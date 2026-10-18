'use strict';
(() => {
  const style=document.createElement('style');
  style.textContent='.pet-bub-stale{font-style:italic;color:#77818f;font-size:.8em}.pet-sticky{position:fixed;width:220px;max-height:190px;overflow:auto;padding:12px;background:rgba(255,248,223,.97);color:#514b39;border:1px solid #e9d8a1;border-radius:14px;box-shadow:0 5px 20px #2b344b22;z-index:9;font:12px/1.5 "Microsoft YaHei",sans-serif;pointer-events:auto;overflow-wrap:anywhere}.pet-sticky strong{display:block}.pet-sticky p{margin:6px 0}.pet-sticky button{font:inherit;background:#fffaf1;border:1px solid #e8d9b4;border-radius:7px;color:#65552f;padding:4px 7px;margin:3px 3px 0 0;cursor:pointer}.pet-sticky em{font-size:11px;color:#897544}.pet-sticky[hidden]{display:none}';
  document.head.append(style);
  const pin=document.createElement('aside');pin.className='pet-sticky';pin.hidden=true;pin.setAttribute('aria-live','polite');document.body.append(pin);
  let signature='',state=null,notified=new Set(),connectionFailed=false;
  async function call(route,payload) {
    const response=await fetch(BASE+route,{method:payload?'POST':'GET',cache:'no-store',...(payload?{headers:{'content-type':'application/json'},body:JSON.stringify(payload)}:{})});
    const result=await response.json();if(!response.ok||result.ok===false)throw new Error(result.message||'暂时连接不上后台');return result;
  }
  window.showPetReminders=s=>{call('/manager',{}).catch(()=>s.showWhisper('管理窗口暂时打不开，请从托盘打开。'));};
  window.startPetControl=s=>{
    s.closeMenu();s.stopMove();s.stopThrow();
    window.petBridge?.startControl({petId:s.pet.id,size:toScreen(s.size),x:toScreen(s.pos.x+VIEW.x),y:toScreen(s.pos.y+VIEW.y),
      assetBase:s.assetBase,idle:s.animations.idle[0],facing:s.facing});
  };
  async function command(payload) {
    try{state=await call('/reminders',payload);signature='';paint();}
    catch(error){const p=document.createElement('p');p.textContent=error.message;pin.append(p);}
  }
  function button(text,fn) {
    const b=document.createElement('button');b.textContent=text;b.onclick=e=>{e.stopPropagation();fn();};return b;
  }
  function paint() {
    const s=sprites[0];if(!s||!state)return;
    const alerts=state.alerts||[];
    s.stickyOn=!!alerts.length;s.syncInputBusy();
    const sig=JSON.stringify([alerts,state.collapsed]);
    if(sig!==signature) {
      signature=sig;pin.replaceChildren();pin.hidden=!alerts.length;
      s.stickyOn=!!alerts.length;s.syncInputBusy();
      if(alerts.length) {
        if(state.collapsed)pin.append(button(`⏰ ${alerts.length} 件事等你处理`,()=>command({action:'collapse',value:false})));
        else {
          const alert=alerts[0];const title=document.createElement('strong');title.textContent='本鱼帮你记着：'+alert.item.title;
          const due=document.createElement('p');due.textContent=new Date(alert.dueAt).toLocaleString('zh-CN',{timeZone:alert.item.zone})+(alert.dueAt<=Date.now()?' · 已到点':' · 提前提醒');
          const count=document.createElement('em');count.textContent=alerts.length>1?`还有 ${alerts.length-1} 项待处理`:'先办正事，白饭等会儿吃。';
          pin.append(title,due,count,document.createElement('br'),
            button('完成',()=>command({action:'complete',id:alert.reminderId})),
            button('15 分钟后',()=>command({action:'snooze',id:alert.reminderId})),
            button('收起',()=>command({action:'collapse',value:true})),
            button('全部提醒',()=>window.showPetReminders(s)));
        }
      }
      for(const alert of alerts)if(!notified.has(alert.id)) {
        notified.add(alert.id);
        if(notified.size>512)notified.delete(notified.values().next().value);
        if(!state.collapsed)s.showWhisper('这件事该惦记啦：'+alert.item.title);
      }
    }
    if(!pin.hidden) {
      const clamp=s.visibleClampRect();
      if(clamp) {
        pin.style.width=Math.max(100,Math.min(220,clamp.w-16))+'px';
        pin.style.maxHeight=Math.max(80,Math.min(190,clamp.h-16))+'px';
        pin.style.left=Math.max(clamp.x+8,Math.min(clamp.x+clamp.w-pin.offsetWidth-8,s.hit.getBoundingClientRect().left-pin.offsetWidth-12))+'px';
        pin.style.top=Math.max(clamp.y+8,Math.min(clamp.y+clamp.h-pin.offsetHeight-8,s.hit.getBoundingClientRect().top))+'px';
      }
      s.syncInputRegions();
    }
  }
  async function loop() {
    try {
      state=await call('/reminders');connectionFailed=false;paint();
      if(state.controlRequest && CONFIG.petIndex===0 && sprites[0]) {
        const consumed=await call('/control',{action:'consume',id:state.controlRequest});
        if(consumed.accepted)window.startPetControl(sprites[0]);
      }
    }catch(error){if(!connectionFailed)console.warn('[pet-features] local reminder connection failed');connectionFailed=true;}
    setTimeout(loop,2000);
  }
  void loop();
})();
