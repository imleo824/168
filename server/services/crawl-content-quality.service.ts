import { cleanCrawlContent } from './crawl-content-extract.service';

export type CrawlQualityDecision = {
  shouldPublish: boolean;
  reason: string;
  score: number;
  cleanedTitle: string;
  cleanedContent: string;
  contact: string;
  flags: string[];
  removed: {
    emojiCount: number;
    emojiRatio: number;
    contactLines: number;
    promoLines: number;
    boilerplateLines: number;
    tailLines: number;
    duplicateLines: number;
  };
  diagnostics: {
    canonicalLength: number;
    cleanedLength: number;
    imageCount: number;
    rawLineCount: number;
    keptLineCount: number;
    removedLineRatio: number;
    repeatedLineRatio: number;
  };
};

type BodyCleanResult = {
  cleanedContent: string;
  emojiCount: number;
  contactLines: number;
  promoLines: number;
  boilerplateLines: number;
  tailLines: number;
  duplicateLines: number;
  rawLineCount: number;
  keptLineCount: number;
};

const CONTACT_PATTERNS = [
  /https?:\/\/(?:t\.me|telegram\.me|wa\.me)\/\+?[A-Za-z0-9_]+/gi,
  /\b(?:t\.me|telegram\.me|wa\.me)\/\+?[A-Za-z0-9_]+/gi,
  /(?:TG|Telegram|飞机|电报)[:：\s@]*[A-Za-z0-9_]{4,64}/gi,
  /(^|[^A-Za-z0-9_.@])@[A-Za-z0-9_]{4,64}(?!\.[A-Za-z])/g,
  /(?:微信|VX|WeChat)[:：\s]*[A-Za-z0-9_-]{4,64}/gi,
  /\+?\d[\d\s-]{7,}\d/g,
];

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function textLength(raw: string) {
  return String(raw || '').replace(/\s+/g, '').length;
}

function compact(raw: string) {
  return String(raw || '')
    .normalize('NFKC')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/[!！?？。,.，、]{3,}/g, '。')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function canonicalContent(raw: unknown) {
  return compact(cleanCrawlContent(raw));
}

function normalizeSemanticSymbols(raw: string) {
  return String(raw || '')
    .replace(/(?:✈\uFE0F?|🛩\uFE0F?|🛫|🛬|🚀)\s*(?=@?[A-Za-z0-9_]{4,64}\b)/g, ' TG ')
    .replace(/(?:☎\uFE0F?|📞|📱|📲)\s*/g, ' 电话 ')
    .replace(/(?:📍|🗺\uFE0F?|🌐)\s*/g, ' 地址 ')
    .replace(/(?:✉\uFE0F?|📩|📨|📧)\s*/g, ' 联系 ')
    .replace(/(?:💰|💵|🪙|💳|💸)\s*/g, ' 金额 ');
}

