import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdminIngestActor } from '@/lib/ingest-auth';
import { type IngestQualityWeights } from '@/lib/ingest-config';
import {
  calculateQualityScore,
  normalizeQualityWeights,
  resolveDefaultQualityWeights,
} from '@/lib/ingest-quality-score';
import { calculatePagination, errorResponse, successResponse } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const VALID_STATUSES = new Set(['pending', 'approved', 'rejected', 'published', 'failed']);
const VALID_SORT_BY = new Set(['discoveredAt', 'updatedAt', 'stars', 'forks', 'qualityScore']);
const VALID_SORT_ORDER = new Set(['asc', 'desc']);

function parsePositiveFloat(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return parsed;
}

function resolveQualityWeights(searchParams: URLSearchParams): IngestQualityWeights {
  const defaults = resolveDefaultQualityWeights();
  return normalizeQualityWeights({
    stars: parsePositiveFloat(searchParams.get('weightStars')) ?? defaults.stars,
    forks: parsePositiveFloat(searchParams.get('weightForks')) ?? defaults.forks,
    recentActivity:
      parsePositiveFloat(searchParams.get('weightRecentActivity')) ?? defaults.recentActivity,
    issueHealth: parsePositiveFloat(searchParams.get('weightIssueHealth')) ?? defaults.issueHealth,
  });
}

export async function GET(request: NextRequest) {
  try {
    const actor = await requireAdminIngestActor(request);
    if (!actor) {
      return NextResponse.json(
        errorResponse('仅管理员可查看候选池', 'FORBIDDEN'),
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const status = (searchParams.get('status') || '').trim().toLowerCase();
    const page = Number.parseInt(searchParams.get('page') || '1', 10);
    const pageSize = Number.parseInt(searchParams.get('pageSize') || '20', 10);
    const sortByRaw = (searchParams.get('sortBy') || 'discoveredAt').trim();
    const sortOrderRaw = (searchParams.get('sortOrder') || 'desc').trim().toLowerCase();
    const sortBy = VALID_SORT_BY.has(sortByRaw) ? sortByRaw : 'discoveredAt';
    const sortOrder = VALID_SORT_ORDER.has(sortOrderRaw) ? sortOrderRaw : 'desc';
    const qualityWeights = resolveQualityWeights(searchParams);

    const { skip, take, page: safePage, pageSize: safePageSize } = calculatePagination({
      page,
      pageSize,
    });

    const where =
      status && VALID_STATUSES.has(status)
        ? {
            status,
          }
        : undefined;

    const statusRowsPromise = prisma.ingestCandidate.groupBy({
      by: ['status'],
      _count: {
        _all: true,
      },
    });

    let total = 0;
    let items: Array<Record<string, any>> = [];

    if (sortBy === 'qualityScore') {
      const [allItems, statusRows] = await Promise.all([
        prisma.ingestCandidate.findMany({
          where,
        }),
        statusRowsPromise,
      ]);

      const scoredItems = allItems.map((item) => ({
        ...item,
        qualityScore: calculateQualityScore(
          {
            stars: item.stars,
            forks: item.forks,
            openIssues: item.openIssues,
            pushedAt: item.pushedAt,
          },
          qualityWeights
        ),
      }));

      scoredItems.sort((left, right) => {
        const scoreDelta = left.qualityScore - right.qualityScore;
        if (scoreDelta !== 0) {
          return sortOrder === 'asc' ? scoreDelta : -scoreDelta;
        }

        const leftTime = new Date(left.discoveredAt).getTime();
        const rightTime = new Date(right.discoveredAt).getTime();
        return rightTime - leftTime;
      });

      total = scoredItems.length;
      items = scoredItems.slice(skip, skip + take);

      const totalPages = Math.ceil(total / safePageSize);
      const statusSummary = statusRows.reduce<Record<string, number>>((acc, row) => {
        acc[row.status] = row._count._all;
        return acc;
      }, {});

      return NextResponse.json(
        successResponse({
          items,
          total,
          page: safePage,
          pageSize: safePageSize,
          totalPages,
          statusSummary,
          sortBy,
          sortOrder,
          qualityWeights,
          actor,
        })
      );
    }

    const dbOrderBy =
      sortBy === 'stars'
        ? [{ stars: sortOrder }]
        : sortBy === 'forks'
          ? [{ forks: sortOrder }]
          : sortBy === 'updatedAt'
            ? [{ updatedAt: sortOrder }]
            : [{ discoveredAt: sortOrder }];

    const [rawItems, countedTotal, statusRows] = await Promise.all([
      prisma.ingestCandidate.findMany({
        where,
        orderBy: dbOrderBy as any,
        skip,
        take,
      }),
      prisma.ingestCandidate.count({ where }),
      statusRowsPromise,
    ]);

    total = countedTotal;
    items = rawItems.map((item) => ({
      ...item,
      qualityScore: calculateQualityScore(
        {
          stars: item.stars,
          forks: item.forks,
          openIssues: item.openIssues,
          pushedAt: item.pushedAt,
        },
        qualityWeights
      ),
    }));

    const totalPages = Math.ceil(total / safePageSize);
    const statusSummary = statusRows.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = row._count._all;
      return acc;
    }, {});

    return NextResponse.json(
      successResponse({
        items,
        total,
        page: safePage,
        pageSize: safePageSize,
        totalPages,
        statusSummary,
        sortBy,
        sortOrder,
        qualityWeights,
        actor,
      })
    );
  } catch (error: any) {
    return NextResponse.json(
      errorResponse(error?.message || '读取候选池失败', 'INGEST_CANDIDATES_FETCH_ERROR'),
      { status: 500 }
    );
  }
}
