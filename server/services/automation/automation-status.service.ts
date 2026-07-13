import { isDbConfigured } from '../../db';
import { listAutomationHeartbeats, type AutomationModuleName } from '../automation-health.service';
import { getAutomationTaskLocks } from '../automation-task-lock.service';

const MODULES: AutomationModuleName[] = [
  'auto_crawl',
  'auto_post',
  'auto_like',
  'quote_publish',
  'comment_publish',
  'chat_bot',
];

function toTime(value: unknown) {
  const time = value ? new Date(value as any).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function deriveState(activeLock: boolean, heartbeat: any) {
  if (activeLock) return 'RUNNING';
  if (!heartbeat) return 'UNKNOWN';
  if (heartbeat.status === 'FAILED') return 'FAILED';
  if (heartbeat.status === 'SUCCEEDED') return 'HEALTHY';
  return 'IDLE';
}

function summarize(modules: Array<{ state: string }>) {
  return {
    total: modules.length,
    running: modules.filter((item) => item.state === 'RUNNING').length,
    healthy: modules.filter((item) => item.state === 'HEALTHY').length,
    idle: modules.filter((item) => item.state === 'IDLE').length,
    failed: modules.filter((item) => item.state === 'FAILED').length,
    unknown: modules.filter((item) => item.state === 'UNKNOWN').length,
  };
}

export async function getAutomationStatusSnapshot() {
  if (!isDbConfigured()) {
    const modules = MODULES.map((module) => ({ module, state: 'UNKNOWN', activeLock: null, lastHeartbeat: null, reason: 'database_not_configured' }));
    return { ok: false, databaseConfigured: false, generatedAt: new Date().toISOString(), summary: summarize(modules), modules };
  }

  const [locks, heartbeats] = await Promise.all([
    getAutomationTaskLocks().catch(() => []),
    listAutomationHeartbeats({ limit: 100 }).catch(() => []),
  ]);

  const lockByName = new Map<string, any>();
  for (const lock of locks as any[]) lockByName.set(String(lock.name || ''), lock);

  const heartbeatByModule = new Map<string, any>();
  for (const heartbeat of heartbeats as any[]) {
    const module = String(heartbeat.module || '');
    if (!MODULES.includes(module as AutomationModuleName)) continue;
    const current = heartbeatByModule.get(module);
    if (!current || toTime(heartbeat.createdAt) > toTime(current.createdAt)) heartbeatByModule.set(module, heartbeat);
  }

  const modules = MODULES.map((module) => {
    const activeLock = lockByName.get(module) || null;
    const lastHeartbeat = heartbeatByModule.get(module) || null;
    const state = deriveState(Boolean(activeLock?.active), lastHeartbeat);
    return {
      module,
      state,
      activeLock,
      lastHeartbeat,
      reason: activeLock?.active ? 'lock_active' : lastHeartbeat?.reason || null,
    };
  });

  const summary = summarize(modules);
  return { ok: summary.failed === 0, databaseConfigured: true, generatedAt: new Date().toISOString(), summary, modules };
}
