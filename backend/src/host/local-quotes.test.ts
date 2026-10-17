import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pickLocalQuote, DEFAULT_QUOTES } from './local-quotes.ts';

test('custom quotes reload, avoid immediate repeats, and recover from invalid JSON', () => {
  const root = mkdtempSync(join(tmpdir(), 'pet-quotes-'));
  const file = join(root, 'quotes.json');
  try {
    writeFileSync(file, JSON.stringify(['第一句', '第二句']));
    const first = pickLocalQuote(file);
    assert.notEqual(pickLocalQuote(file), first);
    writeFileSync(file, JSON.stringify(['新的语录']));
    assert.equal(pickLocalQuote(file), '新的语录');
    writeFileSync(file, 'invalid json');
    assert.ok(DEFAULT_QUOTES.includes(pickLocalQuote(file)));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
