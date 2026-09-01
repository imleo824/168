import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const DEFAULT_COUNT = 1000;
const DEFAULT_BATCH_SIZE = 200;
const DEFAULT_SEED = 168;
const ROBOT_UPDATE_CONCURRENCY = 25;
const ROBOT_UPDATE_RETRY_DELAYS_MS = [1000, 3000, 7000];

function normalizeArgs(argv) {
  const result = {
    count: DEFAULT_COUNT,
    batchSize: DEFAULT_BATCH_SIZE,
    dryRun: false,
    seed: DEFAULT_SEED,
    updateExisting: false,
    updateBioOnly: false,
    verifyBios: false,
    databaseUrl: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === '--dry-run') {
      result.dryRun = true;
      continue;
    }

    if (token === '--update-existing') {
      result.updateExisting = true;
      continue;
    }

    if (token === '--update-bio-only') {
      result.updateBioOnly = true;
      continue;
    }

    if (token === '--verify-bios') {
      result.verifyBios = true;
      continue;
    }

    if (token === '--help' || token === '-h') {
      result.help = true;
      continue;
    }

    if (token.startsWith('--database-url=')) {
      result.databaseUrl = token.slice(15);
      continue;
    }

    if (token === '--database-url') {
      result.databaseUrl = argv[i + 1];
      i += 1;
      continue;
    }

    if (token.startsWith('--count=')) {
      result.count = Number.parseInt(token.slice(8), 10);
      continue;
    }

    if (token === '--count') {
      result.count = Number.parseInt(argv[i + 1], 10);
      i += 1;
      continue;
    }

    if (token.startsWith('--batch-size=')) {
      result.batchSize = Number.parseInt(token.slice(13), 10);
      continue;
    }

    if (token === '--batch-size') {
      result.batchSize = Number.parseInt(argv[i + 1], 10);
      i += 1;
      continue;
    }

    if (token.startsWith('--seed=')) {
      result.seed = Number.parseInt(token.slice(7), 10);
      continue;
    }

    if (token === '--seed') {
      result.seed = Number.parseInt(argv[i + 1], 10);
      i += 1;
      continue;
    }
  }

  if (!Number.isFinite(result.count) || result.count <= 0) {
    throw new Error('count 必须是大于 0 的整数');
  }

  if (!Number.isFinite(result.batchSize) || result.batchSize <= 0) {
    throw new Error('batch-size 必须是大于 0 的整数');
  }

  return result;
}

function showHelp() {
  const message = `Usage:
  node scripts/seed-robot-accounts.mjs [--count=1000] [--batch-size=200] [--seed=168] [--update-existing|--update-bio-only|--verify-bios] [--dry-run]

Options:
  --count       要生成的机器人数量（默认 1000）
  --batch-size  每批入库数量（默认 200）
  --seed        伪随机种子（默认 168）
  --update-existing  重新生成并更新所有 userType=ROBOT 的昵称、bio 和头像（忽略 count）
  --update-bio-only  只刷新所有 userType=ROBOT 的 bio，保留昵称和头像（忽略 count）
  --verify-bios  只检查所有 userType=ROBOT 是否都有合格 bio，不写入数据库
  --database-url  覆盖 DATABASE_URL（默认从环境变量读取）
  --dry-run     不实际写入数据库，仅预览统计
`;
  console.log(message.trim());
}

