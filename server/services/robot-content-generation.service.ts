import {
  cleanRobotReactionText,
  detectRobotReactionIntent,
  getRobotReactionSignals,
  robotReactionSignature,
  scoreRobotReaction,
  type RobotReactionCandidate,
  type RobotReactionMode,
  type RobotReactionPost,
  type RobotReactionUser,
} from './robot-reaction-quality.service';
import { generateAutomationAiText } from './automation-ai.service';
import { detectRobotHumanToneViolation } from './robot-human-tone-gate.service';

type GenerateOptions = {
  post: RobotReactionPost;
  robot: RobotReactionUser;
  mode: RobotReactionMode;
  recentContents?: string[];
  allowRuleFallback?: boolean;
};

type PickedReaction = RobotReactionCandidate & {
  source: 'model';
  signature: string;
};

type FieldProfile = {
  key: string;
  label: string;
  match: RegExp;
  fields: string[];
};

export type RobotReactionReadiness = {
  ok: boolean;
  reason: string;
  terms: string[];
  fields: string[];
  profile: string;
};

const AI_TIMEOUT_MS = 12_000;
const RECENT_LIMIT = 12;
const OUTPUT_LIMIT = 10;
const COPY_NGRAM_MIN = 8;

const EMOTIONAL_SOURCE_TERMS = ['岁月', '红尘', '浮生', '漂泊', '江湖', '乌篷船', '白鹭', '苏轼', '陶潜', '晚霞', '清风', '忘忧', '仗剑', '潮起潮落', '往事', '归隐', '天涯', '古刹', '秋', '自由', '过客'];
const EMOTIONAL_FIELD_TERMS = ['真实', '画面', '江湖感', '古风', '漂泊感', '松弛感', '后半段', '词味', '意境'];
const EMOTIONAL_MATCH_RE = /岁月|红尘|浮生|漂泊|江湖|乌篷船|白鹭|苏轼|陶潜|晚霞|清风|忘忧|仗剑|潮起潮落|往事|归隐|天涯|古刹|意境|古风|词味|诗意|歌词|洒脱|自由|过客|秋/i;

const FIELD_PROFILES: FieldProfile[] = [
  { key: 'job', label: '招聘', match: /招聘|求职|岗位|工资|薪资|提成|月休|包住|试用期|班次|上班|客服|销售|运营/i, fields: ['到手', '月休', '包住', '班次', '试用期', '结算'] },
  { key: 'housing', label: '租房', match: /租房|房源|公寓|合租|月租|押金|水电|通勤|看房|楼层|合同|转租/i, fields: ['水电', '押金', '通勤', '合租', '看房', '合同'] },
  { key: 'secondhand', label: '二手', match: /二手|手机|电脑|数码|面交|电池|维修|成色|实拍|配件|保修|解绑|自取/i, fields: ['面交', '电池', '维修', '实拍', '配件', '保修'] },
  { key: 'apple', label: 'Apple', match: /Apple|苹果|iPhone|iPad|MacBook|Mac|电池|维修|ID|国行|美版|港版|屏幕/i, fields: ['电池', '维修', 'ID', '版本', '屏幕', '保修'] },
  { key: 'visa', label: '签证', match: /签证|护照|材料|预约|续签|补办|入境|周期|费用|递交|排期/i, fields: ['排期', '材料', '递交', '费用', '预约', '周期'] },
  { key: 'food', label: '餐馆', match: /餐馆|餐厅|美食|人均|营业|菜单|招牌|外卖|夜宵|位置/i, fields: ['人均', '营业', '位置', '菜单', '招牌', '外卖'] },
  { key: 'business', label: '合作', match: /合作|供需|招商|报价|交付|验收|合同|售后|资源|周期|渠道/i, fields: ['报价', '交付', '验收', '合同', '售后', '周期'] },
  { key: 'emotion', label: '情绪/诗词', match: EMOTIONAL_MATCH_RE, fields: EMOTIONAL_FIELD_TERMS },
  { key: 'general', label: '通用', match: /./, fields: ['价格', '时间', '地点', '费用', '周期', '条件'] },
];

