import { randomUUID } from 'node:crypto';

import { isDbConfigured } from '../../db';
import type { AutomationHeartbeatStatus, AutomationModuleName } from '../automation-health.service';
import type { AutomationRuntimeModule, StopAutomationRuntime } from './automation-module';

const MIN_RUNTIME_DELAY_MS = 1_000;
const MAX_RUNTIME_DELAY_MS = 24 * 60 * 60_000;
const MIN_RUNTIME_TIMEOUT_MS = 10_000;
const DEFAULT_RUNTIME_TIMEOUT_MS = 25 * 60_000;
const MAX_RUNTIME_TIMEOUT_MS = 60 * 60_000;
const DEFAULT_MAX_BACKOFF_MULTIPLIER = 6;
const MAX_JITTER_MS = 30_000;

const RUNTIME_TIMEOUT = Symbol('RUNTIME_TIMEOUT');

let started = false;
let stopped = false;
const timers = new Set<ReturnType<typeof setTimeout>>();
const runtimeStates = new Map<AutomationModuleName, AutomationRuntimeState>();

type RuntimeStatus = 'IDLE' | 'SCHEDULED' | 'RUNNING' | 'SUCCEEDED' | 'SKIPPED' | 'FAILED' | 'STOPPED';

type AutomationRuntimeState = {
  module: AutomationModuleName;
  status: RuntimeStatus;
  activeRunId: string | null;
  tickCount: number;
  consecutiveFailures: number;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastDurationMs: number | null;
  lastReason: string | null;
  lastError: string | null;
  lastResultStatus: string | null;
  nextRunAt: string | null;
  nextDelayMs: number | null;
  lastIntervalMs: number | null;
  timeoutMs: number | null;
};

function iso(date: Date | number) {
  return new Date(date).toISOString();
}

function safeDelayMs(raw: unknown, fallbackMs: number) {
  const value = Number(raw);
  const fallback = Number.isFinite(fallbackMs) ? fallbackMs : MIN_RUNTIME_DELAY_MS;
  const next = Number.isFinite(value) ? value : fallback;
  return Math.min(MAX_RUNTIME_DELAY_MS, Math.max(MIN_RUNTIME_DELAY_MS, Math.round(next)));
}

function safeTimeoutMs(raw: unknown) {
  const value = Number(raw);
  const next = Number.isFinite(value) ? value : DEFAULT_RUNTIME_TIMEOUT_MS;
  return Math.min(MAX_RUNTIME_TIMEOUT_MS, Math.max(MIN_RUNTIME_TIMEOUT_MS, Math.round(next)));
}

function safeText(value: unknown, maxLength = 500) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text ? Array.from(text).slice(0, maxLength).join('') : null;
}

function getState(moduleName: AutomationModuleName): AutomationRuntimeState {
  let state = runtimeStates.get(moduleName);
  if (!state) {
    state = {
      module: moduleName,
      status: 'IDLE',
      activeRunId: null,
      tickCount: 0,
      consecutiveFailures: 0,
      lastStartedAt: null,
      lastFinishedAt: null,
      lastDurationMs: null,
      lastReason: null,
      lastError: null,
      lastResultStatus: null,
      nextRunAt: null,
      nextDelayMs: null,
      lastIntervalMs: null,
      timeoutMs: null,
    };
    runtimeStates.set(moduleName, state);
  }
  return state;
}

function setManagedTimeout(callback: () => void | Promise<void>, delayMs: number) {
  const timer = setTimeout(() => {
    timers.delete(timer);
    void Promise.resolve(callback()).catch((error) => {
      console.warn('[automation-runtime] managed timer callback failed:', error instanceof Error ? error.message : error);
    });
  }, safeDelayMs(delayMs, MIN_RUNTIME_DELAY_MS));
  timer.unref?.();
  timers.add(timer);
  return timer;
}

