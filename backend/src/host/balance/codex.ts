import type { BalanceResult } from './types';

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
  if (!cli) return { ok: false, provider: 'codex', reason: 'fetch-error', message: '未找到 Codex，请先安装并登录客户端' };
  const result = await backend.readUsage(cli);
  if (!result.ok || !result.queryOk) {
    return { ok: false, provider: 'codex', reason: 'fetch-error', message: result.error || '额度暂不可用，请稍后重试' };
  }
  return {
    ok: true, provider: 'codex', shape: 'quota',
    data: { planLabel: result.planLabel, windows: result.windows.map((w: { label: string; used: number; remaining: number; resetsAt: number | null }) => ({
      label: w.label, used: w.used, remaining: w.remaining, resetsAt: w.resetsAt,
    })) },
  };
}
