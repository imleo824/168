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
  contact: string;
  rawLineCount: number;
  keptLineCount: number;
};

const CONTACT_PATTERNS = [
  /https?:\/\/(?:t\.me|telegram\.me|wa\.me)\/\+?[A-Za-z0-9_]+/gi,
  /\b(?:t\.me|telegram\.me|wa\.me)\/\+?[A-Za-z0-9_]+/gi,
  /(?:TG|Telegram|飞机|电报|纸飞机|纸飞机号)[:：\s@]*[A-Za-z0-9_]{4,64}/gi,
  /(?:微信|VX|WeChat|微信号)[:：\s]*[A-Za-z0-9_-]{4,64}/gi,
  /(?:WhatsApp|WS|瓦斯)[:：\s]*\+?\d[\d\s-]{7,}\d/gi,
  /(?:电话|手机|联系电话|联系方式|咨询热线|致电)[:：\s]*\+?\d[\d\s-]{7,}\d/gi,
  /(?:联系|咨询|私聊|找|加|应聘|看房|求购|租房|招聘|HR|人事)[:：\s]*@([A-Za-z0-9_]{4,64})/gi,
];

// Spam, Illegal, Scam, Gambling, Porn, and Bot Promotion patterns
const DEFINITIVE_SPAM_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  // Gambling / Casino / Lottery platforms
  { pattern: /(?:百家乐|龙虎斗|扎金花|开奖网|六合彩|时时彩|极速赛车|澳洲幸运5|幸运飞艇|真人视讯|棋牌包网|彩票包网|开户送彩金|首充送|包网搭建|刷水套利|捕鱼游戏源码|彩票源码|菠菜源码|棋牌源码)/i, reason: 'gambling_spam' },
  // Black/Grey Money Laundering / Account fraud / Illicit tools
  { pattern: /(?:USDT跑分|跑分平台|白资承兑|大额跑分|四件套买卖|收银行卡|出银行卡|代开银行卡|代开对公|代实名|洗钱通道|卡农车队|承兑车队|话费慢充洗白|资金盘|杀猪盘|呼死你|定位寻人|黑客查档|手机号查轨迹|微信查档|名下资产查询|针孔偷拍|迷魂药|听话水|迷奸水|假币假钞)/i, reason: 'illicit_financial_or_tools' },
  // Explicit Adult / Escort / Porn / Prostitution spam
  { pattern: /(?:同城约炮|楼凤资源|修车品茶|上门兼职妹|裸聊敲诈|同城交友约炮|极品外围|学生妹兼职|包夜品茶|换脸视频|门事件|偷拍视频|幼女资源)/i, reason: 'adult_spam' },
  // Fake documents / Passports / Visas fraud
  { pattern: /(?:高仿护照|假护照|假绿卡|真实驾照包过|代办假证|假毕业证|国外文凭包过|假工签|免考驾照)/i, reason: 'counterfeit_documents' },
  // Fake Faucets / Pyramid Schemes / Task scams
  { pattern: /(?:TRX空投|TRX兑换|波场空投|波场矿机|刷单返利|兼职打字员|点赞关注赚钱|充值返现平台|挂机赚钱|充值翻倍)/i, reason: 'pyramid_or_scam' },
  // Pure channel ad / directory / promotion shell
  { pattern: /^(?:【?(?:广告位招租|商务合作|广告赞助|独家冠名|互推合作|频道导航|资源整合群|频道矩阵)】?[:：\s]*)+$/i, reason: 'pure_channel_ad' },
];

const TELEGRAM_UI_LINE_PATTERNS = [
  /^(?:forwarded from|转发自|转自|via)\b/i,
  /^(?:view in telegram|open in telegram|please open telegram|instant view|comments?|replies|share|copy link)$/i,
  /^(?:查看原文|打开 Telegram|在 Telegram 中查看|阅读全文|查看评论|发表评论|复制链接|分享)$/i,
  /^\d+\s*(?:comments?|replies|views?|shares?)$/i,
  /^\d+\s*(?:条评论|次浏览|次转发)$/,
];

function isLikelyBotOrChannelHandle(handle: string) {
  const normalized = String(handle || '').replace(/^@/, '').toLowerCase().trim();
  if (!normalized || normalized.length < 3) return true;
  if (normalized.endsWith('bot') || normalized.endsWith('_bot')) return true;
  if (/(?:kefu|admin|service|tougao|tgbot|guanggao|ad_bot|group|channel|joinchat|official|notice)/i.test(normalized)) return true;
  return false;
}

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
    .replace(/[\u200B-\u200F\u202A-\u202E\uFEFF\u00AD]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/[!！?？。,.，、]{3,}/g, '。')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function canonicalContent(raw: unknown) {
  return compact(cleanCrawlContent(raw));
}

