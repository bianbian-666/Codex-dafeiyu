import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toBalanceState, balancePercent, balanceBubbleView } from './balance.ts';

const raw = (windows: unknown[]) => ({ ok: true, provider: 'codex', shape: 'quota', data: { planLabel: 'Plus', windows } });
test('all returned windows display remaining percentages; animation uses most used', () => {
  const state = toBalanceState(raw([
    { label: '5 小时', used: 15, remaining: 85, resetsAt: null },
    { label: '每周', used: 3, remaining: 97, resetsAt: 2000000000 },
  ]));
  assert.ok(state?.ok);
  assert.equal(balancePercent(state), 15);
  const rows = balanceBubbleView(state).map(r => r.text);
  assert.ok(rows.includes('5 小时 剩余 85%'));
  assert.ok(rows.includes('每周 剩余 97%'));
  assert.ok(rows.includes('重置时间未知'));
});
test('single nonstandard window and individual quota are preserved', () => {
  for (const label of ['30 天', '个人额度', '17 分钟']) {
    const state = toBalanceState(raw([{ label, used: 100, remaining: 0, resetsAt: null }]));
    assert.ok(state?.ok);
    assert.equal(balancePercent(state), 100);
    assert.match(balanceBubbleView(state)[1].text, /剩余 0%/);
  }
});
test('invalid or missing windows never become zero usage', () => {
  assert.equal(toBalanceState(raw([])), null);
  assert.equal(toBalanceState(raw([{ label: 'x', used: NaN, remaining: 100 }])), null);
  const failed = toBalanceState({ ok: false, provider: 'codex', reason: 'fetch-error', message: '查询超时' });
  assert.ok(failed && !failed.ok);
  assert.ok(balanceBubbleView(failed).some(r => r.text === '查询超时'));
});