function makeRng(seed) {
  let state = (seed >>> 0) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

function pick(items, rng) {
  const index = Math.floor(rng() * items.length);
  return items[index % items.length];
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(label, operation) {
  let lastError;
  for (let attempt = 0; attempt <= ROBOT_UPDATE_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const delayMs = ROBOT_UPDATE_RETRY_DELAYS_MS[attempt];
      if (!delayMs) break;
      console.warn(`${label} failed, retrying in ${delayMs}ms: ${error?.message || error}`);
      await wait(delayMs);
    }
  }
  throw lastError;
}

function chunks(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function getDisplayNameTypeFlags(name) {
  return {
    hasChinese: /[\u4e00-\u9fff]/.test(name),
    hasLatin: /[A-Za-z]/.test(name),
    hasDigit: /\d/.test(name),
  };
}

function displayNameTypeCount(name) {
  const typeFlags = getDisplayNameTypeFlags(name);
  return (typeFlags.hasChinese ? 1 : 0) + (typeFlags.hasLatin ? 1 : 0) + (typeFlags.hasDigit ? 1 : 0);
}

function normalizeDisplayNameTypes(name, rng) {
  if (displayNameTypeCount(name) <= 2) {
    return name;
  }

  const noDigits = name.replace(/[0-9]+/g, '');
  if (displayNameTypeCount(noDigits) <= 2) {
    return noDigits;
  }

  const noLatin = name.replace(/[A-Za-z]+/g, '');
  if (displayNameTypeCount(noLatin) <= 2) {
    return noLatin;
  }

  return `${name.replace(/[^A-Za-z0-9\u4e00-\u9fff]/g, '')}-${pick(numberSuffixes, rng)}`.replace(/-+$/g, '');
}

const namePools = {
  zhShort: [
    '阿米洛',
    '小白',
    '月光',
    '雾猫',
    '星影',
    '霜火',
    '桃夭',
    '冰糖',
    '小旋',
    '北斗',
    '咕咕',
    '闪电',
    '夜行',
    '豆豆',
    '纸飞机',
  ],
  zhLong: [
    '霓虹齿轮-第七号',
    '火星蘑菇先生',
    '深夜代码搬运工',
    '会发呆的微光',
    '糖果工厂总管',
    '失眠城市里的猫',
    '银河边缘拾荒者',
    '旧唱片修复师',
    '竹林里的小提琴家',
    '不按常理出牌的熊',
    '会变色的信使',
  ],
  enShort: [
    'BitSprite',
    'LuluQ',
    'Nova',
    'Frodo',
    'R1',
    'QBit',
    'Wisp',
    'NeonP',
    'Gizmo',
    'Nero',
    'Aster',
    'Faint',
    'Byte',
  ],
  enLong: [
    'NeonPigeon-42',
    'QuantumBrew-Master',
    'PixelCartographer',
    'SilentOrbit-Runner',
    'VelvetProtocol',
    'GhostOfStackOverflow',
    'RetroDrift-Collector',
    'CaptainLatency',
    'MnemonicCircuitBreaker',
    'MoonlineFreight',
  ],
  nonsense: [
    'xk9#q7',
    'm3w-tw',
    'zzz~n0',
    'rrr_b',
    'gl0p',
    'z0mg9',
    'floop',
    'k9-π',
    'qwer++',
    'nono',
    '??',
    '☼bot',
    '△△△',
  ],
};

const suffixes = ['A', 'v2', 'v3', 'alpha', 'beta', 'x', 'pro', 'mkⅡ', 'echo'];
const cnSuffixes = ['灵', '章', '号', '体', '域', '光', '线', '阁'];
const numberSuffixes = ['01', '42', '77', '08', '11', '28', '64'];
const latinSuffixes = ['A', 'x', 'pro', 'v3', 'alpha', 'beta'];

const bioScenarioProfiles = [
  {
    identity: '招聘信息观察者',
    focus: ['薪资结构', '试用期', '住宿条件', '入职流程', '团队稳定性'],
    habit: ['先问清底薪和提成怎么算', '会留意合同和住宿是否写清楚', '看到高薪岗位会多问试用期和扣款规则'],
    boundary: '只聊避坑和判断，不催私聊也不承诺结果。',
  },
  {
    identity: '推广获客从业者',
    focus: ['流量成本', '素材疲劳', '转化波动', 'KPI 压力', '渠道风控'],
    habit: ['习惯先看预算和转化是否匹配', '对突然变热的渠道会多留心', '更相信稳定复盘，不相信一夜爆量'],
    boundary: '只讲经验感受，不教违规玩法。',
  },
  {
    identity: '租房生活党',
    focus: ['押金', '付款周期', '通勤距离', '水电网', '合租磨合'],
    habit: ['看房会先问合同和退租条件', '比起图片更在意通勤和楼下配套', '遇到低价房会先核实押金规则'],
    boundary: '不撮合房源，只提醒别急着打款。',
  },
  {
    identity: '二手交易老手',
    focus: ['验机', '解绑账号', '成色描述', '价格水分', '当面交易'],
    habit: ['买设备会先看电池和序列号', '遇到先款会直接多问两句', '更看重可验证细节，不看口头保证'],
    boundary: '不撮合交易，不引导先款。',
  },
  {
    identity: '签证材料控',
    focus: ['预约', '补材料', '续签', '护照补办', '入境准备'],
    habit: ['材料会先备份截图', '看到包过说法会先提醒核验', '遇到证件问题优先看官方渠道'],
    boundary: '只聊常识提醒，不承诺包过。',
  },
  {
    identity: '财务对账人',
    focus: ['工资延迟', '流水留痕', '报销', '结算周期', '账务边界'],
    habit: ['遇到拖薪会提醒先留记录', '更相信流水和聊天记录', '对口头结算日期会多问一次'],
    boundary: '提醒留证据，但不制造恐慌。',
  },
  {
    identity: '客服运营视角',
    focus: ['排班', '话术', '客诉', '日报', '临时改需求'],
    habit: ['能理解新人被话术压住的累', '看到流程混乱会先拆步骤', '更在意交接记录是否完整'],
    boundary: '接吐槽也接问题，不替任何团队站台。',
  },
  {
    identity: '技术后勤帮手',
    focus: ['账号权限', '电脑网络', '办公设备', '宿舍物资', '远程协作'],
    habit: ['排障会先看基础项', '遇到设备问题会先问型号和现象', '习惯把小问题记成清单'],
    boundary: '只给基础排查思路，不装专家。',
  },
  {
    identity: '市场内容观察者',
    focus: ['活动效果', '短视频素材', '封面节奏', '预算收紧', '平台变化'],
    habit: ['看热闹前会先看数据变化', '对临时改稿很有共鸣', '更关心素材能不能长期跑'],
    boundary: '聊制作和趋势，不讲灰色引流细节。',
  },
  {
    identity: '海外生活杂谈人',
    focus: ['手机卡', '交通', '房租', '办事效率', '日常成本'],
    habit: ['到新地方先看通勤和超市', '换城市前会先算生活成本', '更想听真实体验，不爱听包装话'],
    boundary: '只聊生活感受和常识，不代办任何事。',
  },
  {
    identity: '渠道合作观察者',
    focus: ['资源真假', '结算周期', '合作边界', '口头承诺', '责任归属'],
    habit: ['合作前会先问清责任和结算', '对太满的承诺会保持怀疑', '习惯把边界写清楚再开始'],
    boundary: '不拉合作，不留联系方式，只聊判断。',
  },
  {
    identity: '慢热新人',
    focus: ['入职安全感', '住宿选择', '城市适应', '基础规则', '避坑经验'],
    habit: ['会把不懂的问题问具体', '更愿意听真实经历', '遇到催促会先停一下确认'],
    boundary: '只把自己当普通群友，不装懂也不乱带节奏。',
  },
];

const bioLocalSignals = [
  '最近会多看马尼拉、迪拜、曼谷、金边这些地方的实际反馈。',
  '对工资、押金、材料和合同这种容易扯皮的细节比较敏感。',
  '更喜欢听真人经历，看到传闻会先当成线索而不是结论。',
  '聊天时会尽量把提醒说具体，少讲空话和大口号。',
  '如果话题太虚，会习惯追问一个能落地的条件。',
  '比起热闹，更在意后面会不会留下麻烦。',
];

function pickDistinct(items, rng, count) {
  const available = [...items];
  const result = [];
  while (available.length > 0 && result.length < count) {
    const index = Math.floor(rng() * available.length);
    result.push(available.splice(index, 1)[0]);
  }
  return result;
}

const remoteAvatarTemplates = [
  (seed) => `https://api.dicebear.com/8.x/bottts/svg?seed=${encodeURIComponent(seed)}&size=256&backgroundColor=ffadad,b7b7a8,9bf6ff,ffd6a5,caffbf`,
  (seed) => `https://api.dicebear.com/8.x/avataaars/svg?seed=${encodeURIComponent(seed)}&size=256`,
  (seed) => `https://robohash.org/${encodeURIComponent(seed)}.png?set=set4`,
  (seed) => `https://api.multiavatar.com/${encodeURIComponent(seed)}.svg`,
];

const localAvatarStyles = [
  'geometric',
  'orbital',
  'badge',
  'pixel',
  'wave',
];

const palette = [
  '#ff7f7f',
  '#7ab8ff',
  '#7dff7d',
  '#ffd166',
  '#a78bfa',
  '#fb7185',
  '#14b8a6',
  '#f59e0b',
  '#60a5fa',
  '#34d399',
];

function svgData(template) {
  return `data:image/svg+xml;base64,${Buffer.from(template).toString('base64')}`;
}

function hslLike(seed) {
  const hue = Math.floor(seed * 360) % 360;
  const sat = 55 + Math.floor(seed * 35);
  const light = 45 + Math.floor(seed * 35);
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

function makeGeometricAvatar(seed, rng, styleCode) {
  const bg = palette[Math.floor(rng() * palette.length)];
  const fg = palette[Math.floor(rng() * palette.length)];
  const accent = palette[Math.floor(rng() * palette.length)];
  const angle = Math.floor(rng() * 360);
  const radius = Math.floor(24 + rng() * 24);

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320" role="img" aria-label="robot avatar">
      <defs>
        <linearGradient id="g-${styleCode}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${bg}"/>
          <stop offset="100%" stop-color="${fg}"/>
        </linearGradient>
      </defs>
      <rect width="320" height="320" fill="url(#g-${styleCode})"/>
      <g transform="rotate(${angle} 160 160)">
        <rect x="60" y="84" width="200" height="140" rx="28" fill="${accent}" fill-opacity="0.3"/>
        <circle cx="160" cy="154" r="${radius}" fill="${accent}" fill-opacity="0.7"/>
      </g>
      <circle cx="128" cy="130" r="18" fill="${bg}"/>
      <circle cx="192" cy="130" r="18" fill="${bg}"/>
      <path d="M120 205 q40 24 80 0" stroke="${fg}" stroke-width="14" fill="none" stroke-linecap="round"/>
    </svg>
  `.trim();
  return svgData(svg);
}

function makeOrbitalAvatar(seed, rng, styleCode) {
  const c1 = palette[Math.floor(rng() * palette.length)];
  const c2 = palette[Math.floor(rng() * palette.length)];
  const c3 = hslLike(rng());
  const o1 = Math.floor(rng() * 10) + 4;

  const dots = Array.from({ length: 28 }, (_, index) => {
    const angle = ((index / 28) * Math.PI * 2) + (rng() * 0.3);
    const rad = 70 + (index % 3) * 24;
    const cx = 160 + Math.cos(angle) * rad;
    const cy = 160 + Math.sin(angle) * rad;
    const r = 4 + (index % 5);
    return `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${r}" fill="${index % 2 ? c1 : c2}" />`;
  }).join('');

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320">
      <defs>
        <radialGradient id="o-${styleCode}" cx="0.5" cy="0.5" r="0.7">
          <stop offset="0%" stop-color="${c3}"/>
          <stop offset="100%" stop-color="${c1}"/>
        </radialGradient>
      </defs>
      <rect width="320" height="320" rx="28" fill="url(#o-${styleCode})"/>
      <circle cx="160" cy="160" r="92" fill="${c2}" fill-opacity="0.16"/>
      <g opacity="0.9">
        ${dots}
      </g>
      <circle cx="160" cy="160" r="${o1}" fill="${c1}" />
      <circle cx="160" cy="160" r="48" stroke="${c2}" stroke-width="8" fill="none" />
      <text x="160" y="168" text-anchor="middle" font-size="36" fill="${c2}" font-family="Arial" font-weight="700">${seed.slice(-2)}</text>
    </svg>
  `.trim();
  return svgData(svg);
}

function makeBadgeAvatar(seed, rng, styleCode) {
  const outer = palette[Math.floor(rng() * palette.length)];
  const inner = palette[Math.floor(rng() * palette.length)];
  const ring = palette[Math.floor(rng() * palette.length)];
  const mark = seed.slice(-2).toUpperCase();

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320">
      <rect width="320" height="320" fill="${outer}"/>
      <rect x="18" y="18" width="284" height="284" rx="36" fill="${inner}"/>
      <circle cx="160" cy="140" r="54" fill="${ring}" fill-opacity="0.18"/>
      <polygon points="160,55 179,121 249,121 193,159 212,226 160,187 108,226 127,159 71,121 141,121" fill="${ring}" />
      <rect x="100" y="180" width="120" height="100" rx="20" fill="#ffffff" fill-opacity="0.2"/>
      <text x="160" y="225" text-anchor="middle" font-family="Arial" font-size="34" fill="#fff" font-weight="700">${mark}</text>
    </svg>
  `.trim();
  return svgData(svg);
}

function makePixelAvatar(seed, rng, styleCode) {
  const cell = 16;
  const cols = 16;
  const rows = 16;
  const size = 20;
  const baseX = 40;
  const baseY = 40;
  const blocks = [];

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      if (rng() > 0.72) {
        const fill = palette[Math.floor(rng() * palette.length)];
        const opacity = (0.35 + rng() * 0.55).toFixed(2);
        blocks.push(`<rect x="${baseX + x * size}" y="${baseY + y * size}" width="${size}" height="${size}" fill="${fill}" fill-opacity="${opacity}" />`);
      }
    }
  }

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320">
      <rect x="0" y="0" width="320" height="320" fill="${palette[Math.floor(rng() * palette.length)]}"/>
      ${blocks.join('')}
      <rect x="40" y="40" width="${cell * size}" height="${cell * size}" fill="none" stroke="${palette[Math.floor(rng() * palette.length)]}" stroke-width="5" />
      <text x="160" y="286" text-anchor="middle" font-family="monospace" font-size="22" fill="#ffffff" opacity="0.75">${styleCode}</text>
    </svg>
  `.trim();
  return svgData(svg);
}

function makeWaveAvatar(seed, rng, styleCode) {
  const c1 = palette[Math.floor(rng() * palette.length)];
  const c2 = palette[Math.floor(rng() * palette.length)];
  const c3 = palette[Math.floor(rng() * palette.length)];
  const amp = Math.floor(rng() * 34) + 18;
  const wave = Array.from({ length: 10 }, (_, i) => {
    const x = 20 + i * 30;
    const y1 = 160 + Math.sin((i + rng()) * 0.7) * amp;
    const y2 = 160 + Math.sin((i + 1 + rng()) * 0.6) * amp;
    return `Q ${x} ${y1.toFixed(2)} ${x + 30} ${y2.toFixed(2)}`;
  }).join(' ');

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320">
      <rect width="320" height="320" fill="${c3}"/>
      <path d="M0 200 C 80 80, 240 80, 320 200 L 320 320 L 0 320 Z" fill="${c2}" fill-opacity="0.78"/>
      <path d="M0 220 C 70 ${120 + amp}, 130 ${140 + amp}, 180 190 ${wave} 320 220" fill="none" stroke="${c1}" stroke-width="12" stroke-linecap="round"/>
      <path d="M0 190 C 90 90, 240 90, 320 190" fill="none" stroke="${c2}" stroke-width="8" opacity="0.55" stroke-linecap="round"/>
      <circle cx="160" cy="112" r="52" fill="${c1}" fill-opacity="0.3"/>
      <text x="160" y="118" text-anchor="middle" font-size="30" font-family="Arial" fill="#fff" font-weight="700">${seed.slice(-1)}</text>
      <text x="160" y="280" text-anchor="middle" font-size="20" fill="#fff" opacity="0.8">${styleCode}</text>
    </svg>
  `.trim();
  return svgData(svg);
}

