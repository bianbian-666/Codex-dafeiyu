import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createChatClient} from '../backend/runtime/codex-chat.mjs';
import {connect} from '../backend/runtime/codex-rpc.mjs';
const temp=()=>mkdtempSync(join(tmpdir(),'pet-chat-runtime-'));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fakeConnection(){
 const calls=[],listeners=new Set();let alive=true,id=0;
 const c={calls,listeners,servers:{first:{}},outcome:'success',
  alive:()=>alive,emit:msg=>{for(const fn of listeners)fn(msg);},
  close(){alive=false;c.emit({method:'pet/connectionClosed'});},
  async rpc(method,params){
   calls.push({method,params});
   if(method==='model/list')return {data:[{model:'gpt-5.6-sol',isDefault:true,supportedReasoningEfforts:[{reasoningEffort:'low'}]}]};
   if(method==='config/read')return {config:{mcp_servers:c.servers}};
   if(method==='thread/start')return {thread:{id:'thread-'+(++id)}};
   if(method==='turn/start'){
    const threadId=params.threadId,text=JSON.parse(params.input[0].text).userMessage;
    setImmediate(()=>{
     if(c.outcome==='disconnect'){c.close();return;}
     if(c.outcome==='error'){c.emit({method:'error',params:{threadId,willRetry:false,error:{message:'额度不足'}}});return;}
     c.emit({method:'item/agentMessage/delta',params:{threadId:'unrelated',delta:'不应混入'}});
     c.emit({method:'item/agentMessage/delta',params:{threadId,delta:'收到'}});
     c.emit({method:'item/completed',params:{threadId,item:{type:'agentMessage',phase:'final_answer',text:'收到：'+text}}});
     c.emit({method:'turn/completed',params:{threadId,turn:{status:'completed'}}});
    });return {};
   }
   throw new Error('Unexpected method '+method);
  }};return c;
}

test('warm replies cache models, refresh tool configuration, retain selected model and isolate context',async t=>{
 const c=fakeConnection();let connects=0;
 const client=createChatClient({connectToCodex:async()=>{connects++;return c;}});t.after(client.closeChatConnection);
 const dir=temp(),deltas=[];
 assert.equal((await client.chat('第一句',[{role:'assistant',content:'之前'}],dir,{memory:'用户喜欢简短回复',onDelta:d=>deltas.push(d)})).ok,true);
 c.servers.second={};
 assert.equal((await client.chat('第二句',[],dir,{mode:'sol'})).text,'收到：第二句');
 assert.equal(connects,1);assert.equal(c.calls.filter(v=>v.method==='model/list').length,1);
 assert.equal(c.calls.filter(v=>v.method==='config/read').length,2);
 const threads=c.calls.filter(v=>v.method==='thread/start').map(v=>v.params);
 assert.equal(threads[1].config['mcp_servers.second.enabled'],false);
 assert.equal(threads[1].model,'gpt-5.6-sol');assert.equal(threads[1].ephemeral,true);
 assert.match(threads[0].baseInstructions,/白饭/);assert.match(threads[0].developerInstructions,/用户喜欢简短回复/);
 assert.equal(threads[0].developerInstructions.includes('你是 Codex-dafeiyu'),false);
 assert.equal(threads[1].developerInstructions,null);assert.deepEqual(deltas,['收到']);
 assert.deepEqual(JSON.parse(c.calls.filter(v=>v.method==='turn/start')[1].params.input[0].text).recentConversation,[]);
});

test('model catalog expires and account updates invalidate it immediately',async t=>{
 let clock=0;const c=fakeConnection(),client=createChatClient({connectToCodex:async()=>c,now:()=>clock,modelCacheMs:100});t.after(client.closeChatConnection);
 const dir=temp();await client.chat('一',[],dir);clock=101;await client.chat('二',[],dir);
 c.emit({method:'account/updated',params:{authMode:'chatgpt'}});await client.chat('三',[],dir);
 assert.equal(c.calls.filter(v=>v.method==='model/list').length,3);
});

test('first reply prepares model catalog and current configuration in parallel',async t=>{
 const c=fakeConnection(),original=c.rpc;let release;const gate=new Promise(resolve=>release=resolve);
 c.rpc=async(method,params)=>{const result=await original(method,params);if(method==='model/list')await gate;return result;};
 const client=createChatClient({connectToCodex:async()=>c});t.after(client.closeChatConnection);
 const reply=client.chat('你好',[],temp());await tick();
 assert.ok(c.calls.some(v=>v.method==='model/list'));assert.ok(c.calls.some(v=>v.method==='config/read'));
 assert.equal(c.calls.some(v=>v.method==='thread/start'),false);release();assert.equal((await reply).ok,true);
});

test('simultaneous sessions share startup, but never their responses',async t=>{
 const c=fakeConnection();let connects=0;
 const client=createChatClient({connectToCodex:async()=>{connects++;await tick();return c;}});t.after(client.closeChatConnection);
 const dir=temp(),[a,b]=await Promise.all([client.chat('甲',[],dir),client.chat('乙',[],dir)]);
 assert.equal(connects,1);assert.equal(c.calls.filter(v=>v.method==='model/list').length,1);
 assert.equal(a.text,'收到：甲');assert.equal(b.text,'收到：乙');
});

test('failed or disconnected requests are not resent, and the next user send reconnects',async t=>{
 const first=fakeConnection(),second=fakeConnection();first.outcome='error';let connects=0;
 const client=createChatClient({connectToCodex:async()=>++connects===1?first:second});t.after(client.closeChatConnection);
 const dir=temp(),failed=await client.chat('不要重发',[],dir);
 assert.equal(failed.ok,false);assert.match(failed.message,/额度不足/);
 assert.equal(first.calls.filter(v=>v.method==='turn/start').length,1);assert.equal(connects,1);
 assert.equal((await client.chat('用户重新发送',[],dir)).ok,true);assert.equal(connects,2);
 second.outcome='disconnect';const dropped=await client.chat('断开',[],dir);
 assert.equal(dropped.ok,false);assert.match(dropped.message,/连接已结束/);
});

test('real RPC child lifecycle sends the app version and rejects immediately when the child exits',async t=>{
 const dir=temp(),cwd=process.cwd(),override=process.env.CODEX_PET_CODEX_PATH;
 writeFileSync(join(dir,'app-server'),`const rl=require('readline').createInterface({input:process.stdin});let version;rl.on('line',line=>{const msg=JSON.parse(line);if(msg.id==null)return;if(msg.method==='initialize'){version=msg.params.clientInfo.version;console.log(JSON.stringify({id:msg.id,result:{}}));}else if(msg.method==='version'){console.log(JSON.stringify({id:msg.id,result:version}));}else process.exit(1);});`);
 process.chdir(dir);process.env.CODEX_PET_CODEX_PATH=process.execPath;let c;
 t.after(()=>{c?.close();process.chdir(cwd);if(override===undefined)delete process.env.CODEX_PET_CODEX_PATH;else process.env.CODEX_PET_CODEX_PATH=override;});
 c=await connect();assert.equal(await c.rpc('version'),JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version);let closed=0;
 c.listeners.add(msg=>{if(msg.method==='pet/connectionClosed')closed++;});
 await assert.rejects(c.rpc('exit'),/连接已结束/);assert.equal(c.alive(),false);
 c.close();assert.equal(closed,1);await assert.rejects(c.rpc('after-exit'),/连接已结束/);
});
