export const SITE_NAME = '推推';
export const SITE_ALTERNATE_NAME = 'TuiTui';
export const SITE_DISPLAY_NAME = SITE_ALTERNATE_NAME;
export const SITE_SLOGAN = '圈内新鲜事 · 匿名发推推';
export const SITE_TITLE =
  '推推｜匿名社交分类信息网：二手交易、新闻快讯、招聘求职、资源合作、房屋租赁、证件护照、保关捞人';
export const SITE_SEO_TITLE =
  '推推｜圈内最大的匿名社交分类信息网_二手交易_新闻快讯_招聘求职_资源合作_房屋租赁_证件护照_保关捞人';
export const SITE_DESCRIPTION =
  '推推是最大的匿名社交分类信息网，聚合二手交易、新闻快讯、招聘求职、资源对接、房屋租赁、证件护照、保关捞人等高质量内容，让用户更快找到有价值的信息机会和本地服务。';
export const SITE_KEYWORDS =
  '推推,匿名社交,分类信息网,分类信息平台,圈内信息,圈内分类信息,二手交易,新闻快讯,招聘求职,资源合作,圈内资源,本地服务,房屋租赁,证件护照,保关捞人,信息发布,信息聚合,最全分类信息,更新最快,内容权威';

export const HOME_LONG_DESCRIPTION =
  '推推是圈内最大的匿名社交分类信息网。用户可以在平台上发现二手交易、资讯快讯、招聘求职、资源对接、房屋租赁、证件护照、保关捞人等高价值内容，快速发布、高效展示和高效对接，减少信息噪音，让真实有效信息更快触达目标人群。';

export const HOME_FAQ = [
  {
    question: '推推是什么？',
    answer:
      '推推是匿名社交分类信息网，覆盖新闻快讯、招聘求职、资源对接、房屋租赁、证件护照、保关捞人等信息。',
  },
  {
    question: '推推有什么特点？',
    answer:
      '推推强调匿名可信、更新及时、发布高效。我们致力于减少信息噪音，让真实有效信息更快触达目标人群。',
  },
  {
    question: '我可以在推推上做什么？',
    answer:
      '您可以在推推上免费发布和浏览各类信息，包括但不限于招聘求职、资源对接、本地服务等。平台提供快速发布、精准触达和高效对接的功能。',
  },
  {
    question: '在推推上发布信息是免费的吗？',
    answer: '是的，在推推上发布和浏览基础信息是完全免费的。我们致力于为用户提供一个开放、便捷的信息共享平台。',
  },
  {
    question: '如何保证信息的真实性？',
    answer:
      '我们鼓励用户发布真实有效的信息，并通过社区监督和内容审核等多种方式来维护信息的质量。用户可以对信息进行反馈，帮助我们共同营造一个可信的环境。',
  },
];

export function buildCategorySeo(name: string) {
  return {
    title: `${name} | ${SITE_NAME}`,
    description: `最新${name}相关信息，尽在${SITE_NAME}匿名社交分类信息网。`,
  };
}

export function buildPostSeo(content: string) {
  const truncatedContent = content.length > 50 ? `${content.substring(0, 50)}...` : content;
  return {
    title: `${truncatedContent} | ${SITE_NAME}`,
    description: `查看关于“${truncatedContent}”的更多信息，尽在${SITE_NAME}匿名社交分类信息网。`,
  };
}
