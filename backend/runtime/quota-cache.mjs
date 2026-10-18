import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {atomicJson} from './codex-usage/usage.mjs';

export function authScope(home=process.env.CODEX_HOME || path.join(os.homedir(),'.codex')) {
  try { return createHash('sha256').update(fs.readFileSync(path.join(home,'auth.json'))).digest('hex'); } catch { return null; }
}
export function validQuota(value) {
  return value?.ok===true && value.shape==='quota' && typeof value.data?.planLabel==='string' && Array.isArray(value.data.windows) && value.data.windows.length>0 && value.data.windows.every(w=>typeof w.label==='string' && [w.used,w.remaining].every(n=>Number.isFinite(n)&&n>=0&&n<=100) && (w.resetsAt===null || Number.isFinite(w.resetsAt)&&w.resetsAt>0&&w.resetsAt<=253402271999));
}
export async function cachedQuota({file,cli,readUsage,getScope=authScope,scope=getScope(),now=Date.now()}) {
  let cache;
  try {cache=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}
  const clear=()=>{cache=undefined;try{fs.unlinkSync(file);}catch{}};
  if (!validQuota(cache?.value) || scope===null && cache?.scope!=null) clear();
  let verifiedAccount=null;
  let result;
  try {
    result=cli ? await readUsage(cli,{onAccount:key=>{verifiedAccount=key;if(!key || cache && cache.accountKey!==key)clear();}})
      : {ok:false,error:'未找到 Codex，请先安装并登录客户端'};
  }catch{result={ok:false,error:'额度暂不可用，请稍后重试'};}
  if(getScope()!==scope){clear();return {ok:false,provider:'codex',reason:'fetch-error',message:'登录状态已变化，请重新查询额度'};}
  // A changed login while the read was in flight never authorizes reuse.
  if(result.errorCode==='AUTH_MODE_UNSUPPORTED' || result.queryOk && !result.ok)clear();
  if(result.ok && result.queryOk) {
    const value={ok:true,provider:'codex',shape:'quota',observedAt:result.observedAt||now,stale:false,
      data:{planLabel:result.planLabel,windows:result.windows.map(({label,used,remaining,resetsAt})=>({label,used,remaining,resetsAt}))}};
    if(validQuota(value)) {
      if(result.accountKey)try{atomicJson(file,{schema:1,scope,accountKey:result.accountKey,value});}catch{console.warn('[quota-cache] latest snapshot could not be saved');}
      return value;
    }
  }
  if(cache && (scope && cache.scope===scope || verifiedAccount && cache.accountKey===verifiedAccount))return {...cache.value,stale:true};
  return {ok:false,provider:'codex',reason:'fetch-error',message:result.error||'额度暂不可用，请稍后重试'};
}
