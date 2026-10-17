import {readFileSync,writeFileSync,renameSync,existsSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {chat} from './codex-chat.mjs';
export function readUserSummary(home=process.env.CODEX_HOME||join(homedir(),'.codex')){
 const file=join(home,'memories','memory_summary.md');
 try{
  const raw=readFileSync(file,'utf8').replace(/^\uFEFF/,'');
  const blocks=raw.split(/(?=^##\s)/m);
  const personal=blocks.filter(block=>/^##\s+(?:User Profile|User preferences|Current projects|Current work|用户画像|用户偏好|当前项目|正在做的事)\s*$/im.test(block.split('\n')[0]));
  const text=personal.join('\n').trim().slice(0,4500);
  return {available:!!text,text,source:'Codex 已记录的个人信息、偏好和当前项目；不包含一般操作指南'};
 }catch{return {available:false,text:'',source:'未找到 Codex 的个人记忆摘要'};}
}
const stores=new Map();
export function conversations(dir,generate=chat){
 if(stores.has(dir))return stores.get(dir);
 mkdirSync(dir,{recursive:true});const file=join(dir,'pet-conversations.json');
 const fresh=()=>({id:randomUUID(),title:'新的鱼塘',messages:[],createdAt:Date.now()});
 let data;
 if(existsSync(file)){data=JSON.parse(readFileSync(file,'utf8').replace(/^\uFEFF/,''));if(!Array.isArray(data.sessions)||!data.sessions.length)throw new Error('聊天文件格式异常，请保留原文件后检查');}
 else{
   const first=fresh();try{const old=JSON.parse(readFileSync(join(dir,'dsh-pet','memory.json'),'utf8'));const messages=old.main?.main?.messages;if(Array.isArray(messages)&&messages.length){first.messages=messages;first.title='之前和本鱼的聊天';}}catch{}
   data={active:first.id,mode:'auto',useMemory:true,sessions:[first]};
 }
 const save=()=>{writeFileSync(file+'.tmp',JSON.stringify(data,null,2));renameSync(file+'.tmp',file);};save();
 let pending=null;
 const current=()=>data.sessions.find(s=>s.id===data.active)||data.sessions[0];
 const profile=()=>{
  const automatic=readUserSummary(),notes=String(data.profileNotes||'').trim();
  const text=[automatic.text?`【Codex 对用户的既有了解，可能过期】\n${automatic.text}`:'',notes?`【用户亲自补充或纠正，以此为准】\n${notes}`:''].filter(Boolean).join('\n\n');
  return {...automatic,available:!!text,text,notes};
 };
 const snapshot=()=>({ok:true,active:current().id,mode:data.mode,useMemory:data.useMemory,sessions:data.sessions.map(({id,title,createdAt})=>({id,title,createdAt})),messages:current().messages,pending,memory:profile()});
 const command=async body=>{
  if(pending)return {ok:false,message:'本鱼还在回上一句，等一下再操作～'};
  if(body.action==='new'){const s=fresh();data.sessions.unshift(s);data.active=s.id;save();return snapshot();}
  if(body.action==='select'){if(!data.sessions.some(s=>s.id===body.id))return {ok:false,message:'找不到这个聊天'};data.active=body.id;save();return snapshot();}
  if(body.action==='settings'){if(['auto','sol','luna'].includes(body.mode))data.mode=body.mode;if(typeof body.useMemory==='boolean')data.useMemory=body.useMemory;save();return snapshot();}
  if(body.action==='profile'){
   if(typeof body.notes!=='string'||body.notes.length>3000)return {ok:false,message:'画像补充请控制在 3000 字以内'};
   data.profileNotes=body.notes.trim();save();return snapshot();
  }
  if(body.action!=='send'||typeof body.text!=='string'||!body.text.trim()||body.text.length>2000)return {ok:false,message:'请输入 1～2000 字'};
  const session=current(),text=body.text.trim(),history=session.messages.filter(m=>!m.error);
  const user={role:'user',content:text,ts:Date.now()};session.messages.push(user);if(session.messages.length===1)session.title=text.slice(0,22);save();
  pending={sessionId:session.id,text:'',startedAt:Date.now()};
  try{
   const result=await generate(text,history,dir,{mode:data.mode,memory:data.useMemory?profile().text:'',onDelta:delta=>{pending.text+=String(delta??'');}});
   if(result.ok)session.messages.push({role:'assistant',content:result.text,model:result.model,ts:Date.now()});
   else user.error=result.message||'回复失败';
   save();return result;
  }catch(e){user.error=e.message;save();return {ok:false,message:e.message};}finally{pending=null;}
 };
 const service={snapshot,command};stores.set(dir,service);return service;
}
