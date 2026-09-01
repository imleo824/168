import type { Prisma } from '@prisma/client';
import type {
  LocationPresetConfig,
  PublishCategoryMetaConfig,
  PublishCategoryMetaFieldConfig,
} from '../config-types';
import { generateAutomationAiText } from './automation-ai.service';
import { cleanString } from './auto-crawl-normalize';
import { cleanCrawlContent, type CrawlExtractResult } from './crawl-content-extract.service';
import {
  currencyRate,
  normalizeCrawlCategoryMeta,
  type CrawlCategoryRef,
} from './crawl-category-meta-normalize.service';
import { normalizeToLocationPreset } from './location-preset-normalize.service';

export type AutoCrawlExtractionContext = {
  category: CrawlCategoryRef;
  schema: PublishCategoryMetaConfig | null;
  locationPresets: LocationPresetConfig[];
};

export type CrawlAiExtractResult = CrawlExtractResult & {
  audit: {
    extractor: 'ai_optional';
    bodySource: 'quality_cleaned_title_and_content';
    categoryId: string;
    categorySlug: string;
    schemaVersion: number | null;
    configuredMetaKeys: string[];
    metaStandardization: Awaited<ReturnType<typeof normalizeCrawlCategoryMeta>>['audit'];
    ruleBasedMetaKeys: string[];
    ruleBasedFallbackKeys: string[];
    contactSource: 'ai' | 'quality_raw_contact' | 'none';
    provider: string;
    model: string;
    enrichmentStatus: 'success' | 'failed' | 'invalid_json';
    enrichmentError: string | null;
  };
};

type MetaFieldSpec = {
  key: string;
  label: string;
  type: string;
  options?: string[];
  maxLength?: number;
  required?: boolean;
};

const CANDIDATE_TEXT_LIMIT = 12_000;
const FIELD_SEGMENT_LIMIT = 140;
const CHINESE_NUMBER_CHARS = '零一二两三四五六七八九十百千万';

