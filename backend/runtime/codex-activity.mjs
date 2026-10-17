// Read-only local status adapter. Never exports message text, tool arguments,
// filenames, account details or command output. No model or network requests.
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const idle = () => ({ state: null, task: null });
export function classifyItem(item = {}) {
  const tool = `${item.server || ''}/${item.tool || ''}`.toLowerCase();
  if (['waitingForApproval', 'pendingApproval', 'waitingForInput'].includes(item.status) ||
      (/request_user_input|ask_user|approval/.test(tool) && !item.completed_at_ms)) {
    return { state: 'waiting', task: '等你确认一下，主人～' };
  }
  const labels = {
    reasoning: ['thinking', '思考中，认真转动小脑袋…'],
    fileChange: ['working', '编写／修改文件中…'],
    commandExecution: ['working', '执行命令中…'],
    webSearch: ['working', '搜索资料中…'],
    imageView: ['thinking', '查看图片中…'],
    imageGeneration: ['working', '生成图片中…'],
    contextCompaction: ['result', '整理上下文中…'],
    agentMessage: ['result', '撰写回复中…'],
    userMessage: ['thinking', '收到啦，正在理解你的要求…'],
    subAgentActivity: ['working', '协作处理任务中…'],
    sleep: ['waiting', '等待操作完成…'],
  };
  if (item.is_ui || /cua_repl|computer_use|browser/.test(tool)) return { state: 'working', task: '操作界面中…' };
  if (/search/.test(tool)) return { state: 'working', task: '搜索资料中…' };
  if (item.item_type === 'commandExecution' && item.action_type === 'read') return { state: 'thinking', task: '阅读文件中…' };
  if (item.item_type === 'commandExecution' && item.action_type === 'search') return { state: 'working', task: '搜索本地文件中…' };
  if (/node_repl/.test(tool)) return { state: 'working', task: '运行脚本中…' };
  const [state, task] = labels[item.item_type] || ['working', '调用工具中…'];
  return { state, task };
}

export function chooseActivity(turns, now = Date.now()) {
  // A stopped/crashed client can leave an inProgress row. Do not claim it is
  // still running forever; ten minutes without status activity becomes unknown.
  const active = turns.filter(t => t.status === 'inProgress' &&
    now - Math.max(t.item?.created_at_ms || 0, (t.started_at || 0) * 1000) < 600000)
    .sort((a,b) => (b.item?.created_at_ms || 0) - (a.item?.created_at_ms || 0));
  if (active.length) {
    const waiting = active.find(t => classifyItem(t.item).state === 'waiting');
    const selected = waiting || active[0];
    const snapshot = classifyItem(selected.item);
    if (active.length > 1) snapshot.task += `（${active.length} 个任务）`;
    return snapshot;
  }
  const recent = turns.filter(t => t.completed_at && now - t.completed_at * 1000 < 12000)
    .sort((a,b) => b.completed_at - a.completed_at)[0];
  if (recent?.status === 'completed') return { state: 'success', task: '任务完成啦，来看看结果～' };
  if (recent?.status === 'failed') return { state: 'error', task: '任务遇到问题，请查看 Codex' };
  if (recent?.status === 'interrupted') return { state: 'waiting', task: '任务已中断，等你下一步安排～' };
  return idle();
}

export class ActivityReader {
  constructor(home = process.env.CODEX_HOME || join(homedir(), '.codex')) {
    this.file = join(home, 'thread_history_1.sqlite');
    this.db = null;
  }
  read(now = Date.now()) {
    if (!existsSync(this.file)) return idle();
    if (!this.db) {
      this.db = new DatabaseSync(this.file, { readOnly: true });
      this.db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=100;');
    }
    const turns = this.db.prepare(`SELECT thread_id,turn_id,status,started_at,completed_at
      FROM thread_turns WHERE started_at > ? ORDER BY started_at DESC LIMIT 30`).all(Math.floor(now / 1000) - 86400);
    const itemQuery = this.db.prepare(`SELECT item_type,created_at_ms,completed_at_ms,
      json_extract(item_json,'$.status') status,
      json_extract(item_json,'$.server') server,
      json_extract(item_json,'$.tool') tool,
      json_extract(item_json,'$.commandActions[0].type') action_type,
      CASE WHEN instr(COALESCE(json_extract(item_json,'$.arguments.code'),''),'sky.') > 0
        OR instr(COALESCE(json_extract(item_json,'$.arguments.code'),''),'cua.') > 0 THEN 1 ELSE 0 END is_ui
      FROM thread_items WHERE thread_id=? AND turn_id=? ORDER BY rollout_ordinal DESC LIMIT 1`);
    for (const turn of turns) {
      if (turn.status === 'inProgress') turn.item = itemQuery.get(turn.thread_id, turn.turn_id);
    }
    return chooseActivity(turns, now);
  }
  close() { this.db?.close(); this.db = null; }
}

export function startActivityMonitor(publish, options = {}) {
  const reader = new ActivityReader(options.home);
  let previous = '', warned = false;
  const tick = () => {
    let snapshot;
    try { snapshot = reader.read(); warned = false; }
    catch { reader.close(); snapshot = idle(); if (!warned) console.warn('[codex-pet] 本地任务状态暂不可用'); warned = true; }
    const key = JSON.stringify(snapshot);
    if (key !== previous) { previous = key; publish(snapshot); }
  };
  tick();
  const timer = setInterval(tick, options.intervalMs || 2000);
  return () => { clearInterval(timer); reader.close(); };
}