const DIRECT_REJECT_KEYWORDS = ['官网', '网址', '.com', '下载', 'TRX', '注册'];

function checkAdKeywords(raw: string): { isAd: boolean; keyword?: string } {
  const text = String(raw || '');
  for (const keyword of DIRECT_REJECT_KEYWORDS) {
    if (text.includes(keyword)) {
      return { isAd: true, keyword };
    }
  }
  return { isAd: false };
}

function checkDefinitiveSpam(raw: string): { isSpam: boolean; reason: string } {
  const text = String(raw || '');
  for (const entry of DEFINITIVE_SPAM_PATTERNS) {
    if (entry.pattern.test(text)) {
      return { isSpam: true, reason: entry.reason };
    }
  }
  return { isSpam: false, reason: '' };
}

function normalizeSemanticSymbols(raw: string) {
  return String(raw || '')
    .replace(/(?:✈\uFE0F?|🛩\uFE0F?|🛫|🛬|🚀)\s*(?=@?[A-Za-z0-9_]{4,64}\b)/g, ' TG ')
    .replace(/(?:☎\uFE0F?|📞|📱|📲)\s*/g, ' 电话: ')
    .replace(/(?:📍|🗺\uFE0F?|🌐)\s*/g, ' 地点: ')
    .replace(/(?:✉\uFE0F?|📩|📨|📧)\s*/g, ' 联系: ')
    .replace(/(?:💰|💵|🪙|💳|💸)\s*/g, ' 待遇: ');
}

function stripEmoji(raw: string) {
  let emojiCount = 0;
  const normalized = normalizeSemanticSymbols(raw);
  let cleaned = normalized.replace(/(?:[#*0-9]\uFE0F?\u20E3|\p{Regional_Indicator}{2}|\p{Extended_Pictographic}(?:\uFE0E|\uFE0F)?(?:\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0E|\uFE0F)?(?:\p{Emoji_Modifier})?)*)/gu, (match) => {
    if (match.length > 0) emojiCount += 1;
    return '';
  });
  cleaned = cleaned
    .replace(/[\u200B-\u200F\u202A-\u202E\uFEFF\u00AD\uFE0E\uFE0F\u20E3\u200D]/g, '')
    .replace(/[\u2580-\u27BF]/g, '')
    .replace(/[★☆◆◇■□▲△▼▽●○]+/g, ' ')
    .trim();
  return { cleaned, emojiCount };
}

function removeInlineContacts(line: string) {
  let next = line;
  for (const pattern of CONTACT_PATTERNS) {
    next = next.replace(pattern, (...match) => {
      const captures = match.slice(1, -2).filter((value: unknown) => typeof value === 'string');
      return String(captures[0] || '');
    });
  }
  return next
    .replace(/(?:联系|私聊|咨询|客服|飞机|电报|纸飞机|TG|Telegram|微信|VX|WeChat|电话|WhatsApp|WS)[:：\s-]*$/i, '')
    .trim();
}

function isTelegramUiLine(line: string) {
  const value = compact(line).replace(/\s+/g, ' ');
  return TELEGRAM_UI_LINE_PATTERNS.some((pattern) => pattern.test(value));
}

function canonicalLineKey(line: string) {
  return compact(line)
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\b(?:t\.me|telegram\.me|wa\.me)\/\S+/gi, '')
    .replace(/(^|[^A-Za-z0-9_.@])@[A-Za-z0-9_]{4,64}(?!\.[A-Za-z])/g, '$1')
    .toLowerCase();
}

function contactValue(raw: unknown) {
  return compact(String(raw || '')).slice(0, 120);
}

