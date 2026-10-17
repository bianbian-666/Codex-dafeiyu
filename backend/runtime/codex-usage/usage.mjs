import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import readline from 'node:readline';
import {createHash,randomUUID} from 'node:crypto';
import {pluginVersion} from './metadata.mjs';
import {identifyPlan,quotaWindowLabel} from './plan.mjs';

const resetTime=value=>typeof value==='number' && Number.isFinite(value) && value>0 && value<=253402271999?value:null;
function quotaAmount(value) {
  // The service returns decimal strings for credit amounts, not currency.
  if(typeof value==='string' && !/^\d+(?:\.\d+)?$/.test(value.trim()))return null;
  if(typeof value!=='number' && typeof value!=='string')return null;
  const number=Number(value);
  return Number.isFinite(number) && number>=0?number:null;
}
function normalizeIndividual(raw) {
  if(!raw || typeof raw!=='object' || Array.isArray(raw))return null;
  const total=quotaAmount(raw.limit),amountUsed=quotaAmount(raw.used);
  const supplied=raw.remainingPercent;
  // Prefer the service's rounded percentage; derive only when it is absent.
  const remaining=supplied==null
    ?(total>0 && amountUsed!==null?Math.max(0,100*(1-amountUsed/total)):null)
    :(typeof supplied==='number' && Number.isFinite(supplied) && supplied>=0 && supplied<=100?supplied:null);
  if(remaining===null)return null;
  return {kind:'individual',label:'个人额度',minutes:null,used:100-remaining,remaining,
    resetsAt:resetTime(raw.resetsAt),total,amountUsed,
    amountRemaining:total!==null && amountUsed!==null?Math.max(0,total-amountUsed):null};
}

export function normalizeLimits(result, now=Date.now()) {
  const hasBuckets=result && Object.hasOwn(result,'rateLimitsByLimitId') && result.rateLimitsByLimitId!==null;
  const limit = hasBuckets ? result.rateLimitsByLimitId?.codex : result?.rateLimits;
  if(!limit || typeof limit!=='object' || Array.isArray(limit))return {ok:false,queryOk:false,source:'official',observedAt:now,...identifyPlan(null,null),windows:[],errorCode:'INVALID_LIMITS',error:'Codex 额度接口未返回有效额度数据'};
  const windows = [];
  let invalid=false;
  for (const key of ['primary','secondary']) {
    const raw = limit?.[key];
    const mins = raw?.windowDurationMins;
    const used = raw?.usedPercent;
    const reset = raw?.resetsAt;
    if(raw===null || raw===undefined)continue;
    if(typeof raw!=='object' || Array.isArray(raw) || !Number.isSafeInteger(mins) || mins<=0 || typeof used!=='number' || !Number.isFinite(used) || used<0 || used>100){invalid=true;continue;}
    if(windows.some(window=>window.minutes===mins)){invalid=true;continue;}
    // DateTimeOffset must also be able to represent the Beijing (+08:00) view.
    windows.push({label:quotaWindowLabel(mins),minutes:mins,used,remaining:100-used,resetsAt:resetTime(reset)});
  }
  windows.sort((a,b)=>a.minutes-b.minutes);
  if(limit.individualLimit!=null){
    const individual=normalizeIndividual(limit.individualLimit);
    if(individual)windows.unshift(individual);else invalid=true;
  }
  return {ok:windows.length>0,queryOk:!invalid,source:'official',observedAt:now,...identifyPlan(null,limit.planType),windows,...(invalid?{errorCode:'INVALID_WINDOWS',error:'Codex 额度接口返回的窗口数据不完整'}:windows.length===0?{errorCode:'NO_WINDOWS',error:'当前账户未提供可显示的额度窗口'}:{})};
}

