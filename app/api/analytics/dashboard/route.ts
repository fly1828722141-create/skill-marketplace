import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { isDashboardOwnerEmail } from '@/lib/dashboard-access';
import { errorResponse, successResponse } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function toDateKey(input: Date) {
  return input.toISOString().slice(0, 10);
}

function buildDateKeys(startAt: Date, endAt: Date): string[] {
  const keys: string[] = [];
  const cursor = new Date(startAt);
  const final = new Date(endAt);

  cursor.setHours(0, 0, 0, 0);
  final.setHours(0, 0, 0, 0);

  while (cursor.getTime() <= final.getTime()) {
    keys.push(toDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return keys;
}

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json(
        errorResponse('请先登录后查看看板', 'UNAUTHORIZED'),
        { status: 401 }
      );
    }

    if (!isDashboardOwnerEmail(currentUser.email)) {
      return NextResponse.json(
        errorResponse('无权限访问数据看板', 'FORBIDDEN'),
        { status: 403 }
      );
    }

    const daysInput = Number(request.nextUrl.searchParams.get('days') || 7);
    const days = Number.isFinite(daysInput)
      ? Math.min(90, Math.max(1, Math.floor(daysInput)))
      : 7;

    const startAt = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const endAt = new Date();

    const [totalSkills, totalUsers, totalHumans, skillStats, topSkills, humanSkillRaw] =
      await Promise.all([
        prisma.skill.count({ where: { status: 'active' } }),
        prisma.user.count(),
        prisma.skillCategory.count({ where: { status: 'active' } }),
        prisma.skill.aggregate({
          _sum: {
            downloadCount: true,
            viewCount: true,
          },
        }),
        prisma.skill.findMany({
          where: { status: 'active' },
          orderBy: { downloadCount: 'desc' },
          take: 5,
          select: {
            id: true,
            title: true,
            downloadCount: true,
            viewCount: true,
            category: {
              select: {
                id: true,
                slug: true,
                name: true,
              },
            },
          },
        }),
        prisma.skill.groupBy({
          by: ['categoryId'],
          where: {
            status: 'active',
            categoryId: {
              not: null,
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
      ]);

    let totalEvents = 0;
    let pageViews = 0;
    let loginEvents = 0;
    let downloadClicks = 0;
    let uploadEvents = 0;
    let reviewSubmitEvents = 0;
    let reviewLikeEvents = 0;
    let visitorsRaw: Array<{
      userId: string | null;
      anonymousId: string | null;
      sessionId: string | null;
    }> = [];
    let eventTopRaw: Array<{ eventName: string; _count: { _all: number } }> = [];
    let moduleTopRaw: Array<{ module: string | null; _count: { _all: number } }> = [];
    let humanClickTopRaw: Array<{ categoryId: string | null; _count: { _all: number } }> = [];
    let trendRaw: Array<{ createdAt: Date; eventName: string }> = [];
    let humanClickTrendRaw: Array<{ createdAt: Date; categoryId: string | null }> = [];
    let activeUsersRaw: Array<{ userId: string | null; _count: { _all: number } }> = [];

    try {
      [
        totalEvents,
        pageViews,
        loginEvents,
        downloadClicks,
        uploadEvents,
        reviewSubmitEvents,
        reviewLikeEvents,
        visitorsRaw,
        eventTopRaw,
        moduleTopRaw,
        humanClickTopRaw,
        trendRaw,
        humanClickTrendRaw,
        activeUsersRaw,
      ] = await Promise.all([
        prisma.eventLog.count({
          where: { createdAt: { gte: startAt } },
        }),
        prisma.eventLog.count({
          where: {
            createdAt: { gte: startAt },
            eventName: 'page_view',
          },
        }),
        prisma.eventLog.count({
          where: {
            createdAt: { gte: startAt },
            eventName: 'user_sign_in',
          },
        }),
        prisma.eventLog.count({
          where: {
            createdAt: { gte: startAt },
            eventName: 'skill_download_click',
          },
        }),
        prisma.eventLog.count({
          where: {
            createdAt: { gte: startAt },
            eventName: 'skill_upload_success',
          },
        }),
        prisma.eventLog.count({
          where: {
            createdAt: { gte: startAt },
            eventName: 'review_submit_success',
          },
        }),
        prisma.eventLog.count({
          where: {
            createdAt: { gte: startAt },
            eventName: 'review_like_toggle',
          },
        }),
        prisma.eventLog.findMany({
          where: { createdAt: { gte: startAt } },
          select: {
            userId: true,
            anonymousId: true,
            sessionId: true,
          },
        }),
        prisma.eventLog.groupBy({
          by: ['eventName'],
          where: { createdAt: { gte: startAt } },
          _count: { _all: true },
        }),
        prisma.eventLog.groupBy({
          by: ['module'],
          where: {
            createdAt: { gte: startAt },
            module: { not: null },
          },
          _count: { _all: true },
        }),
        prisma.eventLog.groupBy({
          by: ['categoryId'],
          where: {
            createdAt: { gte: startAt },
            eventName: 'category_click',
            categoryId: { not: null },
          },
          _count: { _all: true },
        }),
        prisma.eventLog.findMany({
          where: { createdAt: { gte: startAt } },
          select: {
            createdAt: true,
            eventName: true,
          },
        }),
        prisma.eventLog.findMany({
          where: {
            createdAt: { gte: startAt },
            eventName: 'category_click',
            categoryId: { not: null },
          },
          select: {
            createdAt: true,
            categoryId: true,
          },
        }),
        prisma.eventLog.groupBy({
          by: ['userId'],
          where: {
            createdAt: { gte: startAt },
            userId: { not: null },
          },
          _count: {
            _all: true,
          },
        }),
      ]);
    } catch (eventQueryError) {
      console.error('看板事件数据查询失败，已降级为基础统计:', eventQueryError);
    }

    const visitorSet = new Set<string>();
    visitorsRaw.forEach((row) => {
      const visitorId = row.userId || row.anonymousId || row.sessionId;
      if (visitorId) {
        visitorSet.add(visitorId);
      }
    });

    const humanIdsFromClicks = humanClickTopRaw
      .map((item) => item.categoryId)
      .filter((value): value is string => typeof value === 'string');
    const humanIdsFromTrends = humanClickTrendRaw
      .map((item) => item.categoryId)
      .filter((value): value is string => typeof value === 'string');
    const humanIdsFromSkills = humanSkillRaw
      .map((item) => item.categoryId)
      .filter((value): value is string => typeof value === 'string');

    const allHumanIds = [...new Set([...humanIdsFromClicks, ...humanIdsFromTrends, ...humanIdsFromSkills])];

    const humans =
      allHumanIds.length > 0
        ? await prisma.skillCategory.findMany({
            where: {
              id: {
                in: allHumanIds,
              },
            },
            select: {
              id: true,
              slug: true,
              name: true,
            },
          })
        : [];

    const humanNameMap = humans.reduce<Record<string, string>>((acc, item) => {
      acc[item.id] = item.name;
      return acc;
    }, {});

    const dateKeys = buildDateKeys(startAt, endAt);
    const trendMap: Record<
      string,
      {
        date: string;
        events: number;
        pageViews: number;
        downloads: number;
      }
    > = {};

    dateKeys.forEach((dateKey) => {
      trendMap[dateKey] = {
        date: dateKey,
        events: 0,
        pageViews: 0,
        downloads: 0,
      };
    });

    trendRaw.forEach((row) => {
      const dateKey = toDateKey(row.createdAt);
      if (!trendMap[dateKey]) {
        trendMap[dateKey] = {
          date: dateKey,
          events: 0,
          pageViews: 0,
          downloads: 0,
        };
      }

      trendMap[dateKey].events += 1;
      if (row.eventName === 'page_view') {
        trendMap[dateKey].pageViews += 1;
      }
      if (row.eventName === 'skill_download_click') {
        trendMap[dateKey].downloads += 1;
      }
    });

    const trends = Object.values(trendMap).sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    const topHumansSorted = humanClickTopRaw
      .sort((a, b) => b._count._all - a._count._all)
      .slice(0, 10);

    const topHumanIdsForTrend = topHumansSorted
      .map((item) => item.categoryId)
      .filter((value): value is string => typeof value === 'string')
      .slice(0, 5);

    const humanTrendCounter: Record<string, Record<string, number>> = {};
    topHumanIdsForTrend.forEach((humanId) => {
      humanTrendCounter[humanId] = {};
      dateKeys.forEach((dateKey) => {
        humanTrendCounter[humanId][dateKey] = 0;
      });
    });

    humanClickTrendRaw.forEach((row) => {
      if (!row.categoryId || !topHumanIdsForTrend.includes(row.categoryId)) {
        return;
      }
      const dateKey = toDateKey(row.createdAt);
      if (humanTrendCounter[row.categoryId]?.[dateKey] !== undefined) {
        humanTrendCounter[row.categoryId][dateKey] += 1;
      }
    });

    const humanTrends = topHumanIdsForTrend.map((humanId) => ({
      categoryId: humanId,
      categoryName: humanNameMap[humanId] || '未知数字人',
      points: dateKeys.map((date) => ({
        date,
        count: humanTrendCounter[humanId][date] || 0,
      })),
    }));

    const humansBySkill = humanSkillRaw
      .filter((item): item is { categoryId: string; _count: { _all: number }; _sum: { downloadCount: number | null; viewCount: number | null } } =>
        typeof item.categoryId === 'string'
      )
      .sort((a, b) => b._count._all - a._count._all)
      .slice(0, 10)
      .map((item) => ({
        categoryId: item.categoryId,
        categoryName: humanNameMap[item.categoryId] || '未知数字人',
        skillCount: item._count._all,
        totalDownloads: item._sum.downloadCount || 0,
        totalViews: item._sum.viewCount || 0,
      }));

    const activeUsersSorted = activeUsersRaw
      .filter((item): item is { userId: string; _count: { _all: number } } =>
        typeof item.userId === 'string'
      )
      .sort((a, b) => b._count._all - a._count._all)
      .slice(0, 10);

    const activeUserIds = activeUsersSorted.map((item) => item.userId);
    const activeUserProfiles =
      activeUserIds.length > 0
        ? await prisma.user.findMany({
            where: {
              id: { in: activeUserIds },
            },
            select: {
              id: true,
              name: true,
              department: true,
            },
          })
        : [];
    const activeUserMap = activeUserProfiles.reduce<
      Record<string, { name: string; department: string | null }>
    >((acc, item) => {
      acc[item.id] = {
        name: item.name,
        department: item.department ?? null,
      };
      return acc;
    }, {});

    const topHumans = topHumansSorted.map((item) => ({
      categoryId: item.categoryId,
      categoryName: item.categoryId
        ? humanNameMap[item.categoryId] || '未知数字人'
        : '未知数字人',
      count: item._count._all,
    }));

    return NextResponse.json(
      successResponse({
        range: {
          days,
          startAt,
          endAt,
        },
        overview: {
          totalEvents,
          uniqueVisitors: visitorSet.size,
          pageViews,
          logins: loginEvents,
          downloads: downloadClicks,
          uploads: uploadEvents,
          reviewSubmits: reviewSubmitEvents,
          reviewLikes: reviewLikeEvents,
        },
        site: {
          totalSkills,
          totalUsers,
          totalHumans,
          totalDownloads: skillStats._sum.downloadCount || 0,
          totalViews: skillStats._sum.viewCount || 0,
        },
        topEvents: eventTopRaw
          .sort((a, b) => b._count._all - a._count._all)
          .slice(0, 10)
          .map((item) => ({
            eventName: item.eventName,
            count: item._count._all,
          })),
        moduleUsage: moduleTopRaw
          .sort((a, b) => b._count._all - a._count._all)
          .slice(0, 10)
          .map((item) => ({
            module: item.module || 'unknown',
            count: item._count._all,
          })),
        topHumans,
        topCategories: topHumans,
        trends,
        humanTrends,
        categoryTrends: humanTrends,
        humansBySkill,
        activeUsers: activeUsersSorted.map((item) => ({
          userId: item.userId,
          name: activeUserMap[item.userId]?.name || '未知用户',
          department: activeUserMap[item.userId]?.department || null,
          eventCount: item._count._all,
        })),
        topSkills,
      })
    );
  } catch (error: any) {
    console.error('获取数据看板失败:', error);
    return NextResponse.json(
      errorResponse('获取数据看板失败', 'DASHBOARD_FETCH_ERROR'),
      { status: 500 }
    );
  }
}
