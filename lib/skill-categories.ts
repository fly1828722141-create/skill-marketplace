import prisma from '@/lib/prisma';
import { DEFAULT_SKILL_CATEGORIES_PRESET } from '@/lib/category-presets';

export type DefaultSkillCategory = (typeof DEFAULT_SKILL_CATEGORIES_PRESET)[number];
export const DEFAULT_SKILL_CATEGORIES = DEFAULT_SKILL_CATEGORIES_PRESET;

export async function ensureDefaultCategories() {
  const syncedCategories = await Promise.all(
    DEFAULT_SKILL_CATEGORIES.map(async (category) => {
      const existingBySlug = await prisma.skillCategory.findUnique({
        where: { slug: category.slug },
      });

      if (existingBySlug) {
        return prisma.skillCategory.update({
          where: { id: existingBySlug.id },
          data: {
            name: category.name,
            icon: category.icon,
            sortOrder: category.sortOrder,
            status: 'active',
          },
        });
      }

      const existingByName = await prisma.skillCategory.findUnique({
        where: { name: category.name },
      });

      if (existingByName) {
        return prisma.skillCategory.update({
          where: { id: existingByName.id },
          data: {
            slug: category.slug,
            icon: category.icon,
            sortOrder: category.sortOrder,
            status: 'active',
          },
        });
      }

      return prisma.skillCategory.create({
        data: {
          slug: category.slug,
          name: category.name,
          icon: category.icon,
          sortOrder: category.sortOrder,
          status: 'active',
        },
      });
    })
  );

  const defaultSlugSet = new Set(DEFAULT_SKILL_CATEGORIES.map((item) => item.slug));
  const otherCategory = syncedCategories.find((item) => item.slug === 'others');

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

  try {
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
  } catch (error) {
    console.error('归并历史分类失败，但不影响分类查询:', error);
  }
}