function stripEmoji(raw: string) {
  let emojiCount = 0;
  const normalized = normalizeSemanticSymbols(raw);
  let cleaned = normalized.replace(/(?:[#*0-9]\uFE0F?\u20E3|\p{Regional_Indicator}{2}|\p{Extended_Pictographic}(?:\uFE0E|\uFE0F)?(?:\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0E|\uFE0F)?(?:\p{Emoji_Modifier})?)*)/gu, () => {
    emojiCount += 1;
    return '';
  });
  cleaned = cleaned
    .replace(/[\u200B-\u200F\u202A-\u202E\uFEFF\u00AD\uFE0E\uFE0F\u20E3\u200D]/g, '')
    .replace(/[\u2580-\u27BF]/g, '');
  return { cleaned, emojiCount };
}

function removeInlineContacts(line: string) {
  let next = line;
  for (const pattern of CONTACT_PATTERNS) next = next.replace(pattern, (...match) => {
    const captures = match.slice(1, -2).filter((value: unknown) => typeof value === 'string');
    return String(captures[0] || '');
  });
  return next
    .replace(/(?:联系|私聊|咨询|客服|飞机|电报|TG|Telegram|微信|VX|WeChat|电话)[:：\s-]*$/i, '')
    .trim();
}

function isSeparatorLine(line: string) {
  return /^[\-—_=*·•｜|\s]{4,}$/.test(line);
}

function isTelegramServiceActionContent(title: string, content: string) {
  const lines = `${title}\n${content}`
    .split('\n')
    .map((line) => compact(line))
    .filter(Boolean);
  const text = unique(lines).join(' ');
  if (!text || textLength(text) > 120 || lines.length > 2) return false;
  return /^(?:.+\s+)?(?:pinned\s+(?:a|an|the)?\s*(?:message|photo|video|file|sticker|poll|audio|voice message)|changed\s+(?:the\s+)?(?:group|channel)?\s*(?:photo|title|name)|joined\s+telegram|created\s+(?:the\s+)?(?:group|channel)|started\s+(?:a\s+)?video chat)$/i.test(text);
}

function isTailMarker(line: string) {
  const value = compact(line);
  return /^(?:频道赞助商|独家冠名赞助|赞助商|广告赞助|频道广告|广告合作|商务合作|投稿联系|爆料投稿|免费发布|频道导航|频道矩阵|防失联|备用频道|备用群|官方频道|风险提示及免责条款|免责声明|本文来源[:：]|点击查看原文|阅读原文)/i.test(value);
}

function shouldStartTail(line: string, index: number, total: number, keptCount: number) {
  if (!isTailMarker(line) || keptCount === 0) return false;
  const progress = total > 0 ? index / total : 0;
  return progress >= 0.55 || (keptCount >= 3 && textLength(line) <= 60);
}

function isPromoLine(line: string) {
  const value = compact(line);
  if (!value) return true;
  if (/^(?:广告合作|商务合作|投稿|投稿联系|爆料投稿|免费发布|推广|置顶|互推|频道合作|频道导航|资源群|交流群|官方群|加入频道|订阅频道)[:：\s]/i.test(value)) return true;
  return /^(?:点击|扫码|长按|复制链接|打开链接|关注|订阅|进群|加群).{0,50}$/i.test(value);
}

function isBoilerplateLine(line: string, hasContentAbove: boolean) {
  const value = compact(line);
  if (!value || isSeparatorLine(value)) return true;
  if (/^(?:VIEW IN TELEGRAM|Please open Telegram|查看原文|打开 Telegram).*$/i.test(value)) return true;
  if (hasContentAbove && /^(?:@[A-Za-z0-9_]{4,64}|https?:\/\/\S+|t\.me\/\S+)$/i.test(value)) return true;
  if (/(?:认准唯一|绝无小号|没有任何小号|防假冒|防冒充|谨防冒充|谨防上当|唯一客服|唯一账号|唯一联系方式)/i.test(value)) return true;
  if (hasContentAbove && /^(?:资金交易.*注意甄别|二手物品.*私下交易|切勿私下交易|本群不做担保).*$/i.test(value)) return true;
  return false;
}

function repeatedLineRatio(lines: string[]) {
  const meaningful = lines.map((line) => compact(line)).filter((line) => textLength(line) >= 4);
  if (meaningful.length < 3) return 0;
  const seen = new Set<string>();
  let repeats = 0;
  for (const line of meaningful) {
    const key = line.toLowerCase();
    if (seen.has(key)) repeats += 1;
    else seen.add(key);
  }
  return repeats / meaningful.length;
}

function cleanBody(rawContent: string): BodyCleanResult {
  const rawLines = canonicalContent(rawContent).split('\n').map((line) => compact(line)).filter(Boolean);
  const kept: string[] = [];
  const seen = new Set<string>();
  let contactLines = 0;
  let promoLines = 0;
  let boilerplateLines = 0;
  let tailLines = 0;
  let duplicateLines = 0;
  let emojiCount = 0;
  let tailStarted = false;

  for (let index = 0; index < rawLines.length; index += 1) {
    const rawLine = rawLines[index];
    if (!tailStarted && shouldStartTail(rawLine, index, rawLines.length, kept.length)) tailStarted = true;
    if (tailStarted) {
      tailLines += 1;
      continue;
    }
    if (isSeparatorLine(rawLine)) {
      boilerplateLines += 1;
      continue;
    }
    if (isPromoLine(rawLine)) {
      promoLines += 1;
      continue;
    }

    const withoutContacts = compact(removeInlineContacts(rawLine));
    if (withoutContacts !== compact(rawLine)) contactLines += 1;
    if (!withoutContacts) continue;
    if (isBoilerplateLine(withoutContacts, kept.length > 0)) {
      boilerplateLines += 1;
      continue;
    }

    const emoji = stripEmoji(withoutContacts);
    emojiCount += emoji.emojiCount;
    const line = compact(emoji.cleaned);
    if (!line) continue;

    const dedupeKey = line.toLowerCase();
    if (seen.has(dedupeKey)) {
      duplicateLines += 1;
      continue;
    }
    seen.add(dedupeKey);
    kept.push(line);
  }

  return {
    cleanedContent: compact(kept.join('\n')),
    emojiCount,
    contactLines,
    promoLines,
    boilerplateLines,
    tailLines,
    duplicateLines,
    rawLineCount: rawLines.length,
    keptLineCount: kept.length,
  };
}

function cleanTitle(rawTitle: string, cleanedContent: string) {
  const titleSource = canonicalContent(rawTitle) || cleanedContent.split('\n').find(Boolean) || '';
  return compact(stripEmoji(removeInlineContacts(titleSource)).cleaned)
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/(?:t\.me|telegram\.me)\/\S+/gi, '')
    .replace(/(^|[^A-Za-z0-9_.@])@[A-Za-z0-9_]{4,64}(?!\.[A-Za-z])/g, '$1')
    .replace(/^【[^】]{1,30}】\s*/, '')
    .trim()
    .slice(0, 80);
}

