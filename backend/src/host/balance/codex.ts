import type { BalanceResult } from './types';
import { join } from 'node:path';
import { dshHomeDir } from '../helper-process';

// The MIT-licensed read-only client is vendored from T7moris/GPT-Niang.
// No credential files, conversations, or model calls are used by this adapter.
let pending: Promise<BalanceResult> | undefined;
export function queryCodexBalance(): Promise<BalanceResult> {
  if (pending) return pending;
  pending = read().finally(() => { pending = undefined; });
  return pending;
}
async function read(): Promise<BalanceResult> {
  const backend = await import(new URL('../runtime/codex-usage/usage.mjs', import.meta.url).href);
  const cli = backend.resolveCodexExecutable(process.env.CODEX_PET_CODEX_PATH || process.env.DSH_PET_CODEX_PATH);
  const cache = await import(new URL('../runtime/quota-cache.mjs', import.meta.url).href);
  return cache.cachedQuota({file:join(dshHomeDir(), 'quota-latest.json'),cli,readUsage:backend.readUsage});
}
