const parent = Number(process.env.CODEX_PET_MANAGER_PID);
if (Number.isSafeInteger(parent) && parent > 0) setInterval(() => {
  try { process.kill(parent, 0); } catch { process.exit(0); }
}, 2000).unref();
process.argv = [process.execPath, fileURLToPath(new URL('./backend/lib/standalone.js', import.meta.url)), '--port', '0'];
await import('./backend/lib/standalone.js');
import { fileURLToPath } from 'node:url';
