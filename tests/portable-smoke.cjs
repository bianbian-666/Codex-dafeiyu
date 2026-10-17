const { _electron: electron, chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn, execFileSync } = require('node:child_process');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, timeout=20000) { const start=Date.now(); let last; for(;;) { try { if(await fn()) return; } catch(e) {last=e;} if(Date.now()-start>timeout)throw last||new Error('Condition did not become true'); await delay(200); } }
async function freePort(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}

(async()=>{
 const root=path.resolve(__dirname,'..'),version=require('../package.json').version;
 const original=path.join(root,'dist',`CodexPet-v${version}-windows-x64`);
 const relocated=path.join(root,'dist',`中文 空格 # CodexPet-v${version}`);
 const data=fs.mkdtempSync(path.join(os.tmpdir(),'大肥鱼 portable '));
 const port=await freePort();
 fs.renameSync(original,relocated);
 const env={...process.env,CODEX_PET_TEST_CDP:String(port),CODEX_PET_TEST_DATA:data};
 delete env.ELECTRON_RUN_AS_NODE;
 if(process.env.CODEX_PET_TEST_LIVE!=='1') {env.CODEX_PET_CODEX_PATH=path.join(data,'未安装 Codex.exe');env.CODEX_HOME=path.join(data,'empty-codex');}
 let application,petBrowser,mainPid;
 try {
  application=await electron.launch({executablePath:path.join(relocated,'CodexPet.exe'),env,timeout:30000});
  mainPid=await application.evaluate(()=>process.pid);
  const page=await application.firstWindow();
  await page.waitForSelector('#chat-sessions option',{state:'attached',timeout:30000});
  await page.waitForFunction(()=>!document.querySelector('#activity').textContent.includes('正在准备'),{timeout:30000});
  if(process.env.CODEX_PET_TEST_LIVE==='1')await page.waitForSelector('#quota .quota-row',{timeout:45000});
  if(process.env.CODEX_PET_TEST_LIVE!=='1')await page.waitForFunction(()=>document.querySelector('#quota').textContent.includes('未找到 Codex'),{timeout:30000});
  await until(async()=>{try{petBrowser=await chromium.connectOverCDP('http://127.0.0.1:'+port);return true;}catch{return false;}});
  const pet=petBrowser.contexts()[0].pages()[0];
  await pet.waitForFunction(()=>Array.from(document.querySelectorAll('video')).some(v=>v.readyState>=2&&v.videoWidth>0),{timeout:30000});
  console.log('PASS relocated Chinese/space/# path, first-run defaults, bundled runtime, decoded transparent animation');
  const log=fs.readFileSync(path.join(data,'profile','app.log'),'utf8');
  const base=log.match(/服务已监听 (http:\/\/127\.0\.0\.1:\d+)\//)?.[1];assert.ok(base);
  assert.equal((await fetch(base+'/health')).status,403);
  assert.equal((await fetch(base+'/dsh-pet-7340/pet-chat')).status,403);
  console.log('PASS per-launch manager authentication; anonymous access to chat data is rejected');
  await page.click('#visibility');
  await until(()=>JSON.parse(fs.readFileSync(path.join(data,'visibility-state.json'))).visible===false);
  await page.click('#visibility');
  await until(()=>JSON.parse(fs.readFileSync(path.join(data,'visibility-state.json'))).visible===true);
  await page.click('[data-action="quote"]');
  await pet.waitForFunction(()=>document.querySelector('.pet-bubble')?.textContent.trim().length>0);
  assert.equal(await page.locator('#chat-mode').inputValue(),'auto');
  const old=await page.locator('#chat-sessions').inputValue();await page.click('#chat-new');
  await page.waitForFunction(id=>document.querySelector('#chat-sessions').value!==id,old);
  const fresh=await page.locator('#chat-sessions').inputValue();
  await page.uncheck('#chat-memory');await page.waitForTimeout(500);
  await page.fill('#chat-input',process.env.CODEX_PET_TEST_LIVE==='1'?'请只回复：小鱼干收到。':'你好');
  await page.click('#chat-send');
  await page.waitForFunction(()=>!document.querySelector('#chat-send').disabled,{timeout:115000});
  if(process.env.CODEX_PET_TEST_LIVE==='1')assert.match(await page.locator('#chat-result').textContent(),/ · low/);
  else assert.match(await page.locator('#chat-result').textContent(),/找不到 Codex/);
  await page.reload();await page.waitForSelector('#chat-sessions option',{state:'attached'});
  assert.equal(await page.locator('#chat-sessions').inputValue(),fresh);
  assert.equal(await page.locator('#chat-memory').isChecked(),false);
  await page.click('#chat-expand');
  await page.selectOption('#chat-sessions',old);
  console.log('PASS hide/show, local quote, new/switch/reload history, model mode, memory toggle, '+(process.env.CODEX_PET_TEST_LIVE==='1'?'live account reply':'missing-Codex chat error without retry'));
  const second=spawn(path.join(relocated,'CodexPet.exe'),[],{env,windowsHide:true,stdio:'ignore'});
  await new Promise(r=>second.once('exit',r));
  assert.equal(await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().filter(w=>!w.isDestroyed()).length),1);
  await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());
  assert.equal(await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible()),false);
  await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].show());
  console.log('PASS single instance and close-to-tray');
  if(process.env.CODEX_PET_TEST_LIVE==='1') {
    await page.click('[data-action="reset"]');
    await page.waitForFunction(()=>!document.querySelector('[data-action="reset"]').disabled,null,{timeout:20000});
    assert.match(await page.locator('#reset-result').textContent(),/暂无官方|重置预告|联系不上/);
    await page.click('[data-action="open-codex"]');
    await pet.waitForFunction(()=>sprites[0].anim==='点击回应-收到敬礼');
    console.log('PASS live quota, reset response/error handling and open-Codex salute');
  }
  const compiler=path.join(process.env.WINDIR,'Microsoft.NET','Framework64','v4.0.30319','csc.exe');
  const probeExe=path.join(data,'FullscreenProbe.exe'),probeResult=path.join(data,'fullscreen-result.txt');
  execFileSync(compiler,['/nologo','/target:winexe','/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll','/out:'+probeExe,path.join(__dirname,'FullscreenProbe.cs')],{windowsHide:true});
  const probe=spawn(probeExe,[probeResult],{windowsHide:true,stdio:'ignore'});
  await until(()=>JSON.parse(fs.readFileSync(path.join(data,'fullscreen.json'))).fullscreen===true);
  await until(()=>JSON.parse(fs.readFileSync(path.join(data,'visibility-state.json'))).visible===false);
  await new Promise(r=>probe.once('exit',r));
  assert.equal(fs.readFileSync(probeResult,'utf8'),'PASS');
  await until(()=>JSON.parse(fs.readFileSync(path.join(data,'visibility-state.json'))).visible===true);
  console.log('PASS real fullscreen window retains focus; pet hides and restores');
  if(process.env.CODEX_PET_TEST_LIVE!=='1') {
   fs.mkdirSync(path.join(root,'docs'),{recursive:true});
   await page.screenshot({path:path.join(root,'docs','portable-preview.png')});
  }
  await page.evaluate(()=>window.pet.action('quit')).catch(()=>{});
  await delay(2500);
  await assert.rejects(fetch(base+'/health'));
  console.log('PASS graceful shutdown releases backend port');
 } catch (error) { console.error('SMOKE FAILURE:',error); throw error; } finally {
  await petBrowser?.close().catch(()=>{});
  if(application) {
    await Promise.race([application.evaluate(({app})=>app.exit(0)).catch(()=>{}),delay(2000)]);
    try { application.process()?.kill(); } catch {}
    if(mainPid)try{execFileSync('taskkill.exe',['/PID',String(mainPid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}catch{}
  }
  await until(()=>{fs.renameSync(relocated,original);return true;},10000);
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
