import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdminIngestActor } from '@/lib/ingest-auth';
import { runPublishWorker } from '@/lib/skill-ingest';
import { errorResponse, successResponse } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type CandidateAction = 'approve' | 'reject' | 'retry';

interface PatchBody {
  action?: CandidateAction;
  reason?: string;
  publishNow?: boolean;
}

function normalizeReason(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const text = input.trim();
  if (!text) return null;
  return text.slice(0, 400);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const actor = await requireAdminIngestActor(request);
    if (!actor) {
      return NextResponse.json(
        errorResponse('仅管理员可审批候选 Skill', 'FORBIDDEN'),
        { status: 403 }
      );
    }

    const candidateId = params.id;
    const existing = await prisma.ingestCandidate.findUnique({
      where: { id: candidateId },
      select: {
        id: true,
        status: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        errorResponse('候选记录不存在', 'INGEST_CANDIDATE_NOT_FOUND'),
        { status: 404 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as PatchBody;
    const action = body.action;

    if (action !== 'approve' && action !== 'reject' && action !== 'retry') {
      return NextResponse.json(
        errorResponse('action 仅支持 approve/reject/retry', 'VALIDATION_ERROR'),
        { status: 400 }
      );
    }

    const reason = normalizeReason(body.reason);

    if (action === 'approve') {
      await prisma.ingestCandidate.update({
        where: { id: candidateId },
        data: {
          status: 'approved',
          autoDecision: 'allow',
          autoDecisionNote: reason || '管理员审批通过',
          failureReason: null,
        },
      });

      let publishResult = null;
      const shouldPublishNow = body.publishNow !== false;
      if (shouldPublishNow) {
        publishResult = await runPublishWorker({
          triggerType: actor.triggerType,
          triggerLabel: actor.triggerLabel,
          onlyApproved: true,
          candidateIds: [candidateId],
          batchSize: 1,
        });
      }

      const candidate = await prisma.ingestCandidate.findUnique({
        where: { id: candidateId },
      });

      return NextResponse.json(
        successResponse({
          candidate,
          publishResult,
        })
      );
    }

    if (action === 'reject') {
      const candidate = await prisma.ingestCandidate.update({
        where: { id: candidateId },
        data: {
          status: 'rejected',
          autoDecision: 'hold',
          autoDecisionNote: reason || '管理员手动拒绝',
          failureReason: reason || null,
        },
      });

      return NextResponse.json(successResponse(candidate));
    }

    const candidate = await prisma.ingestCandidate.update({
      where: { id: candidateId },
      data: {
        status: 'pending',
        autoDecision: null,
        autoDecisionNote: reason || '管理员重试',
        failureReason: null,
      },
    });

    return NextResponse.json(successResponse(candidate));
  } catch (error: any) {
    return NextResponse.json(
      errorResponse(error?.message || '审批候选 Skill 失败', 'INGEST_CANDIDATE_PATCH_ERROR'),
      { status: 500 }
    );
  }
}
