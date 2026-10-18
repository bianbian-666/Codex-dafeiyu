'use strict';
(async()=>{
  const info=await window.petGame.init();if(!info)return;
  const canvas=document.getElementById('world'),ctx=canvas.getContext('2d');
  const status=document.getElementById('game-status'),clearButton=document.getElementById('clear');
  const dpi=Math.min(devicePixelRatio||1,1.5);
  canvas.width=Math.round(innerWidth*dpi);canvas.height=Math.round(innerHeight*dpi);ctx.scale(dpi,dpi);
  const keys=new Set(),shots=[];let last=performance.now(),lastReport=0,lastShot=-1e9,closed=false,fallen=false,isRunning=false;
  let x=info.x-info.area.x,y=info.y-info.area.y,vx=0,vy=0,facing=info.facing==='right'?1:-1;
  const size=info.size,factor=size*.00082,base='dsh-pet-bridge://dsh-pet/dsh-pet-7340';
  function video(src) {const v=document.createElement('video');v.muted=true;v.playsInline=true;v.src=src;v.preload='auto';v.addEventListener('error',()=>status.textContent='素材未加载成功，请退出后重试');return v;}
  const idle=video(info.assetBase+encodeURIComponent(info.idle)+'.webm');idle.loop=true;
  const controlAssets=base+'/thumb/main/';
  const run=video(controlAssets+encodeURIComponent('控制-奔跑摔倒')+'.webm');
  const fall=run; // One decoder and one continuous timeline at the fall seam.
  run.loop=false;run.load();
  let lastFallEnd=null;
  const bowl=new Image();bowl.src=base+'/pic/rice-bowl.png';
  const impactSrc=info.assetBase+encodeURIComponent('白饭落地')+'.webm';
  const impactTemplate=video(impactSrc);impactTemplate.load();
  await Promise.all([idle.play().catch(()=>{}),bowl.decode().catch(()=>{})]);
  const normalStatus='每圈奔跑有 20% 概率摔倒；摔倒时暂停操作，播完恢复。';
  status.textContent=normalStatus;
  function exit(){if(closed)return;closed=true;keys.clear();for(const v of [idle,run,fall,...shots.map(s=>s.video)])v?.pause();window.petGame.exit({x,y,facing});}
  function finishFall(){if(!fallen)return;fallen=false;keys.clear();vx=vy=0;fall.pause();run.currentTime=0;clearButton.disabled=false;status.textContent=normalStatus;}
  function startFall(){
    if(fallen||closed)return;
    fallen=true;isRunning=false;keys.clear();vx=vy=0;clearButton.disabled=true;
    status.textContent='摔倒中，动画播放完后恢复操作。';
    // Deliberately do not seek, pause, reset or replace the playing video.
  }
  fall.addEventListener('error',()=>{finishFall();status.textContent='摔倒素材暂未能播放，请退出后重试。';});
  run.addEventListener('ended',()=>{
    if(closed)return;
    if(fallen){lastFallEnd={ended:run.ended,mediaTime:run.currentTime,duration:run.duration};finishFall();}
    else run.currentTime=0;
  });
  function decideRun(mediaTime) {
    const decision=PetGamePhysics.runDecision({mediaTime,fallen,running:isRunning,seeking:run.seeking});
    if(decision==='fall')startFall();
    else if(decision==='loop')run.currentTime=0;
  }
  if(run.requestVideoFrameCallback) {
    const onFrame=(_now,meta)=>{if(closed)return;decideRun(meta.mediaTime);run.requestVideoFrameCallback(onFrame);};
    run.requestVideoFrameCallback(onFrame);
  }
  document.getElementById('exit').onclick=exit;
  clearButton.onclick=()=>{if(fallen)return;for(const s of shots)s.video?.pause();shots.length=0;};
  window.addEventListener('keydown',e=>{
    if(e.code==='Escape'){e.preventDefault();exit();return;}
    if(['KeyW','KeyA','KeyS','KeyD'].includes(e.code)){
      e.preventDefault();if(fallen)return;keys.add(e.code);
      if(e.code==='KeyA')facing=-1;else if(e.code==='KeyD')facing=1;
    }
  });
  window.addEventListener('keyup',e=>keys.delete(e.code));
  window.addEventListener('blur',exit);document.addEventListener('visibilitychange',()=>{if(document.hidden)exit();});
  canvas.addEventListener('pointerdown',e=>{
    if(e.button!==0 || closed || fallen || performance.now()-lastShot<800 || shots.length>=3 || !bowl.complete || !bowl.naturalWidth)return;
    lastShot=performance.now();
    shots.push(PetGamePhysics.createShot({x,y,size,facing,born:performance.now()}));
  });
  function frame(now) {
    if(closed)return;
    const dt=Math.min(.04,(now-last)/1000);last=now;
    // Fallback and current-frame guard; when falling, runDecision never draws
    // another random value or changes the uninterrupted playback timeline.
    decideRun(run.currentTime);
    const dx=Number(keys.has('KeyD'))-Number(keys.has('KeyA')),dy=Number(keys.has('KeyS'))-Number(keys.has('KeyW'));
    if(!fallen) {
      ({vx,vy}=PetGamePhysics.movement(vx,vy,dx,dy,dt,size*.8));
      x=Math.max(-size*200/640,Math.min(innerWidth-size*440/640,x+vx*dt));
      y=Math.max(60-size*80/640,Math.min(innerHeight-size*360/640,y+vy*dt));
      if(dx)facing=dx>0?1:-1;
    }
    if(now-lastReport>33){window.petGame.position({x,y,facing});lastReport=now;}
    isRunning=!fallen&&Math.hypot(vx,vy)>8;
    if(isRunning && run.paused && !run.ended)run.play().catch(()=>{});
    else if(!isRunning&&!fallen)run.pause();
    const v=fallen?fall:isRunning&&run.readyState>=2?run:idle;
    ctx.clearRect(0,0,innerWidth,innerHeight);
    if(v.readyState>=2) {
      ctx.save();ctx.translate(x+size/2,y+size*30/640);ctx.scale(facing>0?-1:1,1);
      ctx.drawImage(v,-size/2,0,size,size*360/640);ctx.restore();
    }
    for(let i=shots.length-1;i>=0;i--) {
      const s=shots[i],elapsed=(now-s.born)/1000,u=elapsed/s.duration;
      if(u<1) {
        const p=PetGamePhysics.flightPosition(s,u);ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);
        ctx.drawImage(bowl,-bowl.width*factor/2,-bowl.height*factor/2,bowl.width*factor,bowl.height*factor);ctx.restore();
      }else {
        if(!s.video) {s.video=video(impactSrc);s.video.play().catch(()=>{status.textContent='落地动画暂未能播放';});s.landed=now;}
        if(s.video.readyState>=2) {
          ctx.save();ctx.translate(s.tx,s.ground);ctx.scale(s.direction,1);
          ctx.drawImage(s.video,-420*factor,-570*factor,724*factor,640*factor);ctx.restore();
        }
        if(s.video.ended || now-s.landed>5000){s.video.pause();s.video.removeAttribute('src');shots.splice(i,1);}
      }
    }
    requestAnimationFrame(frame);
  }
  window.__petGameDebug={shots,position:()=>({x,y}),state:()=>({fallen,isRunning,facing,lastFallEnd}),keys,exit,run,fall};
  requestAnimationFrame(frame);
})().catch(()=>{document.getElementById('game-status').textContent='控制模式未能启动，请退出后重试';});
