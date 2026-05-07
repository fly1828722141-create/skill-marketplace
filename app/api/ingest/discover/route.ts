import { NextRequest, NextResponse } from 'next/server';
import { resolveIngestActor } from '@/lib/ingest-auth';
import { runGitHubDiscovery, runPublishWorker } from '@/lib/skill-ingest';
import { errorResponse, successResponse } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface DiscoverRequestBody {
  queries?: string[];
  perQuery?: number;
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
    const body: DiscoverRequestBody = rawBody ? JSON.parse(rawBody) : {};
    return runDiscover(request, body, rawBody);
  } catch (error: any) {
    const message = rawBody && error instanceof SyntaxError ? '请求体 JSON 格式错误' : error?.message;
    return NextResponse.json(
      errorResponse(message || '自动收录执行失败', 'INGEST_DISCOVER_ERROR'),
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    return runDiscover(request, {}, '');
  } catch (error: any) {
    return NextResponse.json(
      errorResponse(error?.message || '自动收录执行失败', 'INGEST_DISCOVER_ERROR'),
      { status: 500 }
    );
  }
}

async function runDiscover(
  request: NextRequest,
  body: DiscoverRequestBody,
  rawBody: string
) {
  const actor = await resolveIngestActor(request, rawBody);
  if (!actor) {
    return NextResponse.json(
      errorResponse('未授权调用自动收录接口', 'UNAUTHORIZED'),
      { status: 401 }
    );
  }

  const queries = Array.isArray(body.queries)
    ? body.queries.map((item) => String(item || '').trim()).filter(Boolean)
    : undefined;
  const perQuery = parseNumber(body.perQuery);
  const maxCandidates = parseNumber(body.maxCandidates);

  const discoverResult = await runGitHubDiscovery({
    triggerType: actor.triggerType,
    triggerLabel: actor.triggerLabel,
    queries,
    perQuery,
    maxCandidates,
  });

  const shouldRunPublisher = body.runPublishWorker !== false;
  const publishBatchSize = parseNumber(body.publishBatchSize);

  const publishResult = shouldRunPublisher
    ? await runPublishWorker({
        triggerType: actor.triggerType,
        triggerLabel: actor.triggerLabel,
        batchSize: publishBatchSize,
      })
    : null;

  return NextResponse.json(
    successResponse({
      discover: discoverResult,
      publish: publishResult,
    })
  );
}