function detectContactFromLine(line: string) {
  const value = compact(line);
  if (!value) return '';
  // Ignore channel admin / advertiser / bot contacts
  if (/(?:广告合作|商务合作|投稿爆料|爆料投稿|频道导航|频道矩阵|官方频道|防失联|备用频道|交流群|资源群|频道客服|唯一客服|频道机器人|机器人联系|广告位招租|冠名赞助)/i.test(value)) return '';

  const labeledTelegram = value.match(/(?:TG|Telegram|飞机|电报|纸飞机)[:：\s@]*([A-Za-z0-9_]{4,64})/i);
  if (labeledTelegram?.[1] && !isLikelyBotOrChannelHandle(labeledTelegram[1])) {
    return contactValue(`@${labeledTelegram[1].replace(/^@/, '')}`);
  }

  const telegramUrl = value.match(/(?:https?:\/\/)?(?:t\.me|telegram\.me)\/([A-Za-z0-9_]{4,64})/i);
  if (telegramUrl?.[1] && !isLikelyBotOrChannelHandle(telegramUrl[1])) {
    return contactValue(`@${telegramUrl[1]}`);
  }

  const whatsappUrl = value.match(/(?:https?:\/\/)?wa\.me\/(\+?\d{7,15})/i);
  if (whatsappUrl?.[1]) return contactValue(`WhatsApp:${whatsappUrl[1]}`);

  const whatsappLabeled = value.match(/(?:WhatsApp|WS|瓦斯)[:：\s]*(\+?\d[\d\s-]{7,}\d)/i);
  if (whatsappLabeled?.[1]) return contactValue(`WhatsApp:${whatsappLabeled[1].replace(/\s+/g, '')}`);

  const wechat = value.match(/(?:微信|VX|WeChat|微信号)[:：\s]*([A-Za-z0-9_-]{4,64})/i);
  if (wechat?.[1]) return contactValue(`微信:${wechat[1]}`);

  const phone = value.match(/(?:电话|手机|联系电话|联系方式)[:：\s]*(\+?\d[\d\s-]{7,}\d)/i);
  if (phone?.[1]) return contactValue(phone[1].replace(/\s+/g, ' '));

  const labeledAt = value.match(/(?:联系|咨询|私聊|找|加|应聘|看房|求购|租房|招聘|HR|人事)[:：\s]*@([A-Za-z0-9_]{4,64})/i);
  if (labeledAt?.[1] && !isLikelyBotOrChannelHandle(labeledAt[1])) {
    return contactValue(`@${labeledAt[1]}`);
  }

  return '';
}

