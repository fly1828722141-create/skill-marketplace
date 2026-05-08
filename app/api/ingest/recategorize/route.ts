import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_SKILL_CATEGORIES_PRESET } from '@/lib/category-presets';
import { requireAdminIngestActor } from '@/lib/ingest-auth';
import prisma from '@/lib/prisma';
import { resolveCategoryIdByContent } from '@/lib/skill-ingest';
import { errorResponse, successResponse } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const LEGACY_CATEGORY_SLUGS = [
  'productivity-automation',
  'dev-engineering',
  'data-analytics',
  'content-writing-translation',
  'design-media',
  'operations-support',
];

const UPDATE_CHUNK_SIZE = 100;

interface RecategorizeRequestBody {
  includeCandidates?: boolean;
  deactivateLegacy?: boolean;
}

interface ActiveCategory {
  id: string;
  slug: string;
  name: string;
}

function sanitizeBoolean(value: unknown, defaultValue: boolean): boolean {
  if (typeof value === 'boolean') return value;
  return defaultValue;
}

function buildUpdateChunks<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function ensureTaxonomyCategories(options: { deactivateLegacy: boolean }) {
  const existing = await prisma.skillCategory.findMany({
    select: {
      id: true,
      slug: true,
      name: true,
      icon: true,
      sortOrder: true,
      status: true,
    },
  });

  const slugMap = new Map(existing.map((item) => [item.slug, item]));
  const nameMap = new Map(existing.map((item) => [item.name, item]));

  let created = 0;
  let updated = 0;

  for (const preset of DEFAULT_SKILL_CATEGORIES_PRESET) {
    const matchedBySlug = slugMap.get(preset.slug);
    if (matchedBySlug) {
      const updateData: Record<string, unknown> = {};

      if (matchedBySlug.status !== 'active') {
        updateData.status = 'active';
      }
      if ((matchedBySlug.icon || '') !== preset.icon) {
        updateData.icon = preset.icon;
      }
      if (matchedBySlug.sortOrder !== preset.sortOrder) {
        updateData.sortOrder = preset.sortOrder;
      }

      const nameConflict = nameMap.get(preset.name);
      if ((!nameConflict || nameConflict.id === matchedBySlug.id) && matchedBySlug.name !== preset.name) {
        updateData.name = preset.name;
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.skillCategory.update({
          where: { id: matchedBySlug.id },
          data: updateData,
        });
        updated += 1;
      }
      continue;
    }

    const matchedByName = nameMap.get(preset.name);
    if (matchedByName) {
      const updateData: Record<string, unknown> = {};

      if (!slugMap.has(preset.slug)) {
        updateData.slug = preset.slug;
      }
      if (matchedByName.status !== 'active') {
        updateData.status = 'active';
      }
      if ((matchedByName.icon || '') !== preset.icon) {
        updateData.icon = preset.icon;
      }
      if (matchedByName.sortOrder !== preset.sortOrder) {
        updateData.sortOrder = preset.sortOrder;
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.skillCategory.update({
          where: { id: matchedByName.id },
          data: updateData,
        });
        updated += 1;
      }
      continue;
    }

    await prisma.skillCategory.create({
      data: {
        slug: preset.slug,
        name: preset.name,
        icon: preset.icon,
        sortOrder: preset.sortOrder,
        status: 'active',
      },
    });
    created += 1;
  }

  let deactivatedLegacy = 0;
  if (options.deactivateLegacy) {
    const result = await prisma.skillCategory.updateMany({
      where: {
        slug: {
          in: LEGACY_CATEGORY_SLUGS,
        },
      },
      data: {
        status: 'inactive',
      },
    });
    deactivatedLegacy = result.count;
  }

  const activeCategories = await prisma.skillCategory.findMany({
    where: { status: 'active' },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      slug: true,
      name: true,
    },
  });

  return {
    activeCategories,
    created,
    updated,
    deactivatedLegacy,
  };
}

