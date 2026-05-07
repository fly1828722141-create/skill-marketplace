import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdminIngestActor } from '@/lib/ingest-auth';
import { calculatePagination, errorResponse, successResponse } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const VALID_STATUSES = new Set(['pending', 'approved', 'rejected', 'published', 'failed']);

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

    const [items, total, statusRows] = await Promise.all([
      prisma.ingestCandidate.findMany({
        where,
        orderBy: [{ discoveredAt: 'desc' }],
        skip,
        take,
      }),
      prisma.ingestCandidate.count({ where }),
      prisma.ingestCandidate.groupBy({
        by: ['status'],
        _count: {
          _all: true,
        },
      }),
    ]);

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