// Only a fingerprint of public account/read identity fields is persisted.
// Missing identity cannot safely authorize reuse of another query's snapshot.
export function accountFingerprint(account) {
  const fields=['id','accountId','chatgptAccountId','email'];
  const identity=fields.map(key=>[key,typeof account?.[key]==='string'?account[key].trim():null]).filter(([,value])=>value);
  if(identity.length===0)return null;
  return createHash('sha256').update(JSON.stringify([account.type,account.planType??null,identity])).digest('hex');
}

// The desktop app replaces its hash-named CLI folder during updates. Resolve
// the executable on every refresh rather than pinning the install-time path.
export function resolveCodexExecutable(configuredPath,{env=process.env,platform=process.platform}={}) {
  const isFile=file=>{try{return fs.statSync(file).isFile();}catch{return false;}};
  const explicit = configuredPath || env.CODEX_PET_CODEX_PATH || env.DSH_PET_CODEX_PATH;
  if (explicit) return typeof explicit === 'string' && isFile(explicit) ? explicit : undefined;
  const executable=platform==='win32'?'codex.exe':'codex';
  if(platform==='darwin'){
    // Finder launches with a minimal PATH. Prefer the CLI shipped with the app.
    // An explicit app root also lets tests isolate themselves from real logins.
    const applications=env.GPT_NIANG_CODEX_APP?[env.GPT_NIANG_CODEX_APP]:[
      '/Applications/Codex.app',
      ...(env.HOME?[path.join(env.HOME,'Applications','Codex.app')]:[])
    ];
    for(const app of applications){
      for(const relative of ['Contents/Resources/codex-cli/bin/codex','Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex','Contents/Resources/codex']){
        const file=path.join(app,relative);
        if(isFile(file))return file;
      }
    }
  }

  const localData=env.LOCALAPPDATA??env.LocalAppData;
  if(platform==='win32' && localData){
    const root=path.join(localData,'OpenAI','Codex','bin');
    const candidates=[];
    const add=file=>{try{const stat=fs.statSync(file);if(stat.isFile())candidates.push({file,modified:stat.mtimeMs});}catch{}};
    add(path.join(root,executable));
    try{for(const entry of fs.readdirSync(root,{withFileTypes:true})){if(entry.isDirectory())add(path.join(root,entry.name,executable));}}catch{}
    candidates.sort((a,b)=>b.modified-a.modified||a.file.localeCompare(b.file));
    if(candidates.length)return candidates[0].file;
  }
  for(const directory of (env.PATH??env.Path??'').split(platform==='win32'?';':':')){
    const trimmed=directory.trim().replace(/^"(.*)"$/,'$1');
    if(!trimmed)continue;
    const file=path.join(trimmed,executable);
    if(isFile(file))return file;
    if(platform==='win32'){
      // npm installs a .cmd shim; spawn the native CLI without invoking a shell.
      for(const arch of ['x86_64-pc-windows-msvc','aarch64-pc-windows-msvc']){
        for(const root of [
          path.join(trimmed,'node_modules','@openai','codex','vendor',arch),
          path.join(trimmed,'node_modules','@openai','codex','node_modules','@openai',arch.startsWith('x86_64')?'codex-win32-x64':'codex-win32-arm64','vendor',arch),
        ]){
          const native=path.join(root,'codex','codex.exe');
          if(isFile(native))return native;
        }
      }
    }
  }
  return undefined;
}

