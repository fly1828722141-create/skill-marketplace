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

    const [totalSkills, totalUsers, skillStats, topSkills] = await Promise.all([
      prisma.skill.count({ where: { status: 'active' } }),
      prisma.user.count(),
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
              name: true,
            },
          },
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
    let categoryTopRaw: Array<{ categoryId: string | null; _count: { _all: number } }> = [];
    let trendRaw: Array<{ createdAt: Date; eventName: string }> = [];
    let categoryTrendRaw: Array<{ createdAt: Date; categoryId: string | null }> = [];
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
        categoryTopRaw,
        trendRaw,
        categoryTrendRaw,
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

    const categoryIds = categoryTopRaw
      .map((item) => item.categoryId)
      .filter((value): value is string => typeof value === 'string');
    const categoryTrendIds = categoryTrendRaw
      .map((item) => item.categoryId)
      .filter((value): value is string => typeof value === 'string');

    const categories =
      [...categoryIds, ...categoryTrendIds].length > 0
        ? await prisma.skillCategory.findMany({
            where: {
              id: {
                in: [...new Set([...categoryIds, ...categoryTrendIds])],
              },
            },
            select: {
              id: true,
              slug: true,
              name: true,
            },
          })
        : [];

    const categoryNameMap = categories.reduce<Record<string, string>>(
      (acc, category) => {
        acc[category.id] = category.name;
        return acc;
      },
      {}
    );

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
    const topCategoriesSorted = categoryTopRaw
      .sort((a, b) => b._count._all - a._count._all)
      .slice(0, 10);
    const topCategoryIds = topCategoriesSorted
      .map((item) => item.categoryId)
      .filter((value): value is string => typeof value === 'string')
      .slice(0, 5);

    const categoryTrendCounter: Record<string, Record<string, number>> = {};
    topCategoryIds.forEach((categoryId) => {
      categoryTrendCounter[categoryId] = {};
      dateKeys.forEach((dateKey) => {
        categoryTrendCounter[categoryId][dateKey] = 0;
      });
    });

    categoryTrendRaw.forEach((row) => {
      if (!row.categoryId || !topCategoryIds.includes(row.categoryId)) {
        return;
      }
      const dateKey = toDateKey(row.createdAt);
      if (categoryTrendCounter[row.categoryId]?.[dateKey] !== undefined) {
        categoryTrendCounter[row.categoryId][dateKey] += 1;
      }
    });

    const categoryTrends = topCategoryIds.map((categoryId) => ({
      categoryId,
      categoryName: categoryNameMap[categoryId] || '未知分类',
      points: dateKeys.map((date) => ({
        date,
        count: categoryTrendCounter[categoryId][date] || 0,
      })),
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
        topCategories: topCategoriesSorted
          .map((item) => ({
            categoryId: item.categoryId,
            categoryName: item.categoryId
              ? categoryNameMap[item.categoryId] || '未知分类'
              : '未知分类',
            count: item._count._all,
          })),
        trends,
        categoryTrends,
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
