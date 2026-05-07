import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { isDashboardOwnerEmail } from '@/lib/dashboard-access';
import { ensureDefaultCategories } from '@/lib/skill-categories';
import { getFallbackSkillCategories } from '@/lib/category-presets';
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

// ===========================================
// GET /api/categories - 获取分类列表
// ===========================================
export async function GET(request: NextRequest) {
  const fallbackCategories = getFallbackSkillCategories();

  try {
    try {
      await ensureDefaultCategories();
    } catch (error) {
      console.error('初始化默认分类失败，继续返回现有分类:', error);
    }

    const includeInactive = request.nextUrl.searchParams.get('includeInactive') === '1';
    if (includeInactive) {
      const currentUser = await getCurrentUser();
      if (!currentUser) {
        return NextResponse.json(
          errorResponse('请先登录后查看分类管理数据', 'UNAUTHORIZED'),
          { status: 401 }
        );
      }
      if (!isDashboardOwnerEmail(currentUser.email)) {
        return NextResponse.json(
          errorResponse('仅管理员可查看全部分类', 'FORBIDDEN'),
          { status: 403 }
        );
      }
    }

    const categories = await prisma.skillCategory.findMany({
      where: includeInactive ? undefined : { status: 'active' },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        slug: true,
        name: true,
        icon: true,
        sortOrder: true,
        status: true,
        _count: {
          select: {
            skills: true,
          },
        },
      },
    });

    if (categories.length === 0) {
      return NextResponse.json(
        successResponse(fallbackCategories, '分类为空，已回退默认分类')
      );
    }

    return NextResponse.json(
      successResponse(
        categories.map((item) => ({
          id: item.id,
          slug: item.slug,
          name: item.name,
          icon: item.icon,
          sortOrder: item.sortOrder,
          status: item.status,
          skillCount: item._count.skills,
        }))
      )
    );
  } catch (error: any) {
    console.error('获取分类列表失败:', error);
    return NextResponse.json(
      successResponse(fallbackCategories, '分类服务暂时降级，已返回默认分类')
    );
  }
}

// ===========================================
// POST /api/categories - 新增分类（管理员）
// ===========================================
export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json(
        errorResponse('请先登录后再创建分类', 'UNAUTHORIZED'),
        { status: 401 }
      );
    }
    if (!isDashboardOwnerEmail(currentUser.email)) {
      return NextResponse.json(
        errorResponse('仅管理员可创建分类', 'FORBIDDEN'),
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const icon = toOptionalString(body?.icon);
    const slugInput = typeof body?.slug === 'string' ? body.slug : '';
    const sortOrderInput = Number(body?.sortOrder);

    if (!name) {
      return NextResponse.json(
        errorResponse('分类名称不能为空', 'VALIDATION_ERROR'),
        { status: 400 }
      );
    }
    if (name.length > 30) {
      return NextResponse.json(
        errorResponse('分类名称最多 30 个字符', 'VALIDATION_ERROR'),
        { status: 400 }
      );
    }

    const maxSortOrder = await prisma.skillCategory.aggregate({
      _max: {
        sortOrder: true,
      },
    });

    const category = await prisma.skillCategory.create({
      data: {
        name,
        slug: normalizeSlug(slugInput || name),
        icon,
        sortOrder:
          Number.isFinite(sortOrderInput) && sortOrderInput >= 0
            ? Math.floor(sortOrderInput)
            : (maxSortOrder._max.sortOrder || 0) + 10,
        status: 'active',
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

    return NextResponse.json(successResponse(category, '分类创建成功'), { status: 201 });
  } catch (error: any) {
    console.error('创建分类失败:', error);
    const isUniqueError = error?.code === 'P2002';
    return NextResponse.json(
      errorResponse(
        isUniqueError ? '分类名称或 slug 已存在' : '创建分类失败，请稍后重试',
        isUniqueError ? 'CONFLICT' : 'CATEGORY_CREATE_ERROR'
      ),
      { status: isUniqueError ? 409 : 500 }
    );
  }
}
