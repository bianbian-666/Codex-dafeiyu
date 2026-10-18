import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {atomicJson} from './codex-usage/usage.mjs';

const DAY=86400000;
const zoneDefault=()=>Intl.DateTimeFormat().resolvedOptions().timeZone;
const pad=n=>String(n).padStart(2,'0');
function parts(epoch,zone) {
  const data=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(epoch)).map(p=>[p.type,p.value]));
  return {y:+data.year,m:+data.month,d:+data.day,h:+data.hour,min:+data.minute,s:+data.second};
}
export function localTime(epoch,zone) { const p=parts(epoch,zone);return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.h)}:${pad(p.min)}`; }
export function toEpoch(local,zone) {
  if(typeof local!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local))throw new Error('请填写完整日期和时刻');
  new Intl.DateTimeFormat('zh-CN',{timeZone:zone}).format();
  const [y,m,d,h,min]=local.match(/\d+/g).map(Number);
  if(y<2000 || y>2100 || h>23 || min>59)throw new Error('日期或时刻无效');
  const wall=Date.UTC(y,m-1,d,h,min);
  let epoch=wall;
  for(let i=0;i<4;i++){const p=parts(epoch,zone);epoch+=wall-Date.UTC(p.y,p.m-1,p.d,p.h,p.min,p.s);}
  if(localTime(epoch,zone)!==local)throw new Error('该日期或时刻在所选时区不存在，请调整');
  return epoch;
}
function cn(s) {
  if(/^\d+(?:\.\d+)?$/.test(s))return +s;
  const n={'零':0,'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};
  if(s==='十')return 10;
  if(s.includes('十')){const [a,b]=s.split('十');return (n[a]||1)*10+(n[b]||0);}
  return n[s]??NaN;
}
function nextDay(local,days) {
  const [y,m,d,h,min]=local.match(/\d+/g).map(Number);
  const date=new Date(Date.UTC(y,m-1,d+days,h,min));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth()+1)}-${pad(date.getUTCDate())}T${pad(h)}:${pad(min)}`;
}
export function parseReminder(input,{now=Date.now(),zone=zoneDefault()}={}) {
  const text=String(input||'').trim().slice(0,1000);
  const p=parts(now,zone);let date=`${p.y}-${pad(p.m)}-${pad(p.d)}`,repeat='once',explicit=false;
  const questions=[];
  let leads=[0];
  const advance=text.match(/提前(.+?)(?:提醒|通知|$)/);
  if(advance) {
    leads=[...advance[1].matchAll(/(\d+(?:\.\d+)?|[一二两三四五六七八九十]+)\s*(小时|分钟|天|分)/g)].map(m=>cn(m[1])*({'小时':60,'天':1440,'分钟':1,'分':1}[m[2]]));
    if(!leads.length){questions.push('请填写提前多少分钟提醒');leads=[0];}
  }
  const weekday=text.match(/(下周|本周|这周|每周|每星期|星期|周)([一二三四五六日天1-7])/);
  const abs=text.match(/(?:(\d{4})[年\-/])?(\d{1,2})[月\-/](\d{1,2})(?:日|号)?/);
  let daily=/每天|每日/.test(text);
  if(daily)repeat='daily';
  if(weekday) {
    explicit=true;repeat=/^每/.test(weekday[1])?'weekly':'once';
    const dow={'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'日':0,'天':0}[weekday[2]]??(+weekday[2]%7);
    const today=new Date(Date.UTC(p.y,p.m-1,p.d)).getUTCDay();
    let delta=(dow-today+7)%7;
    // The following Monday anchors "下周", independent of current weekday.
    if(weekday[1]==='下周')delta=(8-(today||7))+(dow===0?6:dow-1);
    date=nextDay(date+'T00:00',delta).slice(0,10);
  } else if(abs) {
    explicit=true;date=`${abs[1]||p.y}-${pad(+abs[2])}-${pad(+abs[3])}`;
  } else if(/后天|明天|今天|今日/.test(text)) {
    explicit=true;date=nextDay(date+'T00:00',text.includes('后天')?2:text.includes('明天')?1:0).slice(0,10);
  } else if(!daily)questions.push('请确认提醒的具体日期');
  const clock=text.match(/(?:(上午|下午|晚上|中午|凌晨)\s*)?(\d{1,2}|[一二两三四五六七八九十]+)(?:(?:[:：](\d{2}))|(?:点|时)(?:(半|一刻|三刻|\d{1,2})(?:分)?)?)/);
  let time='';
  if(clock) {
    let h=cn(clock[2]);const min=clock[3]?+clock[3]:clock[4]==='半'?30:clock[4]==='一刻'?15:clock[4]==='三刻'?45:+(clock[4]||0);
    if(/下午|晚上/.test(clock[1]||'') && h<12)h+=12;
    if(clock[1]==='中午' && h<11)h+=12;
    if(clock[1]==='凌晨' && h===12)h=0;
    if(h>23 || min>59)questions.push('时刻超出范围，请修改');else time=`${pad(h)}:${pad(min)}`;
  }else questions.push('还差几点提醒，请补充时刻');
  let dueLocal=date+'T'+(time||'');
  if(time)try {
    const at=toEpoch(dueLocal,zone);
    if(at<=now && (repeat==='weekly'||repeat==='daily'))dueLocal=nextDay(dueLocal,repeat==='weekly'?7:1);
    else if(at<=now)questions.push('这个时间已经过去，请确认或修改');
  }catch(error){questions.push(error.message);}
  let title=text.replace(/提前.+?(?=提醒|通知|$)/g,'').replace(/(?:请)?(?:提醒我|通知我)(?:做)?/g,'').replace(/每(?:天|日)/g,'');
  if(weekday)title=title.replace(weekday[0],'');
  if(abs)title=title.replace(abs[0],'');
  if(clock)title=title.replace(clock[0],'');
  title=title.replace(/后天|明天|今天|今日|的?\s*(?:ddl|deadline)\s*(?:是|为)?|截止(?:时间)?(?:是|为)?/ig,'').replace(/^[\s，。,:：；;！!请]+|[\s，。,:：；;！!]+$/g,'').slice(0,100)||'待办任务';
  return {title,dueLocal,repeat,leadMinutes:[...new Set(leads)].sort((a,b)=>b-a),zone,questions,original:text,needsConfirmation:true};
}

export function reminderService(root,{clock=Date.now}={}) {
  const file=path.join(root,'reminders.json');
  let db={schema:1,items:[],alerts:[],collapsed:false};
  try {
    const raw=JSON.parse(fs.readFileSync(file,'utf8'));
    if(raw.schema!==1 || !Array.isArray(raw.items) || !Array.isArray(raw.alerts))throw new Error('invalid schema');
    db=raw;
  }catch(error){if(error.code!=='ENOENT')throw new Error('提醒数据无法读取，已保留原文件，请先备份检查 reminders.json');}
  const save=()=>atomicJson(file,db);
  const nextAt=item=>{
    const local=nextDay(localTime(item.dueAt,item.zone),item.repeat==='weekly'?7:1).slice(0,10)+'T'+(item.wallTime||localTime(item.dueAt,item.zone).slice(11));
    try {return toEpoch(local,item.zone);}catch(error) {
      // Only the missing DST occurrence shifts; retain the chosen wall time.
      const [y,m,d,h,min]=local.match(/\d+/g).map(Number);
      for(let offset=1;offset<=180;offset++) {
        const adjusted=new Date(Date.UTC(y,m-1,d,h,min+offset)).toISOString().slice(0,16);
        try{return toEpoch(adjusted,item.zone);}catch{}
      }
      throw error;
    }
  };
  const advance=item=>{item.dueAt=nextAt(item);item.fired=[];};
  function tick() {
    const now=clock();let changed=false;
    for(const item of db.items) {
      if(!item.enabled)continue;
      // Summarize missed recurring occurrences instead of replaying every week.
      if(item.repeat!=='once') {
        let guard=0;
        while(item.dueAt<now && guard++<37000) {
          const next=nextAt(item);
          if(next>now)break;
          item.dueAt=next;item.fired=[];changed=true;
        }
      }
      const dueLeads=item.leadMinutes.filter(m=>item.dueAt-m*60000<=now && !item.fired.includes(m));
      if(dueLeads.length) {
        item.fired.push(...dueLeads);
        const old=db.alerts.find(a=>a.reminderId===item.id);
        if(!old || old.dueAt!==item.dueAt) {
          db.alerts=db.alerts.filter(a=>a.reminderId!==item.id);
          db.alerts.push({id:randomUUID(),reminderId:item.id,dueAt:item.dueAt,raisedAt:now,snoozeUntil:0});
        }
        changed=true;
      }
      if(item.repeat!=='once' && item.dueAt<=now){advance(item);changed=true;}
    }
    if(changed)save();
  }
  function snapshot() {
    tick();
    const now=clock();
    return structuredClone({...db,now,alerts:db.alerts.filter(a=>a.snoozeUntil<=now).map(a=>({...a,item:db.items.find(i=>i.id===a.reminderId)})).filter(a=>a.item)});
  }
  function command(payload={}) {
    tick();
    if(payload.action==='parse')return {ok:true,draft:parseReminder(payload.text,{now:clock(),zone:payload.zone||zoneDefault()})};
    if(payload.action==='preview') {
      const dueAt=toEpoch(payload.item.dueLocal,payload.item.zone);
      const leads=payload.item.leadMinutes;
      if(!Array.isArray(leads)||leads.length>8||!leads.every(n=>Number.isFinite(n)&&n>=0&&n<=525600))throw new Error('请填写有效提前量');
      return {ok:true,times:leads.map(m=>dueAt-m*60000)};
    }
    // Commit only validated explicit fields from the confirmation card.
    if(payload.action==='save') {
      const value=payload.item||{},title=String(value.title||'').trim().slice(0,100);
      if(!title)throw new Error('请填写任务名称');
      if(!['once','daily','weekly'].includes(value.repeat))throw new Error('请选择重复规则');
      if(typeof value.zone!=='string'||!value.zone)throw new Error('请确认提醒的时区');
      const dueAt=toEpoch(value.dueLocal,value.zone);
      if(dueAt<=clock())throw new Error('请把提醒时间设在未来');
      const leadMinutes=value.leadMinutes;
      if(!Array.isArray(leadMinutes)||!leadMinutes.length||leadMinutes.length>8||!leadMinutes.every(n=>Number.isFinite(n)&&n>=0&&n<=525600))throw new Error('提前量应为 0～525600 分钟，最多 8 次');
      const existing=value.id&&db.items.find(i=>i.id===value.id);
      if(value.id&&!existing)throw new Error('任务已经不存在');
      if(!existing && db.items.length>=200)throw new Error('最多保留 200 个提醒，请先清理旧任务');
      const item={id:existing?.id||randomUUID(),title,dueAt,zone:value.zone,wallTime:value.dueLocal.slice(11),repeat:value.repeat,leadMinutes:[...new Set(leadMinutes)].sort((a,b)=>b-a),enabled:true,fired:[],createdAt:existing?.createdAt||clock()};
      db.items=db.items.filter(i=>i.id!==item.id);db.items.push(item);db.alerts=db.alerts.filter(a=>a.reminderId!==item.id);
    }else if(payload.action==='collapse')db.collapsed=!!payload.value;
    else if(['complete','snooze','delete','skip'].includes(payload.action)) {
      const item=db.items.find(i=>i.id===payload.id);
      if(!item)throw new Error('找不到这条提醒');
      if(payload.action==='snooze') {
        const alert=db.alerts.find(a=>a.reminderId===item.id);
        if(!alert)throw new Error('提醒已经处理');
        alert.snoozeUntil=clock()+15*60000;
      }else {
        const alert=db.alerts.find(a=>a.reminderId===item.id);
        db.alerts=db.alerts.filter(a=>a.reminderId!==item.id);
        if(payload.action==='delete'){db.items=db.items.filter(i=>i!==item);}
        else if(item.repeat==='once'){item.enabled=false;}
        else if(!alert || alert.dueAt===item.dueAt)advance(item);
      }
    }else throw new Error('未知提醒操作');
    save();return {ok:true,...snapshot()};
  }
  return {snapshot,command};
}