function objectValue(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function parseStrictJsonObject(raw: unknown) {
  const text = String(raw || '').trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function fieldSpec(field: PublishCategoryMetaFieldConfig): MetaFieldSpec {
  return {
    key: field.key,
    label: field.label,
    type: field.type,
    ...(field.options ? { options: field.options } : {}),
    ...(typeof field.maxLength === 'number' ? { maxLength: field.maxLength } : {}),
    ...(field.required ? { required: true } : {}),
  };
}

function locationValues(presets: LocationPresetConfig[]) {
  return presets.flatMap((group) => [
    group.country,
    ...group.cities.map((city) => `${group.country} · ${city}`),
  ]);
}

function normalizeSearchText(raw: unknown) {
  return String(raw ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCandidateContent(raw: unknown) {
  return String(raw ?? '')
    .normalize('NFKC')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function firstMeaningfulLine(raw: string) {
  return normalizeCandidateContent(raw).split('\n').find(Boolean) || '';
}

export function buildCrawlMetaSourceData(input: {
  rawTitle?: unknown;
  cleanedContent: unknown;
}) {
  const title = cleanString(cleanCrawlContent(input.rawTitle || ''), 160);
  const content = cleanCrawlContent(input.cleanedContent);
  const firstLine = firstMeaningfulLine(content);
  const parts: string[] = [];
  if (title && normalizeSearchText(title) !== normalizeSearchText(firstLine)) parts.push(`标题：${title}`);
  if (content) parts.push(content);
  return parts.join('\n').slice(0, CANDIDATE_TEXT_LIMIT);
}

function escapeRegex(raw: unknown) {
  return String(raw ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function textLines(raw: unknown) {
  return normalizeCandidateContent(raw)
    .split(/[\n\r]+/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 240);
}

function lineLooksRelevant(line: string, terms: string[]) {
  return terms.some((term) => term && line.toLowerCase().includes(term.toLowerCase()));
}

function fieldTerms(field: PublishCategoryMetaFieldConfig) {
  return [field.label, field.key].map(normalizeSearchText).filter(Boolean);
}

function fieldSegments(field: PublishCategoryMetaFieldConfig, content: string, extraTerms: string[] = []) {
  const terms = Array.from(new Set([...fieldTerms(field), ...extraTerms.map(normalizeSearchText)].filter(Boolean)));
  const lines = textLines(content);
  const segments: string[] = [];

  for (const line of lines) {
    if (lineLooksRelevant(line, terms)) segments.push(line.slice(0, FIELD_SEGMENT_LIMIT));
  }

  for (const term of terms) {
    const pattern = new RegExp(`${escapeRegex(term)}\\s*[:：]?\\s*([^\\n。；;|]{1,${FIELD_SEGMENT_LIMIT}})`, 'i');
    const match = content.match(pattern);
    if (match?.[0]) segments.unshift(match[0].slice(0, FIELD_SEGMENT_LIMIT));
  }

  return Array.from(new Set(segments)).slice(0, 8);
}

function moneyFieldTerms(field: PublishCategoryMetaFieldConfig) {
  const key = normalizeSearchText(field.key).toLowerCase();
  const label = normalizeSearchText(field.label).toLowerCase();
  const terms = new Set<string>();
  if (/salary|wage|pay/.test(key) || /薪资|工资|待遇|月薪|薪酬/.test(label)) {
    ['薪资', '工资', '待遇', '月薪', '薪酬', '底薪', 'salary', 'pay'].forEach((term) => terms.add(term));
  }
  if (/price|rent|cost|fee|amount/.test(key) || /价格|租金|房租|费用|金额|月租/.test(label)) {
    ['价格', '租金', '房租', '费用', '金额', '月租', 'price', 'rent', 'cost', 'fee'].forEach((term) => terms.add(term));
  }
  return Array.from(terms);
}

function isSalarySelectField(field: PublishCategoryMetaFieldConfig) {
  return field.type === 'select'
    && /薪资|工资|待遇/i.test(field.label)
    && (field.options || []).some((option) => /\$|面议/.test(option));
}

function isNumberField(field: PublishCategoryMetaFieldConfig) {
  return field.type === 'number';
}

function isMoneyNumberField(field: PublishCategoryMetaFieldConfig) {
  const key = normalizeSearchText(field.key).toLowerCase();
  const label = normalizeSearchText(field.label).toLowerCase();
  return /price|rent|salary|cost|fee|amount/.test(key)
    || /价格|租金|房租|薪资|工资|待遇|费用|金额|月租/.test(label);
}

function numericUnitPattern(units: string) {
  return new RegExp(`([+-]?\\d[\\d,]*(?:\\.\\d+)?\\s*(?:k|K|千|w|W|万)?|[${CHINESE_NUMBER_CHARS}]{1,12})\\s*(?:${units})`, 'i');
}

function contextualNumericCandidate(field: PublishCategoryMetaFieldConfig, content: string) {
  const key = normalizeSearchText(field.key).toLowerCase();
  const label = normalizeSearchText(field.label);
  const text = normalizeSearchText(content);
  if (/deposit/.test(key) || /押/.test(label)) return text.match(/押\s*([+-]?\d+(?:\.\d+)?|[零一二两三四五六七八九十百千万]{1,12})/)?.[0] || '';
  if (/payment/.test(key) || /付/.test(label)) return text.match(/付\s*([+-]?\d+(?:\.\d+)?|[零一二两三四五六七八九十百千万]{1,12})/)?.[0] || '';
  if (/bed(room)?s?/.test(key) || /卧室|房间|几房|房型/.test(label)) return text.match(/([+-]?\d+(?:\.\d+)?|[零一二两三四五六七八九十百千万]{1,12})\s*(?:房|室|bedrooms?|br)(?:\b|$)?/i)?.[0] || '';
  if (/area|size/.test(key) || /面积|平方|平米/.test(label)) return text.match(numericUnitPattern('平|平方|平米|㎡|m2|sqm|sq\\.m'))?.[0] || '';
  return '';
}

function firstNumberLikeSegment(segments: string[]) {
  return segments.find((segment) => /(?:\d|[零一二两三四五六七八九十百千万])/.test(segment)) || '';
}

function selectCandidate(field: PublishCategoryMetaFieldConfig, content: string) {
  if (isSalarySelectField(field)) {
    return firstNumberLikeSegment(fieldSegments(field, content, moneyFieldTerms(field)))
      || (/(?:面议|面谈|详聊|从优|看能力|negotiable|tbd)/i.test(content) ? content : '');
  }
  return content;
}

function numberCandidate(field: PublishCategoryMetaFieldConfig, content: string) {
  const contextual = contextualNumericCandidate(field, content);
  if (contextual) return contextual;
  if (isMoneyNumberField(field)) return firstNumberLikeSegment(fieldSegments(field, content, moneyFieldTerms(field)));
  return firstNumberLikeSegment(fieldSegments(field, content));
}

function booleanCandidate(field: PublishCategoryMetaFieldConfig, content: string) {
  const label = normalizeSearchText(field.label);
  if (!label) return undefined;
  const negative = new RegExp(`(?:不|无|未|无需|没有|否)\\s*${escapeRegex(label)}|${escapeRegex(label)}\\s*(?:否|无|不需要|没有)`, 'i');
  const positive = new RegExp(`(?:可|有|支持|提供|需要|要求|包|含)?\\s*${escapeRegex(label)}|${escapeRegex(label)}\\s*(?:是|有|支持|提供|需要)`, 'i');
  if (negative.test(content)) return false;
  if (positive.test(content)) return true;
  return undefined;
}

function textCandidate(field: PublishCategoryMetaFieldConfig, content: string) {
  const segment = fieldSegments(field, content)[0] || '';
  if (!segment) return '';
  const terms = fieldTerms(field);
  const pattern = new RegExp(`^(?:${terms.map(escapeRegex).join('|')})\\s*[:：]?\\s*`, 'i');
  return segment.replace(pattern, '').trim();
}

export function buildRuleBasedCrawlMetaCandidates(context: AutoCrawlExtractionContext, rawContent: unknown) {
  const fields = context.schema?.fields || [];
  const content = normalizeCandidateContent(rawContent).slice(0, CANDIDATE_TEXT_LIMIT);
  const candidates: Record<string, unknown> = {};
  if (!fields.length || !content) return candidates;

  for (const field of fields) {
    const key = normalizeSearchText(field.key);
    if (!key) continue;

    if (field.type === 'location') {
      if (normalizeToLocationPreset(content, context.locationPresets)) candidates[key] = content;
      continue;
    }
    if (field.type === 'select') {
      const candidate = selectCandidate(field, content);
      if (candidate) candidates[key] = candidate;
      continue;
    }
    if (isNumberField(field)) {
      const candidate = numberCandidate(field, content);
      if (candidate) candidates[key] = candidate;
      continue;
    }
    if (field.type === 'boolean') {
      const candidate = booleanCandidate(field, content);
      if (candidate !== undefined) candidates[key] = candidate;
      continue;
    }
    if (field.type === 'text') {
      const candidate = textCandidate(field, content);
      if (candidate) candidates[key] = candidate;
    }
  }

  return candidates;
}

function schemaInstruction(context: AutoCrawlExtractionContext) {
  const fields = (context.schema?.fields || []).map(fieldSpec);
  if (!fields.length) return '当前数据库分类没有配置 Meta 字段，meta 必须返回空对象 {}。';
  const configuredLabels = fields.map((field) => field.label).filter(Boolean).join('、');

  const hasLocation = fields.some((field) => field.type === 'location');
  const hasSalaryRange = fields.some((field) => field.type === 'select' && /薪资|工资|待遇/i.test(field.label) && (field.options || []).some((option) => /\$|面议/.test(option)));
  const locationRule = hasLocation
    ? `\nlocation 类型字段只能归一到数据库地点预设之一：${JSON.stringify(locationValues(context.locationPresets))}。必须充分理解 SOURCE_DATA 挖掘地点：优先识别城市、地区、园区、口岸、常见英文名和缩写，能匹配城市/地区时输出“国家 · 城市”；只识别到国家时输出国家；都无法可靠匹配后台预设时省略。最终输出必须是预设原文值，不能自造地点。`
    : '';
  const salaryRangeRule = hasSalaryRange
    ? '\n薪资 select 字段必须先识别金额、币种和周期，再归入配置区间：U、USDT、USD、美元、刀按美元等值处理；也要识别 RMB/CNY/人民币、PHP/披索/比索、THB/泰铢、KHR/瑞尔、VND/越南盾、AED/迪拉姆、MYR/马币/林吉特、SGD/新币、IDR/印尼盾、LAK/基普、MMK/缅币、JPY/日元、KRW/韩元、HKD/港币、MOP/澳门币、EUR/欧元等常见币种。能按原文语义合理换算到美元月薪区间时，输出最接近的 options 原文值；没有明确数字金额，或币种/周期不足以可靠判断，或只写面谈、面议、待遇从优、薪资详聊、看能力，必须输出“面议”。'
    : '';

  return `当前分类允许的 Meta Schema：${JSON.stringify(fields)}${locationRule}${salaryRangeRule}\n本次只处理这些后台字段：${configuredLabels || '无'}。meta 只能包含 Schema 中配置的 key；required=true 的字段必须优先从原文完整提取，但原文没有可靠证据时仍必须省略，禁止猜测或填造默认值，后续发布契约会阻止结构不完整的内容。未配置的原文属性必须完全忽略，不要抽取、不要转写、不要放入 meta 候选，例如年龄、性别、国籍、语言、学历、工作时间、休假、班次、人数、经验要求等，除非它们本身就是 Schema 字段。字段 key 只是输出键，原文不需要出现 key 字符串；只围绕 Schema 字段的 label、type、options 理解上下文后提取，不要做关键词照抄。number 字段只在 Schema 配置了对应字段时才解析数值；对于价格、薪资、租金等金额字段（key/label 包含 price, salary, rent, cost, fee, amount, 价格, 租金, 薪资），若原文中带有明确的非 USD 币种（如 AED 85,000、RMB 5000、10000 PHP 等），必须在 meta 中保留包含币种和数值的原始表达（如 {"price": "AED 85,000"}），以便系统自动精准按汇率换算为 USD；若原文为 USD/美元/U/纯数字，则可直接输出数值。select 字段必须输出 options 中的原文值，不能自造新值。无法确认的字段直接省略。`;
}

function locationFromMeta(meta: Record<string, unknown>, schema: PublishCategoryMetaConfig | null) {
  const locationField = schema?.fields.find((field) => field.type === 'location');
  if (!locationField) return '';
  const value = meta[locationField.key];
  return typeof value === 'string' ? value : '';
}

export async function buildCrawlExtract(input: {
  context: AutoCrawlExtractionContext;
  rawTitle?: string;
  rawContent: string;
  cleanedContent: string;
  sourceName?: string;
  detectedContact?: string;
}): Promise<CrawlAiExtractResult> {
  const context = input.context;
  if (!context.category?.id || !context.category.name || !context.category.slug) {
    throw new Error('auto_crawl_database_category_required');
  }

  const publishContent = cleanCrawlContent(input.cleanedContent);
  const sourceContent = buildCrawlMetaSourceData({
    rawTitle: input.rawTitle,
    cleanedContent: publishContent,
  });
  const originalTitle = cleanString(input.rawTitle, 80)
    || cleanString(publishContent.split('\n').find((line) => line.trim().length >= 2), 80);
  const fallbackTitle = originalTitle || '自动抓取内容';
  const detectedContact = cleanString(input.detectedContact, 120);
  const system = '你是分类信息平台的高级编辑与结构化提取器。数据库 Category 是分类唯一事实源，后台 Meta Schema 是 Meta 唯一事实源。主要任务是精准提取发布者联系方式和符合 Schema 规范的 Meta 属性；若原文缺乏标题时则生成精炼标题。不得修改分类；不得新增未配置的 Meta 字段；只输出合法的纯 JSON 对象，不要 Markdown 格式。';
  const user = `输出字段只能是 title、contact、meta：
1. "title": 若原内容缺乏有效标题，请提炼精炼自然标题（10-40字）；若原内容已有明确标题可直接输出原标题。
2. "contact": 仅提取该条信息真正发布者（如HR、房东、卖家）的联系方式（优先提取 @telegram_handle、WhatsApp、微信、电话）；严格排除频道管理、频道机器人、投稿入口、广告赞助商的联系方式；若无明确发布者联系方式则输出空字符串 ""。
3. "meta": 严格符合后台 Meta Schema 的字段键值对对象。

数据库分类：${JSON.stringify({ id: context.category.id, name: context.category.name, slug: context.category.slug })}
Schema版本：${context.schema?.schemaVersion ?? null}
${schemaInstruction(context)}

SOURCE_DATA 是经过质量清洗的标题与正文；title 和 meta 只能基于 SOURCE_DATA 判断进行语义提炼。
正文内容由系统保留，禁止输出 content、category、categoryName 或 location 等外层未定义字段。
来源渠道：${input.sourceName || ''}
<SOURCE_DATA>
${sourceContent}
</SOURCE_DATA>`;

  const result = await generateAutomationAiText({
    purpose: 'crawl',
    system,
    user,
    temperature: 0,
    maxTokens: 1800,
    timeoutMs: 20_000,
    jsonMode: true,
  }).catch((error) => ({
    ok: false,
    text: '',
    reason: error instanceof Error ? error.message : 'ai_failed',
    provider: '',
    model: '',
  }));

  const parsed = result.ok && result.text ? parseStrictJsonObject(result.text) : null;
  const enrichmentStatus: CrawlAiExtractResult['audit']['enrichmentStatus'] = !result.ok
    ? 'failed'
    : parsed
      ? 'success'
      : 'invalid_json';
  const enrichmentError = enrichmentStatus === 'success'
    ? null
    : String(result.reason || (enrichmentStatus === 'invalid_json' ? 'invalid_json' : 'ai_failed')).slice(0, 300);

  const aiRawMeta = objectValue(parsed?.meta);
  const aiNormalized = await normalizeCrawlCategoryMeta({
    category: context.category,
    rawMeta: aiRawMeta,
    categoryMetaSchema: context.schema,
    locationPresets: context.locationPresets,
  });
  const ruleBasedRawMeta = buildRuleBasedCrawlMetaCandidates(context, sourceContent);
  const ruleBasedFallbackRawMeta = Object.fromEntries(Object.entries(ruleBasedRawMeta)
    .filter(([key, candidate]) => {
      if (!Object.prototype.hasOwnProperty.call(aiNormalized.meta, key)) return true;
      const candidateStr = String(candidate || '');
      const candidateRate = currencyRate(candidateStr);
      if (candidateRate !== null && candidateRate !== 1) {
        const aiVal = aiNormalized.meta[key];
        const aiRawVal = String((aiRawMeta as Record<string, unknown>)[key] ?? '');
        const aiRawRate = currencyRate(aiRawVal);
        if (typeof aiVal === 'number' && (aiRawRate === null || aiRawRate === 1)) {
          return true;
        }
      }
      return false;
    }));
  const normalized = Object.keys(ruleBasedFallbackRawMeta).length
    ? await normalizeCrawlCategoryMeta({
      category: context.category,
      rawMeta: { ...aiRawMeta, ...ruleBasedFallbackRawMeta },
      categoryMetaSchema: context.schema,
      locationPresets: context.locationPresets,
    })
    : aiNormalized;
  const ruleBasedFallbackKeys = Object.keys(ruleBasedFallbackRawMeta)
    .filter((key) => Object.prototype.hasOwnProperty.call(normalized.meta, key)
      && !Object.prototype.hasOwnProperty.call(aiNormalized.meta, key));

  const aiContact = cleanString(parsed?.contact, 120);
  const contact = aiContact || detectedContact;
  const contactSource = aiContact ? 'ai' : detectedContact ? 'quality_raw_contact' : 'none';
  const meta = normalized.meta as Prisma.InputJsonObject;
  return {
    title: cleanString(parsed?.title, 80) || fallbackTitle,
    content: publishContent,
    categoryName: context.category.name,
    location: locationFromMeta(normalized.meta, context.schema),
    contact,
    meta,
    audit: {
      extractor: 'ai_optional',
      bodySource: 'quality_cleaned_title_and_content',
      categoryId: context.category.id,
      categorySlug: context.category.slug,
      schemaVersion: typeof context.schema?.schemaVersion === 'number' ? context.schema.schemaVersion : null,
      configuredMetaKeys: (context.schema?.fields || []).map((field) => field.key),
      metaStandardization: normalized.audit,
      ruleBasedMetaKeys: Object.keys(ruleBasedRawMeta),
      ruleBasedFallbackKeys,
      contactSource,
      provider: String(result.provider || ''),
      model: String(result.model || ''),
      enrichmentStatus,
      enrichmentError,
    },
  };
}
