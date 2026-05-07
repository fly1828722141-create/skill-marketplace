import prisma from '@/lib/prisma';
import { DEFAULT_SKILL_CATEGORIES_PRESET } from '@/lib/category-presets';

export type DefaultSkillCategory = (typeof DEFAULT_SKILL_CATEGORIES_PRESET)[number];
export const DEFAULT_SKILL_CATEGORIES = DEFAULT_SKILL_CATEGORIES_PRESET;

export async function ensureDefaultCategories() {
  // 仅在空库时初始化默认分类，避免覆盖管理员已维护的分类体系。
  const existingCount = await prisma.skillCategory.count();
  if (existingCount > 0) {
    return;
  }

  await Promise.all(
    DEFAULT_SKILL_CATEGORIES.map((category) =>
      prisma.skillCategory.create({
        data: {
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
