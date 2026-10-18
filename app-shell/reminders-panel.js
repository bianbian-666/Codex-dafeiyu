'use strict';
const reminderCard=document.createElement('section');
reminderCard.id='reminder-card';reminderCard.className='quota-card';
reminderCard.innerHTML=`<div class="section-title"><h2>DDL 小便签</h2></div>
<p class="muted">白饭本鱼来送，ddl 本鱼帮你盯。到点后便签常驻，直到你处理。</p>
<form id="reminder-parse"><label for="reminder-text">告诉本鱼什么时候提醒你</label><textarea id="reminder-text" maxlength="1000" placeholder="每周五下午6点提醒我交周报；论文的ddl是10月23日18点，请提前24小时和2小时提醒我" required></textarea><button type="submit">整理成提醒</button></form>
<form id="reminder-confirm" hidden><p><strong>确认后才保存</strong></p><label>任务<input id="reminder-title" maxlength="100" required></label><label>截止／提醒时间<input id="reminder-date" type="datetime-local" required></label><label>重复<select id="reminder-repeat"><option value="once">仅这一次</option><option value="daily">每天同一时刻</option><option value="weekly">每周同一天、同一时刻</option></select></label><label>提前几分钟（多个用逗号分隔，0 表示到点）<input id="reminder-leads" value="0" required></label><p id="reminder-zone" class="muted"></p><p id="reminder-warning" role="status"></p><div class="actions"><button type="submit" class="primary">确认保存</button><button id="reminder-cancel" type="button">取消</button></div></form>
<p id="reminder-message" role="status"></p><div id="reminder-list"></div><p class="muted">本地保存，无需模型。软件退出或关机期间不弹出，重新打开会补提醒。</p>`;
const controlCard=document.createElement('section');
controlCard.id='control-card';
controlCard.innerHTML=`<div class="section-title"><h2>桌宠控制</h2><button id="pet-control">控制大肥鱼</button></div>
<p class="muted">WASD 移动，左键沿朝向扔白饭，Esc／切换应用退出。</p><p id="control-message" role="status"></p>`;
document.querySelector('.settings').before(reminderCard,controlCard);
let reminderZone=Intl.DateTimeFormat().resolvedOptions().timeZone,editingReminder=null,reminderSignature='';
const re=id=>document.getElementById(id);
async function reminderCommand(command) {
  const result=await window.pet.action('reminders-command',command);
  if(result?.ok===false)throw new Error(result.message||'提醒暂未保存');
  return result;
}
function reminderMessage(text){re('reminder-message').textContent=text;}
re('pet-control').onclick=async()=>{
  re('control-message').textContent='';
  try{const result=await window.pet.action('control');if(!result?.ok)re('control-message').textContent=result?.message||'暂时无法开启控制';}
  catch(error){re('control-message').textContent=error.message||'暂时无法开启控制';}
};
re('reminder-parse').onsubmit=async e=>{
  e.preventDefault();const button=e.submitter;button.disabled=true;
  try{const result=await reminderCommand({action:'parse',text:re('reminder-text').value,zone:reminderZone});showReminderDraft(result.draft);reminderMessage('请核对任务、日期和提前量。');}catch(error){reminderMessage(error.message);}finally{button.disabled=false;}
};
function showReminderDraft(draft) {
  editingReminder=draft.id||null;reminderZone=draft.zone;
  re('reminder-title').value=draft.title;re('reminder-date').value=draft.dueLocal.length===16?draft.dueLocal:'';
  re('reminder-repeat').value=draft.repeat;re('reminder-leads').value=draft.leadMinutes.join(', ');
  re('reminder-zone').textContent='此任务的时区：'+draft.zone+'（随本条提醒保存）';
  re('reminder-warning').textContent=(draft.questions||[]).join('；');re('reminder-confirm').hidden=false;
  void previewReminderTimes();
}
let previewSequence=0;
async function previewReminderTimes() {
  const seq=++previewSequence;
  if(!re('reminder-date').value)return;
  try {
    const result=await reminderCommand({action:'preview',item:{dueLocal:re('reminder-date').value,zone:reminderZone,leadMinutes:re('reminder-leads').value.split(/[,，]/).map(s=>s.trim()?Number(s):NaN)}});
    if(seq!==previewSequence)return;
    re('reminder-warning').textContent='将提醒：'+result.times.map(t=>new Date(t).toLocaleString('zh-CN',{timeZone:reminderZone})+(t<=Date.now()?'（已过去，保存后立即补提醒）':'')).join('；');
  }catch(error){if(seq===previewSequence)re('reminder-warning').textContent=error.message;}
}
re('reminder-date').addEventListener('change',previewReminderTimes);re('reminder-leads').addEventListener('input',previewReminderTimes);
re('reminder-cancel').onclick=()=>{re('reminder-confirm').hidden=true;editingReminder=null;};
re('reminder-confirm').onsubmit=async e=>{
  e.preventDefault();const button=e.submitter;button.disabled=true;
  try{
    const raw=re('reminder-leads').value.trim();if(!raw)throw new Error('请填写提前量');
    const result=await reminderCommand({action:'save',item:{id:editingReminder,title:re('reminder-title').value,dueLocal:re('reminder-date').value,repeat:re('reminder-repeat').value,leadMinutes:raw.split(/[,，]/).map(s=>s.trim()?Number(s):NaN),zone:reminderZone}});
    re('reminder-confirm').hidden=true;re('reminder-text').value='';editingReminder=null;reminderMessage('记住啦，到点本鱼叫你！');renderReminderList(result);
  }catch(error){reminderMessage(error.message);}finally{button.disabled=false;}
};
function localInput(epoch,zone) {
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(epoch)).map(p=>[p.type,p.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
function renderReminderList(state) {
  const sig=JSON.stringify([state.items,state.alerts]);if(sig===reminderSignature)return;reminderSignature=sig;
  const list=re('reminder-list');list.replaceChildren();
  if(!state.items?.length){const p=document.createElement('p');p.className='muted';p.textContent='还没有提醒，先记下一件事吧。';list.append(p);return;}
  for(const item of [...state.items].sort((a,b)=>Number(b.enabled)-Number(a.enabled)||a.dueAt-b.dueAt)) {
    const card=document.createElement('article');card.className='reminder-item';
    const title=document.createElement('strong');title.textContent=item.title;
    const info=document.createElement('p');info.className='muted';
    const active=state.alerts.find(a=>a.reminderId===item.id);
    info.textContent=(active?'待处理 · ':!item.enabled?'已完成 · ':'')+new Date(active?.dueAt||item.dueAt).toLocaleString('zh-CN',{timeZone:item.zone})+' · '+({once:'一次',daily:'每天',weekly:'每周'}[item.repeat])+' · '+item.zone;
    const actions=document.createElement('div');actions.className='reminder-actions';
    function action(text,kind) {
      const button=document.createElement('button');button.textContent=text;button.onclick=async()=>{button.disabled=true;try{renderReminderList(await reminderCommand({action:kind,id:item.id}));}catch(error){reminderMessage(error.message);}finally{button.disabled=false;}};actions.append(button);
    }
    if(item.enabled||active)action('完成本次','complete');
    if(active)action('15 分钟后','snooze');
    if(item.enabled&&item.repeat!=='once')action('跳过本次','skip');
    const edit=document.createElement('button');edit.textContent='修改';edit.onclick=()=>showReminderDraft({...item,dueLocal:localInput(item.dueAt,item.zone)});actions.append(edit);
    action(item.repeat==='once'?'删除':'结束任务','delete');
    card.append(title,info,actions);list.append(card);
  }
}
async function reminderLoop(){try{const state=await window.pet.action('reminders-state');if(state?.ok===false)throw new Error(state.message);renderReminderList(state);}catch(error){reminderMessage(error.message||'暂时连接不上提醒');}setTimeout(reminderLoop,2000);}
void reminderLoop();
