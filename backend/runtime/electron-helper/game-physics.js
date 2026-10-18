(function(root){
  'use strict';
  function flightPosition(shot,u) {
    const t=Math.max(0,Math.min(1,u));
    return {x:shot.sx+(shot.tx-shot.sx)*t,y:shot.sy+(shot.ty-shot.sy)*t-4*shot.height*t*(1-t),angle:shot.direction*.6*t};
  }
  function movement(vx,vy,dx,dy,dt,speed) {
    const length=Math.hypot(dx,dy)||1,blend=1-Math.exp(-12*Math.max(0,Math.min(.04,dt)));
    return {vx:vx+(dx/length*speed-vx)*blend,vy:vy+(dy/length*speed-vy)*blend};
  }
  const FALL_CHANCE=.2;
  // Unified clip begins at original frame 42. Frame 105 starts the stumble;
  // keep the original consecutive frames through the fall and recovery.
  const RUN_PHASE_END=(105-42)/24;
  function shouldFall(random=Math.random) {return random()<FALL_CHANCE;}
  function runDecision({mediaTime,fallen,running,seeking},random=Math.random) {
    if(fallen||!running||seeking||mediaTime<RUN_PHASE_END)return 'continue';
    return shouldFall(random)?'fall':'loop';
  }
  function createShot({x,y,size,facing,born}) {
    const direction=facing===1?1:-1,factor=size*.00082;
    const ground=y+size*360/640,sx=x+size/2+direction*size*.13,sy=ground-size*.34;
    const distance=size*.95,tx=sx+direction*distance;
    return {sx,sy,tx,ty:ground-90*factor,ground,height:Math.min(Math.max(65,Math.min(180,distance*.3+45)),Math.max(30,sy-24)),duration:Math.max(.65,Math.min(1.2,Math.sqrt(distance)/20)),direction,born,video:null};
  }
  const api={flightPosition,movement,shouldFall,createShot,FALL_CHANCE,RUN_PHASE_END,runDecision};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PetGamePhysics=api;
})(globalThis);
