import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const PROTECTED_DROP_TABLES = [
  'User',
  'Post',
  'Order',
  'PointTransaction',
  'PromotionBooking',
  'SystemConfig',
  'ChatRoom',
  'ChatMessage',
  'ChatMute',
  'ChatBotInvocation',
];

const jobPositionOptions = [
  '客服',
  '推广',
  '电销',
  '运营',
  '人事',
  '财务',
  '技术',
  '产品',
  '设计',
  '风控',
  '市场',
  '销售',
  '行政',
  '司机',
  '安保',
  '厨师',
  '服务员',
  '翻译',
  '主播',
  '剪辑',
];

const jobSalaryRangeOptions = [
  '面议',
  '$500 以下',
  '$500 - $800',
  '$800 - $1,200',
  '$1,200 - $1,500',
  '$1,500 - $2,000',
  '$2,000 - $3,000',
  '$3,000 - $5,000',
  '$5,000 以上',
];

const secondhandItemCategoryOptions = [
  '手机',
  '电脑',
  '数码配件',
  '家电',
  '家具',
  '电动车/摩托',
  '汽车用品',
  '服饰鞋包',
  '美妆个护',
  '母婴用品',
  '运动户外',
  '游戏娱乐',
  '办公用品',
  '票券卡券',
  '其他',
];

const documentServiceTypeOptions = [
  '签证',
  '移民',
  '护照',
  '工作证明',
  '保关',
  '捞人',
  '洗白',
];

const nightlifeCategoryOptions = [
  'KTV',
  '按摩',
  '开车',
];

const restaurantCategoryOptions = [
  '中餐',
  '火锅',
  '烧烤',
  '日料',
  '韩餐',
  '西餐',
  '快餐',
  '小吃',
  '茶餐厅',
  '咖啡甜品',
  '自助餐',
  '东南亚菜',
  '其他',
];

const publishCategorySchema = [
  {
    slug: 'jobs',
    name: '招聘',
    fields: [
      { key: 'position', label: '岗位', type: 'select', required: true, options: jobPositionOptions },
      { key: 'location', label: '地点', type: 'location', required: true },
      { key: 'salaryRange', label: '薪资', type: 'select', required: true, options: jobSalaryRangeOptions },
    ],
  },
  {
    slug: 'secondhand',
    name: '二手',
    fields: [
      { key: 'itemCategory', label: '品类', type: 'select', required: true, options: secondhandItemCategoryOptions },
      { key: 'location', label: '地点', type: 'location', required: true },
    ],
  },
  {
    slug: 'housing',
    name: '租房',
    fields: [
      { key: 'price', label: '价格', type: 'number', required: true, min: 0 },
      { key: 'bedrooms', label: '卧室', type: 'number', required: true, min: 0, max: 99 },
      { key: 'bathrooms', label: '浴室', type: 'number', required: true, min: 0, max: 99 },
      { key: 'area', label: '面积', type: 'number', required: true, min: 0 },
      { key: 'location', label: '地点', type: 'location', required: true },
      { key: 'depositMonths', label: '押金月数', type: 'number', required: true, min: 0, max: 24 },
      { key: 'paymentMonths', label: '付几', type: 'number', required: true, min: 1, max: 24 },
    ],
  },
  {
    slug: 'documents',
    name: '证件',
    fields: [
      { key: 'location', label: '地点', type: 'location', required: true },
      { key: 'serviceType', label: '类型', type: 'select', required: true, options: documentServiceTypeOptions },
    ],
  },
  {
    slug: 'nightlife',
    name: '夜场',
    fields: [
      { key: 'location', label: '地点', type: 'location', required: true },
      { key: 'serviceType', label: '分类', type: 'select', required: true, options: nightlifeCategoryOptions },
    ],
  },
  {
    slug: 'restaurant',
    name: '餐厅',
    fields: [
      { key: 'location', label: '地点', type: 'location', required: true },
      { key: 'restaurantType', label: '分类', type: 'select', required: true, options: restaurantCategoryOptions },
    ],
  },
  {
    slug: 'express',
    name: '快递',
    fields: [
      { key: 'location', label: '地点', type: 'location', required: true },
    ],
  },
];