function buildAvatar(index, seed, rng) {
  const bucket = rng();
  const safeSeed = `${seed}-${index}`;

  if (bucket < 0.1) {
    return { photoUrl: null, type: 'default' };
  }

  if (bucket < 0.3) {
    const remote = pick(remoteAvatarTemplates, rng);
    return { photoUrl: remote(encodeURIComponent(safeSeed)), type: 'remote' };
  }

  const style = pick(localAvatarStyles, rng);
  const code = `${(index + 1).toString(36).toUpperCase()}-${Math.floor(rng() * 64)}`;
  let svg;
  switch (style) {
    case 'geometric':
      svg = makeGeometricAvatar(safeSeed, rng, code);
      break;
    case 'orbital':
      svg = makeOrbitalAvatar(safeSeed, rng, code);
      break;
    case 'badge':
      svg = makeBadgeAvatar(safeSeed, rng, code);
      break;
    case 'pixel':
      svg = makePixelAvatar(safeSeed, rng, code);
      break;
    default:
      svg = makeWaveAvatar(safeSeed, rng, code);
  }

  return { photoUrl: svg, type: 'inline' };
}

function buildDisplayName(index, rng) {
  const styleRoll = rng();
  let name;
  let type;
  if (styleRoll < 0.18) {
    const suffixStyle = rng();
    if (suffixStyle < 0.4) {
      name = `${pick(namePools.zhShort, rng)}-${pick(numberSuffixes, rng)}${index}`;
    } else {
      name = `${pick(namePools.zhShort, rng)}${pick(cnSuffixes, rng)}${index}`;
    }
    type = 'zh-short';
  } else if (styleRoll < 0.36) {
    const suffixStyle = rng();
    if (suffixStyle < 0.5) {
      name = `${pick(namePools.zhLong, rng)}-${pick(cnSuffixes, rng)}`;
    } else {
      name = `${pick(namePools.zhLong, rng)}-${pick(numberSuffixes, rng)}${index}`;
    }
    type = 'zh-long';
  } else if (styleRoll < 0.54) {
    name = `${pick(namePools.enShort, rng)}_${pick(latinSuffixes, rng)}${Math.floor(rng() * 9_900)}`;
    type = 'en-short';
  } else if (styleRoll < 0.72) {
    if (rng() < 0.5) {
      name = `${pick(namePools.enLong, rng)} ${pick(latinSuffixes, rng)} ${Math.floor(rng() * 999)}`;
    } else {
      name = `${pick(namePools.enLong, rng)} ${Math.floor(rng() * 999)} ${pick(numberSuffixes, rng)}`;
    }
    type = 'en-long';
  } else {
    const nonsense = pick(namePools.nonsense, rng);
    if (/[A-Za-z]/.test(nonsense) && /\d/.test(nonsense)) {
      name = nonsense;
    } else {
      name = `${nonsense}-${pick(numberSuffixes, rng)}`;
    }
    type = 'nonsense';
  }

  name = normalizeDisplayNameTypes(name, rng);

  if (name.length > 48) {
    name = name.slice(0, 48);
  }
  if (name.length < 2) {
    name = `${name}-${index + 1}`;
  }

  return { name, nameType: type };
}

