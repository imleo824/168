import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';
import { PrismaClient } from '@prisma/client';

export const MIN_ACTIVE_PER_TOPIC = 1000;
export const AUTO_POST_TOPICS = ['QUOTE', 'FACT', 'RIDDLE', 'JOKE'];

const DEFAULT_TAKE_PER_TOPIC = 1000;
const CACHE_DIR = path.join(process.cwd(), 'tmp', 'auto-post-seed-cache');
const REQUEST_DELAY_MS = 180;
const WIKIQUOTE_BATCH_SIZE = 40;

const SOURCES = {
  wikiquote: {
    name: 'Wikiquote',
    license: 'CC-BY-SA-4.0',
    home: 'https://zh.wikiquote.org/',
  },
  wikidata: {
    name: 'Wikidata',
    license: 'CC0-1.0',
    home: 'https://www.wikidata.org/wiki/Wikidata:Licensing',
  },
  ccRiddle: {
    name: 'CC-Riddle',
    license: 'CC-BY-NC-SA-4.0',
    url: 'https://raw.githubusercontent.com/pku0xff/CC-Riddle/main/CC-Riddle.jsonl',
    home: 'https://github.com/pku0xff/CC-Riddle',
  },
  chineseHumor: {
    name: 'Chinese_Humor_MultiLabeled',
    license: 'MIT',
    url: 'https://raw.githubusercontent.com/SamTseng/Chinese_Humor_MultiLabeled/master/mlabel_corpora/JokeHumorLevel.txt',
    home: 'https://github.com/SamTseng/Chinese_Humor_MultiLabeled',
  },
  charm: {
    name: 'CHARM',
    license: 'Apache-2.0',
    home: 'https://github.com/opendatalab/CHARM',
  },
};

const TOPIC_ALIASES = new Map([
  ['quote', 'QUOTE'],
  ['quotes', 'QUOTE'],
  ['famous_quote', 'QUOTE'],
  ['famous_quotes', 'QUOTE'],
  ['名人名言', 'QUOTE'],
  ['fact', 'FACT'],
  ['facts', 'FACT'],
  ['cold_fact', 'FACT'],
  ['cold_facts', 'FACT'],
  ['冷知识', 'FACT'],
  ['riddle', 'RIDDLE'],
  ['riddles', 'RIDDLE'],
  ['brain_teaser', 'RIDDLE'],
  ['brain_teasers', 'RIDDLE'],
  ['脑筋急转弯', 'RIDDLE'],
  ['joke', 'JOKE'],
  ['jokes', 'JOKE'],
  ['cold_joke', 'JOKE'],
  ['cold_jokes', 'JOKE'],
  ['冷笑话', 'JOKE'],
]);

const BLOCK_PATTERNS = [
  /https?:\/\/|www\./i,
  /微信|wechat|telegram|tg|纸飞机|whatsapp|line|站外联系|私聊|私信|加我|联系方式/i,
  /付款|支付|转账|收款|充值|usdt|银行卡|担保|定金|汇款/i,
  /赌博|博彩|下注|盘口|洗钱|跑分|私彩|刷流水/i,
  /色情|涉黄|裸聊|约炮|招嫖|劫色/i,
  /假护照|假签证|假证|伪造|偷渡|绕关|买通|贿赂|包过|走后门/i,
  /辱骂|傻逼|操你|去死/i,
  /广告|引流|推广合作|商务合作/i,
];

