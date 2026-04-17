import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { errorResponse, successResponse } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const [totalSkills, totalUsers, skillAggregate, latestSkills] =
      await Promise.all([
        prisma.skill.count({
          where: { status: 'active' },
        }),
        prisma.user.count(),
        prisma.skill.aggregate({
          _sum: {
            downloadCount: true,
            viewCount: true,
          },
        }),
        prisma.skill.findMany({
          where: { status: 'active' },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            title: true,
            createdAt: true,
            downloadCount: true,
            viewCount: true,
          },
        }),
      ]);

    return NextResponse.json(
      successResponse({
        totalSkills,
        totalUsers,
        totalDownloads: skillAggregate._sum.downloadCount || 0,
        totalViews: skillAggregate._sum.viewCount || 0,
        latestSkills,
        updatedAt: new Date(),
      })
    );
  } catch (error: any) {
    console.error('获取站点统计失败:', error);
    return NextResponse.json(
      errorResponse('获取站点统计失败', 'OVERVIEW_FETCH_ERROR'),
      { status: 500 }
    );
  }
}
