const { app, BrowserWindow, Tray, Menu, ipcMain, shell, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { prepareData, checkPackage, readBackendAddress, backendEnvironment } = require('./runtime-utils.cjs');
app.setAppUserModelId('local.codexpet.bluemaid');
const root = __dirname;
const icon = path.join(root, 'assets', 'icon.ico');

if (process.env.CODEX_PET_HELPER === '1') {
  if (process.env.CODEX_PET_TEST_CDP) app.commandLine.appendSwitch('remote-debugging-port', process.env.CODEX_PET_TEST_CDP);
  const rendererData = process.env.CODEX_PET_TEST_CDP && process.env.CODEX_PET_TEST_DATA
    ? path.join(path.resolve(process.env.CODEX_PET_TEST_DATA), 'renderer')
    : path.join(app.getPath('appData'), 'CodexPet', 'renderer');
  fs.mkdirSync(rendererData, { recursive: true });
  app.setPath('userData', rendererData);
  require('./backend/runtime/electron-helper/main.js');
} else {
  const testRun = !!(process.env.CODEX_PET_TEST_CDP && process.env.CODEX_PET_TEST_DATA);
  const userRoot = testRun ? path.join(path.resolve(process.env.CODEX_PET_TEST_DATA), 'profile') : path.join(app.getPath('appData'), 'CodexPet');
  fs.mkdirSync(userRoot, { recursive: true });
  app.setPath('userData', userRoot);
  const data = process.env.CODEX_PET_TEST_CDP && process.env.CODEX_PET_TEST_DATA ? path.resolve(process.env.CODEX_PET_TEST_DATA) : path.join(userRoot, 'data');
  fs.mkdirSync(data, { recursive: true });
  const locked = app.requestSingleInstanceLock();
  if (!locked) app.quit();
  else if (process.argv.includes('--quit')) app.quit();
  else run();

  function run() {
    let panel, tray, child, desktopGuard, quitting = false, visible = true;
    let base, phase = '正在启动桌宠…', backendReady = false;
    const token = randomBytes(32).toString('hex');
    const headers = { Authorization: 'Bearer ' + token };
    const control = path.join(data, 'visibility.json');
    const backend = path.join(root, 'backend');
    const log = fs.createWriteStream(path.join(userRoot, 'app.log'), { flags: 'a' });
    let pendingLog = '';
    function migrate() {
      checkPackage(root);
      prepareData(root, data);
    }
    function setVisible(value) {
      visible = value;
      const temporary = control + '.tmp';
      fs.writeFileSync(temporary, JSON.stringify({ visible }));
      fs.renameSync(temporary, control);
      updateTray();
    }
    async function request(route, method = 'GET', body) {
      const started = Date.now();
      while (!backendReady && !quitting && Date.now() - started < 8000) await new Promise(resolve => setTimeout(resolve, 100));
      if (!backendReady || quitting) throw new Error('桌宠后台正在启动或已停止，请稍后重试；持续出现时请退出软件后重新打开。');
      try {
        // Retry reads only: never replay a chat submission that could consume quota twice.
        for (let attempt = 0; ; attempt++) {
          try {
            const response = await fetch(base + route, { method, headers: { ...headers, ...(body ? {'Content-Type':'application/json'} : {}) }, ...(body ? {body:JSON.stringify(body)} : {}), signal: AbortSignal.timeout(body ? 115000 : 22000) });
            if (!response.ok) throw new Error('后台响应异常');
            return await response.json();
          } catch (error) { if (method !== 'GET' || attempt > 0) throw error; await new Promise(resolve => setTimeout(resolve, 300)); }
        }
      } catch (error) {
        log.write(`[connection] ${new Date().toISOString()} ${method} ${route.split('?')[0]} ${error.cause?.code || error.name || 'unknown'}\n`);
        throw new Error('暂时连接不上桌宠后台，请稍后重试。若刚发送过消息，请先查看聊天记录，避免重复发送。');
      }
    }
    function showPanel() {
      if (!panel || panel.isDestroyed()) createPanel();
      panel.show(); if (panel.isMinimized()) panel.restore(); panel.focus();
    }
    async function openCodex() {
      void request('/dsh-pet-7340/ack','POST').catch(()=>{});
      await new Promise((resolve, reject) => {
        const helper = spawn(path.join(root,'DesktopBridge.exe'),['--open-codex', process.env.CODEX_PET_APP_PATH || 'OpenAI.Codex_2p2nqsd0c76g0!App'],{windowsHide:true,stdio:'ignore'});
        helper.once('error', () => reject(new Error('无法打开 Codex，请检查客户端安装；自定义安装可设置 CODEX_PET_APP_PATH')));
        helper.once('exit', code => code === 0 ? resolve() : reject(new Error('无法打开 Codex，请先手动打开客户端')));
      });
    }
    function createPanel() {
      panel = new BrowserWindow({ width: 490, height: 820, minWidth: 440, minHeight: 640,
        title: '蓝色大肥鱼codex桌宠', icon, backgroundColor: '#f6f8ff', autoHideMenuBar: true,
        webPreferences: { preload: path.join(root, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
      panel.loadFile(path.join(root, 'panel.html'));
      panel.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      panel.webContents.on('will-navigate', event => event.preventDefault());
      panel.on('close', event => { if (!quitting) { event.preventDefault(); panel.hide(); } });
    }
    function updateTray() {
      if (!tray) return;
      tray.setContextMenu(Menu.buildFromTemplate([
        { label: '打开管理窗口', click: showPanel },
        { label: '打开 Codex', click: () => { void openCodex().catch(error => { showPanel(); phase = error.message; }); } },
        { label: '查询 Codex 重置', click: () => { void request('/dsh-pet-7340/reset','POST').catch(()=>{}); } },
        { label: visible ? '隐藏桌宠' : '显示桌宠', click: () => setVisible(!visible) },
        { type: 'separator' },
        { label: '看额度', click: () => { showPanel(); void request('/dsh-pet-7340/balance', 'POST').catch(() => {}); } },
        { label: '碎碎念 · 来一句', click: () => { setVisible(true); void request('/dsh-pet-7340/whisper?pet=main', 'POST').catch(() => {}); } },
        { type: 'separator' },
        { label: '编辑语录', click: () => shell.openPath(path.join(data, 'quotes.json')) },
        { label: '退出蓝色大肥鱼codex桌宠', click: quitApp },
      ]));
    }
    async function quitApp() {
      if (quitting) return;
      quitting = true;
      try { if (backendReady) await fetch(base + '/shutdown', { method: 'POST', headers, signal: AbortSignal.timeout(1500) }); } catch {}
      if (child && child.exitCode === null) child.kill();
      desktopGuard?.kill();
      tray?.destroy(); log.end(); app.quit();
    }
    app.on('second-instance', (_event, args) => { if (args.includes('--quit')) void quitApp(); else showPanel(); });
    app.on('before-quit', event => { if (!quitting) { event.preventDefault(); void quitApp(); } });
    app.on('window-all-closed', () => {});
    app.whenReady().then(() => {
      try { migrate(); } catch (error) { dialog.showErrorBox('桌宠暂时无法启动', error.message); quitting = true; log.end(); app.quit(); return; }
      setVisible(true);
      desktopGuard = spawn(path.join(root, 'DesktopBridge.exe'), [String(process.pid), path.join(data, 'fullscreen.json')], {windowsHide:true,stdio:'ignore'});
      desktopGuard.on('error',()=>{});
      tray = new Tray(icon); tray.setToolTip('蓝色大肥鱼codex桌宠 · Codex'); tray.on('click', showPanel); updateTray();
      ipcMain.handle('pet:status', async () => {
        try {
          const result = await request('/dsh-pet-7340/state');
          return { ready: true, visible, balance: result.sections.balance.data, work: result.sections.workStatus.data };
        } catch { return { ready: false, visible, message: phase }; }
      });
      ipcMain.handle('pet:action', async (_event, action, message) => {
        try {
        if (action === 'open-codex') { await openCodex(); return {ok:true}; }
        if (action === 'chat-state') return await request('/dsh-pet-7340/pet-chat');
        if (action === 'chat-command') return await request('/dsh-pet-7340/pet-chat','POST',message);
        if (action === 'reset') return await request('/dsh-pet-7340/reset','POST');
        if (action === 'chat') return await request('/dsh-pet-7340/chat?pet=main','POST',{text:String(message ?? '').slice(0,2000)});
        if (action === 'toggle') { setVisible(!visible); return { ok: true }; }
        if (action === 'quota') return await request('/dsh-pet-7340/balance', 'POST');
        if (action === 'quote') return await request('/dsh-pet-7340/whisper?pet=main', 'POST');
        if (action === 'quotes') return { ok: !(await shell.openPath(path.join(data, 'quotes.json'))) };
        if (action === 'settings') return { ok: !(await shell.openPath(path.join(data, 'dsh-pet', 'main-config.jsonc'))) };
        if (action === 'folder') return { ok: !(await shell.openPath(data)) };
        if (action === 'quit') { void quitApp(); return { ok: true }; }
        throw new Error('未知操作');
        } catch (error) { return { ok: false, message: error.message || '操作暂未完成，请稍后重试。' }; }
      });
      createPanel();
      const env = { ...backendEnvironment(), DSH_HOME: data, DSH_PET_ELECTRON_PATH: process.execPath,
        DSH_PET_ICON: icon, CODEX_PET_DESKTOP_BRIDGE:path.join(root,'DesktopBridge.exe'), CODEX_PET_HELPER: '1', CODEX_PET_CONTROL: control, CODEX_PET_MANAGER_PID: String(process.pid), CODEX_PET_HTTP_TOKEN: token };
      delete env.ELECTRON_RUN_AS_NODE;
      child = spawn(path.join(root, 'node.exe'), [path.join(root, 'backend-entry.mjs')], { env, cwd: backend, windowsHide: true, stdio: ['ignore','pipe','pipe'] });
      child.stdout.on('data', chunk => {
        log.write(chunk); pendingLog += chunk.toString();
        const lines = pendingLog.split('\n'); pendingLog = lines.pop();
        for (const line of lines) {
          const address = readBackendAddress(line);
          if (address) { base = address; backendReady = true; phase = '桌宠已启动'; }
        }
      });
      child.stderr.on('data', chunk => log.write(chunk));
      child.on('error', () => { backendReady = false; phase = '桌宠启动失败，请退出后重试'; });
      child.on('exit', () => { backendReady = false; if (!quitting) phase = '桌宠已停止，请退出软件后重新打开'; });
    });
  }
}