function isSeparatorLine(line: string) {
  return /^[\-—_=*·•｜|~#~+]{3,}$/.test(line.trim());
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
  return /^(?:频道赞助商|独家冠名赞助|赞助商|广告赞助|频道广告|广告合作|商务合作|投稿联系|爆料投稿|免费发布|频道导航|频道矩阵|防失联|备用频道|备用群|官方频道|风险提示及免责条款|免责声明|本文来源[:：]|点击查看原文|阅读原文|本群不做任何担保|私下交易风险自负)/i.test(value);
}

function shouldStartTail(line: string, index: number, total: number, keptCount: number) {
  if (!isTailMarker(line) || keptCount === 0) return false;
  const progress = total > 0 ? index / total : 0;
  return progress >= 0.50 || (keptCount >= 2 && textLength(line) <= 80);
}

function isPromoLine(line: string) {
  const value = compact(line);
  if (!value) return true;
  if (/^(?:广告合作|商务合作|投稿|投稿联系|爆料投稿|免费发布|推广|置顶|互推|频道合作|频道导航|频道矩阵|频道客服|官方客服|资源群|交流群|官方群|加入频道|订阅频道|进群交流)[:：\s]/i.test(value)) return true;
  if (/^(?:点击|扫码|长按|复制链接|打开链接|关注|订阅|进群|加群|认准唯一).{0,60}$/i.test(value)) return true;
  return false;
}

function isBoilerplateLine(line: string, hasContentAbove: boolean) {
  const value = compact(line);
  if (!value || isSeparatorLine(value)) return true;
  if (isTelegramUiLine(value)) return true;
  if (/^(?:VIEW IN TELEGRAM|Please open Telegram|查看原文|打开 Telegram).*$/i.test(value)) return true;
  if (hasContentAbove && /^(?:@[A-Za-z0-9_]{4,64}|https?:\/\/\S+|t\.me\/\S+)$/i.test(value)) return true;
  if (/(?:认准唯一|绝无小号|没有任何小号|防假冒|防冒充|谨防冒充|谨防上当|唯一客服|唯一账号|唯一联系方式|广告位出租|招租联系|频道客服|官方客服|频道导航|频道矩阵)/i.test(value)) return true;
  if (hasContentAbove && /^(?:资金交易.*注意甄别|二手物品.*私下交易|切勿私下交易|本群不做担保|本频道不承担|免责声明).*$/i.test(value)) return true;
  return false;
}

function repeatedLineRatio(lines: string[]) {
  const meaningful = lines.map((line) => canonicalLineKey(line)).filter((line) => textLength(line) >= 4);
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
  let contact = '';
  let tailStarted = false;

  for (let index = 0; index < rawLines.length; index += 1) {
    const rawLine = rawLines[index];
    if (!tailStarted && shouldStartTail(rawLine, index, rawLines.length, kept.length)) tailStarted = true;
    if (tailStarted) {
      tailLines += 1;
      continue;
    }
    if (isSeparatorLine(rawLine) || isTelegramUiLine(rawLine)) {
      boilerplateLines += 1;
      continue;
    }
    if (isPromoLine(rawLine)) {
      promoLines += 1;
      continue;
    }
    if (!contact) {
      contact = detectContactFromLine(rawLine);
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

    const dedupeKey = canonicalLineKey(line);
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
    contact,
    rawLineCount: rawLines.length,
    keptLineCount: kept.length,
  };
}

function cleanTitle(rawTitle: string, cleanedContent: string) {
  const titleSource = canonicalContent(rawTitle) || cleanedContent.split('\n').find(Boolean) || '';
  let title = compact(stripEmoji(removeInlineContacts(titleSource)).cleaned)
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/(?:t\.me|telegram\.me)\/\S+/gi, '')
    .replace(/(^|[^A-Za-z0-9_.@])@[A-Za-z0-9_]{4,64}(?!\.[A-Za-z])/g, '$1')
    .replace(/^[【\[(（]?(?:置顶|推荐|精选|广告|爆料|独家|全网首发|紧急|通知|声明|公告|合作|投稿)[】\])）]\s*/gi, '')
    .replace(/^[#＃]\S+\s*/g, '')
    .replace(/[★☆◆◇■□▲△▼▽●○]+/g, ' ')
    .trim();

  if (!title && cleanedContent) {
    const firstLine = cleanedContent.split('\n').find((line) => textLength(line) >= 4);
    if (firstLine) {
      title = firstLine.slice(0, 80);
    }
  }

  return title.slice(0, 80);
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
  const combinedText = `${rawTitle}\n${canonical}`;

  // 1. Definitive spam & illegal content check
  const spamCheck = checkDefinitiveSpam(combinedText);
  if (spamCheck.isSpam) {
    return {
      shouldPublish: false,
      reason: spamCheck.reason,
      score: 0,
      cleanedTitle: cleanTitle(rawTitle, canonical),
      cleanedContent: '',
      contact: '',
      flags: ['definitive_spam_detected', `reason:${spamCheck.reason}`],
      removed: { emojiCount: 0, emojiRatio: 0, contactLines: 0, promoLines: 0, boilerplateLines: 0, tailLines: 0, duplicateLines: 0 },
      diagnostics: { canonicalLength: textLength(canonical), cleanedLength: 0, imageCount, rawLineCount: canonical.split('\n').filter(Boolean).length, keptLineCount: 0, removedLineRatio: 1, repeatedLineRatio: 0 },
    };
  }

  // 1.5. Direct ad keyword check
  const adCheck = checkAdKeywords(combinedText);
  if (adCheck.isAd) {
    return {
      shouldPublish: false,
      reason: 'ad_keyword',
      score: 0,
      cleanedTitle: cleanTitle(rawTitle, canonical),
      cleanedContent: '',
      contact: '',
      flags: ['direct_reject_keyword', `keyword:${adCheck.keyword}`],
      removed: { emojiCount: 0, emojiRatio: 0, contactLines: 0, promoLines: 0, boilerplateLines: 0, tailLines: 0, duplicateLines: 0 },
      diagnostics: { canonicalLength: textLength(canonical), cleanedLength: 0, imageCount, rawLineCount: canonical.split('\n').filter(Boolean).length, keptLineCount: 0, removedLineRatio: 1, repeatedLineRatio: 0 },
    };
  }

  // 2. Telegram service action check
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

  // 3. Clean body and extract meaningful text
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
  if (removedLineRatio >= 0.75 && cleanedLength < 30) { flags.push('template_dominant'); score -= 35; }
  if (repeatedRatio >= 0.5) { flags.push('repetition_heavy'); score -= 20; }
  if (emojiRatio > 0.50 && cleanedLength < 60) { flags.push('emoji_dominant'); score -= 55; }
  else if (emojiRatio > 0.35 && cleanedLength < 100) { flags.push('emoji_heavy'); score -= 15; }
  if (cleanedLength < 10 && imageCount === 0) { flags.push('too_short_without_media'); score -= 55; }
  else if (cleanedLength < 20 && imageCount === 0) score -= 15;
  if (imageCount > 0 && (cleanedLength >= 2 || cleanedTitle)) score += 10;
  if (cleanedLength >= 50) score += 10;
  score = Math.max(0, Math.min(100, score));

  // 4. Final publish decision: ensure valid content passes, invalid is discarded
  let shouldPublish = true;
  let reason = 'pass';
  if (cleanedLength < 6 && imageCount === 0) {
    shouldPublish = false;
    reason = 'empty_after_clean';
  } else if (cleanedLength < 10 && imageCount === 0) {
    shouldPublish = false;
    reason = 'too_short_without_media';
  } else if (flags.includes('emoji_dominant')) {
    shouldPublish = false;
    reason = 'emoji_dominant';
  } else if (flags.includes('template_dominant') && cleanedLength < 20 && imageCount === 0) {
    shouldPublish = false;
    reason = 'template_shell';
  } else if (score < 40) {
    shouldPublish = false;
    reason = 'low_quality';
  }

  return {
    shouldPublish,
    reason,
    score,
    cleanedTitle: cleanedTitle || rawTitle,
    cleanedContent: effectiveContent,
    contact: body.contact,
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