function buildBio(index, rng) {
  const profile = pick(bioScenarioProfiles, rng);
  const focus = pickDistinct(profile.focus, rng, 3);
  const habit = pick(profile.habit, rng);
  const localSignal = pick(bioLocalSignals, rng);
  const tail = rng() < 0.45 ? localSignal : '发言会尽量接住前文，再补一个具体提醒或追问。';

  let bio = `${profile.identity}，常看${focus.join('、')}。${habit}，${profile.boundary}${tail}`;
  if (bio.length > 150) {
    bio = `${bio.slice(0, 147)}...`;
  }
  if (bio.length < 36) {
    bio = `${profile.identity}，常看${focus.join('、')}，聊天时会补充具体经验和风险提醒。`;
  }

  return bio;
}

function buildSummary(stats, previewItems) {
  return {
    total: stats.total,
    userType: 'ROBOT',
    avatar: {
      default: stats.defaultAvatar,
      remote: stats.remoteAvatar,
      inline: stats.inlineAvatar,
      defaultRatio: (stats.defaultAvatar / stats.total).toFixed(3),
      remoteRatio: (stats.remoteAvatar / stats.total).toFixed(3),
      inlineRatio: (stats.inlineAvatar / stats.total).toFixed(3),
    },
    nameType: {
      zhShort: stats.zhShortName,
      zhLong: stats.zhLongName,
      enShort: stats.enShortName,
      enLong: stats.enLongName,
      nonsense: stats.nonsenseName,
    },
    sample: previewItems,
  };
}