const locationPresets = [
  { country: '菲律宾', cities: ['马尼拉', '马卡蒂', 'BGC', '塔吉格', '帕赛', '帕拉纳克', '阿拉邦', '奎松', '甲米地', '克拉克', '安吉利斯', '苏比克', '宿务', '达沃', 'MOA', '曼达卢永', '帕西格', '卡加延', '打拉', '邦板牙', '碧瑶', '长滩岛'] },
  { country: '阿联酋', cities: ['迪拜', '阿布扎比', '沙迦', '阿治曼', '拉斯海玛', '迪拜码头', 'JLT', 'Business Bay', 'Deira', 'Bur Dubai', 'International City', '富查伊拉', '乌姆盖万'] },
  { country: '柬埔寨', cities: ['金边', '西港', '暹粒', '波贝', '巴域', '贡布', '国公', '柴桢', '干拉', '七星海', '财通', '拜林', '菩萨', '桔井'] },
  { country: '泰国', cities: ['曼谷', '芭提雅', '普吉', '清迈', '清莱', '合艾', '孔敬', '湄索', '素万那普', '廊曼', '华欣', '苏梅岛', '美塞', '美索'] },
  { country: '斯里兰卡', cities: ['科伦坡', '康提', '加勒', '尼甘布', '拉特纳普勒', '芒特拉维尼亚'] },
  { country: '日本', cities: ['东京', '大阪', '横滨', '名古屋', '福冈', '京都', '札幌', '冲绳'] },
  { country: '韩国', cities: ['首尔', '仁川', '釜山', '济州', '大邱'] },
  { country: '马来西亚', cities: ['吉隆坡', '雪兰莪', '槟城', '柔佛', '新山', '马六甲', '沙巴', '古晋', '云顶', '怡保'] },
  { country: '缅甸', cities: ['仰光', '曼德勒', '内比都', '妙瓦底', '老街', '果敢', '木姐', '大其力', '勐拉', '佤邦', '腊戌', '勐波', '勐平', '当阳', '密支那'] },
  { country: '越南', cities: ['胡志明', '河内', '岘港', '芽庄', '海防', '平阳', '同奈', '芹苴', '富国岛', '大叻', '芒街'] },
  { country: '印尼', cities: ['雅加达', '巴厘岛', '泗水', '万隆', '棉兰', '巴淡', '日惹'] },
  { country: '老挝', cities: ['万象', '琅勃拉邦', '巴色', '磨丁', '金三角', '沙湾拿吉', '丰沙里', '乌多姆赛', '万荣'] },
  { country: '新加坡', cities: ['新加坡', '乌节', '芽笼', '裕廊', '樟宜'] },
  { country: '香港', cities: ['香港岛', '九龙', '新界', '中环', '尖沙咀', '旺角'] },
  { country: '澳门', cities: ['澳门半岛', '氹仔', '路环', '路氹城'] },
  { country: '印度', cities: ['新德里', '孟买', '班加罗尔', '海得拉巴', '金奈', '加尔各答'] },
  { country: '孟加拉', cities: ['达卡', '吉大港', '锡尔赫特'] },
  { country: '尼泊尔', cities: ['加德满都', '博卡拉', '蓝毗尼'] },
  { country: '土耳其', cities: ['伊斯坦布尔', '安卡拉', '安塔利亚', '伊兹密尔'] },
  { country: '塞浦路斯', cities: ['尼科西亚', '利马索尔', '拉纳卡', '北塞'] },
  { country: '亚美尼亚', cities: ['埃里温', '久姆里', '瓦纳佐尔'] },
  { country: '格鲁吉亚', cities: ['第比利斯', '巴统', '库塔伊西'] },
  { country: '塞尔维亚', cities: ['贝尔格莱德', '诺维萨德', '尼什'] },
  { country: '罗马尼亚', cities: ['布加勒斯特', '克卢日', '蒂米什瓦拉', '康斯坦察'] },
  { country: '阿尔巴尼亚', cities: ['地拉那', '都拉斯', '发罗拉'] },
  { country: '黑山', cities: ['波德戈里察', '布德瓦', '科托尔'] },
  { country: '俄罗斯', cities: ['莫斯科', '圣彼得堡', '海参崴', '新西伯利亚'] },
  { country: '哈萨克斯坦', cities: ['阿拉木图', '阿斯塔纳', '奇姆肯特'] },
  { country: '吉尔吉斯斯坦', cities: ['比什凯克', '奥什'] },
  { country: '乌兹别克斯坦', cities: ['塔什干', '撒马尔罕'] },
  { country: '巴西', cities: ['圣保罗', '里约', '巴西利亚', '库里奇巴'] },
  { country: '墨西哥', cities: ['墨西哥城', '坎昆', '瓜达拉哈拉', '蒙特雷', '蒂华纳'] },
  { country: '阿尔及利亚', cities: ['阿尔及尔', '奥兰', '君士坦丁'] },
  { country: '毛里求斯', cities: ['路易港', '居尔皮普', '大湾'] },
  { country: '英国', cities: ['伦敦'] },
  { country: '美国', cities: ['洛杉矶', '纽约', '旧金山', '西雅图'] },
  { country: '加拿大', cities: ['温哥华', '多伦多'] },
  { country: '澳大利亚', cities: ['悉尼', '墨尔本'] },
  { country: '瓦努阿图', cities: ['维拉港'] },
  { country: '马绍尔', cities: ['马朱罗'] },
  { country: '德国', cities: ['柏林', '法兰克福'] },
  { country: '法国', cities: ['巴黎'] },
  { country: '意大利', cities: ['罗马', '米兰'] },
  { country: '西班牙', cities: ['马德里'] },
  { country: '瑞士', cities: ['苏黎世'] },
  { country: '新西兰', cities: ['奥克兰'] },
  { country: '多米尼克', cities: ['罗索'] },
  { country: '葡萄牙', cities: ['里斯本', '波尔图', '法鲁'] },
  { country: '希腊', cities: ['雅典', '塞萨洛尼基', '克里特'] },
  { country: '马耳他', cities: ['瓦莱塔', '斯利马'] },
  { country: '匈牙利', cities: ['布达佩斯', '德布勒森'] },
  { country: '爱尔兰', cities: ['都柏林', '科克'] },
  { country: '荷兰', cities: ['阿姆斯特丹', '鹿特丹', '海牙'] },
  { country: '奥地利', cities: ['维也纳', '萨尔茨堡'] },
  { country: '卢森堡', cities: ['卢森堡市'] },
  { country: '比利时', cities: ['布鲁塞尔', '安特卫普'] },
  { country: '波兰', cities: ['华沙', '克拉科夫'] },
  { country: '捷克', cities: ['布拉格', '布尔诺'] },
  { country: '巴拿马', cities: ['巴拿马城'] },
  { country: '哥斯达黎加', cities: ['圣何塞'] },
  { country: '阿根廷', cities: ['布宜诺斯艾利斯'] },
  { country: '智利', cities: ['圣地亚哥'] },
  { country: '乌拉圭', cities: ['蒙得维的亚'] },
  { country: '安提瓜和巴布达', cities: ['圣约翰'] },
  { country: '圣基茨和尼维斯', cities: ['巴斯特尔'] },
  { country: '圣卢西亚', cities: ['卡斯特里'] },
  { country: '格林纳达', cities: ['圣乔治'] },
];

