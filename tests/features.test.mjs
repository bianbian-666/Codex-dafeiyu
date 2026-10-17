import test from 'node:test';import assert from 'node:assert/strict';
import {lowestSol} from '../backend/runtime/codex-chat.mjs';
import {classifyReset} from '../backend/runtime/codex-reset.mjs';
const model=(model,hidden=false)=>({model,hidden,supportedReasoningEfforts:[{reasoningEffort:'low'}]});
test('lowest numeric version, excludes hidden and other families',()=>{assert.equal(lowestSol([model('gpt-6.1-sol'),model('gpt-5.6-luna'),model('gpt-5.6-sol'),model('gpt-6-sol'),model('gpt-4-sol',true)]),'gpt-5.6-sol');assert.equal(lowestSol([model('gpt-10-sol'),model('gpt-6-sol')]),'gpt-6-sol');assert.throws(()=>lowestSol([model('gpt-5.6-terra')]))});
const now=Date.now(),iso=n=>new Date(n).toISOString();
const signal={at:iso(now-1000),summary:'official reset upcoming',window:{label:'within hours',start_at:iso(now+3600000),end_at:iso(now+7200000)}};
test('teases and predictions never become official confirmation',()=>assert.equal(classifyReset({official_signal:null,last_reset_at:null,probability_24h:1,tease_signal:{tier:'T2'}},now).status,'quiet'));
test('active official window, expired and already landed',()=>{assert.equal(classifyReset({official_signal:signal,last_reset_at:null},now).status,'confirmed');assert.equal(classifyReset({official_signal:signal,last_reset_at:iso(now)},now).status,'quiet');assert.equal(classifyReset({official_signal:signal,last_reset_at:null},now+7200000).status,'quiet');assert.throws(()=>classifyReset({}))});