async function resolveNextDelayMs(module: AutomationRuntimeModule) {
  if (!isDbConfigured() || !module.nextIntervalMs) return safeDelayMs(module.fallbackIntervalMs, MIN_RUNTIME_DELAY_MS);
  try {
    return safeDelayMs(await module.nextIntervalMs(), module.fallbackIntervalMs);
  } catch (error) {
    if (isDbConfigured()) {
      console.warn(`[automation-runtime] ${module.module} interval resolution failed:`, error instanceof Error ? error.message : error);
    }
    return safeDelayMs(module.fallbackIntervalMs, MIN_RUNTIME_DELAY_MS);
  }
}

function addJitter(delayMs: number) {
  const jitterMax = Math.min(MAX_JITTER_MS, Math.max(0, Math.floor(delayMs * 0.05)));
  if (jitterMax <= 0) return delayMs;
  return safeDelayMs(delayMs + Math.floor(Math.random() * jitterMax), delayMs);
}

function applyBackoff(module: AutomationRuntimeModule, delayMs: number, state: AutomationRuntimeState) {
  if (state.consecutiveFailures <= 0) return delayMs;
  const maxMultiplier = Math.max(1, Math.min(24, Number(module.maxBackoffMultiplier || DEFAULT_MAX_BACKOFF_MULTIPLIER)));
  const multiplier = Math.min(maxMultiplier, 1 + state.consecutiveFailures);
  return safeDelayMs(delayMs * multiplier, delayMs);
}

async function scheduleModule(module: AutomationRuntimeModule, startup: boolean) {
  if (stopped) return;
  const state = getState(module.module);
  const baseDelayMs = startup
    ? safeDelayMs(module.startupDelayMs ?? MIN_RUNTIME_DELAY_MS, MIN_RUNTIME_DELAY_MS)
    : await resolveNextDelayMs(module);
  const delayMs = startup ? baseDelayMs : addJitter(applyBackoff(module, baseDelayMs, state));
  const nextRunAt = Date.now() + delayMs;
  state.status = 'SCHEDULED';
  state.nextRunAt = iso(nextRunAt);
  state.nextDelayMs = delayMs;
  state.lastIntervalMs = baseDelayMs;
  state.timeoutMs = safeTimeoutMs(module.timeoutMs);
  setManagedTimeout(() => runModuleTick(module, startup, delayMs), delayMs);
}

function extractResultStatus(result: unknown) {
  if (!result || typeof result !== 'object') return null;
  const record = result as Record<string, any>;
  return safeText(record.status || record.run?.status || record.result?.status, 80);
}

function inferHeartbeatStatus(result: unknown, error: unknown, timedOut: boolean): AutomationHeartbeatStatus {
  if (error || timedOut) return 'FAILED';
  const status = String(extractResultStatus(result) || '').toUpperCase();
  if (status === 'FAILED' || status === 'PARTIAL_FAILED') return 'FAILED';
  if (status === 'SKIPPED' || status === 'REJECTED' || status === 'DUPLICATE') return 'SKIPPED';
  return 'SUCCEEDED';
}

function inferReason(result: unknown, error: unknown, timedOut: boolean) {
  if (timedOut) return 'runtime_timeout';
  if (error) return safeText(error instanceof Error ? error.message : error, 300);
  if (!result || typeof result !== 'object') return extractResultStatus(result) || 'completed';
  const record = result as Record<string, any>;
  return safeText(
    record.skipReason
      || record.errorMessage
      || record.reason
      || record.error
      || record.run?.skipReason
      || record.run?.errorMessage
      || record.run?.reason
      || record.result?.skipReason
      || record.result?.errorMessage
      || extractResultStatus(result)
      || 'completed',
    300,
  );
}