const WIKIQUOTE_FALLBACK_PAGES = [
  '孔子', '孟子', '老子', '莊子', '墨子', '荀子', '韩非', '孙子', '司马迁', '诸葛亮',
  '李白', '杜甫', '白居易', '苏轼', '王安石', '朱熹', '王阳明', '曹雪芹', '鲁迅', '胡适',
  '柏拉圖', '亞里士多德', '蘇格拉底', '伊壁鳩魯', '西塞罗', '奥古斯丁', '培根', '笛卡尔', '斯宾诺莎', '洛克',
  '卢梭', '康德', '黑格尔', '叔本華', '尼采', '马克思', '恩格斯', '罗素', '维特根斯坦', '萨特',
  '莎士比亞', '歌德', '雨果', '巴尔扎克', '托尔斯泰', '陀思妥耶夫斯基', '契诃夫', '马克·吐温', '海明威', '泰戈尔',
  '林肯', '华盛顿', '富兰克林', '拿破仑', '丘吉尔', '甘地', '曼德拉', '马丁·路德·金', '愛因斯坦', '牛顿',
  '达尔文', '伽利略', '居里夫人', '爱迪生', '乔布斯',
];

function parseArgs(argv) {
  const args = {
    input: process.env.AUTO_POST_SEED_INPUT || '',
    output: process.env.AUTO_POST_SEED_OUTPUT || '',
    remote: false,
    dryRun: false,
    refreshCache: false,
    batchSize: 500,
    minPerTopic: MIN_ACTIVE_PER_TOPIC,
    takePerTopic: DEFAULT_TAKE_PER_TOPIC,
    cacheDir: process.env.AUTO_POST_SEED_CACHE_DIR || CACHE_DIR,
  };
  for (const arg of argv) {
    if (arg === '--remote') args.remote = true;
    else if (arg === '--no-remote') args.remote = false;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--refresh-cache') args.refreshCache = true;
    else if (arg.startsWith('--input=')) args.input = arg.slice('--input='.length);
    else if (arg.startsWith('--output=')) args.output = arg.slice('--output='.length);
    else if (arg.startsWith('--cache-dir=')) args.cacheDir = path.resolve(process.cwd(), arg.slice('--cache-dir='.length));
    else if (arg.startsWith('--batch-size=')) args.batchSize = Math.max(1, Number(arg.slice('--batch-size='.length)) || args.batchSize);
    else if (arg.startsWith('--min-per-topic=')) args.minPerTopic = Math.max(1, Number(arg.slice('--min-per-topic='.length)) || args.minPerTopic);
    else if (arg.startsWith('--take-per-topic=')) args.takePerTopic = Math.max(1, Number(arg.slice('--take-per-topic='.length)) || args.takePerTopic);
  }
  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureCacheDir(cacheDir) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

function cachePath(cacheDir, key) {
  return path.join(cacheDir, `${key.replace(/[^a-z0-9_.-]/gi, '_')}.cache`);
}

function normalizeTopic(value) {
  const raw = String(value || '').trim();
  const upper = raw.toUpperCase();
  if (AUTO_POST_TOPICS.includes(upper)) return upper;
  return TOPIC_ALIASES.get(raw) || TOPIC_ALIASES.get(raw.toLowerCase()) || '';
}

function cleanText(value, maxLength) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
    .slice(0, maxLength);
}

