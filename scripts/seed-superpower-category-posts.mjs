import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

export const SUPERPOWER_CATEGORY_SEED_SOURCE = 'seed:superpower-category-posts';
export const SUPERPOWER_CATEGORY_SEED_COMPLETION_KEY = 'seed_superpower_category_posts_completed';

const categorySeeds = [
  {
    slug: 'documents',
    name: '证件',
    posts: [
      {
        title: '菲律宾签证延期当天可处理',
        content: '马尼拉地区签证延期、补材料、过期咨询都可处理，流程清楚，先确认情况再报价。',
        location: '菲律宾·马尼拉',
        categoryMeta: { location: '菲律宾·马尼拉', serviceType: '签证' },
      },
      {
        title: '迪拜签证续签材料协助',
        content: '协助整理续签资料、预约和进度跟进，适合工作签、旅游签到期前办理。',
        location: '迪拜·迪拜',
        categoryMeta: { location: '迪拜·迪拜', serviceType: '签证' },
      },
      {
        title: '柬埔寨保关咨询通道',
        content: '金边、西港入境保关咨询，提前核对护照和行程信息，减少临场不确定。',
        location: '柬埔寨·金边',
        categoryMeta: { location: '柬埔寨·金边', serviceType: '保关' },
      },
      {
        title: '泰国签证疑难问题处理',
        content: '逾期、拒签记录、材料不完整等情况可先评估，给出可执行办理方案。',
        location: '泰国·曼谷',
        categoryMeta: { location: '泰国·曼谷', serviceType: '签证' },
      },
      {
        title: '马来西亚洗白记录咨询',
        content: '针对历史出入境记录、逾期记录提供初步评估，确认可行后再推进。',
        location: '马来·吉隆坡',
        categoryMeta: { location: '马来·吉隆坡', serviceType: '洗白' },
      },
    ],
  },
  {
    slug: 'jobs',
    name: '招聘',
    posts: [
      {
        title: '马尼拉客服岗位直招',
        content: '需要普通话沟通流畅，熟悉电脑基础操作，包住宿，试用期后薪资稳定上调。',
        location: '菲律宾·马尼拉',
        categoryMeta: { location: '菲律宾·马尼拉', position: '客服', salaryRange: '$800 - $1,200' },
      },
      {
        title: '迪拜运营专员招聘',
        content: '负责日常数据整理、用户跟进和活动执行，要求执行力强，有海外经验优先。',
        location: '迪拜·迪拜',
        categoryMeta: { location: '迪拜·迪拜', position: '运营', salaryRange: '$1,500 - $2,000' },
      },
      {
        title: '金边推广岗位急招',
        content: '团队直招推广人员，提供培训和住宿，适合愿意长期发展的候选人。',
        location: '柬埔寨·金边',
        categoryMeta: { location: '柬埔寨·金边', position: '推广', salaryRange: '$1,200 - $1,500' },
      },
      {
        title: '曼谷财务助理招聘',
        content: '负责基础账务记录、对账和表格整理，要求细心稳定，会基础表格。',
        location: '泰国·曼谷',
        categoryMeta: { location: '泰国·曼谷', position: '财务', salaryRange: '$1,200 - $1,500' },
      },
      {
        title: '吉隆坡技术支持招聘',
        content: '处理系统使用问题和基础排障，要求沟通清楚，有客服或技术支持经验优先。',
        location: '马来·吉隆坡',
        categoryMeta: { location: '马来·吉隆坡', position: '技术', salaryRange: '$2,000 - $3,000' },
      },
    ],
  },
  {
    slug: 'secondhand',
    name: '二手',
    posts: [
      {
        title: '九成新 iPhone 15 Pro 出售',
        content: '自用机，外观保护很好，电池健康正常，支持当面验机，配原装充电线。',
        location: '菲律宾·马卡蒂',
        categoryMeta: { location: '菲律宾·马卡蒂', itemCategory: '手机' },
      },
      {
        title: 'MacBook Pro M2 便宜转',
        content: '办公自用电脑，运行流畅，适合设计、剪辑和日常办公，可现场测试。',
        location: '迪拜·迪拜',
        categoryMeta: { location: '迪拜·迪拜', itemCategory: '电脑' },
      },
      {
        title: '宿舍小冰箱和电饭煲打包出',
        content: '搬家处理，冰箱制冷正常，电饭煲干净好用，打包拿走更划算。',
        location: '柬埔寨·西港',
        categoryMeta: { location: '柬埔寨·西港', itemCategory: '家电' },
      },
      {
        title: '二手办公椅和折叠桌',
        content: '办公椅坐感舒服，折叠桌稳定不晃，适合宿舍或小办公室使用。',
        location: '泰国·芭提雅',
        categoryMeta: { location: '泰国·芭提雅', itemCategory: '家具' },
      },
      {
        title: '电动车一台可试骑',
        content: '通勤用电动车，续航正常，刹车灯光都没问题，支持附近试骑。',
        location: '马来·槟城',
        categoryMeta: { location: '马来·槟城', itemCategory: '电动车/摩托' },
      },
    ],
  },
  {
    slug: 'housing',
    name: '租房',
    posts: [
      {
        title: '马尼拉一室一厅拎包入住',
        content: '近商圈和超市，楼下交通方便，适合单人或情侣入住，可约时间看房。',
        location: '菲律宾·马尼拉',
        categoryMeta: { location: '菲律宾·马尼拉', bedrooms: 1, bathrooms: 1, price: 650, area: 42, depositMonths: 2, paymentMonths: 1 },
      },
      {
        title: '马卡蒂两房公寓出租',
        content: '高层采光好，带家具家电，安保完善，适合两人合租或小家庭。',
        location: '菲律宾·马卡蒂',
        categoryMeta: { location: '菲律宾·马卡蒂', bedrooms: 2, bathrooms: 1, price: 980, area: 68, depositMonths: 2, paymentMonths: 1 },
      },
      {
        title: '迪拜市中心单间转租',
        content: '房间干净，公共区域维护好，距离地铁站不远，入住时间可商量。',
        location: '迪拜·迪拜',
        categoryMeta: { location: '迪拜·迪拜', bedrooms: 1, bathrooms: 1, price: 750, area: 35, depositMonths: 1, paymentMonths: 1 },
      },
      {
        title: '金边三房整租适合团队',
        content: '空间大，家具齐全，网络稳定，附近生活便利，可长租优惠。',
        location: '柬埔寨·金边',
        categoryMeta: { location: '柬埔寨·金边', bedrooms: 3, bathrooms: 2, price: 1200, area: 105, depositMonths: 2, paymentMonths: 3 },
      },
      {
        title: '曼谷近 BTS 精装一房',
        content: '小区设施齐全，有泳池健身房，房间保养好，适合长期居住。',
        location: '泰国·曼谷',
        categoryMeta: { location: '泰国·曼谷', bedrooms: 1, bathrooms: 1, price: 700, area: 40, depositMonths: 2, paymentMonths: 1 },
      },
    ],
  },
];

