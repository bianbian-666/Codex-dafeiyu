import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createShot,flightPosition,shouldFall,FALL_CHANCE}=require('../backend/runtime/electron-helper/game-physics.js');

test('fall probability is 20 percent per completed run cycle, with an exact threshold',()=>{
  assert.equal(FALL_CHANCE,.2);
  assert.equal(shouldFall(()=>.199999),true);assert.equal(shouldFall(()=>.2),false);
  assert.equal(Array.from({length:100},(_,i)=>shouldFall(()=>i/100)).filter(Boolean).length,20);
});
test('facing determines both spawn and target: left and right have the same range and flight time',()=>{
  for(const x of [-140,10,1200,2400]) {
    const input={x,y:500,size:500,born:100},center=x+250;
    const left=createShot({...input,facing:-1}),right=createShot({...input,facing:1});
    assert.equal(left.direction,-1);assert.equal(right.direction,1);
    assert.equal(left.sx-left.tx,right.tx-right.sx);assert.equal(left.duration,right.duration);
    assert.equal(left.ground,right.ground);assert.equal(left.height,right.height);
    for(const u of [0,.2,.5,.8,1]) {
      const l=flightPosition(left,u),r=flightPosition(right,u);
      assert.ok(Math.abs(l.x+r.x-2*center)<1e-9);assert.equal(l.y,r.y);
    }
  }
});
test('a shot captures its facing and ground at launch, independent of subsequent movement',()=>{
  const input={x:400,y:300,size:450,facing:1,born:0};
  const shot=createShot(input),target=flightPosition(shot,1);
  input.x=200;input.y=900;input.facing=-1;
  assert.deepEqual(flightPosition(shot,1),target);assert.equal(shot.direction,1);
});