function cleanString(value, maxLength) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function normalizeForHash(raw) {
  return String(raw || '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .replace(/[“”"‘’'`，,。.!！?？、；;：:（）()[\]{}《》<>]/g, '')
    .toLowerCase()
    .trim();
}

function contentHash(content, answer = '') {
  return crypto.createHash('sha256').update(`${normalizeForHash(content)}|${normalizeForHash(answer)}`).digest('hex');
}

function validUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function countChars(value) {
  return Array.from(String(value || '')).length;
}

function isSafe(content, answer = '') {
  const text = `${content}\n${answer}`.trim();
  return text && !BLOCK_PATTERNS.some((pattern) => pattern.test(text));
}

function normalizeItem(raw) {
  const topic = normalizeTopic(raw.topic);
  const title = cleanString(raw.title, 120);
  const content = cleanText(raw.content, 1500);
  const answer = cleanText(raw.answer, 500);
  const author = cleanString(raw.author, 120);
  const sourceName = cleanString(raw.sourceName, 160);
  const sourceUrl = cleanString(raw.sourceUrl, 800);
  const license = cleanString(raw.license, 80);
  const qualityScore = Math.max(0, Math.min(100, Math.round(Number(raw.qualityScore) || 80)));

  if (!topic) return null;
  if (!content || countChars(content) < 4) return null;
  if (topic === 'RIDDLE' && !answer) return null;
  if (!sourceName || !sourceUrl || !license || !validUrl(sourceUrl)) return null;
  if (!isSafe(content, answer)) return null;

  return {
    topic,
    title: title || null,
    content,
    answer: answer || null,
    author: author || null,
    sourceName,
    sourceUrl,
    license,
    contentHash: contentHash(content, answer),
    isActive: raw.isActive !== false,
    qualityScore,
  };
}

function loadLocalItems(inputPath) {
  if (!inputPath) return [];
  const absolutePath = path.resolve(process.cwd(), inputPath);
  const source = fs.readFileSync(absolutePath, 'utf8');
  if (absolutePath.endsWith('.jsonl')) {
    return source
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }
  const parsed = JSON.parse(source);
  return Array.isArray(parsed) ? parsed : Array.isArray(parsed.items) ? parsed.items : [];
}

function writeSeedOutput(outputPath, items) {
  if (!outputPath) return;
  const absolutePath = path.resolve(process.cwd(), outputPath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  const lines = items.map((item) => JSON.stringify({
    topic: item.topic,
    title: item.title,
    content: item.content,
    answer: item.answer,
    author: item.author,
    sourceName: item.sourceName,
    sourceUrl: item.sourceUrl,
    license: item.license,
    contentHash: item.contentHash,
    isActive: item.isActive,
    qualityScore: item.qualityScore,
  }));
  fs.writeFileSync(absolutePath, `${lines.join('\n')}\n`);
  console.log(`[seed:auto-post] wrote output: ${absolutePath}`);
}

async function fetchText(url, options = {}) {
  const {
    cacheDir = CACHE_DIR,
    cacheKey = crypto.createHash('sha1').update(url).digest('hex'),
    refreshCache = false,
    retries = 4,
    retryDelayMs = 1200,
    headers = {},
  } = options;
  ensureCacheDir(cacheDir);
  const file = cachePath(cacheDir, cacheKey);
  if (!refreshCache && fs.existsSync(file)) return fs.readFileSync(file, 'utf8');

  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': '168-auto-post-seed/2.0 (curated content import)',
          ...headers,
        },
      });
      if (!res.ok) throw new Error(`fetch failed ${res.status}: ${url}`);
      const text = await res.text();
      fs.writeFileSync(file, text);
      return text;
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(retryDelayMs * (attempt + 1));
    }
  }
  if (fs.existsSync(file)) {
    console.warn(`[seed:auto-post] using stale cache for ${cacheKey}:`, lastError?.message || lastError);
    return fs.readFileSync(file, 'utf8');
  }
  throw lastError;
}

async function fetchJson(url, options = {}) {
  return JSON.parse(await fetchText(url, options));
}

function stripWikiMarkup(value) {
  return String(value || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<ref[\s\S]*?<\/ref>/gi, '')
    .replace(/<ref[^/>]*\/>/gi, '')
    .replace(/\{\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}\}/g, '')
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/g, '$1')
    .replace(/\[(https?:\/\/[^\s\]]+)\s+([^\]]+)\]/g, '$2')
    .replace(/'{2,}/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseWikiquoteLines(wikitext, pageTitle, sourceUrl) {
  const lines = String(wikitext || '').split('\n');
  const items = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('*') && !trimmed.startsWith('#')) continue;
    if (/^\*+\s*(來源|出处|參考|参见|外部|Category|File|Image|==)/i.test(trimmed)) continue;
    const text = stripWikiMarkup(trimmed.replace(/^[*:：\s#]+/, ''));
    if (countChars(text) < 10 || countChars(text) > 120) continue;
    if (!/[。！？；，,.!?]/.test(text)) continue;
    if (/^(ISBN|Category|File|Image|http)/i.test(text)) continue;
    items.push({
      topic: 'QUOTE',
      title: text.slice(0, 18),
      content: text,
      author: pageTitle,
      sourceName: SOURCES.wikiquote.name,
      sourceUrl,
      license: SOURCES.wikiquote.license,
      qualityScore: 82,
    });
  }
  return items;
}

async function fetchWikiquoteHumanPages(args) {
  const query = `
SELECT ?item ?itemLabel ?article WHERE {
  ?article schema:about ?item ;
           schema:isPartOf <https://zh.wikiquote.org/> .
  ?item wdt:P31 wd:Q5 .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "zh,en". }
}
LIMIT 500
  `;
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`;
  const data = await fetchJson(url, {
    cacheDir: args.cacheDir,
    refreshCache: args.refreshCache,
    cacheKey: 'wikidata_zh_wikiquote_human_pages.json',
    headers: { Accept: 'application/sparql-results+json' },
  });
  const rows = data?.results?.bindings || [];
  const pages = rows.map((row) => {
    const article = row.article?.value || '';
    const title = decodeURIComponent(article.split('/wiki/')[1] || '').replace(/_/g, ' ');
    return {
      title,
      label: row.itemLabel?.value || title,
      sourceUrl: article || `https://zh.wikiquote.org/wiki/${encodeURIComponent(title)}`,
    };
  }).filter((row) => row.title);
  if (pages.length > 0) return pages;
  return WIKIQUOTE_FALLBACK_PAGES.map((title) => ({
    title,
    label: title,
    sourceUrl: `https://zh.wikiquote.org/wiki/${encodeURIComponent(title)}`,
  }));
}

