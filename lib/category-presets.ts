import type { SkillCategory } from '@/types';

export interface CategoryPreset {
  slug: string;
  name: string;
  icon: string;
  sortOrder: number;
}

export const DEFAULT_SKILL_CATEGORIES_PRESET: CategoryPreset[] = [
  { slug: 'development-coding', name: '开发工具与编程', icon: 'dev', sortOrder: 10 },
  { slug: 'data-processing-analytics', name: '数据处理与分析', icon: 'data', sortOrder: 20 },
  { slug: 'documents-productivity', name: '文档与办公', icon: 'office', sortOrder: 30 },
  { slug: 'browser-web', name: '浏览器与网络', icon: 'biz', sortOrder: 40 },
  { slug: 'system-files', name: '系统与文件', icon: 'dev', sortOrder: 50 },
  { slug: 'communication-collaboration', name: '通信与协作', icon: 'content', sortOrder: 60 },
  { slug: 'search-knowledge', name: '搜索与知识', icon: 'data', sortOrder: 70 },
  { slug: 'media-creativity', name: '多媒体与创意', icon: 'image', sortOrder: 80 },
  { slug: 'third-party-integrations', name: '第三方服务集成', icon: 'biz', sortOrder: 90 },
  { slug: 'ai-enhancement-automation', name: 'AI 增强与自动化', icon: 'office', sortOrder: 100 },
  { slug: 'others', name: '其他', icon: 'generic', sortOrder: 110 },
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
