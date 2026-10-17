import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ActivityReader, chooseActivity, classifyItem } from '../../runtime/codex-activity.mjs';

test('fine-grained stages and unknown tools are grounded in item types', () => {
  for (const [type,label] of [['reasoning','思考'],['fileChange','文件'],['commandExecution','命令'],['webSearch','搜索'],['agentMessage','回复']]) {
    assert.ok(classifyItem({item_type:type}).task.includes(label));
  }
  assert.match(classifyItem({item_type:'mcpToolCall',server:'node_repl',is_ui:1}).task,/界面/);
  assert.match(classifyItem({item_type:'mcpToolCall',server:'node_repl'}).task,/脚本/);
  assert.equal(classifyItem({tool:'request_user_input',status:'inProgress'}).state,'waiting');
  assert.match(classifyItem({item_type:'newUnknownTool'}).task,/工具/);
});
test('active work wins over another task completion; stale activity is not claimed live', () => {
  const now=Date.now();
  const active={status:'inProgress',started_at:now/1000,item:{item_type:'fileChange',created_at_ms:now}};
  const completed={status:'completed',completed_at:now/1000};
  assert.equal(chooseActivity([completed,active],now).state,'working');
  assert.equal(chooseActivity([completed],now).state,'success');
  assert.equal(chooseActivity([{...completed,status:'failed'}],now).state,'error');
  assert.equal(chooseActivity([{...completed,status:'interrupted'}],now).state,'waiting');
  assert.equal(chooseActivity([{...active,started_at:1,item:{created_at_ms:1}}],now).state,null);
  assert.equal(chooseActivity([completed],now+15000).state,null);
});
test('reader observes live SQLite updates without exposing body text', () => {
  const root=mkdtempSync(join(tmpdir(),'codex-pet-test-'));
  const db=new DatabaseSync(join(root,'thread_history_1.sqlite'));
  const reader=new ActivityReader(root), now=Date.now();
  try {
    db.exec(`CREATE TABLE thread_turns(thread_id,turn_id,status,started_at,completed_at);
      CREATE TABLE thread_items(thread_id,turn_id,item_type,created_at_ms,completed_at_ms,item_json,rollout_ordinal);`);
    db.prepare('INSERT INTO thread_turns VALUES(?,?,?,?,?)').run('a','b','inProgress',Math.floor(now/1000),null);
    db.prepare('INSERT INTO thread_items VALUES(?,?,?,?,?,?,?)').run('a','b','reasoning',now,null,JSON.stringify({text:'PRIVATE_CONTENT'}),1);
    assert.equal(reader.read(now).state,'thinking');
    assert.ok(!JSON.stringify(reader.read(now)).includes('PRIVATE_CONTENT'));
    db.prepare('UPDATE thread_turns SET status=?,completed_at=?').run('completed',Math.floor(now/1000));
    assert.equal(reader.read(now).state,'success');
  } finally { reader.close(); db.close(); rmSync(root,{recursive:true,force:true}); }
});
