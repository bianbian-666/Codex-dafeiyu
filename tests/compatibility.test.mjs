import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolveCodexExecutable, normalizeLimits, readUsage } from '../backend/runtime/codex-usage/usage.mjs';
import { selectChatModel } from '../backend/runtime/codex-chat.mjs';
import { conversations, readUserSummary } from '../backend/runtime/pet-conversations.mjs';
import { ActivityReader } from '../backend/runtime/codex-activity.mjs';
const require = createRequire(import.meta.url);
const { prepareData, checkPackage, readBackendAddress } = require('../app-shell/runtime-utils.cjs');
const temp = () => mkdtempSync(join(tmpdir(), '大肥鱼 compatibility '));
const touch = file => { mkdirSync(join(file, '..'), { recursive: true }); writeFileSync(file, ''); return file; };
const model = (name, extra={}) => ({model:name, supportedReasoningEfforts:[{reasoningEffort:'low'}], ...extra});

test('account model list: public names, default, hidden, unavailable, explicit families', () => {
  assert.equal(selectChatModel([model('gpt-5.4-mini'),model('gpt-5.4',{isDefault:true})]), 'gpt-5.4');
  assert.equal(selectChatModel([model('secret',{hidden:true}),model('available')]), 'available');
  assert.throws(() => selectChatModel([]), /没有/);
  assert.throws(() => selectChatModel([model('gpt-5.4')], 'sol'), /sol/);
  assert.equal(selectChatModel([model('gpt-6-sol'),model('gpt-5.6-sol')], 'sol'), 'gpt-5.6-sol');
  assert.equal(selectChatModel([model('gpt-6-luna'),model('gpt-5.6-luna')], 'luna'), 'gpt-5.6-luna');
  assert.throws(() => selectChatModel([model('gpt-5.4',{supportedReasoningEfforts:[]})]));
});
test('CLI discovery: no installation, explicit path, invalid override, PATH with spaces', () => {
  const root=temp(), cli=touch(join(root,'Codex 路径','codex.exe'));
  assert.equal(resolveCodexExecutable(undefined,{env:{},platform:'win32'}),undefined);
  assert.equal(resolveCodexExecutable(undefined,{env:{CODEX_PET_CODEX_PATH:cli},platform:'win32'}),cli);
  assert.equal(resolveCodexExecutable('missing',{env:{PATH:join(cli,'..')},platform:'win32'}),undefined);
  assert.equal(resolveCodexExecutable(undefined,{env:{PATH:'"'+join(cli,'..')+'"'},platform:'win32'}),cli);
});
test('CLI discovery: versioned desktop app and global npm native executable', () => {
  const root=temp(), desktop=touch(join(root,'OpenAI','Codex','bin','new-version','codex.exe'));
  assert.equal(resolveCodexExecutable(undefined,{env:{LOCALAPPDATA:root},platform:'win32'}),desktop);
  const npm=join(root,'npm'),cli=touch(join(npm,'node_modules','@openai','codex','vendor','x86_64-pc-windows-msvc','codex','codex.exe'));
  assert.equal(resolveCodexExecutable(undefined,{env:{PATH:npm},platform:'win32'}),cli);
});
test('Chinese, spaces and # install paths retain correct Windows URL decoding', () => {
  const root=temp(), url=new URL('./backend/lib/standalone.js',new URL('file:///'+root.replaceAll('\\','/')+'/app%20%23/entry.mjs'));
  assert.equal(fileURLToPath(url).includes('%20'),false);
  const address=readBackendAddress('[INFO] 独立模式服务已监听 http://127.0.0.1:54321/');
  assert.equal(address,'http://127.0.0.1:54321');
  assert.equal(readBackendAddress('http://example.org:123/'),null);
});
test('first run creates defaults under writable user data; upgrades preserve edits', () => {
  const root=temp(), data=join(temp(),'用户数据');
  touch(join(root,'defaults','dsh-pet','main-config.jsonc'));
  touch(join(root,'defaults','quotes.json'));
  prepareData(root,data);
  writeFileSync(join(data,'quotes.json'),'["我的语录"]');
  prepareData(root,data);
  assert.equal(readFileSync(join(data,'quotes.json'),'utf8'),'["我的语录"]');
  assert.throws(()=>checkPackage(root),/完整解压/);
});
test('missing memories, no status database and no Codex CLI do not break local features', async () => {
  const dir=temp();
  assert.equal(readUserSummary(dir).available,false);
  const reader=new ActivityReader(dir); assert.equal(reader.read().state,null); reader.close();
  const result=await readUsage(join(dir,'missing.exe'),{timeoutMs:1000});
  assert.equal(result.ok,false); assert.match(result.error,/安装|程序/);
  const service=conversations(dir,async()=>({ok:false,message:'请先登录 Codex'}));
  assert.equal(service.snapshot().mode,'auto');
  const failed=await service.command({action:'send',text:'你好'});
  assert.equal(failed.ok,false); assert.equal(service.snapshot().pending,null);
  assert.match(service.snapshot().messages[0].error,/登录/);
  assert.equal((await service.command({action:'new'})).ok,true);
});
test('quota windows follow real account values, including 30 days and empty windows', () => {
  assert.equal(normalizeLimits({rateLimits:{primary:{windowDurationMins:43200,usedPercent:30}}}).windows[0].remaining,70);
  assert.equal(normalizeLimits({rateLimits:{primary:{windowDurationMins:300,usedPercent:0,resetsAt:null}}}).windows[0].remaining,100);
  assert.equal(normalizeLimits({rateLimits:{}}).ok,false);
  assert.equal(normalizeLimits({rateLimits:{primary:{windowDurationMins:300,usedPercent:NaN}}}).queryOk,false);
});
test('memory import selects personal headings, bounds length, excludes operation guides', () => {
  const root=temp();mkdirSync(join(root,'memories'));
  writeFileSync(join(root,'memories','memory_summary.md'),'v1\n## User Profile\n喜欢小鱼干\n## General Tips\nPRIVATE_GUIDE\n');
  assert.match(readUserSummary(root).text,/小鱼干/);
  assert.equal(readUserSummary(root).text.includes('PRIVATE_GUIDE'),false);
});
