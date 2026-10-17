const el = id => document.getElementById(id);
function renderQuota(balance) {
  const box = el('quota'); box.replaceChildren();
  el('plan').textContent = balance?.data?.planLabel || '';
  if (!balance?.ok) { const p=document.createElement('p'); p.className='muted'; p.textContent=balance?.message || '额度暂不可用，可点击刷新重试'; box.append(p); return; }
  for (const w of balance.data.windows || []) {
    const row=document.createElement('div'); row.className='quota-row';
    const line=document.createElement('div'); line.className='quota-label';
    const label=document.createElement('span'); label.textContent=w.label;
    const number=document.createElement('strong'); number.textContent=`剩余 ${Math.round(w.remaining)}%`;
    line.append(label,number);
    const bar=document.createElement('div'); bar.className='bar';
    const fill=document.createElement('div'); fill.className='fill'; fill.style.width=Math.max(0,Math.min(100,w.remaining))+'%'; bar.append(fill);
    const reset=document.createElement('small'); reset.className='reset';
    reset.textContent=w.resetsAt ? new Date(w.resetsAt*1000).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})+' 重置' : '重置时间未知';
    row.append(line,bar,reset); box.append(row);
  }
}
async function refresh() {
  try {
    const state=await window.pet.status();
    el('activity').textContent=state.ready ? state.work?.task || '暂时没有任务，在这里陪你～' : state.message;
    el('visibility').textContent=state.visible?'隐藏桌宠':'显示桌宠';
    if(state.ready) renderQuota(state.balance);
  } catch { el('activity').textContent='暂时无法连接桌宠'; }
}
document.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',async()=>{
  button.disabled=true; el('notice').textContent='';
  try {
    const action=button.dataset.action;
    if(action==='quota') el('notice').textContent='正在查询最新额度…';
    const result=await window.pet.action(action);
    if(action==='reset') el('reset-result').textContent=result.text;
    if(result?.ok===false) throw new Error(result.message || result.text || '操作未成功，请稍后重试');
    el('notice').textContent=action==='settings'?'修改配置后，请退出软件并重新打开。':action==='quotes'?'保存语录文件后，下次说话即生效。':action==='quota'?'已刷新额度':action==='quote'?'听听她说什么～':'';
    await refresh();
  } catch (error) { el('notice').textContent=error.message || '操作暂未成功，请稍后重试。'; }
  finally { button.disabled=false; }
}));
let stopped=false; window.addEventListener('beforeunload',()=>{stopped=true});
async function loop(){await refresh(); if(!stopped) setTimeout(loop,2000)} loop();