// Only three read-only protocol methods are sent. There is no thread or model call.
export function readUsage(cli, {timeoutMs=18000,spawnProcess=spawn,onAccount=()=>{}}={}) {
  return new Promise(resolve=>{
    let finished=false,proc,lines,accountKey=null,account=null,planInfo=identifyPlan(null,null),expectedId=1;
    const failure=(error,errorCode)=>({ok:false,queryOk:false,error,windows:[],...planInfo,accountKey,clearPrevious:!accountKey,...(errorCode?{errorCode}:{})});
    const stopChild=()=>{try{proc?.stdin.end();proc?.kill();}catch{}};
    const finish=data=>{
      if(finished)return; finished=true; clearTimeout(timer);
      lines?.close();
      process.removeListener('exit',stopChild);
      stopChild();
      resolve(data);
    };
    const timer=setTimeout(()=>finish(failure('查询超时，稍后重试')),timeoutMs);
    try{proc=spawnProcess(cli,['app-server','--stdio'],{windowsHide:true,stdio:['pipe','pipe','pipe']});}
    catch{finish(failure('Codex 额度服务暂不可用'));return;}
    process.once('exit',stopChild);
    proc.stderr.on('data',()=>{}).on('error',()=>{});
    proc.on('error',error=>finish(failure(error.code==='ENOENT'?'未找到 Codex 程序，请检查客户端安装':'无法启动 Codex 额度服务',error.code)));
    proc.on('close',()=>finish(failure('Codex 额度服务已结束')));
    proc.stdout.on('error',()=>finish(failure('Codex 额度连接已结束')));
    proc.stdin.on('error',()=>finish(failure('Codex 额度连接已结束')));
    const send=data=>{try{proc.stdin.write(JSON.stringify(data)+'\n');}catch{finish(failure('额度连接不可用'));}};
    lines=readline.createInterface({input:proc.stdout});
    lines.on('line',line=>{
      if(finished)return;
      if(line.length>2*1024*1024)return;
      let m;try{m=JSON.parse(line);}catch{return;}
      if(!m || typeof m!=='object' || Array.isArray(m))return;
      if(m.id!==expectedId)return;
      if(m.id===1){
        if(m.error)return finish(failure('Codex 额度接口未就绪'));
        expectedId=null;
        send({method:'initialized',params:{}});
        expectedId=2;
        send({id:2,method:'account/read',params:{refreshToken:false}});
      } else if(m.id===2){
        if(m.error)return finish(failure('暂时无法读取登录状态'));
        const type=m.result?.account?.type;
        account=m.result?.account;
        planInfo=identifyPlan(account?.planType,null,type??null);
        // Account details and credentials are neither stored nor displayed.
        if(type!=='chatgpt' && type!=='chatgptAuthTokens')return finish(failure('请在 Codex 中使用 ChatGPT 账号登录（API Key 不提供订阅额度）','AUTH_MODE_UNSUPPORTED'));
        accountKey=accountFingerprint(m.result.account);
        try{onAccount(accountKey);}catch{return finish(failure('无法保存账户切换状态'));}
        expectedId=3;
        send({id:3,method:'account/rateLimits/read',params:{}});
      } else if(m.id===3){
        if(m.error)return finish(failure('暂时无法读取额度，请检查登录状态或稍后重试','RATE_LIMITS_READ_FAILED'));
        const data=normalizeLimits(m.result);
        planInfo=identifyPlan(account?.planType,data.plan,account?.type);
        Object.assign(data,planInfo);
        const currentKey=accountFingerprint({...account,planType:data.plan});
        if(currentKey!==accountKey){accountKey=currentKey;try{onAccount(accountKey);}catch{return finish(failure('无法保存套餐切换状态'));}}
        data.clearPrevious=(data.queryOk && !data.ok) || !accountKey;
        data.accountKey=accountKey;
        finish(data);
      }
    });
    send({id:1,method:'initialize',params:{clientInfo:{name:'gpt_niang_usage',title:'GPT 娘额度挂件',version:pluginVersion}}});
  });
}

export function atomicJson(file,data) {
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const tmp=file+'.'+process.pid+'.'+randomUUID()+'.tmp';
  try{fs.writeFileSync(tmp,JSON.stringify(data,null,2)+'\n');fs.renameSync(tmp,file);}
  finally{try{fs.unlinkSync(tmp);}catch{}}
}

export function freshness(window,observedAt,now=Date.now()) {
  if(!window || !Number.isFinite(observedAt))return 'unavailable';
  if(Number.isFinite(window.resetsAt) && window.resetsAt>0 && window.resetsAt*1000<=now)return 'expired';
  return now-observedAt>180000?'stale':'fresh';
}
