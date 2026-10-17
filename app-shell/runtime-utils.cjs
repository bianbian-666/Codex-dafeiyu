const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function backendEnvironment(source = process.env) {
  const env = { ...source, NODE_USE_ENV_PROXY: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  env.NO_PROXY = [env.NO_PROXY || env.no_proxy, 'localhost', '127.0.0.1', '[::1]'].filter(Boolean).join(',');
  if (process.platform !== 'win32' || env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy) return env;
  try {
    const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';
    const read = name => execFileSync('reg.exe', ['query', key, '/v', name], {encoding:'utf8',windowsHide:true,timeout:1500});
    if (!/REG_DWORD\s+0x1\b/.test(read('ProxyEnable'))) return env;
    const raw = read('ProxyServer').match(/REG_SZ\s+([^\r\n]+)/)?.[1]?.trim();
    const address = raw?.includes('=') ? raw.split(';').find(s=>s.startsWith('https='))?.slice(6) || raw.split(';').find(s=>s.startsWith('http='))?.slice(5) : raw;
    if (address) {
      const url = new URL(address.includes('://') ? address : 'http://' + address);
      if (['http:', 'https:'].includes(url.protocol)) { env.HTTPS_PROXY=url.href; env.HTTP_PROXY=url.href; }
    }
  } catch { /* An unavailable system proxy does not prevent offline features. */ }
  return env;
}

function prepareData(root, data) {
  fs.mkdirSync(data, { recursive: true });
  for (const relative of ['quotes.json', 'dsh-pet/main-config.jsonc']) {
    const target = path.join(data, relative);
    if (!fs.existsSync(target)) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(root, 'defaults', relative), target);
    }
  }
}

function checkPackage(root) {
  const required = ['node.exe','backend-entry.mjs','DesktopBridge.exe','backend/lib/standalone.js',
    'backend/assets/config.jsonc','backend/runtime/electron-helper/main.js','assets/icon.ico',
    'defaults/quotes.json','defaults/dsh-pet/main-config.jsonc'];
  const missing = required.filter(file => !fs.existsSync(path.join(root, file)));
  if (missing.length) throw new Error('程序文件不完整，请完整解压发布包后重试。缺少：' + missing.join('、'));
}

function readBackendAddress(line) {
  const match = line.match(/服务已监听 (http:\/\/127\.0\.0\.1:(\d+))\//);
  return match && Number(match[2]) > 0 && Number(match[2]) <= 65535 ? match[1] : null;
}

module.exports = { prepareData, checkPackage, readBackendAddress, backendEnvironment };
