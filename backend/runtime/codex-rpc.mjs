import {spawn,execFileSync} from 'node:child_process';
import readline from 'node:readline';
import {resolveCodexExecutable} from './codex-usage/usage.mjs';
export async function connect() {
  const cli=resolveCodexExecutable(process.env.CODEX_PET_CODEX_PATH || process.env.DSH_PET_CODEX_PATH);
  if(!cli) throw new Error('本鱼找不到 Codex，请先安装并登录。');
  // Follow this PC's existing Windows proxy preference for the child only.
  const env={...process.env};
  if(process.platform==='win32'&&!env.HTTPS_PROXY&&!env.https_proxy){try{
    const key='HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';
    const enabled=execFileSync('reg.exe',['query',key,'/v','ProxyEnable'],{encoding:'utf8',windowsHide:true});
    if(/REG_DWORD\s+0x1\b/.test(enabled)){
      const raw=execFileSync('reg.exe',['query',key,'/v','ProxyServer'],{encoding:'utf8',windowsHide:true}).match(/REG_SZ\s+([^\r\n]+)/)?.[1]?.trim();
      const address=raw?.includes('=')?raw.split(';').find(s=>s.startsWith('https='))?.slice(6)||raw.split(';').find(s=>s.startsWith('http='))?.slice(5):raw;
      if(address){const url=new URL(address.includes('://')?address:'http://'+address);if(['http:','https:','socks5:'].includes(url.protocol)){env.HTTPS_PROXY=url.href;env.HTTP_PROXY??=url.href;env.NO_PROXY??='localhost,127.0.0.1';}}
    }
  }catch{}}
  const child=spawn(cli,['app-server','--stdio'],{env,windowsHide:true,stdio:['pipe','pipe','pipe']});
  let sequence=0; const pending=new Map(),listeners=new Set();
  child.stderr.resume();
  const send=obj=>child.stdin.write(JSON.stringify(obj)+'\n');
  const fail=()=>{for(const p of pending.values())p.reject(new Error('Codex 连接已结束'));pending.clear();};
  child.on('error',fail);child.on('exit',fail);child.stdin.on('error',fail);
  readline.createInterface({input:child.stdout}).on('line',line=>{
    let msg;try{msg=JSON.parse(line)}catch{return}
    if(msg.id!=null&&msg.method){send({id:msg.id,error:{code:-32601,message:'Desktop companion does not execute tools or approvals'}});return;}
    if(msg.id!=null){const p=pending.get(msg.id);if(p){pending.delete(msg.id);msg.error?p.reject(new Error(msg.error.message)):p.resolve(msg.result)}}
    else {if(process.env.CODEX_PET_RPC_DEBUG) console.error('RPC',msg.method,JSON.stringify({threadId:msg.params?.threadId,keys:Object.keys(msg.params??{}),status:msg.params?.turn?.status,itemType:msg.params?.item?.type,error:msg.params?.error}));for(const fn of listeners)fn(msg);}
  });
  const rpc=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Codex 响应超时'))},20000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}});send({id,method,params});});
  const close=()=>{child.stdin.end();child.kill();fail()};
  try{await rpc('initialize',{clientInfo:{name:'dafeiyu_pet',version:'1.0.0'},capabilities:{experimentalApi:true}});send({method:'initialized'});}catch(e){close();throw e}
  const stop=()=>child.kill();process.once('exit',stop);
  child.once('exit',()=>process.removeListener('exit',stop));
  return {rpc,close,listeners,alive:()=>child.exitCode===null&&!child.killed};
}
