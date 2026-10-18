import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {RUN_PHASE_END,runDecision}=require('../backend/runtime/electron-helper/game-physics.js');

test('keep moving through the preparatory running frames; decide only at actual stumble onset',()=>{
  let rolls=0;const random=()=>{rolls++;return 0;};
  const phase={fallen:false,running:true,seeking:false};
  assert.equal(RUN_PHASE_END,2.625);
  for(const mediaTime of [0,1.75,2.3,2.624])assert.equal(runDecision({...phase,mediaTime},random),'continue');
  assert.equal(rolls,0);
  assert.equal(runDecision({...phase,mediaTime:2.625},random),'fall');assert.equal(rolls,1);
});
test('a chosen fall runs uninterrupted; idle and seeking states do not repeat probability rolls',()=>{
  const noRoll=()=>assert.fail('an ineligible phase must not reroll');
  assert.equal(runDecision({fallen:true,running:false,seeking:false,mediaTime:3.5},noRoll),'continue');
  assert.equal(runDecision({fallen:false,running:false,seeking:false,mediaTime:2.7},noRoll),'continue');
  assert.equal(runDecision({fallen:false,running:true,seeking:true,mediaTime:2.7},noRoll),'continue');
  assert.equal(runDecision({fallen:false,running:true,seeking:false,mediaTime:2.625},()=>.9),'loop');
});
