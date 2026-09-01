import type { AutomationModuleName } from '../automation-health.service';

export type AutomationRuntimeTrigger = 'SCHEDULED';

export type AutomationRuntimeRunInput = {
  trigger: AutomationRuntimeTrigger;
  reason: string;
};

export type AutomationRuntimeModule = {
  module: AutomationModuleName;
  fallbackIntervalMs: number;
  startupDelayMs?: number;
  timeoutMs?: number;
  maxBackoffMultiplier?: number;
  nextIntervalMs?: () => Promise<number> | number;
  run: (input: AutomationRuntimeRunInput) => Promise<unknown> | unknown;
};

export type StopAutomationRuntime = () => void;
