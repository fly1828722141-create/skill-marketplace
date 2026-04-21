import prisma from '@/lib/prisma';
import { DEFAULT_SKILL_CATEGORIES_PRESET } from '@/lib/category-presets';
import {
  CORE_DIGITAL_HUMAN_SLUG_SET,
  DEFAULT_DIGITAL_HUMAN_SLUG,
  DIGITAL_HUMAN_MIGRATION_EVENT,
} from '@/lib/digital-humans';

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

  const defaultCategory = syncedCategories.find(
    (item) => item.slug === DEFAULT_DIGITAL_HUMAN_SLUG
  );
  if (!defaultCategory) {
    return;
  }

  try {
    const migrated = await prisma.eventLog.findFirst({
      where: { eventName: DIGITAL_HUMAN_MIGRATION_EVENT },
      select: { id: true },
    });
    if (migrated) return;

    const coreCategoryIds = syncedCategories.map((item) => item.id);
    const legacyCategories = await prisma.skillCategory.findMany({
      where: {
        id: {
          notIn: coreCategoryIds,
        },
      },
      select: {
        id: true,
        slug: true,
      },
    });
    const legacyCategoryIds = legacyCategories.map((item) => item.id);

    const [legacySkillMigration, uncategorizedSkillMigration, legacyEventMigration] =
      await prisma.$transaction(async (tx) => {
        const updates = await Promise.all([
          legacyCategoryIds.length > 0
            ? tx.skill.updateMany({
                where: {
                  categoryId: {
                    in: legacyCategoryIds,
                  },
                },
                data: {
                  categoryId: defaultCategory.id,
                },
              })
            : Promise.resolve({ count: 0 }),
          tx.skill.updateMany({
            where: {
              categoryId: null,
            },
            data: {
              categoryId: defaultCategory.id,
            },
          }),
          legacyCategoryIds.length > 0
            ? tx.eventLog.updateMany({
                where: {
                  categoryId: {
                    in: legacyCategoryIds,
                  },
                },
                data: {
                  categoryId: defaultCategory.id,
                },
              })
            : Promise.resolve({ count: 0 }),
        ]);

        if (legacyCategoryIds.length > 0) {
          await tx.skillCategory.updateMany({
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

        await tx.eventLog.create({
          data: {
            eventName: DIGITAL_HUMAN_MIGRATION_EVENT,
            page: '/api/categories',
            module: 'category-system',
            action: 'legacy_to_default_human',
            categoryId: defaultCategory.id,
            metadata: {
              defaultHumanSlug: DEFAULT_DIGITAL_HUMAN_SLUG,
              coreHumanSlugs: [...CORE_DIGITAL_HUMAN_SLUG_SET],
              migratedLegacyCategoryCount: legacyCategoryIds.length,
              migratedSkillCount:
                updates[0].count + updates[1].count,
              migratedEventLogCount: updates[2].count,
            },
          },
        });

        return updates;
      });

    if (legacySkillMigration.count > 0 || uncategorizedSkillMigration.count > 0) {
      console.info(
        `数字人迁移完成：legacy=${legacySkillMigration.count}, uncategorized=${uncategorizedSkillMigration.count}, events=${legacyEventMigration.count}`
      );
    }
  } catch (error) {
    console.error('数字人迁移失败，但不影响分类查询:', error);
  }
}