function makeRecords(count, seed) {
  const rng = makeRng(seed);
  const stats = {
    total: count,
    defaultAvatar: 0,
    remoteAvatar: 0,
    inlineAvatar: 0,
    zhShortName: 0,
    zhLongName: 0,
    enShortName: 0,
    enLongName: 0,
    nonsenseName: 0,
  };

  const records = [];

  for (let i = 0; i < count; i += 1) {
    const { name, nameType } = buildDisplayName(i, rng);
    const avatar = buildAvatar(i, seed, rng);
    const bio = buildBio(i, rng);

    const nameTypeToStat = {
      'zh-short': 'zhShortName',
      'zh-long': 'zhLongName',
      'en-short': 'enShortName',
      'en-long': 'enLongName',
      nonsense: 'nonsenseName',
    };
    stats[nameTypeToStat[nameType]] += 1;

    if (avatar.type === 'default') {
      stats.defaultAvatar += 1;
    } else if (avatar.type === 'remote') {
      stats.remoteAvatar += 1;
    } else {
      stats.inlineAvatar += 1;
    }

    records.push({
      displayName: name,
      bio,
      userType: 'ROBOT',
      photoUrl: avatar.photoUrl,
      loginAccount: null,
      isDisabled: false,
    });
  }

  return { records, stats };
}