function normalizeText(value: unknown) {
  return cleanRobotReactionText(value, 220)
    .replace(/[\s。.!！?？,，、；;：:"'“”‘’《》【】()[\]（）{}<>]/g, '')
    .toLowerCase();
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function sourceBrief(post: RobotReactionPost) {
  return {
    category: [post.category?.name, post.category?.slug].filter(Boolean).join('/') || '未知分类',
    title: cleanRobotReactionText(post.title, 90) || '无标题',
    content: cleanRobotReactionText(post.content, 260) || '无正文',
    location: cleanRobotReactionText(post.location || post.countryName, 60) || '未知地点',
  };
}

function sourceText(post: RobotReactionPost) {
  const brief = sourceBrief(post);
  return `${brief.category} ${brief.title} ${brief.content} ${brief.location}`;
}

function sourceCompact(post: RobotReactionPost) {
  return normalizeText(`${post.title || ''} ${post.content || ''}`);
}

function fieldProfile(post: RobotReactionPost) {
  const raw = sourceText(post);
  return FIELD_PROFILES.find((profile) => profile.match.test(raw)) || FIELD_PROFILES[FIELD_PROFILES.length - 1];
}

function isEmotionProfile(profile: FieldProfile) {
  return profile.key === 'emotion';
}

function missingFields(post: RobotReactionPost, profile: FieldProfile) {
  if (isEmotionProfile(profile)) return profile.fields;
  const compactSource = normalizeText(sourceText(post));
  const missing = profile.fields.filter((field) => !compactSource.includes(normalizeText(field)));
  return missing.length ? missing : profile.fields.slice(0, 3);
}

function emotionalTerms(post: RobotReactionPost) {
  const compact = sourceCompact(post);
  return EMOTIONAL_SOURCE_TERMS.filter((term) => compact.includes(normalizeText(term))).slice(0, 8);
}

function sourceTerms(post: RobotReactionPost) {
  return unique([
    ...getRobotReactionSignals(post).map((item) => cleanRobotReactionText(item, 18)).filter(Boolean),
    ...emotionalTerms(post),
  ]).slice(0, 10);
}

export function getRobotReactionReadiness(post: RobotReactionPost, mode: RobotReactionMode): RobotReactionReadiness {
  const terms = sourceTerms(post);
  const profile = fieldProfile(post);
  const fields = missingFields(post, profile);
  const intent = isEmotionProfile(profile) ? 'emotional' : detectRobotReactionIntent(post);
  if (intent === 'unsupported') return { ok: false, reason: 'unsupported_source_intent', terms, fields, profile: profile.key };
  if (!terms.length) return { ok: false, reason: 'no_source_terms', terms, fields, profile: profile.key };
  if (!fields.length) return { ok: false, reason: 'no_field_terms', terms, fields, profile: profile.key };
  if (mode === 'quote' && profile.key === 'general' && terms.length < 2) return { ok: false, reason: 'quote_source_not_specific_enough', terms, fields, profile: profile.key };
  return { ok: true, reason: 'ready', terms, fields, profile: profile.key };
}

function recentBlock(recentContents: string[] = []) {
  return recentContents
    .map((item) => cleanRobotReactionText(item, 60))
    .filter(Boolean)
    .slice(0, RECENT_LIMIT)
    .join(' / ') || '无';
}

function extractCandidates(raw: unknown, mode: RobotReactionMode) {
  const max = mode === 'quote' ? 46 : 28;
  const text = String(raw || '').replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
  const lines = text.split(/\n+/)
    .flatMap((line) => line.split(/(?<=。|！|!|？|\?)\s+(?=\S)/))
    .map((line) => cleanRobotReactionText(line, max)
      .replace(/^[-*•\d.、)）\s]+/g, '')
      .replace(/^(候选|评论|引用|内容|文案|回复|text|content)\s*[:：]\s*/i, '')
      .replace(/^['"“”]+|['"“”]+$/g, '')
      .trim())
    .filter(Boolean)
    .filter((line) => !['SKIP', 'NO_REPLY', 'NOREPLY', '跳过', '不发'].includes(line.replace(/\s+/g, '').toUpperCase()));
  return unique(lines).slice(0, OUTPUT_LIMIT);
}

function isRecentDuplicate(text: string, recentContents: string[] = []) {
  const compact = normalizeText(text);
  if (!compact) return true;
  return recentContents.some((item) => {
    const other = normalizeText(item);
    return other && (other === compact || (other.length >= 10 && compact.includes(other)) || (compact.length >= 10 && other.includes(compact)));
  });
}

function containsAny(text: string, words: string[]) {
  const compact = normalizeText(text);
  return words.some((word) => {
    const value = normalizeText(word);
    return value.length >= 2 && compact.includes(value.slice(0, Math.min(6, value.length)));
  });
}

function copiedFromSource(post: RobotReactionPost, content: string) {
  const source = sourceCompact(post);
  const compact = normalizeText(content);
  if (!source || !compact || compact.length < COPY_NGRAM_MIN) return false;
  if (source.includes(compact)) return true;
  for (let index = 0; index <= compact.length - COPY_NGRAM_MIN; index += 1) {
    if (source.includes(compact.slice(index, index + COPY_NGRAM_MIN))) return true;
  }
  return false;
}

function toCandidate(post: RobotReactionPost, content: string, mode: RobotReactionMode, allowedSourceTerms: string[], allowedFieldTerms: string[]): PickedReaction | null {
  const cleaned = cleanRobotReactionText(content, mode === 'quote' ? 46 : 28);
  if (copiedFromSource(post, cleaned)) return null;
  const profile = fieldProfile(post);
  const toneViolation = detectRobotHumanToneViolation(cleaned, mode);
  if (toneViolation) return null;
  if (!containsAny(cleaned, allowedSourceTerms)) return null;
  if (!containsAny(cleaned, allowedFieldTerms)) return null;
  const intent = isEmotionProfile(profile) ? 'emotional' : detectRobotReactionIntent(post);
  const candidate: RobotReactionCandidate = {
    content: cleaned,
    intent,
    kind: mode === 'quote' ? 'judgment' : /吗|几|多少|哪|有/.test(cleaned) ? 'ask' : intent === 'emotional' ? 'empathy' : intent === 'daily' ? 'daily_echo' : 'interest',
    score: 0,
  };
  const quality = scoreRobotReaction(post, candidate, mode);
  if (!quality.ok) return null;
  return { ...candidate, score: quality.score, reason: quality.reason, source: 'model', signature: robotReactionSignature(cleaned) };
}

function pickBest(lines: string[], options: GenerateOptions, allowedSourceTerms: string[], allowedFieldTerms: string[]) {
  let best: PickedReaction | null = null;
  for (const line of lines) {
    if (isRecentDuplicate(line, options.recentContents || [])) continue;
    const candidate = toCandidate(options.post, line, options.mode, allowedSourceTerms, allowedFieldTerms);
    if (!candidate) continue;
    if (!best || candidate.score > best.score) best = candidate;
  }
  return best;
}

function repairText(repair?: { previousText: string; reason: string }) {
  return repair ? `\n上一版不合格：${cleanRobotReactionText(repair.previousText, 120)}\n问题：${repair.reason}\n` : '';
}

function buildEmotionCommentPrompt(options: GenerateOptions, repair?: { previousText: string; reason: string }) {
  const brief = sourceBrief(options.post);
  const terms = sourceTerms(options.post);
  const fields = missingFields(options.post, fieldProfile(options.post));
  return [
    '任务：评论区短感受',
    '长度：6 到 18 个中文字符',
    '目标：像真人看完诗词/歌词后的轻反应，只抓一个画面或情绪。',
    '硬性要求：每条必须同时包含 1 个原帖词 + 1 个感受词。',
    '严禁复制原帖原句，连续 8 个字相同就算失败。',
    '不要补价格、地点、费用、周期这类字段。',
    '不要解释，不要总结，不要鸡汤，不要复读。',
    '不要使用：这、那、这个、这种、这条、这类。',
    repairText(repair),
    `账号：${cleanRobotReactionText(options.robot.displayName, 40) || '信息账号'}`,
    `原帖摘录：${brief.content}`,
    `原帖词：${terms.join('、')}`,
    `感受词：${fields.join('、')}`,
    `最近已发：${recentBlock(options.recentContents)}`,
    '输出 8 条候选，每行一条。示例方向：江湖感挺真实。/ 后半段画面很足。不能照抄示例。',
  ].join('\n');
}

function buildCommentPrompt(options: GenerateOptions, repair?: { previousText: string; reason: string }) {
  const brief = sourceBrief(options.post);
  const terms = sourceTerms(options.post);
  const profile = fieldProfile(options.post);
  const fields = missingFields(options.post, profile);
  if (isEmotionProfile(profile)) return buildEmotionCommentPrompt(options, repair);
  return [
    '任务：评论区短回复',
    '长度：6 到 18 个中文字符',
    '目标：只补一个缺失字段短片段，不写观点。',
    '硬性要求：每条必须同时包含 1 个原帖词 + 1 个缺失字段。',
    '严禁复制原帖原句，连续 8 个字相同就算失败。',
    '不要参考固定句式，不要套模板，不要写成提醒。',
    '不要写完整观点，不要讲道理，不要总结，不要万能提醒。',
    '不要使用：这、那、这个、这种、这条、这类。',
    '不要使用：最怕、别只看、最好、写清、判断、建议、注意。',
    '不要反问，不要语气词，不要编号。',
    repairText(repair),
    `账号：${cleanRobotReactionText(options.robot.displayName, 40) || '信息账号'}`,
    `背景：${cleanRobotReactionText(options.robot.bio, 100) || '短句，具体，只补字段'}`,
    `分类：${brief.category}`,
    `地点：${brief.location}`,
    `标题：${brief.title}`,
    `正文：${brief.content}`,
    `原帖词：${terms.join('、')}`,
    `缺失字段：${fields.join('、')}`,
    `最近已发：${recentBlock(options.recentContents)}`,
    '输出 8 条候选，每行一条。无法同时包含原帖词和缺失字段就输出 SKIP。',
  ].join('\n');
}

function buildQuotePrompt(options: GenerateOptions, repair?: { previousText: string; reason: string }) {
  const brief = sourceBrief(options.post);
  const terms = sourceTerms(options.post);
  const profile = fieldProfile(options.post);
  const fields = missingFields(options.post, profile);
  const emotion = isEmotionProfile(profile);
  return [
    '任务：引用帖短判断',
    '长度：10 到 32 个中文字符',
    emotion ? '目标：可独立阅读，只提炼一个画面或情绪。' : '目标：可独立阅读，只补一个判断，不写问句。',
    emotion ? '硬性要求：每条必须同时包含 1 个原帖词 + 1 个感受词。' : '硬性要求：每条必须同时包含 1 个原帖词 + 1 个分类字段。',
    '严禁复制原帖原句，连续 8 个字相同就算失败。',
    '不要参考固定句式，不要套模板，不要写成提醒。',
    '不要写成知识卡片，不要讲道理，不要总结，不要万能提醒。',
    '不要使用：这、那、这个、这种、这条、这类。',
    '不要使用：最怕、别只看、最好、写清、判断、建议、注意。',
    '不要反问，不要语气词，不要编号，不要问号。',
    repairText(repair),
    `账号：${cleanRobotReactionText(options.robot.displayName, 40) || '信息账号'}`,
    `背景：${cleanRobotReactionText(options.robot.bio, 100) || '短句，具体，只补字段'}`,
    `分类：${brief.category}`,
    `地点：${brief.location}`,
    `标题：${brief.title}`,
    `正文：${brief.content}`,
    `原帖词：${terms.join('、')}`,
    `${emotion ? '感受词' : '分类字段'}：${fields.join('、')}`,
    `最近已发：${recentBlock(options.recentContents)}`,
    `输出 8 条候选，每行一条。无法同时包含原帖词和${emotion ? '感受词' : '分类字段'}就输出 SKIP。`,
  ].join('\n');
}

function buildPrompt(options: GenerateOptions, repair?: { previousText: string; reason: string }) {
  return options.mode === 'quote' ? buildQuotePrompt(options, repair) : buildCommentPrompt(options, repair);
}

export async function generateBestRobotReaction(options: GenerateOptions): Promise<PickedReaction | null> {
  const readiness = getRobotReactionReadiness(options.post, options.mode);
  if (!readiness.ok) return null;
  const first = await generateAutomationAiText({
    purpose: options.mode === 'quote' ? 'quote' : 'comment',
    system: '只输出中文短句候选；不要解释，不要编号；严禁复制原帖。',
    user: buildPrompt(options),
    temperature: options.mode === 'quote' ? 0.74 : 0.82,
    topP: 0.92,
    maxTokens: 150,
    timeoutMs: AI_TIMEOUT_MS,
  });
  if (first.ok) {
    const picked = pickBest(extractCandidates(first.text, options.mode), options, readiness.terms, readiness.fields);
    if (picked) return picked;
    const repaired = await generateAutomationAiText({
      purpose: options.mode === 'quote' ? 'quote' : 'comment',
      system: '重写成中文短句候选；不要解释，不要编号；不要复制原帖。',
      user: buildPrompt(options, { previousText: first.text || '', reason: '复制原帖、没有同时命中原帖词和字段，或命中了禁用口吻' }),
      temperature: 0.68,
      topP: 0.88,
      maxTokens: 120,
      timeoutMs: AI_TIMEOUT_MS,
    });
    if (repaired.ok) {
      const repairedPicked = pickBest(extractCandidates(repaired.text, options.mode), options, readiness.terms, readiness.fields);
      if (repairedPicked) return repairedPicked;
    }
  }
  return null;
}
