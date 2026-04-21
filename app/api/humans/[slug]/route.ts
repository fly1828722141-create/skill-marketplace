import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { ensureDefaultCategories } from '@/lib/skill-categories';
import { errorResponse, successResponse } from '@/lib/utils';
import { normalizeTagsFromDb } from '@/lib/tags';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  _: Request,
  { params }: { params: { slug: string } }
) {
  try {
    await ensureDefaultCategories();

    const slug = decodeURIComponent(params.slug || '').trim();
    if (!slug) {
      return NextResponse.json(
        errorResponse('数字人标识不能为空', 'VALIDATION_ERROR'),
        { status: 400 }
      );
    }

    const human = await prisma.skillCategory.findFirst({
      where: {
        status: 'active',
        OR: [{ slug }, { id: slug }],
      },
      select: {
        id: true,
        slug: true,
        name: true,
        icon: true,
        sortOrder: true,
      },
    });

    if (!human) {
      return NextResponse.json(
        errorResponse('数字人不存在', 'HUMAN_NOT_FOUND'),
        { status: 404 }
      );
    }

    const [skills, aggregate] = await Promise.all([
      prisma.skill.findMany({
        where: {
          status: 'active',
          categoryId: human.id,
        },
        orderBy: [{ downloadCount: 'desc' }, { viewCount: 'desc' }, { createdAt: 'desc' }],
        include: {
          author: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
              department: true,
            },
          },
          category: {
            select: {
              id: true,
              slug: true,
              name: true,
              icon: true,
            },
          },
          _count: {
            select: {
              comments: true,
            },
          },
        },
      }),
      prisma.skill.aggregate({
        where: {
          status: 'active',
          categoryId: human.id,
        },
        _sum: {
          downloadCount: true,
          viewCount: true,
        },
      }),
    ]);

    const normalizedSkills = skills.map((skill) => ({
      ...skill,
      tags: normalizeTagsFromDb(skill.tags),
    }));

    return NextResponse.json(
      successResponse({
        ...human,
        icon: human.icon || 'generic',
        skillCount: normalizedSkills.length,
        totalDownloads: aggregate._sum.downloadCount || 0,
        totalViews: aggregate._sum.viewCount || 0,
        skills: normalizedSkills,
      })
    );
  } catch (error: any) {
    console.error('获取数字人详情失败:', error);
    return NextResponse.json(
      errorResponse('获取数字人详情失败', 'HUMAN_DETAIL_FETCH_ERROR'),
      { status: 500 }
    );
  }
}

