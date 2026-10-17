import { execFileSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const backend=resolve(dirname(fileURLToPath(import.meta.url)),'../backend');
const tests=['src/shared/codex-quota.test.ts','src/host/local-quotes.test.ts','src/standalone/server.test.ts','src/standalone/options.test.ts','src/host/desktop-geometry.test.ts','src/host/dpi-linearization.test.ts','src/host/pointer-target.test.ts','src/host/host-liveness.test.ts','src/host/topmost-watchdog.test.ts'];
execFileSync(process.execPath,['--experimental-strip-types','--import','./scripts/test-register.mjs','--test',...tests],{cwd:backend,stdio:'inherit',windowsHide:true});
execFileSync(process.execPath,['--test','scripts/tests/codex-activity.test.mjs'],{cwd:backend,stdio:'inherit',windowsHide:true});