function getMigrationUrl() {
  return [
    'MIGRATION_DATABASE_URL',
    'DATABASE_DIRECT_URL',
    'DIRECT_URL',
    'DATABASE_URL',
  ].map((key) => ({ key, value: process.env[key]?.trim() || '' }))
    .find((entry) => entry.value);
}

function safeConnectionSummary(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return `${parsed.protocol}//${parsed.username ? `${parsed.username}@` : ''}${parsed.hostname}:${parsed.port || '5432'}${parsed.pathname}`;
  } catch {
    return '<invalid-url>';
  }
}

function assertSafeMigrationUrl(entry) {
  if (!entry?.value) {
    throw new Error('Missing MIGRATION_DATABASE_URL. Provide a Supabase direct/session :5432 connection string.');
  }

  let parsed;
  try {
    parsed = new URL(entry.value);
  } catch {
    throw new Error(`${entry.key} is not a valid PostgreSQL URL.`);
  }

  const port = parsed.port || '5432';
  const host = parsed.hostname.toLowerCase();
  const usesTransactionPooler =
    port === '6543' ||
    parsed.searchParams.get('pgbouncer') === 'true' ||
    parsed.searchParams.get('connection_limit') !== null;

  if (usesTransactionPooler) {
    throw new Error(
      `${entry.key} appears to be a transaction-pooler/runtime URL (${safeConnectionSummary(entry.value)}). ` +
      'Use Supabase direct or session pooler :5432 for schema deployment.',
    );
  }

  if (host.includes('.pooler.supabase.com') && port !== '5432') {
    throw new Error(`Supabase pooler migrations must use session mode :5432, got ${safeConnectionSummary(entry.value)}.`);
  }
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: { ...process.env, ...(options.env || {}) },
      stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      shell: false,
    });

    let stdout = '';
    let stderr = '';
    if (options.capture) {
      child.stdout?.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr?.on('data', (chunk) => {
        stderr += chunk.toString();
      });
    }

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const rendered = [stderr, stdout].filter(Boolean).join('\n').trim();
      reject(new Error(`${command} ${args.join(' ')} failed with code ${code}${rendered ? `\n${rendered}` : ''}`));
    });
  });
}