async function fetchWikiquoteBatch(pages, args, batchIndex) {
  const titles = pages.map((page) => page.title).join('|');
  const url = `https://zh.wikiquote.org/w/api.php?action=query&prop=revisions&rvslots=main&rvprop=content&format=json&formatversion=2&titles=${encodeURIComponent(titles)}&origin=*`;
  return fetchJson(url, {
    cacheDir: args.cacheDir,
    refreshCache: args.refreshCache,
    cacheKey: `wikiquote_pages_${batchIndex}.json`,
  });
}

async function fetchWikiquoteQuotes(args) {
  const pages = await fetchWikiquoteHumanPages(args).catch((error) => {
    console.warn('[seed:auto-post] Wikiquote page discovery failed:', error.message || error);
    return WIKIQUOTE_FALLBACK_PAGES.map((title) => ({
      title,
      label: title,
      sourceUrl: `https://zh.wikiquote.org/wiki/${encodeURIComponent(title)}`,
    }));
  });
  const pageUrlByTitle = new Map(pages.map((page) => [page.title, page.sourceUrl]));
  const items = [];
  for (let i = 0; i < pages.length; i += WIKIQUOTE_BATCH_SIZE) {
    const batch = pages.slice(i, i + WIKIQUOTE_BATCH_SIZE);
    try {
      const data = await fetchWikiquoteBatch(batch, args, Math.floor(i / WIKIQUOTE_BATCH_SIZE));
      const resultPages = data?.query?.pages || [];
      for (const page of resultPages) {
        const title = page.title || '';
        const sourceUrl = pageUrlByTitle.get(title) || `https://zh.wikiquote.org/wiki/${encodeURIComponent(title)}`;
        const wikitext = page.revisions?.[0]?.slots?.main?.content || page.revisions?.[0]?.content || '';
        items.push(...parseWikiquoteLines(wikitext, title, sourceUrl));
      }
    } catch (error) {
      console.warn(`[seed:auto-post] Wikiquote batch skipped ${i}-${i + batch.length}:`, error.message || error);
    }
    await sleep(REQUEST_DELAY_MS);
    if (items.length >= args.takePerTopic * 1.3) break;
  }
  return items;
}