function requireDatabaseUrl() {
  if (!process.env.DATABASE_URL) {
    throw new Error('缺少 DATABASE_URL，无法写入数据库。请先提供线上数据库连接后再执行。');
  }
}

async function ensureSuperPowerUserWithClient(client) {
  const existing = await client.user.findFirst({
    where: {
      OR: [
        { loginAccount: 'SuperPower' },
        { displayName: { equals: 'SuperPower', mode: 'insensitive' } },
      ],
    },
    select: { id: true },
  });

  if (existing?.id) return existing.id;

  const user = await client.user.create({
    data: {
      loginAccount: 'SuperPower',
      displayName: 'SuperPower',
      contact: '',
      userType: 'ROBOT',
      bio: 'SuperPower 自动发布账号',
    },
    select: { id: true },
  });

  return user.id;
}

async function ensureCategories(client) {
  const categories = new Map();

  for (const [index, seed] of categorySeeds.entries()) {
    const category = await client.category.upsert({
      where: { slug: seed.slug },
      update: { name: seed.name, order: index + 1 },
      create: { slug: seed.slug, name: seed.name, order: index + 1 },
      select: { id: true, slug: true },
    });
    categories.set(seed.slug, category.id);
  }

  return categories;
}

export async function seedSuperpowerCategoryPosts(client, options = {}) {
  const useCompletionMarker = options.useCompletionMarker === true;
  if (useCompletionMarker) {
    const completion = await client.systemConfig.findUnique({
      where: { key: SUPERPOWER_CATEGORY_SEED_COMPLETION_KEY },
      select: { value: true },
    });
    if (completion?.value === 'completed') {
      return { created: 0, skipped: true, counts: [] };
    }
  }

  const userId = await ensureSuperPowerUserWithClient(client);
  const categoryIds = await ensureCategories(client);

  await client.post.deleteMany({
    where: {
      userId,
      source: SUPERPOWER_CATEGORY_SEED_SOURCE,
      category: { slug: { in: categorySeeds.map((seed) => seed.slug) } },
    },
  });

  const now = Date.now();
  const data = categorySeeds.flatMap((categorySeed, categoryIndex) =>
    categorySeed.posts.map((post, postIndex) => {
      const minutesAgo = categoryIndex * 10 + postIndex;
      const publishedAt = new Date(now - minutesAgo * 60 * 1000);

      return {
        title: post.title,
        content: post.content,
        location: post.location,
        contact: '',
        categoryId: categoryIds.get(categorySeed.slug),
        categoryMeta: post.categoryMeta,
        images: [],
        isPublished: true,
        isAnonymous: false,
        showContact: false,
        syncToTelegram: false,
        source: SUPERPOWER_CATEGORY_SEED_SOURCE,
        userId,
        createdAt: publishedAt,
        updatedAt: publishedAt,
        bumpedAt: publishedAt,
      };
    }),
  );

  await client.post.createMany({ data });

  const counts = await client.post.groupBy({
    by: ['categoryId'],
    where: { userId, source: SUPERPOWER_CATEGORY_SEED_SOURCE },
    _count: { _all: true },
  });

  const categoryNamesById = new Map(
    categorySeeds.map((seed) => [categoryIds.get(seed.slug), seed.name]),
  );

  const renderedCounts = counts.map((row) => ({
    category: categoryNamesById.get(row.categoryId) || row.categoryId,
    count: row._count._all,
  }));

  if (useCompletionMarker) {
    await client.systemConfig.upsert({
      where: { key: SUPERPOWER_CATEGORY_SEED_COMPLETION_KEY },
      update: { value: 'completed' },
      create: { key: SUPERPOWER_CATEGORY_SEED_COMPLETION_KEY, value: 'completed' },
    });
  }

  return { created: data.length, skipped: false, counts: renderedCounts };
}

async function main() {
  requireDatabaseUrl();

  const prisma = new PrismaClient();
  const result = await seedSuperpowerCategoryPosts(prisma);

  console.log(`已用 SuperPower 账号生成 ${result.created} 条数据。`);
  for (const row of result.counts) {
    console.log(`${row.category}: ${row.count} 条`);
  }

  await prisma.$disconnect();
}

if (process.argv[1]?.endsWith('seed-superpower-category-posts.mjs')) {
  main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
}
