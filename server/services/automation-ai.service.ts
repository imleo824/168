import {
  generatePlatformAiText,
  getPlatformAiConfig,
  type PlatformAiRuntimeConfig,
  type PlatformAiTextResult,
} from './platform-ai-config.service';

export type AutomationAiPurpose = 'chat' | 'comment' | 'quote' | 'post' | 'crawl';

export type AutomationAiRuntime = PlatformAiRuntimeConfig & {
  purpose: AutomationAiPurpose;
  ready: boolean;
  disabledReason: '' | 'platform_ai_key_missing';
};

export async function getAutomationAiRuntime(purpose: AutomationAiPurpose, options: { force?: boolean } = {}): Promise<AutomationAiRuntime> {
  const config = await getPlatformAiConfig(options);
  const disabledReason = !config.apiKeyConfigured ? 'platform_ai_key_missing' : '';
  return {
    ...config,
    purpose,
    ready: !disabledReason,
    disabledReason,
  };
}

export async function isAutomationAiReady(purpose: AutomationAiPurpose) {
  return (await getAutomationAiRuntime(purpose)).ready;
}

export async function generateAutomationAiText(input: {
  purpose: AutomationAiPurpose;
  system?: string;
  user: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  timeoutMs?: number;
  jsonMode?: boolean;
}): Promise<PlatformAiTextResult> {
  const runtime = await getAutomationAiRuntime(input.purpose);
  if (!runtime.apiKeyConfigured) {
    return { ok: false, text: '', reason: 'platform_ai_key_missing', provider: runtime.provider, model: runtime.model };
  }
  return generatePlatformAiText({
    system: input.system,
    user: input.user,
    temperature: input.temperature,
    topP: input.topP,
    maxTokens: input.maxTokens,
    timeoutMs: input.timeoutMs,
    jsonMode: input.jsonMode,
  });
}

export function stripLegacyAiModel<T extends { model?: unknown; aiModel?: unknown }>(config: T) {
  const next = { ...config } as T;
  delete (next as any).model;
  delete (next as any).aiModel;
  return next;
}
