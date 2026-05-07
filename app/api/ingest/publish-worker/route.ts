import { NextRequest, NextResponse } from 'next/server';
import { resolveIngestActor } from '@/lib/ingest-auth';
import { runPublishWorker } from '@/lib/skill-ingest';
import { errorResponse, successResponse } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PublishWorkerBody {
  batchSize?: number;
  onlyApproved?: boolean;
  candidateIds?: string[];
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
      return NextResponse.json(
        errorResponse('未授权调用自动发布接口', 'UNAUTHORIZED'),
        { status: 401 }
      );
    }

    const body: PublishWorkerBody = rawBody ? JSON.parse(rawBody) : {};

    const batchSize = parseNumber(body.batchSize);
    const onlyApproved = body.onlyApproved === true;
    const candidateIds = Array.isArray(body.candidateIds)
      ? body.candidateIds.map((item) => String(item || '').trim()).filter(Boolean)
      : undefined;

    const result = await runPublishWorker({
      triggerType: actor.triggerType,
      triggerLabel: actor.triggerLabel,
      batchSize,
      onlyApproved,
      candidateIds,
    });

    return NextResponse.json(successResponse(result));
  } catch (error: any) {
    const message = rawBody && error instanceof SyntaxError ? '请求体 JSON 格式错误' : error?.message;
    return NextResponse.json(
      errorResponse(message || '自动发布执行失败', 'INGEST_PUBLISH_ERROR'),
      { status: 500 }
    );
  }
}
