import type { SkillCategory } from '@/types';

export interface CategoryPreset {
  slug: string;
  name: string;
  icon: string;
  sortOrder: number;
}

export const DEFAULT_SKILL_CATEGORIES_PRESET: CategoryPreset[] = [
  { slug: 'productivity-automation', name: '办公效率与自动化', icon: 'office', sortOrder: 10 },
  { slug: 'dev-engineering', name: '开发与编程', icon: 'dev', sortOrder: 20 },
  { slug: 'data-analytics', name: '数据分析与研究', icon: 'data', sortOrder: 30 },
  { slug: 'content-writing-translation', name: '内容写作与营销', icon: 'content', sortOrder: 40 },
  { slug: 'design-media', name: '设计与多媒体', icon: 'image', sortOrder: 50 },
  { slug: 'operations-support', name: '客服与销售运营', icon: 'biz', sortOrder: 60 },
  { slug: 'others', name: '其他', icon: 'generic', sortOrder: 70 },
];

export function getFallbackSkillCategories(): SkillCategory[] {
  return DEFAULT_SKILL_CATEGORIES_PRESET.map((item) => ({
    id: item.slug,
    slug: item.slug,
    name: item.name,
    icon: item.icon,
    sortOrder: item.sortOrder,
  }));
}