function yearFromWikidataDate(value) {
  const match = String(value || '').match(/^(-?\d{1,6})-/);
  if (!match) return '';
  const year = Number(match[1]);
  return Number.isFinite(year) ? String(year) : '';
}

function wikidataQid(url) {
  const match = String(url || '').match(/Q\d+$/);
  return match ? match[0] : '';
}

async function fetchWikidataRows(query, cacheKey, args) {
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`;
  const data = await fetchJson(url, {
    cacheDir: args.cacheDir,
    refreshCache: args.refreshCache,
    cacheKey,
    headers: { Accept: 'application/sparql-results+json' },
  });
  return data?.results?.bindings || [];
}

async function fetchWikidataFacts(args) {
  const items = [];

  const humanRows = await fetchWikidataRows(`
SELECT DISTINCT ?item ?itemLabel ?birth ?countryLabel WHERE {
  ?item wdt:P31 wd:Q5 ;
        wdt:P569 ?birth .
  OPTIONAL { ?item wdt:P27 ?country. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "zh,en". }
}
LIMIT 1800
  `, 'wikidata_facts_humans.json', args).catch((error) => {
    console.warn('[seed:auto-post] Wikidata human facts failed:', error.message || error);
    return [];
  });

  for (const row of humanRows) {
    const name = cleanString(row.itemLabel?.value, 80);
    const year = yearFromWikidataDate(row.birth?.value);
    const country = cleanString(row.countryLabel?.value, 80);
    const qid = wikidataQid(row.item?.value);
    if (!name || !year || !qid || /^Q\d+$/.test(name)) continue;
    items.push({
      topic: 'FACT',
      title: `${name}出生年份`,
      content: country
        ? `${name}出生于${year}年，Wikidata 记录其国籍或所属地区为${country}。`
        : `${name}出生于${year}年，这一出生年份记录在 Wikidata。`,
      sourceName: SOURCES.wikidata.name,
      sourceUrl: `https://www.wikidata.org/wiki/${qid}`,
      license: SOURCES.wikidata.license,
      qualityScore: 76,
    });
  }

  const countryRows = await fetchWikidataRows(`
SELECT DISTINCT ?item ?itemLabel ?capitalLabel WHERE {
  ?item wdt:P31 wd:Q6256 ;
        wdt:P36 ?capital .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "zh,en". }
}
LIMIT 400
  `, 'wikidata_facts_countries.json', args).catch(() => []);
  for (const row of countryRows) {
    const country = cleanString(row.itemLabel?.value, 80);
    const capital = cleanString(row.capitalLabel?.value, 80);
    const qid = wikidataQid(row.item?.value);
    if (!country || !capital || !qid) continue;
    items.push({
      topic: 'FACT',
      title: `${country}首都`,
      content: `Wikidata 记录中，${country}的首都是${capital}。`,
      sourceName: SOURCES.wikidata.name,
      sourceUrl: `https://www.wikidata.org/wiki/${qid}`,
      license: SOURCES.wikidata.license,
      qualityScore: 78,
    });
  }

  const elementRows = await fetchWikidataRows(`
SELECT DISTINCT ?item ?itemLabel ?atomicNumber WHERE {
  ?item wdt:P31 wd:Q11344 ;
        wdt:P1086 ?atomicNumber .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "zh,en". }
}
LIMIT 160
  `, 'wikidata_facts_elements.json', args).catch(() => []);
  for (const row of elementRows) {
    const name = cleanString(row.itemLabel?.value, 80);
    const atomicNumber = cleanString(row.atomicNumber?.value, 20);
    const qid = wikidataQid(row.item?.value);
    if (!name || !atomicNumber || !qid) continue;
    items.push({
      topic: 'FACT',
      title: `${name}原子序数`,
      content: `化学元素${name}的原子序数是${atomicNumber}，该结构化事实来自 Wikidata。`,
      sourceName: SOURCES.wikidata.name,
      sourceUrl: `https://www.wikidata.org/wiki/${qid}`,
      license: SOURCES.wikidata.license,
      qualityScore: 80,
    });
  }

  return items;
}

