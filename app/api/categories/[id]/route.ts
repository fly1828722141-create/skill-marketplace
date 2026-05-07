import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { isDashboardOwnerEmail } from '@/lib/dashboard-access';
import { successResponse, errorResponse } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function normalizeSlug(input: string): string {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || `category-${Date.now().toString(36)}`;
}

function toOptionalString(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  return trimmed ? trimmed : null;
}

async function requireAdminUser() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return {
      error: NextResponse.json(
        errorResponse('请先登录后再管理分类', 'UNAUTHORIZED'),
        { status: 401 }
      ),
      user: null,
    };
  }

  if (!isDashboardOwnerEmail(currentUser.email)) {
    return {
      error: NextResponse.json(
        errorResponse('仅管理员可管理分类', 'FORBIDDEN'),
        { status: 403 }
      ),
      user: null,
    };
  }

  return {
    error: null,
    user: currentUser,
  };
}

// ===========================================
// PATCH /api/categories/[id] - 修改分类（管理员）
// ===========================================
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await requireAdminUser();
    if (authResult.error) return authResult.error;

    const categoryId = params.id;
    const existingCategory = await prisma.skillCategory.findUnique({
      where: { id: categoryId },
      select: {
        id: true,
      },
    });
    if (!existingCategory) {
      return NextResponse.json(
        errorResponse('分类不存在', 'CATEGORY_NOT_FOUND'),
        { status: 404 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const nextName =
      typeof body?.name === 'string' ? body.name.trim() : undefined;
    const nextSlugRaw =
      typeof body?.slug === 'string' ? body.slug.trim() : undefined;
    const nextSlug =
      nextSlugRaw !== undefined && nextSlugRaw
        ? normalizeSlug(nextSlugRaw)
        : undefined;
    const nextIcon =
      body?.icon === undefined ? undefined : toOptionalString(body.icon);
    const nextSortOrderRaw = Number(body?.sortOrder);
    const nextStatus =
      typeof body?.status === 'string' ? body.status.trim().toLowerCase() : undefined;

    if (nextName !== undefined && !nextName) {
      return NextResponse.json(
        errorResponse('分类名称不能为空', 'VALIDATION_ERROR'),
        { status: 400 }
      );
    }
    if (nextName && nextName.length > 30) {
      return NextResponse.json(
        errorResponse('分类名称最多 30 个字符', 'VALIDATION_ERROR'),
        { status: 400 }
      );
    }
    if (nextSlugRaw !== undefined && !nextSlugRaw) {
      return NextResponse.json(
        errorResponse('slug 不能为空', 'VALIDATION_ERROR'),
        { status: 400 }
      );
    }
    if (
      nextSortOrderRaw !== undefined &&
      body?.sortOrder !== undefined &&
      (!Number.isFinite(nextSortOrderRaw) || nextSortOrderRaw < 0)
    ) {
      return NextResponse.json(
        errorResponse('排序值必须是大于等于 0 的数字', 'VALIDATION_ERROR'),
        { status: 400 }
      );
    }
    if (
      nextStatus !== undefined &&
      nextStatus !== 'active' &&
      nextStatus !== 'inactive'
    ) {
      return NextResponse.json(
        errorResponse('分类状态仅支持 active/inactive', 'VALIDATION_ERROR'),
        { status: 400 }
      );
    }

    const updatedCategory = await prisma.skillCategory.update({
      where: { id: categoryId },
      data: {
        ...(nextName !== undefined ? { name: nextName } : {}),
        ...(nextSlug !== undefined ? { slug: nextSlug } : {}),
        ...(nextIcon !== undefined ? { icon: nextIcon } : {}),
        ...(body?.sortOrder !== undefined
          ? { sortOrder: Math.floor(nextSortOrderRaw) }
          : {}),
        ...(nextStatus !== undefined ? { status: nextStatus } : {}),
      },
      select: {
        id: true,
        slug: true,
        name: true,
        icon: true,
        sortOrder: true,
        status: true,
      },
    });

    return NextResponse.json(successResponse(updatedCategory, '分类更新成功'));
  } catch (error: any) {
    console.error('更新分类失败:', error);
    const isUniqueError = error?.code === 'P2002';
    return NextResponse.json(
      errorResponse(
        isUniqueError ? '分类名称或 slug 已存在' : '更新分类失败，请稍后重试',
        isUniqueError ? 'CONFLICT' : 'CATEGORY_UPDATE_ERROR'
      ),
      { status: isUniqueError ? 409 : 500 }
    );
  }
}

// ===========================================
// DELETE /api/categories/[id] - 删除分类（管理员）
// 规则：软删除为 inactive；如存在 Skill，需提供 targetCategoryId 完成迁移
// ===========================================
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await requireAdminUser();
    if (authResult.error) return authResult.error;

    const categoryId = params.id;
    const targetCategoryId = request.nextUrl.searchParams.get('targetCategoryId') || '';

    const category = await prisma.skillCategory.findUnique({
      where: { id: categoryId },
      select: {
        id: true,
        name: true,
        status: true,
      },
    });
    if (!category) {
      return NextResponse.json(
        errorResponse('分类不存在', 'CATEGORY_NOT_FOUND'),
        { status: 404 }
      );
    }

    const activeCategoryCount = await prisma.skillCategory.count({
      where: { status: 'active' },
    });
    if (category.status === 'active' && activeCategoryCount <= 1) {
      return NextResponse.json(
        errorResponse('至少保留一个启用分类，当前分类不可删除', 'VALIDATION_ERROR'),
        { status: 400 }
      );
    }

    const skillCount = await prisma.skill.count({
      where: { categoryId },
    });

    let resolvedTargetCategoryId = '';
    if (skillCount > 0) {
      if (!targetCategoryId) {
        return NextResponse.json(
          errorResponse('该分类下存在 Skill，请先选择迁移目标分类', 'TARGET_REQUIRED'),
          { status: 400 }
        );
      }
      if (targetCategoryId === categoryId) {
        return NextResponse.json(
          errorResponse('迁移目标分类不能与当前分类相同', 'VALIDATION_ERROR'),
          { status: 400 }
        );
      }

      const targetCategory = await prisma.skillCategory.findUnique({
        where: { id: targetCategoryId },
        select: {
          id: true,
          status: true,
        },
      });
      if (!targetCategory || targetCategory.status !== 'active') {
        return NextResponse.json(
          errorResponse('迁移目标分类不存在或未启用', 'TARGET_CATEGORY_INVALID'),
          { status: 400 }
        );
      }
      resolvedTargetCategoryId = targetCategory.id;
    }

    await prisma.$transaction(async (tx) => {
      if (skillCount > 0 && resolvedTargetCategoryId) {
        await tx.skill.updateMany({
          where: { categoryId },
          data: { categoryId: resolvedTargetCategoryId },
        });

        await tx.eventLog.updateMany({
          where: { categoryId },
          data: { categoryId: resolvedTargetCategoryId },
        });
      }

      await tx.skillCategory.update({
        where: { id: categoryId },
        data: { status: 'inactive' },
      });
    });

    return NextResponse.json(
      successResponse(
        {
          deletedCategoryId: categoryId,
          movedSkillCount: skillCount,
          targetCategoryId: resolvedTargetCategoryId || undefined,
        },
        skillCount > 0
          ? `分类已删除，已迁移 ${skillCount} 个 Skill`
          : '分类已删除'
      )
    );
  } catch (error: any) {
    console.error('删除分类失败:', error);
    return NextResponse.json(
      errorResponse('删除分类失败，请稍后重试', 'CATEGORY_DELETE_ERROR'),
      { status: 500 }
    );
  }
}
