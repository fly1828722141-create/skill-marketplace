import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { isSuperAdminEmail } from '@/lib/dashboard-access';
import {
  CORE_DIGITAL_HUMAN_SLUG_SET,
  normalizeHumanIcon,
  normalizeHumanName,
  normalizeHumanSlug,
} from '@/lib/digital-humans';
import { ensureDefaultCategories } from '@/lib/skill-categories';
import { errorResponse, successResponse } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    await ensureDefaultCategories();

    const humans = await prisma.skillCategory.findMany({
      where: { status: 'active' },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        slug: true,
        name: true,
        icon: true,
        sortOrder: true,
      },
    });

    if (humans.length === 0) {
      return NextResponse.json(successResponse([]));
    }

    const humanIds = humans.map((human) => human.id);
    const [skillAggregate, rankedSkills] = await Promise.all([
      prisma.skill.groupBy({
        by: ['categoryId'],
        where: {
          status: 'active',
          categoryId: {
            in: humanIds,
          },
        },
        _count: {
          _all: true,
        },
        _sum: {
          downloadCount: true,
          viewCount: true,
        },
      }),
      prisma.skill.findMany({
        where: {
          status: 'active',
          categoryId: {
            in: humanIds,
          },
        },
        orderBy: [{ downloadCount: 'desc' }, { viewCount: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          title: true,
          categoryId: true,
          downloadCount: true,
          viewCount: true,
        },
      }),
    ]);

    const aggregateMap = new Map<
      string,
      { skillCount: number; totalDownloads: number; totalViews: number }
    >();
    skillAggregate.forEach((item) => {
      if (!item.categoryId) return;
      aggregateMap.set(item.categoryId, {
        skillCount: item._count._all,
        totalDownloads: item._sum.downloadCount || 0,
        totalViews: item._sum.viewCount || 0,
      });
    });

    const topSkillsMap = new Map<
      string,
      Array<{ id: string; title: string; downloadCount: number; viewCount: number }>
    >();
    rankedSkills.forEach((skill) => {
      if (!skill.categoryId) return;
      const existing = topSkillsMap.get(skill.categoryId) || [];
      if (existing.length >= 3) return;
      existing.push({
        id: skill.id,
        title: skill.title,
        downloadCount: skill.downloadCount,
        viewCount: skill.viewCount,
      });
      topSkillsMap.set(skill.categoryId, existing);
    });

    const payload = humans.map((human) => {
      const aggregate = aggregateMap.get(human.id);
      return {
        ...human,
        icon: human.icon || 'generic',
        skillCount: aggregate?.skillCount || 0,
        totalDownloads: aggregate?.totalDownloads || 0,
        totalViews: aggregate?.totalViews || 0,
        topSkills: topSkillsMap.get(human.id) || [],
      };
    });

    return NextResponse.json(successResponse(payload));
  } catch (error: any) {
    console.error('获取数字人列表失败:', error);
    return NextResponse.json(
      errorResponse('获取数字人列表失败', 'HUMANS_FETCH_ERROR'),
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json(
        errorResponse('请先登录后再创建数字人', 'UNAUTHORIZED'),
        { status: 401 }
      );
    }

    if (!isSuperAdminEmail(currentUser.email)) {
      return NextResponse.json(
        errorResponse('仅管理员可以创建数字人', 'FORBIDDEN'),
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const name = normalizeHumanName(typeof body?.name === 'string' ? body.name : '');
    const slug = normalizeHumanSlug(typeof body?.slug === 'string' ? body.slug : name);
    const icon = normalizeHumanIcon(typeof body?.icon === 'string' ? body.icon : null);

    if (name.length < 2 || name.length > 32) {
      return NextResponse.json(
        errorResponse('数字人名称需在 2-32 个字符内', 'VALIDATION_ERROR'),
        { status: 400 }
      );
    }

    if (slug.length < 2 || slug.length > 64) {
      return NextResponse.json(
        errorResponse('数字人标识需在 2-64 个字符内', 'VALIDATION_ERROR'),
        { status: 400 }
      );
    }

    if (CORE_DIGITAL_HUMAN_SLUG_SET.has(slug)) {
      return NextResponse.json(
        errorResponse('该数字人标识属于系统保留，请换一个标识', 'VALIDATION_ERROR'),
        { status: 400 }
      );
    }

    await ensureDefaultCategories();

    const existing = await prisma.skillCategory.findFirst({
      where: {
        OR: [{ slug }, { name }],
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (existing && existing.status === 'active') {
      return NextResponse.json(
        errorResponse('同名或同标识的数字人已存在', 'CONFLICT'),
        { status: 409 }
      );
    }

    const maxSortOrder = await prisma.skillCategory.aggregate({
      _max: { sortOrder: true },
    });

    const created = await prisma.skillCategory.create({
      data: {
        slug,
        name,
        icon,
        sortOrder: (maxSortOrder._max.sortOrder || 0) + 10,
        status: 'active',
      },
      select: {
        id: true,
        slug: true,
        name: true,
        icon: true,
        sortOrder: true,
      },
    });

    return NextResponse.json(
      successResponse(
        {
          ...created,
          skillCount: 0,
          totalDownloads: 0,
          totalViews: 0,
          topSkills: [],
        },
        '数字人创建成功'
      ),
      { status: 201 }
    );
  } catch (error: any) {
    console.error('创建数字人失败:', error);
    if (error?.code === 'P2002') {
      return NextResponse.json(
        errorResponse('同名或同标识的数字人已存在', 'CONFLICT'),
        { status: 409 }
      );
    }
    return NextResponse.json(
      errorResponse('创建数字人失败', 'HUMAN_CREATE_ERROR'),
      { status: 500 }
    );
  }
}

