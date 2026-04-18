import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { isSuperAdminEmail } from '@/lib/dashboard-access';
import { getSensitiveWordError } from '@/lib/content-moderation';
import { errorResponse, successResponse } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const MAX_TITLE_LENGTH = 120;
const MAX_CONTENT_LENGTH = 5000;

function normalizeSort(value: string | null): 'new' | 'hot' {
  return value === 'hot' ? 'hot' : 'new';
}

function clampPageSize(value: string | null): number {
  const parsed = Number(value || 20);
  if (!Number.isFinite(parsed)) return 20;
  return Math.min(50, Math.max(1, Math.floor(parsed)));
}

function asSafeText(input: unknown): string {
  return typeof input === 'string' ? input.trim() : '';
}

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    const sort = normalizeSort(request.nextUrl.searchParams.get('sort'));
    const pageSize = clampPageSize(request.nextUrl.searchParams.get('pageSize'));

    const threads = await prisma.feedbackThread.findMany({
      take: pageSize,
      orderBy:
        sort === 'hot'
          ? [{ upvoteCount: 'desc' }, { replyCount: 'desc' }, { createdAt: 'desc' }]
          : [{ createdAt: 'desc' }],
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
            department: true,
          },
        },
        replies: {
          orderBy: [{ createdAt: 'asc' }],
          take: 300,
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
        },
      },
    });

    const threadIds = threads.map((item) => item.id);
    const replyIds = threads.flatMap((item) => item.replies.map((reply) => reply.id));

    let threadVoteMap = new Map<string, number>();
    let replyVoteMap = new Map<string, number>();

    if (currentUser && threadIds.length > 0) {
      const [threadVotes, replyVotes] = await Promise.all([
        prisma.feedbackVote.findMany({
          where: {
            userId: currentUser.id,
            threadId: {
              in: threadIds,
            },
          },
          select: {
            threadId: true,
            value: true,
          },
        }),
        replyIds.length > 0
          ? prisma.feedbackReplyVote.findMany({
              where: {
                userId: currentUser.id,
                replyId: {
                  in: replyIds,
                },
              },
              select: {
                replyId: true,
                value: true,
              },
            })
          : Promise.resolve([]),
      ]);

      threadVoteMap = new Map(
        threadVotes.map((vote) => [vote.threadId, vote.value])
      );
      replyVoteMap = new Map(replyVotes.map((vote) => [vote.replyId, vote.value]));
    }

    return NextResponse.json(
      successResponse({
        items: threads.map((thread) => ({
          id: thread.id,
          title: thread.title,
          content: thread.content,
          status: thread.status,
          upvoteCount: thread.upvoteCount,
          downvoteCount: thread.downvoteCount,
          replyCount: thread.replyCount,
          pinnedReplyId: thread.pinnedReplyId,
          createdAt: thread.createdAt,
          updatedAt: thread.updatedAt,
          userVote: threadVoteMap.get(thread.id) || 0,
          canManage:
            Boolean(currentUser?.id) &&
            (currentUser?.id === thread.userId || isSuperAdminEmail(currentUser?.email)),
          canDelete: isSuperAdminEmail(currentUser?.email),
          user: thread.user,
          replies: thread.replies.map((reply) => ({
            id: reply.id,
            content: reply.content,
            threadId: reply.threadId,
            parentId: reply.parentId,
            upvoteCount: reply.upvoteCount,
            downvoteCount: reply.downvoteCount,
            createdAt: reply.createdAt,
            updatedAt: reply.updatedAt,
            userVote: replyVoteMap.get(reply.id) || 0,
            user: reply.user,
            parent: reply.parent
              ? {
                  id: reply.parent.id,
                  user: reply.parent.user,
                }
              : null,
          })),
        })),
      })
    );
  } catch (error) {
    console.error('获取反馈帖子失败:', error);
    return NextResponse.json(
      errorResponse('获取反馈帖子失败', 'FEEDBACK_THREADS_FETCH_ERROR'),
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json(
        errorResponse('请先登录后再发帖', 'UNAUTHORIZED'),
        { status: 401 }
      );
    }

    const body = await request.json();
    const title = asSafeText(body?.title);
    const content = asSafeText(body?.content);
    const sensitiveWordError = getSensitiveWordError(`${title}\n${content}`);

    if (title.length < 4 || title.length > MAX_TITLE_LENGTH) {
      return NextResponse.json(
        errorResponse(`标题长度需在 4-${MAX_TITLE_LENGTH} 字之间`, 'VALIDATION_ERROR'),
        { status: 400 }
      );
    }

    if (!content || content.length > MAX_CONTENT_LENGTH) {
      return NextResponse.json(
        errorResponse(
          `正文不能为空且不能超过 ${MAX_CONTENT_LENGTH} 字`,
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

    const thread = await prisma.feedbackThread.create({
      data: {
        title,
        content,
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
      },
    });

    return NextResponse.json(
      successResponse(
        {
          ...thread,
          userVote: 0,
          canManage: true,
          canDelete: isSuperAdminEmail(currentUser?.email),
          replies: [],
        },
        '发帖成功'
      ),
      { status: 201 }
    );
  } catch (error) {
    console.error('创建反馈帖子失败:', error);
    return NextResponse.json(
      errorResponse('创建反馈帖子失败', 'FEEDBACK_THREAD_CREATE_ERROR'),
      { status: 500 }
    );
  }
}
