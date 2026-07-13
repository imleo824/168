import { useMemo } from 'react';
import SEO from '@/platform/SEO';
import {
  HOME_FAQ,
  SITE_ALTERNATE_NAME,
  SITE_DESCRIPTION,
  SITE_KEYWORDS,
  SITE_NAME,
  SITE_SEO_TITLE,
  SITE_TITLE,
  buildCategorySeo,
} from '@/platform/brand';
import type { Category } from '@/types';

interface HomeSeoProps {
  activeMainTab: string;
  validDiscoverCategoryId: string;
  categories: Category[];
}

export function HomeSeo({
  activeMainTab,
  validDiscoverCategoryId,
  categories,
}: HomeSeoProps) {
  const pageTitle = useMemo(() => {
    if (activeMainTab !== 'discover' || validDiscoverCategoryId === 'all') {
      return SITE_TITLE;
    }

    const category = categories.find((item) => item.id === validDiscoverCategoryId);
    return category ? buildCategorySeo(category.name).title : SITE_TITLE;
  }, [activeMainTab, validDiscoverCategoryId, categories]);

  const jsonLd = useMemo(() => {
    const origin = typeof window === 'undefined' ? '' : window.location.origin;

    return [
      {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: SITE_NAME,
        alternateName: SITE_ALTERNATE_NAME,
        url: origin || undefined,
        description: SITE_DESCRIPTION,
        keywords: SITE_KEYWORDS,
        inLanguage: 'zh-CN',
        potentialAction: {
          '@type': 'SearchAction',
          target: origin ? `${origin}/category/search?view=location&q={search_term_string}` : undefined,
          'query-input': 'required name=search_term_string',
        },
        about: [
          '分类信息网',
          '圈内分类信息',
          '新闻快讯',
          '招聘求职',
          '资源对接',
          '房屋租赁',
          '证件护照',
          '保关捞人',
        ].map((name) => ({ '@type': 'Thing', name })),
        audience: { '@type': 'Audience', audienceType: '分类信息用户' },
        areaServed: 'Global',
      },
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: HOME_FAQ.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: { '@type': 'Answer', text: item.answer },
        })),
      },
      {
        '@context': 'https://schema.org',
        '@type': 'SiteNavigationElement',
        name: '首页',
        url: origin || undefined,
        position: 1,
      },
      {
        '@context': 'https://schema.org',
        '@type': 'SiteNavigationElement',
        name: '发布信息',
        url: origin ? `${origin}/create` : undefined,
        position: 2,
      },
      {
        '@context': 'https://schema.org',
        '@type': 'SiteNavigationElement',
        name: '分类',
        url: origin ? `${origin}/category` : undefined,
        position: 3,
      },
      categories.slice(0, 24).length > 0 && {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        itemListElement: categories.slice(0, 24).map((category, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: category.name,
          url: origin ? `${origin}/category/${encodeURIComponent(category.id)}` : undefined,
        })),
      },
    ].filter(Boolean);
  }, [categories]);

  return (
    <SEO
      title={pageTitle}
      socialTitle={SITE_SEO_TITLE}
      description={SITE_DESCRIPTION}
      keywords={SITE_KEYWORDS}
      canonicalPath="/"
      jsonLd={jsonLd}
    />
  );
}