async function fetchCharmFacts(args) {
  const paths = [
    'data/CHARM/memorization/Chinese_Anachronisms_Judgment.json',
    'data/CHARM/memorization/Chinese_Movie_and_Music_Recommendation.json',
    'data/CHARM/memorization/Chinese_Sport_Understanding.json',
    'data/CHARM/memorization/Chinese_Time_Understanding.json',
    'data/CHARM/reasoning/Chinese_Anachronisms_Judgment.json',
    'data/CHARM/reasoning/Chinese_Movie_and_Music_Recommendation.json',
    'data/CHARM/reasoning/Chinese_Natural_Language_Inference.json',
    'data/CHARM/reasoning/Chinese_Reading_Comprehension.json',
    'data/CHARM/reasoning/Chinese_Sequence_Understanding.json',
    'data/CHARM/reasoning/Chinese_Sport_Understanding.json',
    'data/CHARM/reasoning/Chinese_Time_Understanding.json',
    'data/CHARM/reasoning/Global_Anachronisms_Judgment.json',
    'data/CHARM/reasoning/Global_Movie_and_Music_Recommendation.json',
    'data/CHARM/reasoning/Global_Natural_Language_Inference.json',
    'data/CHARM/reasoning/Global_Reading_Comprehension.json',
    'data/CHARM/reasoning/Global_Sequence_Understanding.json',
    'data/CHARM/reasoning/Global_Sport_Understanding.json',
    'data/CHARM/reasoning/Global_Time_Understanding.json',
  ];
  const items = [];
  for (const filePath of paths) {
    const url = `https://raw.githubusercontent.com/opendatalab/CHARM/main/${filePath}`;
    try {
      const data = await fetchJson(url, {
        cacheDir: args.cacheDir,
        refreshCache: args.refreshCache,
        cacheKey: `charm_${filePath.replace(/\//g, '_')}`,
      });
      const examples = Array.isArray(data?.examples) ? data.examples : [];
      for (const row of examples) {
        const input = cleanString(row.input, 240);
        const target = cleanString(row.target, 220);
        if (!input || !target || countChars(input) < 6 || countChars(target) < 1) continue;
        if (/^[A-E]$/.test(target)) continue;
        const content = `${input}\n答案：${target}`;
        if (countChars(content) > 360) continue;
        items.push({
          topic: 'FACT',
          title: input.replace(/[？?].*$/, '').slice(0, 18) || '冷知识问答',
          content,
          answer: target,
          sourceName: SOURCES.charm.name,
          sourceUrl: `${SOURCES.charm.home}/blob/main/${filePath}`,
          license: SOURCES.charm.license,
          qualityScore: filePath.includes('/memorization/') ? 82 : 72,
        });
      }
    } catch (error) {
      console.warn(`[seed:auto-post] CHARM file skipped ${filePath}:`, error.message || error);
    }
  }
  return items;
}

async function fetchCcRiddles(args) {
  const source = await fetchText(SOURCES.ccRiddle.url, {
    cacheDir: args.cacheDir,
    refreshCache: args.refreshCache,
    cacheKey: 'cc_riddle.jsonl',
  });
  const items = [];
  for (const line of source.split(/\n+/)) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    const question = cleanString(row.question, 120);
    const answer = cleanString(row.answer, 80);
    if (!question || !answer || row.source !== 'human') continue;
    if (countChars(question) < 4 || countChars(question) > 80) continue;
    items.push({
      topic: 'RIDDLE',
      title: `猜字：${question}`.slice(0, 18),
      content: question,
      answer,
      sourceName: SOURCES.ccRiddle.name,
      sourceUrl: `${SOURCES.ccRiddle.home}/blob/main/CC-Riddle.jsonl`,
      license: SOURCES.ccRiddle.license,
      qualityScore: 74,
    });
  }
  return items;
}