async function recategorizeSkills(categories: ActiveCategory[]) {
  const skills = await prisma.skill.findMany({
    where: {
      status: {
        in: ['active', 'archived'],
      },
    },
    select: {
      id: true,
      title: true,
      summary: true,
      description: true,
      tags: true,
      categoryId: true,
    },
  });

  let unchanged = 0;
  let skipped = 0;
  const updates: Array<{ id: string; categoryId: string }> = [];

  for (const skill of skills) {
    const nextCategoryId = resolveCategoryIdByContent({
      categories,
      title: skill.title,
      summary: skill.summary || '',
      description: skill.description || '',
      tags: skill.tags || [],
    });

    if (!nextCategoryId) {
      skipped += 1;
      continue;
    }

    if (skill.categoryId === nextCategoryId) {
      unchanged += 1;
      continue;
    }

    updates.push({
      id: skill.id,
      categoryId: nextCategoryId,
    });
  }

  const chunks = buildUpdateChunks(updates, UPDATE_CHUNK_SIZE);
  for (const chunk of chunks) {
    await prisma.$transaction(
      chunk.map((item) =>
        prisma.skill.update({
          where: { id: item.id },
          data: {
            categoryId: item.categoryId,
          },
        })
      )
    );
  }

  return {
    scanned: skills.length,
    recategorized: updates.length,
    unchanged,
    skipped,
  };
}

async function recategorizeCandidates(categories: ActiveCategory[]) {
  const candidates = await prisma.ingestCandidate.findMany({
    select: {
      id: true,
      title: true,
      summary: true,
      description: true,
      tags: true,
      categoryId: true,
    },
  });

  let unchanged = 0;
  let skipped = 0;
  const updates: Array<{ id: string; categoryId: string }> = [];

  for (const candidate of candidates) {
    const nextCategoryId = resolveCategoryIdByContent({
      categories,
      title: candidate.title,
      summary: candidate.summary || '',
      description: candidate.description || '',
      tags: candidate.tags || [],
    });

    if (!nextCategoryId) {
      skipped += 1;
      continue;
    }

    if (candidate.categoryId === nextCategoryId) {
      unchanged += 1;
      continue;
    }

    updates.push({
      id: candidate.id,
      categoryId: nextCategoryId,
    });
  }

  const chunks = buildUpdateChunks(updates, UPDATE_CHUNK_SIZE);
  for (const chunk of chunks) {
    await prisma.$transaction(
      chunk.map((item) =>
        prisma.ingestCandidate.update({
          where: { id: item.id },
          data: {
            categoryId: item.categoryId,
          },
        })
      )
    );
  }

  return {
    scanned: candidates.length,
    recategorized: updates.length,
    unchanged,
    skipped,
  };
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAdminIngestActor(request);
    if (!actor) {
      return NextResponse.json(
        errorResponse('仅管理员可执行批量重分类', 'FORBIDDEN'),
        { status: 403 }
      );
    }

    const body: RecategorizeRequestBody = await request.json().catch(() => ({}));
    const includeCandidates = sanitizeBoolean(body.includeCandidates, true);
    const deactivateLegacy = sanitizeBoolean(body.deactivateLegacy, true);

    const taxonomy = await ensureTaxonomyCategories({
      deactivateLegacy,
    });

    const skillResult = await recategorizeSkills(taxonomy.activeCategories);
    const candidateResult = includeCandidates
      ? await recategorizeCandidates(taxonomy.activeCategories)
      : null;

    return NextResponse.json(
      successResponse({
        trigger: {
          triggerType: actor.triggerType,
          triggerLabel: actor.triggerLabel,
          userId: actor.userId || null,
        },
        taxonomy: {
          activeCategoryCount: taxonomy.activeCategories.length,
          created: taxonomy.created,
          updated: taxonomy.updated,
          deactivatedLegacy: taxonomy.deactivatedLegacy,
        },
        skills: skillResult,
        candidates: candidateResult,
      })
    );
  } catch (error: any) {
    return NextResponse.json(
      errorResponse(error?.message || '批量重分类失败', 'INGEST_RECATEGORIZE_ERROR'),
      { status: 500 }
    );
  }
}