export function filterCrawlContentBeforePublish<T extends {
  title?: string;
  content: string;
  images?: string[];
  sourceName?: string;
  categoryName?: string;
}>(input: T): CrawlQualityDecision {
  const rawTitle = canonicalContent(input.title || '');
  const canonical = canonicalContent(input.content);
  const imageCount = Array.isArray(input.images) ? input.images.filter(Boolean).length : 0;

  if (isTelegramServiceActionContent(rawTitle, canonical)) {
    return {
      shouldPublish: false,
      reason: 'telegram_service_action',
      score: 0,
      cleanedTitle: rawTitle,
      cleanedContent: '',
      contact: '',
      flags: ['telegram_service_action'],
      removed: { emojiCount: 0, emojiRatio: 0, contactLines: 0, promoLines: 0, boilerplateLines: 0, tailLines: 0, duplicateLines: 0 },
      diagnostics: { canonicalLength: textLength(canonical), cleanedLength: 0, imageCount, rawLineCount: 0, keptLineCount: 0, removedLineRatio: 0, repeatedLineRatio: 0 },
    };
  }

  const body = cleanBody(canonical);
  const cleanedTitle = cleanTitle(rawTitle, body.cleanedContent);
  const effectiveContent = body.cleanedContent || (imageCount > 0 ? cleanedTitle : '');
  const canonicalLength = textLength(canonical);
  const cleanedLength = textLength(effectiveContent);
  const removedLineCount = body.contactLines + body.promoLines + body.boilerplateLines + body.tailLines + body.duplicateLines;
  const removedLineRatio = body.rawLineCount ? removedLineCount / body.rawLineCount : 0;
  const emojiRatio = cleanedLength + body.emojiCount > 0 ? body.emojiCount / (cleanedLength + body.emojiCount) : 0;
  const repeatedRatio = repeatedLineRatio(canonical.split('\n'));
  const flags: string[] = [];
  let score = 100;

  if (body.tailLines > 0) { flags.push('source_tail_removed'); score -= Math.min(20, body.tailLines * 3); }
  if (body.promoLines > 0) { flags.push('promo_lines_removed'); score -= Math.min(15, body.promoLines * 4); }
  if (body.contactLines > 0) flags.push('contact_removed');
  if (body.boilerplateLines > 0) { flags.push('boilerplate_removed'); score -= Math.min(12, body.boilerplateLines * 3); }
  if (body.duplicateLines > 0) { flags.push('duplicate_lines_removed'); score -= Math.min(12, body.duplicateLines * 4); }
  if (removedLineRatio >= 0.7) { flags.push('template_dominant'); score -= 35; }
  if (repeatedRatio >= 0.5) { flags.push('repetition_heavy'); score -= 20; }
  if (emojiRatio > 0.45 && cleanedLength < 80) { flags.push('emoji_dominant'); score -= 55; }
  else if (emojiRatio > 0.3 && cleanedLength < 120) { flags.push('emoji_heavy'); score -= 20; }
  if (cleanedLength < 12 && imageCount === 0) { flags.push('too_short_without_media'); score -= 55; }
  else if (cleanedLength < 24 && imageCount === 0) score -= 20;
  if (imageCount > 0 && (cleanedLength >= 2 || cleanedTitle)) score += 10;
  if (cleanedLength >= 80) score += 5;
  score = Math.max(0, Math.min(100, score));

  let shouldPublish = true;
  let reason = 'pass';
  if (cleanedLength < 6 && imageCount === 0) { shouldPublish = false; reason = 'empty_after_clean'; }
  else if (cleanedLength < 12 && imageCount === 0) { shouldPublish = false; reason = 'too_short_without_media'; }
  else if (flags.includes('emoji_dominant')) { shouldPublish = false; reason = 'emoji_dominant'; }
  else if (flags.includes('template_dominant') && cleanedLength < 30 && imageCount === 0) { shouldPublish = false; reason = 'template_shell'; }
  else if (score < 45) { shouldPublish = false; reason = 'low_quality'; }

  return {
    shouldPublish,
    reason,
    score,
    cleanedTitle: cleanedTitle || rawTitle,
    cleanedContent: effectiveContent,
    contact: '',
    flags: unique(flags),
    removed: {
      emojiCount: body.emojiCount,
      emojiRatio,
      contactLines: body.contactLines,
      promoLines: body.promoLines,
      boilerplateLines: body.boilerplateLines,
      tailLines: body.tailLines,
      duplicateLines: body.duplicateLines,
    },
    diagnostics: {
      canonicalLength,
      cleanedLength,
      imageCount,
      rawLineCount: body.rawLineCount,
      keptLineCount: body.keptLineCount,
      removedLineRatio,
      repeatedLineRatio: repeatedRatio,
    },
  };
}
