import { NextRequest, NextResponse } from 'next/server';
import { resolveIngestActor } from '@/lib/ingest-auth';
import { runRebuildIngestLibrary } from '@/lib/skill-ingest';
import { errorResponse, successResponse } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface RebuildBody {
  queries?: string[];
  perQuery?: number;
  maxPagesPerQuery?: number;
  maxCandidates?: number;
  runPublishWorker?: boolean;
  publishBatchSize?: number;
}

function parseNumber(input: unknown): number | undefined {
  if (typeof input === 'number' && Number.isFinite(input)) return input;
  if (typeof input === 'string' && input.trim()) {
    const parsed = Number.parseInt(input, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export async function POST(request: NextRequest) {
  let rawBody = '';

  try {
    rawBody = await request.text();

    const actor = await resolveIngestActor(request, rawBody);
    if (!actor) {
      return NextResponse.json(errorResponse('未授权调用重建收录接口', 'UNAUTHORIZED'), {
        status: 401,
      });
    }

    const body: RebuildBody = rawBody ? JSON.parse(rawBody) : {};
    const queries = Array.isArray(body.queries)
      ? body.queries.map((item) => String(item || '').trim()).filter(Boolean)
      : undefined;
    const perQuery = parseNumber(body.perQuery);
    const maxPagesPerQuery = parseNumber(body.maxPagesPerQuery);
    const maxCandidates = parseNumber(body.maxCandidates);
    const publishBatchSize = parseNumber(body.publishBatchSize);
    const runPublishWorker = body.runPublishWorker !== false;

    const result = await runRebuildIngestLibrary({
      triggerType: actor.triggerType,
      triggerLabel: actor.triggerLabel,
      queries,
      perQuery,
      maxPagesPerQuery,
      maxCandidates,
      runPublishWorker,
      publishBatchSize,
    });

    return NextResponse.json(successResponse(result));
  } catch (error: any) {
    const message = rawBody && error instanceof SyntaxError ? '请求体 JSON 格式错误' : error?.message;
    return NextResponse.json(errorResponse(message || '重建收录库失败', 'INGEST_REBUILD_ERROR'), {
      status: 500,
    });
  }
}
