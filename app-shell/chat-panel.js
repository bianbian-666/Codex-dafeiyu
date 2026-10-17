(() => {
 const get=id=>document.getElementById(id);let expanded=false,sending=false,last='',serverBusy=false,pollError='',pollTimer,polling=false;
 const api=(action,body)=>window.pet.action(action,body);
 function render(s){
  if(!s.ok)throw new Error(s.message||'聊天记录暂不可用');
  serverBusy=!!s.pending;
  for(const id of ['chat-new','chat-sessions','chat-mode','chat-memory','chat-send','chat-input'])get(id).disabled=sending||serverBusy;
  get('chat-mode').value=s.mode;get('chat-memory').checked=s.useMemory;
  get('memory-preview').textContent=s.memory?.available?s.memory.text:'Codex 尚未记录这些个人信息。可以在下方补充，空缺的信息不会猜测。';
  if(!get('profile-notes').dataset.dirty&&document.activeElement!==get('profile-notes'))get('profile-notes').value=s.memory?.notes||'';
  get('profile-save').disabled=sending||serverBusy;
  const options=JSON.stringify(s.sessions);
  if(get('chat-sessions').dataset.options!==options){get('chat-sessions').replaceChildren(...s.sessions.map(item=>{const o=document.createElement('option');o.value=item.id;o.textContent=item.title;return o;}));get('chat-sessions').dataset.options=options;}
  get('chat-sessions').value=s.active;
  const key=JSON.stringify([s.active,s.messages,s.pending]);if(key===last)return;last=key;
  const box=get('chat-history'),nearBottom=box.scrollHeight-box.scrollTop-box.clientHeight<80;
  box.replaceChildren();
  function bubble(role,text,meta){const row=document.createElement('article');row.className='chat-message '+role;const label=document.createElement('small');label.textContent=role==='user'?'你':'大肥鱼';const p=document.createElement('p');p.textContent=text;row.append(label,p);if(meta){const note=document.createElement('small');note.textContent=meta;row.append(note);}box.append(row);}
  for(const m of s.messages)bubble(m.role,m.content,m.error?'未完成：'+m.error:m.model);
  if(s.pending?.sessionId===s.active){bubble('assistant',s.pending.text||'收到，本鱼正在想怎么回你…','正在回复');get('chat-result').textContent=s.pending.text||'收到，本鱼正在想怎么回你…';}
  if(!s.messages.length&&!s.pending){const p=document.createElement('p');p.className='muted';p.textContent='新鱼塘开张啦，说点什么吧～';box.append(p);}
  if(nearBottom||sending)box.scrollTop=box.scrollHeight;
 }
 async function refresh(){const s=await api('chat-state');render(s);if(pollError&&get('chat-result').textContent===pollError)get('chat-result').textContent='';pollError='';return s;}
 async function command(body){const r=await api('chat-command',body);if(!r.ok)throw new Error(r.message||'操作未成功');return r;}
 function expand(value){expanded=value;get('chat-expanded').hidden=!value;get('chat-expand').textContent=value?'收起对话':'展开对话';get('chat-expand').setAttribute('aria-expanded',String(value));if(value)get('chat-history').scrollTop=get('chat-history').scrollHeight;}
 get('chat-expand').onclick=()=>{expand(!expanded);refresh().catch(e=>get('chat-result').textContent=e.message);};
 get('chat-new').onclick=async()=>{try{render(await command({action:'new'}));get('chat-input').value='';get('chat-result').textContent='新的聊天开始啦，之前的记录仍在。';expand(true);}catch(e){get('chat-result').textContent=e.message;}};
 get('chat-sessions').onchange=async()=>{try{render(await command({action:'select',id:get('chat-sessions').value}));get('chat-result').textContent='';}catch(e){get('chat-result').textContent=e.message;}};
 for(const id of ['chat-mode','chat-memory'])get(id).onchange=async()=>{try{render(await command({action:'settings',mode:get('chat-mode').value,useMemory:get('chat-memory').checked}));}catch(e){get('chat-result').textContent=e.message;}};
 get('profile-notes').oninput=()=>{get('profile-notes').dataset.dirty='1';};
 get('profile-save').onclick=async()=>{try{const s=await command({action:'profile',notes:get('profile-notes').value});delete get('profile-notes').dataset.dirty;render(s);get('profile-status').textContent='已保存，下次聊天就会参考。只保存在桌宠里，不修改 Codex 原始记忆。';}catch(e){get('profile-status').textContent=e.message;}};
 get('chat-form').onsubmit=async event=>{
  event.preventDefault();const text=get('chat-input').value.trim();if(!text||sending||serverBusy)return;
  sending=true;get('chat-send').disabled=true;get('chat-result').textContent='收到！本鱼来啦…';expand(true);
  try{const response=command({action:'send',text});schedulePoll(100);const r=await response;get('chat-input').value='';get('chat-result').textContent=`${r.model} · low`;}catch(e){get('chat-result').textContent=e.message;}finally{sending=false;await refresh().catch(()=>{});}
 };
 function schedulePoll(ms){clearTimeout(pollTimer);pollTimer=setTimeout(poll,ms);}
 async function poll(){if(polling){schedulePoll(100);return;}polling=true;try{await refresh();}catch(e){if(!sending){pollError=e.message;get('chat-result').textContent=pollError;}}finally{polling=false;schedulePoll(sending||serverBusy?150:2000);}}poll();
})();