async function runWithTimeout(module: AutomationRuntimeModule, input: { trigger: 'SCHEDULED'; reason: string }, timeoutMs: number) {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const { reason } = input;
  try {
    const runPromise = Promise.resolve().then(() => module.run({ trigger: 'SCHEDULED', reason }));
    const timeoutPromise = new Promise<typeof RUNTIME_TIMEOUT>((resolve) => {
      timeout = setTimeout(() => resolve(RUNTIME_TIMEOUT), timeoutMs);
      timeout.unref?.();
    });
    const result = await Promise.race([runPromise, timeoutPromise]);
    return result === RUNTIME_TIMEOUT ? { timedOut: true, result: null } : { timedOut: false, result };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function runModuleTick(module: AutomationRuntimeModule, startup: boolean, plannedDelayMs: number) {
  if (stopped) return;
  if (!isDbConfigured()) {
    const state = getState(module.module);
    state.status = 'SKIPPED';
    state.lastReason = 'database_not_configured';
    await scheduleModule(module, false);
    return;
  }
  const state = getState(module.module);
  const runId = `runtime_${module.module}_${randomUUID()}`;
  const startedAt = new Date();
  const reason = startup ? 'scheduler_startup_tick' : 'scheduler_tick';
  const timeoutMs = safeTimeoutMs(module.timeoutMs);
  let result: unknown = null;
  let error: unknown = null;
  let timedOut = false;

  state.status = 'RUNNING';
  state.activeRunId = runId;
  state.tickCount += 1;
  state.lastStartedAt = startedAt.toISOString();
  state.lastFinishedAt = null;
  state.lastDurationMs = null;
  state.lastReason = reason;
  state.lastError = null;
  state.timeoutMs = timeoutMs;

  try {
    const execution = await runWithTimeout(module, { trigger: 'SCHEDULED', reason }, timeoutMs);
    result = execution.result;
    timedOut = execution.timedOut;
  } catch (caught) {
    error = caught;
  }

  const finishedAt = new Date();
  const heartbeatStatus = inferHeartbeatStatus(result, error, timedOut);
  const heartbeatReason = inferReason(result, error, timedOut);
  const resultStatus = extractResultStatus(result);
  const durationMs = Math.max(0, finishedAt.getTime() - startedAt.getTime());

  if (heartbeatStatus === 'FAILED') state.consecutiveFailures += 1;
  else state.consecutiveFailures = 0;

  state.status = heartbeatStatus;
  state.activeRunId = null;
  state.lastFinishedAt = finishedAt.toISOString();
  state.lastDurationMs = durationMs;
  state.lastReason = heartbeatReason;
  state.lastError = error || timedOut ? heartbeatReason : null;
  state.lastResultStatus = resultStatus;

  if (timedOut) {
    console.warn(`[automation-runtime] ${module.module} timed out after ${timeoutMs}ms; next tick will be scheduled and task lock should prevent duplicate writes.`);
  } else if (error) {
    if (isDbConfigured()) {
      console.warn(`[automation-runtime] ${module.module} tick failed:`, error instanceof Error ? error.message : error);
    }
  }

  await scheduleModule(module, false);
}

function dedupeModules(modules: AutomationRuntimeModule[]) {
  const seen = new Set<string>();
  return modules.filter((module) => {
    if (!module?.module || seen.has(module.module)) return false;
    seen.add(module.module);
    return true;
  });
}

export function getAutomationRuntimeSnapshot() {
  return {
    started,
    stopped,
    timerCount: timers.size,
    modules: [...runtimeStates.values()].map((state) => ({ ...state })),
  };
}

export function startAutomationRuntime(modules: AutomationRuntimeModule[]): StopAutomationRuntime {
  if (started) return stopAutomationRuntime;
  started = true;
  stopped = false;

  const registeredModules = dedupeModules(modules);
  for (const module of registeredModules) {
    getState(module.module);
    void scheduleModule(module, true);
  }

  console.info(`[automation-runtime] started ${registeredModules.length} modules: ${registeredModules.map((module) => module.module).join(', ')}`);
  return stopAutomationRuntime;
}

export function stopAutomationRuntime() {
  stopped = true;
  started = false;
  for (const timer of timers) clearTimeout(timer);
  timers.clear();
  for (const state of runtimeStates.values()) {
    state.status = 'STOPPED';
    state.activeRunId = null;
    state.nextRunAt = null;
    state.nextDelayMs = null;
  }
}
