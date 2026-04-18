import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { getSensitiveWordError } from '@/lib/content-moderation';
import { errorResponse, successResponse } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const MAX_REPLY_CONTENT_LENGTH = 3000;

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
        errorResponse('请先登录后再回复', 'UNAUTHORIZED'),
        { status: 401 }
      );
    }

    const threadId = params.id;
    const body = await request.json();
    const content = asSafeText(body?.content);
    const parentId = asSafeText(body?.parentId) || null;
    const sensitiveWordError = getSensitiveWordError(content);

    if (!content || content.length > MAX_REPLY_CONTENT_LENGTH) {
      return NextResponse.json(
        errorResponse(
          `回复内容不能为空且不能超过 ${MAX_REPLY_CONTENT_LENGTH} 字`,
          'VALIDATION_ERROR'
        ),
        { status: 400 }
      );
    }

    if (sensitiveWordError) {
      return NextResponse.json(
        errorResponse(sensitiveWordError, 'SENSITIVE_CONTENT'),
        { status: 400 }
      );
    }

    const reply = await prisma.$transaction(async (tx) => {
      const thread = await tx.feedbackThread.findUnique({
        where: { id: threadId },
        select: {
          id: true,
          status: true,
        },
      });

      if (!thread) {
        return { code: 'THREAD_NOT_FOUND' as const };
      }

      if (thread.status !== 'open') {
        return { code: 'THREAD_CLOSED' as const };
      }

      if (parentId) {
        const parent = await tx.feedbackReply.findUnique({
          where: { id: parentId },
          select: {
            id: true,
            threadId: true,
          },
        });

        if (!parent || parent.threadId !== threadId) {
          return { code: 'PARENT_NOT_FOUND' as const };
        }
      }

      const created = await tx.feedbackReply.create({
        data: {
          content,
          threadId,
          parentId,
          userId: currentUser.id,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              avatar: true,
              department: true,
            },
          },
          parent: {
            select: {
              id: true,
              user: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      });

      await tx.feedbackThread.update({
        where: { id: threadId },
        data: {
          replyCount: {
            increment: 1,
          },
        },
      });

      return { code: 'OK' as const, created };
    });

    if (reply.code === 'THREAD_NOT_FOUND') {
      return NextResponse.json(
        errorResponse('帖子不存在', 'FEEDBACK_THREAD_NOT_FOUND'),
        { status: 404 }
      );
    }

    if (reply.code === 'THREAD_CLOSED') {
      return NextResponse.json(
        errorResponse('帖子已关闭，暂不支持回复', 'FEEDBACK_THREAD_CLOSED'),
        { status: 400 }
      );
    }

    if (reply.code === 'PARENT_NOT_FOUND') {
      return NextResponse.json(
        errorResponse('被回复楼层不存在', 'FEEDBACK_PARENT_REPLY_NOT_FOUND'),
        { status: 404 }
      );
    }

    return NextResponse.json(
      successResponse({
        id: reply.created.id,
        content: reply.created.content,
        threadId: reply.created.threadId,
        parentId: reply.created.parentId,
        upvoteCount: reply.created.upvoteCount,
        downvoteCount: reply.created.downvoteCount,
        createdAt: reply.created.createdAt,
        updatedAt: reply.created.updatedAt,
        userVote: 0,
        user: reply.created.user,
        parent: reply.created.parent
          ? {
              id: reply.created.parent.id,
              user: reply.created.parent.user,
            }
          : null,
      })
    );
  } catch (error) {
    console.error('发布反馈回复失败:', error);
    return NextResponse.json(
      errorResponse('发布回复失败', 'FEEDBACK_REPLY_CREATE_ERROR'),
      { status: 500 }
    );
  }
}
