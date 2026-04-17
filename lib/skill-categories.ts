import prisma from '@/lib/prisma';

export interface DefaultSkillCategory {
  slug: string;
  name: string;
  icon: string;
  sortOrder: number;
}

export const DEFAULT_SKILL_CATEGORIES: DefaultSkillCategory[] = [
  { slug: 'productivity-automation', name: '办公效率与自动化', icon: 'office', sortOrder: 10 },
  { slug: 'data-analytics', name: '数据分析与 BI', icon: 'data', sortOrder: 20 },
  { slug: 'dev-engineering', name: '开发工具与工程', icon: 'dev', sortOrder: 30 },
  { slug: 'content-writing-translation', name: '内容写作与翻译', icon: 'content', sortOrder: 40 },
  { slug: 'design-media', name: '设计与多媒体', icon: 'image', sortOrder: 50 },
  { slug: 'marketing-growth', name: '营销与增长', icon: 'biz', sortOrder: 60 },
  { slug: 'operations-support', name: '运营与客服', icon: 'biz', sortOrder: 70 },
  { slug: 'sales-crm', name: '销售与 CRM', icon: 'biz', sortOrder: 80 },
  { slug: 'education-knowledge', name: '教育与知识管理', icon: 'education', sortOrder: 90 },
  { slug: 'ai-models-multimodal', name: 'AI 模型与多模态', icon: 'ai', sortOrder: 100 },
  { slug: 'industry-scenarios', name: '行业场景解决方案', icon: 'biz', sortOrder: 110 },
  { slug: 'workflow-templates', name: '工作流模板与编排', icon: 'office', sortOrder: 120 },
];

export async function ensureDefaultCategories() {
  await Promise.all(
    DEFAULT_SKILL_CATEGORIES.map((category) =>
      prisma.skillCategory.upsert({
        where: { slug: category.slug },
        update: {
          name: category.name,
          icon: category.icon,
          sortOrder: category.sortOrder,
          status: 'active',
        },
        create: {
          slug: category.slug,
          name: category.name,
          icon: category.icon,
          sortOrder: category.sortOrder,
          status: 'active',
        },
      })
    )
  );
}
