import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,readdirSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {cachedQuota} from '../backend/runtime/quota-cache.mjs';
import {parseReminder,reminderService,toEpoch,localTime} from '../backend/runtime/reminders.mjs';
const require=createRequire(import.meta.url);
const {resetWindowInput,transitionWindow}=require('../backend/runtime/electron-helper/visibility-recovery.js');
const {flightPosition,movement}=require('../backend/runtime/electron-helper/game-physics.js');
function temp(t){const p=mkdtempSync(join(tmpdir(),'dafeiyu-140 '));t.after(()=>rmSync(p,{recursive:true,force:true}));return p;}
const zone='Asia/Shanghai';
const success=(used=20,key='account-a')=>({ok:true,queryOk:true,accountKey:key,observedAt:123456789,planLabel:'Plus',windows:[{label:'5小时',used,remaining:100-used,resetsAt:null}]});
test('quota: replace one snapshot, persist across restart, failures never overwrite it',async t=>{
  const dir=temp(t),file=join(dir,'quota.json');const opts={file,cli:'mock',getScope:()=> 'scope-a'};
  assert.equal((await cachedQuota({...opts,readUsage:async()=>success()})).stale,false);
  await cachedQuota({...opts,readUsage:async()=>success(30)});
  const bytes=readFileSync(file,'utf8');
  const stale=await cachedQuota({...opts,readUsage:async()=>({ok:false,error:'offline'})});
  assert.equal(stale.stale,true);assert.equal(stale.data.windows[0].remaining,70);assert.equal(readFileSync(file,'utf8'),bytes);
  assert.deepEqual(readdirSync(dir),['quota.json']);
});
test('quota: no cross-account or logged-out fallback, no cache after malformed data',async t=>{
  const file=join(temp(t),'q.json'),opts={file,cli:'mock',getScope:()=> 'a'};
  await cachedQuota({...opts,readUsage:async()=>success()});
  assert.equal((await cachedQuota({...opts,getScope:()=> 'b',readUsage:async()=>({ok:false})})).ok,false);
  await cachedQuota({...opts,readUsage:async()=>success()});
  assert.equal((await cachedQuota({...opts,readUsage:async(_c,{onAccount})=>{onAccount('new-account');return {ok:false};}})).ok,false);
  writeFileSync(file,'corrupt');assert.equal((await cachedQuota({...opts,readUsage:async()=>({ok:false})})).ok,false);
  await cachedQuota({...opts,readUsage:async()=>success()});
  assert.equal((await cachedQuota({...opts,getScope:()=>null,readUsage:async()=>({ok:false})})).ok,false);
});
test('reminder parsing: weekly, multiple leads, dates, ambiguity requires confirmation',()=>{
  const now=toEpoch('2026-10-18T10:00',zone);
  const a=parseReminder('每周五下午6点提醒我交周报',{now,zone});
  assert.equal(a.repeat,'weekly');assert.equal(a.dueLocal,'2026-10-23T18:00');assert.equal(a.title,'交周报');
  const b=parseReminder('论文的ddl是10月23日18点，请提前24小时和2小时提醒我',{now,zone});
  assert.equal(b.dueLocal,'2026-10-23T18:00');assert.deepEqual(b.leadMinutes,[1440,120]);assert.equal(b.title,'论文');
  assert.ok(parseReminder('每周五提醒我交周报',{now,zone}).questions.some(s=>s.includes('时刻')));
  assert.equal(parseReminder('下周一上午9点提醒我开会',{now,zone}).dueLocal,'2026-10-19T09:00');
  assert.throws(()=>toEpoch('2026-02-30T12:00',zone));
});
test('reminders: restart, overdue, snooze, collapse, complete, no duplicate alerts',t=>{
  const root=temp(t);let now=toEpoch('2026-10-18T10:00',zone);
  let service=reminderService(root,{clock:()=>now});
  service.command({action:'save',item:{title:'写论文',dueLocal:'2026-10-18T12:00',repeat:'once',leadMinutes:[60,0],zone}});
  now+=3600000;let s=service.snapshot();assert.equal(s.alerts.length,1);const id=s.items[0].id;
  service=reminderService(root,{clock:()=>now});assert.equal(service.snapshot().alerts.length,1);
  service.command({action:'collapse',value:true});assert.equal(service.snapshot().collapsed,true);
  service.command({action:'snooze',id});assert.equal(service.snapshot().alerts.length,0);
  now+=16*60000;assert.equal(service.snapshot().alerts.length,1);
  now+=3600000;assert.equal(service.snapshot().alerts.length,1);
  service.command({action:'complete',id});assert.equal(service.snapshot().alerts.length,0);assert.equal(service.snapshot().items[0].enabled,false);
});
test('repeating reminder: offline catch-up is summarized and completing prior alert preserves next occurrence',t=>{
  const root=temp(t);let now=toEpoch('2026-10-18T10:00',zone);const service=reminderService(root,{clock:()=>now});
  service.command({action:'save',item:{title:'周报',dueLocal:'2026-10-23T18:00',repeat:'weekly',leadMinutes:[120,0],zone}});
  now=toEpoch('2026-11-15T10:00',zone);const s=service.snapshot();assert.equal(s.alerts.length,1);
  assert.equal(localTime(s.items[0].dueAt,zone),'2026-11-20T18:00');
  service.command({action:'complete',id:s.items[0].id});assert.equal(service.snapshot().items[0].dueAt,s.items[0].dueAt);
});
test('visibility recovery resets both mirrors and restores without focus; hidden transition releases input',()=>{
  const calls=[];let visible=true;const win={id:1,isDestroyed:()=>false,isVisible:()=>visible,setFocusable:v=>calls.push(['focusable',v]),hide:()=>{visible=false;calls.push('hide');},showInactive:()=>{visible=true;calls.push('showInactive');}};
  const maps=[new Map([[1,true]]),new Map([[1,{dragging:true}]])];
  const options={reset:w=>resetWindowInput(w,maps,(_w,v)=>calls.push(['ignore',v])),notify:(_w,p)=>calls.push(p),geometry:()=>calls.push('geometry'),health:()=>calls.push('health')};
  transitionWindow(win,false,options);assert.ok(maps.every(m=>m.size===0));transitionWindow(win,true,options);
  assert.deepEqual(calls.slice(-4),['showInactive','geometry','resume','health']);
});
test('control physics: normalized diagonals and continuous velocity through the apex',()=>{
  const straight=movement(0,0,1,0,.016,300),diagonal=movement(0,0,1,1,.016,300);
  assert.ok(Math.abs(Math.hypot(diagonal.vx,diagonal.vy)-straight.vx)<1e-8);
  const shot={sx:0,sy:0,tx:400,ty:0,height:100,direction:1};
  const a=flightPosition(shot,.499),b=flightPosition(shot,.5),c=flightPosition(shot,.501);
  assert.ok(a.x<b.x&&b.x<c.x);assert.ok(a.y>b.y&&c.y>b.y);assert.ok(Math.abs(a.y-c.y)<1e-8);
  assert.ok(a.angle<b.angle&&b.angle<c.angle);
});
test('daily reminders keep their chosen wall time across DST; a missing occurrence shifts forward',t=>{
  const root=temp(t),zone='America/New_York';let now=toEpoch('2026-03-06T12:00',zone);
  const service=reminderService(root,{clock:()=>now});
  service.command({action:'save',item:{title:'晨会',dueLocal:'2026-03-07T02:30',repeat:'daily',leadMinutes:[0],zone}});
  now=toEpoch('2026-03-07T03:00',zone);let s=service.snapshot();assert.equal(localTime(s.items[0].dueAt,zone),'2026-03-08T03:00');
  now=toEpoch('2026-03-08T04:00',zone);s=service.snapshot();assert.equal(localTime(s.items[0].dueAt,zone),'2026-03-09T02:30');
});
test('quota: keychain logins use verified account identity, never unverified last-account data',async t=>{
  const file=join(temp(t),'q.json'),opts={file,cli:'mock',getScope:()=>null};
  await cachedQuota({...opts,readUsage:async()=>success()});
  assert.equal((await cachedQuota({...opts,readUsage:async()=>({ok:false})})).ok,false);
  assert.equal((await cachedQuota({...opts,readUsage:async(_c,{onAccount})=>{onAccount('account-a');return {ok:false};}})).stale,true);
  assert.equal((await cachedQuota({...opts,readUsage:async(_c,{onAccount})=>{onAccount('account-b');return {ok:false};}})).ok,false);
});
