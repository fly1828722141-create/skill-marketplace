import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { isSuperAdminEmail } from '@/lib/dashboard-access';
import { errorResponse, successResponse } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function asSafeText(input: unknown): string {
  return typeof input === 'string' ? input.trim() : '';
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json(
        errorResponse('请先登录后再操作', 'UNAUTHORIZED'),
        { status: 401 }
      );
    }

    const threadId = params.id;
    const body = await request.json();
    const replyId = asSafeText(body?.replyId);

    if (!replyId) {
      return NextResponse.json(
        errorResponse('replyId 不能为空', 'VALIDATION_ERROR'),
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const thread = await tx.feedbackThread.findUnique({
        where: { id: threadId },
        select: {
          id: true,
          userId: true,
          pinnedReplyId: true,
        },
      });

      if (!thread) {
        return { code: 'THREAD_NOT_FOUND' as const };
      }

      const canManage =
        thread.userId === currentUser.id || isSuperAdminEmail(currentUser.email);

      if (!canManage) {
        return { code: 'FORBIDDEN' as const };
      }

      const reply = await tx.feedbackReply.findUnique({
        where: { id: replyId },
        select: {
          id: true,
          threadId: true,
        },
      });

      if (!reply || reply.threadId !== threadId) {
        return { code: 'REPLY_NOT_FOUND' as const };
      }

      const nextPinnedReplyId =
        thread.pinnedReplyId === reply.id ? null : reply.id;

      const updated = await tx.feedbackThread.update({
        where: { id: threadId },
        data: {
          pinnedReplyId: nextPinnedReplyId,
        },
        select: {
          pinnedReplyId: true,
        },
      });

      return {
        code: 'OK' as const,
        pinnedReplyId: updated.pinnedReplyId,
      };
    });

    if (result.code === 'THREAD_NOT_FOUND') {
      return NextResponse.json(
        errorResponse('帖子不存在', 'FEEDBACK_THREAD_NOT_FOUND'),
        { status: 404 }
      );
    }

    if (result.code === 'REPLY_NOT_FOUND') {
      return NextResponse.json(
        errorResponse('回复不存在或不属于该帖子', 'FEEDBACK_REPLY_NOT_FOUND'),
        { status: 404 }
      );
    }

    if (result.code === 'FORBIDDEN') {
      return NextResponse.json(
        errorResponse('仅楼主或管理员可置顶回复', 'FORBIDDEN'),
        { status: 403 }
      );
    }

    return NextResponse.json(
      successResponse({
        pinnedReplyId: result.pinnedReplyId,
      })
    );
  } catch (error) {
    console.error('置顶回复失败:', error);
    return NextResponse.json(
      errorResponse('置顶回复失败', 'FEEDBACK_PIN_REPLY_ERROR'),
      { status: 500 }
    );
  }
}