function parseTsvLine(line) {
  const columns = [];
  let current = '';
  for (const char of line) {
    if (char === '\t') {
      columns.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  columns.push(current);
  return columns;
}

async function fetchChineseHumorJokes(args) {
  const source = await fetchText(SOURCES.chineseHumor.url, {
    cacheDir: args.cacheDir,
    refreshCache: args.refreshCache,
    cacheKey: 'chinese_humor_jokes.tsv',
  });
  const lines = source.split(/\n+/).filter(Boolean);
  const items = [];
  for (const line of lines.slice(1)) {
    const [id, title, content, humorLevel] = parseTsvLine(line);
    const cleanedTitle = cleanString(title, 80);
    const cleanedContent = cleanText(content, 600).replace(/\s{2,}/g, '\n');
    const score = Math.max(70, Math.min(95, 70 + (Number(humorLevel) || 3) * 5));
    if (!id || !cleanedTitle || countChars(cleanedContent) < 12) continue;
    items.push({
      topic: 'JOKE',
      title: cleanedTitle,
      content: cleanedContent,
      sourceName: SOURCES.chineseHumor.name,
      sourceUrl: `${SOURCES.chineseHumor.home}/blob/master/mlabel_corpora/JokeHumorLevel.txt`,
      license: SOURCES.chineseHumor.license,
      qualityScore: score,
    });
  }
  return items;
}

async function collectRemoteItems(args) {
  const collectors = [
    ['QUOTE', () => fetchWikiquoteQuotes(args)],
    ['FACT', async () => [...await fetchWikidataFacts(args), ...await fetchCharmFacts(args)]],
    ['RIDDLE', () => fetchCcRiddles(args)],
    ['JOKE', () => fetchChineseHumorJokes(args)],
  ];
  const all = [];
  for (const [topic, collect] of collectors) {
    try {
      const items = await collect();
      console.log(`[seed:auto-post] collected ${topic}: ${items.length}`);
      all.push(...items);
    } catch (error) {
      console.warn(`[seed:auto-post] ${topic} collection failed:`, error.message || error);
    }
  }
  return all;
}

function normalizeAndDedupe(rawItems) {
  const seen = new Set();
  const result = [];
  for (const raw of rawItems) {
    const item = normalizeItem(raw);
    if (!item || seen.has(item.contentHash)) continue;
    seen.add(item.contentHash);
    result.push(item);
  }
  return result;
}

function countByTopic(items) {
  const counts = Object.fromEntries(AUTO_POST_TOPICS.map((topic) => [topic, 0]));
  for (const item of items) {
    if (item.isActive && counts[item.topic] !== undefined) counts[item.topic] += 1;
  }
  return counts;
}

function pickPerTopic(items, takePerTopic) {
  const result = [];
  const seen = new Set();
  for (const topic of AUTO_POST_TOPICS) {
    const topicItems = items
      .filter((item) => item.topic === topic && item.isActive)
      .sort((a, b) => b.qualityScore - a.qualityScore);
    for (const item of topicItems) {
      if (seen.has(item.contentHash)) continue;
      seen.add(item.contentHash);
      result.push(item);
      if (result.filter((picked) => picked.topic === topic).length >= takePerTopic) break;
    }
  }
  return result;
}

async function ensureTables(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AutoPostContent" (
      "id" TEXT NOT NULL,
      "topic" TEXT NOT NULL,
      "title" TEXT,
      "content" TEXT NOT NULL,
      "answer" TEXT,
      "author" TEXT,
      "sourceName" TEXT NOT NULL,
      "sourceUrl" TEXT NOT NULL,
      "license" TEXT NOT NULL,
      "contentHash" TEXT NOT NULL,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "usedAt" TIMESTAMP(3),
      "postId" TEXT,
      "qualityScore" INTEGER NOT NULL DEFAULT 80,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AutoPostContent_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "AutoPostContent_topic_check" CHECK ("topic" IN ('QUOTE', 'FACT', 'RIDDLE', 'JOKE'))
    )
  `);
  await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "AutoPostContent_contentHash_key" ON "AutoPostContent" ("contentHash")');
}

async function insertBatches(prisma, items, batchSize) {
  let created = 0;
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    let batchCreated = 0;
    for (const item of batch) {
      const id = crypto.randomUUID();
      batchCreated += await prisma.$executeRaw`
        INSERT INTO "AutoPostContent" (
          "id",
          "topic",
          "title",
          "content",
          "answer",
          "author",
          "sourceName",
          "sourceUrl",
          "license",
          "contentHash",
          "isActive",
          "qualityScore",
          "createdAt",
          "updatedAt"
        )
        VALUES (
          ${id},
          ${item.topic},
          ${item.title},
          ${item.content},
          ${item.answer},
          ${item.author},
          ${item.sourceName},
          ${item.sourceUrl},
          ${item.license},
          ${item.contentHash},
          ${item.isActive},
          ${item.qualityScore},
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
        ON CONFLICT ("contentHash") DO NOTHING
      `;
    }
    created += batchCreated;
    console.log(`insert batch #${Math.floor(i / batchSize) + 1}: +${batchCreated}`);
  }
  return created;
}

async function verifyDatabaseCounts(prisma, minPerTopic) {
  const rows = await prisma.$queryRaw`
    SELECT "topic", COUNT(*)::int AS "count"
    FROM "AutoPostContent"
    WHERE "isActive" = true
    GROUP BY "topic"
  `;
  const counts = Object.fromEntries(AUTO_POST_TOPICS.map((topic) => [topic, 0]));
  rows.forEach((row) => {
    if (counts[row.topic] !== undefined) counts[row.topic] = Number(row.count || 0);
  });
  const missing = AUTO_POST_TOPICS.filter((topic) => counts[topic] < minPerTopic);
  if (missing.length > 0) {
    throw new Error(`内容库不足：${missing.map((topic) => `${topic}=${counts[topic]}/${minPerTopic}`).join(', ')}`);
  }
  return counts;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rawItems = [
    ...loadLocalItems(args.input),
    ...(args.remote ? await collectRemoteItems(args) : []),
  ];
  const candidates = normalizeAndDedupe(rawItems);
  const candidateCounts = countByTopic(candidates);
  console.log('[seed:auto-post] candidates:', candidateCounts);

  const candidateMissing = AUTO_POST_TOPICS.filter((topic) => candidateCounts[topic] < args.minPerTopic);
  if (candidateMissing.length > 0) {
    throw new Error(`候选内容不足，不会用 AI 或假内容补数：${candidateMissing.map((topic) => `${topic}=${candidateCounts[topic]}/${args.minPerTopic}`).join(', ')}`);
  }

  const items = pickPerTopic(candidates, args.takePerTopic);
  const selectedCounts = countByTopic(items);
  console.log('[seed:auto-post] selected:', selectedCounts);
  writeSeedOutput(args.output, items);

  if (args.dryRun) {
    console.log('[seed:auto-post] DRY RUN passed.');
    return;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error('缺少 DATABASE_URL，无法写入数据库。');
  }

  const prisma = new PrismaClient();
  try {
    await ensureTables(prisma);
    const created = await insertBatches(prisma, items, args.batchSize);
    const counts = await verifyDatabaseCounts(prisma, args.minPerTopic);
    console.log('[seed:auto-post] done:', { created, counts });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[seed:auto-post] failed:', error.message || error);
  process.exit(1);
});
