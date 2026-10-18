import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const base='../backend/runtime/electron-helper/';
const read=name=>readFileSync(new URL(base+name,import.meta.url),'utf8');
const {decideWindowIgnore}=require(base+'pointer-target.js');
const {resetWindowInput}=require(base+'visibility-recovery.js');

function sprite() {
  const context=vm.createContext({window:{__dshPetDebug:{}},console:{log(){}},setTimeout,performance,
    toLocal:v=>v,S:{DRAG_THRESHOLD:4,pick:a=>a[0],trimTrail:t=>t}});
  const Pet=vm.runInContext(read('sprite.js')+'\nPetSprite;',context);
  const s=Object.create(Pet.prototype);
  let capture=null;
  Object.assign(s,{pet:{id:'test'},dragState:{active:false,dragging:false},pos:{x:100,y:100},margin:{l:0,t:0},
    hitRect:{x:0,y:0,w:100,h:100},bottomPad:5,stage:{style:{}},animations:{drag:[]},
    hit:{classList:{add(){},remove(){}},setPointerCapture:id=>capture=id,
      hasPointerCapture:id=>capture===id,releasePointerCapture:()=>capture=null},
    setInteractive(v){this.interactive=v;},syncInputBusy(){this.busy=this.dragState.active;},
    stopThrow(){},stopDragFollow(){},stopMove(){},setTip(){},startDragFollow(){}});
  return s;
}
test('forwarded buttons=0 while capture is held must not cancel a press or its subsequent drag',()=>{
  const s=sprite();
  s.onPointerDown({button:0,pointerId:1,screenX:100,screenY:100});
  s.onMouseMove({buttons:0}); // Electron Windows forwarding uses wParam=0.
  assert.equal(s.dragState.active,true);
  s.onPointerMove({pointerId:1,buttons:1,screenX:130,screenY:120});
  assert.equal(s.dragState.dragging,true);
  assert.equal(s.dragTarget.x,130);
});
test('lost release recovers after capture is actually gone; unrelated pointerup cannot cancel a press',()=>{
  const s=sprite();
  s.onPointerDown({button:0,pointerId:1,screenX:100,screenY:100});
  s.onPointerUp({pointerId:2});
  assert.equal(s.dragState.active,true);
  s.hit.releasePointerCapture(1);
  s.onMouseMove({buttons:0});
  assert.equal(s.dragState.active,false);
  assert.equal(s.busy,false);
  assert.equal(s.activePointerId,null);
});
test('repeated presses release capture and remain ready for the next left click',()=>{
  const s=sprite();
  for(let id=1;id<=100;id++) {
    s.onPointerDown({button:0,pointerId:id,screenX:100,screenY:100});
    s.onPointerUp({pointerId:id});
    assert.equal(s.hit.hasPointerCapture(id),false);
    assert.equal(s.dragState.active,false);
    assert.equal(s.busy,false);
  }
});
test('delayed noninteractive IPC cannot break drag capture even when cursor is outside',()=>{
  const main=read('main.js');
  const code=main.match(/ipcMain\.on\('pet:set-interactive', \(event, interactive\) => \{[\s\S]*?\n  \}\);/)[0];
  const win={id:1,isDestroyed:()=>false,getContentBounds:()=>({x:0,y:0,width:200,height:200})};
  let handler,ignore;
  vm.runInNewContext(code,{ipcMain:{on:(_name,fn)=>handler=fn},BrowserWindow:{fromWebContents:()=>win},
    inputRegions:new Map([[1,{dragging:true,rects:[]}]]),inputBusy:new Map([[1,true]]),
    screen:{getCursorScreenPoint:()=>({x:999,y:999})},decideWindowIgnore,setWindowIgnore:(_win,v)=>ignore=v});
  handler({sender:{}},false);
  assert.equal(ignore,false);
});
test('input reset and busy IPC preserve the native window activation capability',()=>{
  const main=read('main.js');
  assert.match(main,/focusable: true,/);
  const win={id:1,isDestroyed:()=>false,setFocusable:()=>assert.fail('must not mutate activation during input')};
  resetWindowInput(win,[new Map()],()=>{});
  const code=main.match(/ipcMain\.on\('pet:input-busy', \(event, busy\) => \{[\s\S]*?\n  \}\);/)[0];
  let handler;
  vm.runInNewContext(code,{ipcMain:{on:(_name,fn)=>handler=fn},BrowserWindow:{fromWebContents:()=>win},
    inputBusy:new Map(),process:{env:{CODEX_PET_HELPER:'1'}}});
  for(let i=0;i<100;i++){handler({sender:{}},true);handler({sender:{}},false);}
});
