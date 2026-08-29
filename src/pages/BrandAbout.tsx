import { ArrowRight, CheckCircle2, Clock3, Compass, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import AppPage from '@/ui/AppPage';
import PageHeader from '@/ui/PageHeader';
import PageContentShell from '@/ui/PageContentShell';
import { ActionLink } from '@/ui/ActionButton';
import SurfaceSectionCard from '@/ui/SurfaceSectionCard';
import { APP_ROUTES } from '@/app/routePaths';
import SEO from '@/platform/SEO';
import '@/features/brand/BrandAboutRoute.css';
import {
  HOME_FAQ,
  HOME_LONG_DESCRIPTION,
  SITE_DESCRIPTION,
  SITE_KEYWORDS,
  SITE_NAME,
  SITE_SLOGAN,
} from '@/platform/brand';

const featureCards = [
  {
    title: '信息最多',
    description: '聚合新闻快讯、招聘求职、资源合作、本地服务等圈内分类信息。',
    icon: Compass,
  },
  {
    title: '更新最快',
    description: '以信息流方式呈现最新发布内容，帮助用户快速捕捉圈内正在发生的事。',
    icon: Clock3,
  },
  {
    title: '发布高效',
    description: '支持快速发布、互动反馈、标签聚合和广告推广，让有效信息更快被看见。',
    icon: Zap,
  },
  {
    title: '内容权威',
    description: '通过分类、标签、地点、互动和排序体系，让高价值信息更容易被识别。',
    icon: ShieldCheck,
  },
];

const categoryKeywords = [
  '新闻快讯',
  '招聘求职',
  '资源对接',
  '房屋租赁',
  '证件护照',
  '保关捞人',
  '本地服务',
  '圈内资源',
];

export default function BrandAbout() {
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'AboutPage',
      name: `关于${SITE_NAME}`,
      description: SITE_DESCRIPTION,
      inLanguage: 'zh-CN',
      mainEntity: {
        '@type': 'Organization',
        name: SITE_NAME,
        slogan: SITE_SLOGAN,
        description: SITE_DESCRIPTION,
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: HOME_FAQ.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: item.answer,
        },
      })),
    },
  ];

  return (
    <AppPage mobileAddressBarScroll className="brand-about-page">
      <SEO
        title={`关于${SITE_NAME}｜圈内最大的匿名社交分类信息网`}
        socialTitle={`${SITE_NAME}｜${SITE_SLOGAN}`}
        description={SITE_DESCRIPTION}
        keywords={`${SITE_KEYWORDS},关于推推,推推介绍,匿名社交,圈内分类信息网`}
        canonicalPath={APP_ROUTES.about}
        jsonLd={jsonLd}
      />
      <PageHeader title={`关于${SITE_NAME}`} titleAs="div" />

      <PageContentShell as="main" className="brand-about-main ui-app-page-main">
        <section className="brand-about-hero">
          <div className="brand-about-hero-inner">
            <div className="brand-about-hero-content">
              <div className="brand-about-eyebrow">
                <Sparkles className="brand-about-eyebrow-icon" />
                分类信息网
              </div>
              <h1 className="brand-about-title">
                推推 — 圈内最大的匿名社交分类信息网
              </h1>
              <p className="brand-about-copy">
                {HOME_LONG_DESCRIPTION}
              </p>
              <div className="brand-about-actions">
                <ActionLink
                  to={APP_ROUTES.home}
                  variant="primary"
                  className="brand-about-action"
                >
                  浏览最新信息
                  <ArrowRight className="brand-about-action-icon" />
                </ActionLink>
                <ActionLink
                  to={APP_ROUTES.create}
                  variant="muted"
                  className="brand-about-action"
                >
                  发布分类信息
                </ActionLink>
              </div>
            </div>
          </div>
        </section>

        <section className="brand-about-feature-grid">
          {featureCards.map((feature) => {
            const Icon = feature.icon;
            return (
              <SurfaceSectionCard
                key={feature.title}
                as="article"
                tone="solid"
                paddingClassName="brand-about-card-surface"
                className="brand-about-card"
              >
                <div className="brand-about-card-icon">
                  <Icon className="brand-about-card-icon-graphic" />
                </div>
                <h2 className="brand-about-card-title">{feature.title}</h2>
                <p className="brand-about-card-copy">{feature.description}</p>
              </SurfaceSectionCard>
            );
          })}
        </section>

        <section className="brand-about-section">
          <h2 className="brand-about-section-title">覆盖的信息类型</h2>
          <div className="brand-about-keyword-list">
            {categoryKeywords.map((item) => (
              <span key={item} className="brand-about-keyword">
                {item}
              </span>
            ))}
          </div>
        </section>

        <section className="brand-about-section">
          <h2 className="brand-about-section-title">为什么用推推</h2>
          <div className="brand-about-reason-list">
            {[
              '用分类、标签、地点和信息流降低查找成本。',
              '用点赞、浏览、分享等互动信号辅助识别价值。',
              '用 SEO/GEO 结构化能力，让高价值信息更容易被搜索和 AI 摘要理解。',
            ].map((item) => (
              <div key={item} className="brand-about-list-item">
                <CheckCircle2 className="brand-about-check" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="brand-about-section">
          <h2 className="brand-about-section-title">常见问题</h2>
          <div className="brand-about-faq-list">
            {HOME_FAQ.map((item) => (
              <div key={item.question} className="brand-about-faq-item">
                <h3 className="brand-about-faq-title">{item.question}</h3>
                <p className="brand-about-faq-copy">{item.answer}</p>
              </div>
            ))}
          </div>
        </section>
      </PageContentShell>
    </AppPage>
  );
}