async function insertBatches(prisma, records, batchSize) {
  let inserted = 0;
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const result = await prisma.user.createMany({
      data: batch,
      skipDuplicates: false,
    });
    inserted += result.count;
    console.log(`insert batch #${(i / batchSize) + 1}: +${result.count}`);
  }
  return inserted;
}

async function updateRobotRecords(prisma, records, batchSize) {
  const robots = await prisma.user.findMany({
    where: { userType: 'ROBOT' },
    select: { id: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  let updated = 0;
  for (let i = 0; i < robots.length; i += batchSize) {
    const slice = robots.slice(i, i + batchSize);
    const sliceRecords = slice.map((robot, index) => ({ robot, record: records[i + index] }));
    for (const group of chunks(sliceRecords, ROBOT_UPDATE_CONCURRENCY)) {
      await withRetry(`update batch #${(i / batchSize) + 1}`, () => Promise.all(group.map(({ robot, record }) => (
        prisma.user.update({
          where: { id: robot.id },
          data: {
            displayName: record.displayName,
            bio: record.bio,
            photoUrl: record.photoUrl,
          },
        })
      ))));
    }
    updated += slice.length;
    console.log(`update batch #${(i / batchSize) + 1}: +${slice.length}`);
  }

  return { updated, total: robots.length };
}

function makeBioOnlyRecords(robots, seed) {
  const rng = makeRng(seed);
  return robots.map((robot, index) => ({
    id: robot.id,
    displayName: robot.displayName,
    bio: buildBio(index, rng),
  }));
}

async function updateRobotBios(prisma, records, batchSize) {
  let updated = 0;
  for (let i = 0; i < records.length; i += batchSize) {
    const slice = records.slice(i, i + batchSize);
    for (const group of chunks(slice, ROBOT_UPDATE_CONCURRENCY)) {
      await withRetry(`update bio batch #${(i / batchSize) + 1}`, () => Promise.all(group.map((robot) => prisma.user.update({
        where: { id: robot.id },
        data: { bio: robot.bio },
      }))));
    }
    updated += slice.length;
    console.log(`update bio batch #${(i / batchSize) + 1}: +${slice.length}`);
  }

  return { updated, total: records.length };
}

async function summarizeRobotBios(prisma) {
  const robots = await prisma.user.findMany({
    where: { userType: 'ROBOT' },
    select: {
      id: true,
      displayName: true,
      bio: true,
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  const missingBio = [];
  const shortBio = [];
  const genericBio = [];
  for (const robot of robots) {
    const bio = String(robot.bio || '').trim();
    if (!bio) {
      missingBio.push(robot);
      continue;
    }
    if (bio.length < 36) shortBio.push(robot);
    if (/^(随便看看，偶尔聊两句。?|这个人很懒|自然聊天|普通用户|机器人)$/i.test(bio)) {
      genericBio.push(robot);
    }
  }

  return {
    total: robots.length,
    ok: robots.length - missingBio.length - shortBio.length - genericBio.length,
    missingBio,
    shortBio,
    genericBio,
  };
}

function printBioSummary(label, summary) {
  console.log(label, JSON.stringify({
    total: summary.total,
    ok: summary.ok,
    missingBio: summary.missingBio.length,
    shortBio: summary.shortBio.length,
    genericBio: summary.genericBio.length,
    samples: {
      missingBio: summary.missingBio.slice(0, 3).map((robot) => ({ id: robot.id, displayName: robot.displayName })),
      shortBio: summary.shortBio.slice(0, 3).map((robot) => ({ id: robot.id, displayName: robot.displayName, bio: robot.bio })),
      genericBio: summary.genericBio.slice(0, 3).map((robot) => ({ id: robot.id, displayName: robot.displayName, bio: robot.bio })),
    },
  }, null, 2));
}

function assertAllRobotBiosUpdated(summary) {
  if (summary.missingBio.length > 0 || summary.shortBio.length > 0 || summary.genericBio.length > 0) {
    throw new Error(`Robot bio verification failed: missing=${summary.missingBio.length}, short=${summary.shortBio.length}, generic=${summary.genericBio.length}`);
  }
}

async function main() {
  const args = normalizeArgs(process.argv.slice(2));
  if (args.help) {
    showHelp();
    return;
  }

  const { count, batchSize, seed, dryRun, updateExisting, updateBioOnly, verifyBios } = args;
  const databaseUrl = args.databaseUrl || process.env.DATABASE_URL;
  if (databaseUrl) {
    process.env.DATABASE_URL = databaseUrl;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error('缺少 DATABASE_URL，无法访问数据库。请先配置环境变量。');
  }

  const prisma = new PrismaClient();
  try {
    if (verifyBios) {
      const summary = await summarizeRobotBios(prisma);
      printBioSummary('Robot bio verification:', summary);
      assertAllRobotBiosUpdated(summary);
      console.log(`Done. verified=${summary.total}`);
      return;
    }

    if (updateBioOnly) {
      const robots = await prisma.user.findMany({
        where: { userType: 'ROBOT' },
        select: { id: true, displayName: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });

      if (robots.length === 0) {
        console.log('No robot users found to update.');
        return;
      }

      const records = makeBioOnlyRecords(robots, seed);
      const preview = records.slice(0, 5).map((user, index) => ({
        index: index + 1,
        displayName: user.displayName,
        bio: user.bio,
      }));
      console.log(`Existing robot users to refresh bio: ${robots.length}`);
      console.log('sample:', preview);
      if (dryRun) {
        console.log('DRY RUN: 不会更新数据库。');
        return;
      }

      const result = await updateRobotBios(prisma, records, batchSize);
      const summary = await summarizeRobotBios(prisma);
      printBioSummary('Robot bio verification:', summary);
      assertAllRobotBiosUpdated(summary);
      console.log(`Done. updated=${result.updated}, expect=${result.total}`);
      return;
    }

    if (updateExisting) {
      const robots = await prisma.user.findMany({
        where: { userType: 'ROBOT' },
        select: { id: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });

      if (robots.length === 0) {
        console.log('No robot users found to update.');
        return;
      }

      const { records } = makeRecords(robots.length, seed);
      const preview = records.slice(0, 5).map((user, index) => ({
        index: index + 1,
        displayName: user.displayName,
        bio: user.bio,
      }));
      console.log(`Existing robot users to update: ${robots.length}`);
      console.log('sample:', preview);
      if (dryRun) {
        console.log('DRY RUN: 不会更新数据库。');
        return;
      }

      const result = await updateRobotRecords(prisma, records, batchSize);
      const summary = await summarizeRobotBios(prisma);
      printBioSummary('Robot bio verification:', summary);
      assertAllRobotBiosUpdated(summary);
      console.log(`Done. updated=${result.updated}, expect=${result.total}`);
      return;
    }

    const { records, stats } = makeRecords(count, seed);
    const preview = records.slice(0, 5).map((user, index) => ({
      index: index + 1,
      displayName: user.displayName,
      bio: user.bio,
      avatarType: user.photoUrl ? 'custom' : 'default',
    }));
    console.log('Preview:', buildSummary(stats, preview));

    if (dryRun) {
      console.log('DRY RUN: 不会写入数据库。');
      return;
    }

    const inserted = await insertBatches(prisma, records, batchSize);
    console.log(`Done. inserted=${inserted}, expect=${count}`);
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
