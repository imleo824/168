import { getChatConfig } from './chat.config';
import type { ChatMessagePayload } from './chat.types';
import {
  cleanupExpiredChatAutomationLogs,
  createBotChatMessage,
  createBotInvocation,
  ensureDefaultChatBots,
  ensurePublicChatRoom,
  finishBotInvocation,
  listRecentVisibleMessages,
  markChatBotSpoke,
  pickAvailableChatBot,
} from './chat.repository';
import { updateChatAutomationRuntimeSnapshot } from './chat.automation-runtime';
import { recordObservedChatBotRun, runObservedChatMaintenance } from './chat-observed-runner';
import { generateAutomationAiText, getAutomationAiRuntime } from '../services/automation-ai.service';

type BroadcastMessage = (message: ChatMessagePayload) => void;
type BotTask = { trigger: 'HUMAN_MESSAGE' | 'IDLE_WARMUP'; inputMessage?: ChatMessagePayload; sequence?: number; dedupeKey?: string };

const CHAT_AI_TIMEOUT_MS = 14_000;
const CHAT_AUTOMATION_LOG_RETENTION_DAYS = 3;
const BOT_TASK_QUEUE_MAX = 1000;
const BOT_MESSAGE_MAX_LENGTH = 72;
const IDLE_WARMUP_MIN_DELAY_MS = 90_000;
const IDLE_WARMUP_MAX_DELAY_MS = 180_000;
const HUMAN_REPLY_COUNT = 1;
const CHAT_FIELD_GROUPS = ['价格', '地点', '时间', '费用', '材料', '押金', '水电', '月休', '到手', '面交', '电池', '维修', '排期', '验收', '联系方式'];

