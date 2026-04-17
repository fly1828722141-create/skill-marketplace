import prisma from '@/lib/prisma';

export interface DefaultSkillCategory {
  slug: string;
  name: string;
  icon: string;
  sortOrder: number;
}

export const DEFAULT_SKILL_CATEGORIES: DefaultSkillCategory[] = [
  { slug: 'productivity-automation', name: '办公效率与自动化', icon: 'office', sortOrder: 10 },
  { slug: 'dev-engineering', name: '开发与编程', icon: 'dev', sortOrder: 20 },
  { slug: 'data-analytics', name: '数据分析与研究', icon: 'data', sortOrder: 30 },
  { slug: 'content-writing-translation', name: '内容写作与营销', icon: 'content', sortOrder: 40 },
  { slug: 'design-media', name: '设计与多媒体', icon: 'image', sortOrder: 50 },
  { slug: 'operations-support', name: '客服与销售运营', icon: 'biz', sortOrder: 60 },
  { slug: 'others', name: '其他', icon: 'generic', sortOrder: 70 },
];

export async function ensureDefaultCategories() {
  const upserted = await Promise.all(
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

  const defaultSlugSet = new Set(DEFAULT_SKILL_CATEGORIES.map((item) => item.slug));
  const otherCategory = upserted.find((item) => item.slug === 'others');

  const legacyCategories = await prisma.skillCategory.findMany({
    where: {
      status: 'active',
      slug: {
        notIn: [...defaultSlugSet],
      },
    },
    select: {
      id: true,
    },
  });

  if (legacyCategories.length === 0 || !otherCategory) {
    return;
  }

  const legacyCategoryIds = legacyCategories.map((item) => item.id);

  await prisma.skill.updateMany({
    where: {
      categoryId: {
        in: legacyCategoryIds,
      },
    },
    data: {
      categoryId: otherCategory.id,
    },
  });

  await prisma.eventLog.updateMany({
    where: {
      categoryId: {
        in: legacyCategoryIds,
      },
    },
    data: {
      categoryId: otherCategory.id,
    },
  });

  await prisma.skillCategory.updateMany({
    where: {
      id: {
        in: legacyCategoryIds,
      },
    },
    data: {
      status: 'inactive',
    },
  });
}