async function assertCommandExists(command) {
  const lookup = process.platform === 'win32' ? 'where' : 'which';
  const args = [command];
  try {
    await run(lookup, args, { capture: true });
  } catch {
    throw new Error(`Required command not found: ${command}. Install it before deploying the schema.`);
  }
}

async function writeSqlFile(filePath, sql) {
  await fs.writeFile(filePath, sql.endsWith('\n') ? sql : `${sql}\n`, 'utf8');
}

function assertDiffSafety(diffSql) {
  const hits = PROTECTED_DROP_TABLES.filter((table) => {
    const pattern = new RegExp(
      `DROP\\s+TABLE(?:\\s+IF\\s+EXISTS)?\\s+(?:(?:"public"|public)\\.)?["']?${table}["']?`,
      'i',
    );
    return pattern.test(diffSql);
  });

  if (hits.length > 0) {
    throw new Error(`Safety gate stopped deployment: diff tries to drop protected table(s): ${hits.join(', ')}`);
  }
}

function systemConfigUpsertSql() {
  const publishCategoryValue = JSON.stringify(publishCategorySchema).replace(/'/g, "''");
  const locationPresetValue = JSON.stringify(locationPresets).replace(/'/g, "''");
  return `
INSERT INTO "SystemConfig" ("key", "value", "updatedAt")
VALUES
  ('publish_category_schema', '${publishCategoryValue}', CURRENT_TIMESTAMP),
  ('location_presets', '${locationPresetValue}', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE
SET "value" = EXCLUDED."value",
    "updatedAt" = CURRENT_TIMESTAMP;
`;
}

function verificationSql() {
  return `
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Post'
      AND column_name = 'categoryMeta'
  ) THEN
    RAISE EXCEPTION 'Post.categoryMeta is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Post'
      AND column_name = 'categoryId'
      AND is_nullable = 'YES'
  ) THEN
    RAISE EXCEPTION 'Post.categoryId must allow empty topic publishes';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Post'
      AND column_name = 'showContact'
  ) THEN
    RAISE EXCEPTION 'Post.showContact is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Post'
      AND column_name IN ('contact', 'countryCode', 'countryName', 'source', 'bumpedAt')
    GROUP BY table_name
    HAVING COUNT(DISTINCT column_name) = 5
  ) THEN
    RAISE EXCEPTION 'Post publish support columns are missing';
  END IF;

  IF to_regclass('public."UserJoinedTopic"') IS NULL THEN
    RAISE EXCEPTION 'UserJoinedTopic table is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('ChatRoom', 'ChatMessage', 'ChatMute', 'ChatBotInvocation')
    GROUP BY table_schema
    HAVING COUNT(DISTINCT table_name) = 4
  ) THEN
    RAISE EXCEPTION 'chat tables are missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ChatMessage'
      AND column_name IN ('roomId', 'authorType', 'authorUserId', 'body', 'status', 'createdAt')
    GROUP BY table_name
    HAVING COUNT(DISTINCT column_name) = 6
  ) THEN
    RAISE EXCEPTION 'ChatMessage required columns are missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "SystemConfig" WHERE "key" = 'publish_category_schema'
  ) THEN
    RAISE EXCEPTION 'publish_category_schema config is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "SystemConfig" WHERE "key" = 'location_presets'
  ) THEN
    RAISE EXCEPTION 'location_presets config is missing';
  END IF;
END $$;
`;
}

async function main() {
  const migrationEntry = getMigrationUrl();
  assertSafeMigrationUrl(migrationEntry);

  await assertCommandExists('pg_dump');

  const now = timestamp();
  const backupDir = process.env.DB_BACKUP_DIR?.trim() || '/tmp';
  const backupFile = path.join(backupDir, `168-pre-main-schema-${now}.dump`);
  const diffFile = path.join(backupDir, `168-main-schema-diff-${now}.sql`);
  const configSqlFile = path.join(backupDir, `168-publish-category-schema-${now}.sql`);
  const verifySqlFile = path.join(backupDir, `168-main-schema-verify-${now}.sql`);
  const env = { DATABASE_URL: migrationEntry.value };

  console.log(`[db] using ${migrationEntry.key}: ${safeConnectionSummary(migrationEntry.value)}`);
  console.log(`[db] backing up to ${backupFile}`);
  await run('pg_dump', [
    migrationEntry.value,
    '--format=custom',
    '--no-owner',
    '--no-privileges',
    `--file=${backupFile}`,
  ]);

  console.log(`[db] generating schema diff ${diffFile}`);
  const diff = await run('npx', [
    'prisma',
    'migrate',
    'diff',
    '--from-url',
    migrationEntry.value,
    '--to-schema-datamodel',
    'prisma/schema.prisma',
    '--script',
  ], { capture: true });
  await fs.writeFile(diffFile, diff.stdout, 'utf8');
  assertDiffSafety(diff.stdout);

  console.log('[db] applying prisma schema');
  await run('npx', [
    'prisma',
    'db',
    'push',
    '--schema',
    'prisma/schema.prisma',
    '--skip-generate',
    '--accept-data-loss',
  ], { env });

  console.log('[db] syncing ranking aggregates');
  await run('npm', ['run', 'db:rank:sync'], { env });

  console.log('[db] upserting publish category schema config');
  await writeSqlFile(configSqlFile, systemConfigUpsertSql());
  await run('npx', [
    'prisma',
    'db',
    'execute',
    '--file',
    configSqlFile,
    '--schema',
    'prisma/schema.prisma',
  ], { env });

  console.log('[db] verifying required structure and config');
  await writeSqlFile(verifySqlFile, verificationSql());
  await run('npx', [
    'prisma',
    'db',
    'execute',
    '--file',
    verifySqlFile,
    '--schema',
    'prisma/schema.prisma',
  ], { env });

  console.log('[db] deployment complete');
  console.log(`[db] backup: ${backupFile}`);
  console.log(`[db] diff: ${diffFile}`);
}

main().catch((error) => {
  console.error(`[db] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