function randomInt(min: number, max: number) { const low = Math.min(min, max); const high = Math.max(min, max); return Math.floor(Math.random() * (high - low + 1)) + low; }
function sliceChars(value: string, limit: number) { return Array.from(value || '').slice(0, limit).join(''); }
function normalizeText(raw: unknown, maxLength = 500) {
  const text = String(raw || '').replace(/```[\s\S]*?```/g, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#(?:x[0-9a-f]+|\d+);/gi, ' ').replace(/\s+/g, ' ').trim();
  return Array.from(text).length > maxLength ? `${sliceChars(text, maxLength - 1)}…` : text;
}
function compact(text: string) { return normalizeText(text, 240).replace(/[\s。.!！?？,，、；;：:"'“”‘’()[\]{}<>《》【】]/g, '').toLowerCase(); }
function stripSpeakerPrefix(line: string) { return line.replace(/^[\p{Script=Han}A-Za-z0-9_\-\s]{1,32}\s*[:：]\s*/u, '').trim(); }
function sanitizeCandidate(raw: unknown) {
  const lines = String(raw || '').replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').split(/\n+/).map((line) => stripSpeakerPrefix(line.replace(/^\s*(?:[-*•]|\d+[.、)）])\s*/g, '').replace(/^(回复|输出|发言|答案|候选)\s*[:：]\s*/i, '').trim())).filter(Boolean);
  let text = stripSpeakerPrefix(lines.join(' ').replace(/^['"“”]+|['"“”]+$/g, '').replace(/\s+/g, ' ').trim());
  text = stripSpeakerPrefix(text.replace(/^(回复|输出|发言|答案|候选)\s*[:：]\s*/i, '').trim());
  if (Array.from(text).length > BOT_MESSAGE_MAX_LENGTH) text = sliceChars(text, BOT_MESSAGE_MAX_LENGTH).replace(/[，,、；;：:\s]+$/g, '').trim();
  if (text && !/[。！？!?]$/.test(text)) text += /[?？]$/.test(text) ? '' : '。';
  return normalizeText(text, BOT_MESSAGE_MAX_LENGTH);
}
function extractCandidates(raw: unknown) { const text = String(raw || ''); const whole = sanitizeCandidate(text); const lines = text.split(/\n+/).map(sanitizeCandidate).filter(Boolean); return Array.from(new Set([whole, ...lines].filter(Boolean))).slice(0, 8); }
function pickBestCandidate(raw: unknown) { for (const candidate of extractCandidates(raw)) { const marker = compact(candidate).toUpperCase(); if (['SKIP', 'NO_REPLY', 'NOREPLY', '跳过', '不发'].includes(marker)) continue; if (candidate) return candidate; } return ''; }
function latestHuman(messages: ChatMessagePayload[]) { for (let index = messages.length - 1; index >= 0; index -= 1) if (messages[index]?.authorType === 'USER') return messages[index]; return null; }
function fallbackReply(task: BotTask) {
  const body = normalizeText(task.inputMessage?.body || '', 80);
  if (/\?$|？$/.test(body)) return '这个可以补一下具体地点和预算。';
  if (/招聘|工资|薪资|岗位|入职/i.test(body)) return '薪资、地点、月休写上会更清楚。';
  if (/租房|房租|押金|水电/i.test(body)) return '房租、押金、水电和位置要写清。';
  if (/二手|卖|出|转让/i.test(body)) return '价格、成色和面交地点补一下。';
  if (/签证|护照|材料/i.test(body)) return '材料、费用和办理时间写上。';
  return '可以补一下具体信息，方便别人接。';
}
function buildPrompt(bot: any, recentMessages: ChatMessagePayload[], task: BotTask) {
  const target = task.inputMessage?.authorType === 'USER' ? task.inputMessage : latestHuman(recentMessages);
  const transcript = recentMessages.filter((message) => message.authorType === 'USER' || message.authorType === 'BOT').slice(-10).map((message) => `${message.authorType === 'USER' ? '用户' : '信息账号'} ${message.authorName}: ${normalizeText(message.body, 100)}`).join('\n') || '暂无';
  const targetInstruction = target ? `目标用户消息：\n${target.authorName}: ${normalizeText(target.body, 160)}` : '当前冷场：主动发一句真实、短的分类信息补充话题。';
  return ['你是中文分类信息聊天室的信息账号。', `账号名：${bot.displayName}`, `账号设定：${bot.persona || '短句，具体，只补字段，不闲聊。'}`, '', '生成原则：', '- 必须输出一句中文短消息。', '- 只输出一句，不解释，不编号，不输出 SKIP。', '- 围绕目标消息或最近聊天补一个具体信息点。', '- 不冒充真实用户经历，不说自己是 AI 或机器人。', '- 不刷屏，不写长文，不讲大道理。', `可接字段类型：${CHAT_FIELD_GROUPS.join('、')}`, '', '最近聊天：', transcript, '', targetInstruction].join('\n');
}
async function generateReply(bot: any, task: BotTask) {
  const recentMessages = await listRecentVisibleMessages(36);
  const aiRuntime = await getAutomationAiRuntime('chat').catch(() => null);
  if (!aiRuntime?.ready) return { text: '', reason: aiRuntime?.disabledReason || 'platform_ai_not_ready' };
  const response = await generateAutomationAiText({ purpose: 'chat', system: '只输出一句中文短消息；不要解释，不要编号，不要输出 SKIP。', user: buildPrompt(bot, recentMessages, task), temperature: 0.8, topP: 0.92, maxTokens: 80, timeoutMs: CHAT_AI_TIMEOUT_MS });
  const picked = response.ok ? pickBestCandidate(response.text) : '';
  return { text: picked || fallbackReply(task), reason: picked ? 'ai' : (response.reason || 'fallback_reply') };
}
async function recordChatBotHeartbeat(input: { task: BotTask; startedAt: Date; status: 'SUCCEEDED' | 'SKIPPED' | 'FAILED'; reason?: string | null; invocationId?: string | null; outputMessageId?: string | null; details?: unknown }) {
  await recordObservedChatBotRun({ trigger: input.task.trigger, startedAt: input.startedAt, status: input.status, reason: input.reason, invocationId: input.invocationId, inputMessageId: input.task.inputMessage?.id || null, outputMessageId: input.outputMessageId, details: input.details });
}

export function createChatBotService(options: { broadcastMessage: BroadcastMessage; getOnlineCount?: () => number }) {
  const queue: BotTask[] = [];
  const pendingTaskKeys = new Map<string, number>();
  const recentBotMessageAt: number[] = [];
  let active = 0;
  let idleWarmupTimer: NodeJS.Timeout | null = null;
  let idleWarmupStopped = false;

  function pruneBotWindow(now = Date.now()) { while (recentBotMessageAt.length > 0 && now - recentBotMessageAt[0] > 60_000) recentBotMessageAt.shift(); }
  function syncRuntimeSnapshot() { pruneBotWindow(); updateChatAutomationRuntimeSnapshot({ queuePending: queue.length, pendingKeys: pendingTaskKeys.size, active, queueMax: BOT_TASK_QUEUE_MAX, localBotMessagesLastMinute: recentBotMessageAt.length }); }
  function prunePendingTaskKeys(now = Date.now()) { for (const [key, expiresAt] of pendingTaskKeys) if (expiresAt <= now) pendingTaskKeys.delete(key); }
  function getTaskKey(task: BotTask) { return task.trigger === 'HUMAN_MESSAGE' ? `human:${task.inputMessage?.id || 'unknown'}:${task.sequence || 0}` : 'idle:warmup'; }

  async function runNext() {
    const config = await getChatConfig().catch(() => null);
    const concurrency = Math.max(1, Number(config?.botConcurrency || 1));
    while (active < concurrency && queue.length > 0) {
      const task = queue.shift();
      if (!task) break;
      active += 1;
      syncRuntimeSnapshot();
      void runTask(task).catch((error) => console.warn('[chat:bot] task failed:', error?.message || error)).finally(() => {
        if (task.dedupeKey) pendingTaskKeys.delete(task.dedupeKey);
        active -= 1;
        syncRuntimeSnapshot();
        if (queue.length > 0) void runNext().catch((error) => console.warn('[chat:bot] runNext failed:', error?.message || error));
      });
    }
    syncRuntimeSnapshot();
  }

  async function runTask(task: BotTask) {
    const startedAt = new Date();
    let invocation: any = null;
    try {
      const config = await getChatConfig();
      if (!config.enabled || !config.aiEnabled) { await recordChatBotHeartbeat({ task, startedAt, status: 'SKIPPED', reason: 'disabled' }); return; }
      const bot = await pickAvailableChatBot(0);
      if (!bot?.authorUserId) { await recordChatBotHeartbeat({ task, startedAt, status: 'SKIPPED', reason: 'no_available_robot' }); return; }
      const aiRuntime = await getAutomationAiRuntime('chat').catch(() => null);
      invocation = await createBotInvocation({ authorUserId: bot.authorUserId, trigger: task.trigger, inputMessageId: task.inputMessage?.id || null, model: aiRuntime?.model || config.aiModel || 'unknown' });
      if (!aiRuntime?.ready) { const reason = aiRuntime?.disabledReason || 'platform_ai_not_ready'; await finishBotInvocation(invocation.id, { status: 'SKIPPED', error: reason }); await recordChatBotHeartbeat({ task, startedAt, status: 'SKIPPED', reason, invocationId: invocation.id }); return; }
      const reply = await generateReply(bot, task);
      if (!reply.text) { await finishBotInvocation(invocation.id, { status: 'SKIPPED', error: reply.reason || 'empty_reply' }); await recordChatBotHeartbeat({ task, startedAt, status: 'SKIPPED', reason: reply.reason || 'empty_reply', invocationId: invocation.id }); return; }
      const message = await createBotChatMessage({ authorUserId: bot.authorUserId, authorName: bot.displayName, authorPhotoUrl: bot.photoUrl || null, body: reply.text });
      recentBotMessageAt.push(Date.now());
      syncRuntimeSnapshot();
      await markChatBotSpoke(bot.id);
      await finishBotInvocation(invocation.id, { status: 'SUCCEEDED', outputMessageId: message.id, error: null });
      await recordChatBotHeartbeat({ task, startedAt, status: 'SUCCEEDED', reason: 'published', invocationId: invocation.id, outputMessageId: message.id, details: { replyReason: reply.reason } });
      options.broadcastMessage(message);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (invocation?.id) await finishBotInvocation(invocation.id, { status: 'FAILED', error: reason }).catch(() => {});
      await recordChatBotHeartbeat({ task, startedAt, status: 'FAILED', reason, invocationId: invocation?.id || null }).catch(() => {});
    }
  }

  function enqueue(task: BotTask, delayMs: number) {
    prunePendingTaskKeys();
    const dedupeKey = getTaskKey(task);
    if (pendingTaskKeys.has(dedupeKey)) return { queued: false, reason: 'dedupe_pending' };
    pendingTaskKeys.set(dedupeKey, Date.now() + delayMs + CHAT_AI_TIMEOUT_MS + 60_000);
    syncRuntimeSnapshot();
    setTimeout(() => { if (!pendingTaskKeys.has(dedupeKey)) return; queue.push({ ...task, dedupeKey }); syncRuntimeSnapshot(); void runNext().catch((error) => console.warn('[chat:bot] runNext failed:', error?.message || error)); }, Math.max(0, delayMs)).unref?.();
    return { queued: true, reason: 'queued' };
  }

  async function handleHumanMessage(message: ChatMessagePayload) {
    const config = await getChatConfig().catch(() => null);
    if (!config?.enabled || !config.aiEnabled) return;
    for (let index = 0; index < HUMAN_REPLY_COUNT; index += 1) enqueue({ trigger: 'HUMAN_MESSAGE', inputMessage: message, sequence: index }, 0);
  }

  function scheduleIdleWarmup() {
    if (idleWarmupStopped) return;
    idleWarmupTimer = setTimeout(() => {
      void (async () => {
        const startedAt = new Date();
        try {
          const config = await getChatConfig().catch(() => null);
          const onlineCount = options.getOnlineCount?.() || 0;
          if (!config?.enabled || !config.aiEnabled) await recordObservedChatBotRun({ trigger: 'IDLE_WARMUP', startedAt, status: 'SKIPPED', reason: 'disabled', details: { onlineCount } });
          else { const queued = enqueue({ trigger: 'IDLE_WARMUP' }, 0); await recordObservedChatBotRun({ trigger: 'IDLE_WARMUP', startedAt, status: queued.queued ? 'SUCCEEDED' : 'SKIPPED', reason: queued.reason, details: { onlineCount, queuePending: queue.length, pendingKeys: pendingTaskKeys.size } }); }
        } catch (error) { const reason = error instanceof Error ? error.message : String(error); await recordObservedChatBotRun({ trigger: 'IDLE_WARMUP', startedAt, status: 'FAILED', reason }).catch(() => {}); console.warn('[chat:bot] idle warmup failed:', reason); }
        finally { scheduleIdleWarmup(); }
      })();
    }, randomInt(IDLE_WARMUP_MIN_DELAY_MS, IDLE_WARMUP_MAX_DELAY_MS));
    idleWarmupTimer.unref?.();
  }

  function startIdleWarmup() {
    if (idleWarmupTimer) return () => {};
    idleWarmupStopped = false;
    syncRuntimeSnapshot();
    scheduleIdleWarmup();
    return () => { idleWarmupStopped = true; if (idleWarmupTimer) { clearTimeout(idleWarmupTimer); idleWarmupTimer = null; } syncRuntimeSnapshot(); };
  }

  return { handleHumanMessage, startIdleWarmup };
}

export async function ensureChatAutomationReady() { await ensurePublicChatRoom(); const result = await ensureDefaultChatBots(); if (result.created > 0) console.log(`[chat] Seeded ${result.created} robot users.`); }
export function startChatMaintenance() {
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  async function tick() {
    if (stopped) return;
    try { await runObservedChatMaintenance(async () => { await getChatConfig(); return cleanupExpiredChatAutomationLogs(CHAT_AUTOMATION_LOG_RETENTION_DAYS); }); }
    catch (error) { console.warn('[chat] cleanup failed:', error instanceof Error ? error.message : error); }
    finally { if (!stopped) timer = setTimeout(tick, 60 * 60 * 1000); timer?.unref?.(); }
  }
  void tick();
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}
