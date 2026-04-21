import type { SkillCategory } from '@/types';

export interface CategoryPreset {
  slug: string;
  name: string;
  icon: string;
  sortOrder: number;
}

export const DEFAULT_SKILL_CATEGORIES_PRESET: CategoryPreset[] = [
  { slug: 'data-analysis-expert', name: '数据分析专家', icon: 'data', sortOrder: 10 },
  { slug: 'short-video-expert', name: '短视频专家', icon: 'video', sortOrder: 20 },
  { slug: 'programming-dev-expert', name: '编程开发专家', icon: 'dev', sortOrder: 30 },
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
