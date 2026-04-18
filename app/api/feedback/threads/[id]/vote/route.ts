import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { errorResponse, successResponse } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function parseVoteValue(input: unknown): 1 | -1 | null {
  const value = Number(input);
  if (value === 1 || value === -1) return value;
  return null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json(
        errorResponse('请先登录后再投票', 'UNAUTHORIZED'),
        { status: 401 }
      );
    }

    const body = await request.json();
    const nextVoteValue = parseVoteValue(body?.value);

    if (nextVoteValue === null) {
      return NextResponse.json(
        errorResponse('投票值仅支持 1（赞）或 -1（踩）', 'VALIDATION_ERROR'),
        { status: 400 }
      );
    }

    const threadId = params.id;

    const result = await prisma.$transaction(async (tx) => {
      const thread = await tx.feedbackThread.findUnique({
        where: { id: threadId },
        select: {
          id: true,
          upvoteCount: true,
          downvoteCount: true,
        },
      });

      if (!thread) {
        return null;
      }

      const existingVote = await tx.feedbackVote.findUnique({
        where: {
          threadId_userId: {
            threadId,
            userId: currentUser.id,
          },
        },
      });

      let upvoteCount = thread.upvoteCount;
      let downvoteCount = thread.downvoteCount;
      let userVote: -1 | 0 | 1 = nextVoteValue;

      if (existingVote && existingVote.value === nextVoteValue) {
        await tx.feedbackVote.delete({
          where: {
            threadId_userId: {
              threadId,
              userId: currentUser.id,
            },
          },
        });

        if (nextVoteValue === 1) {
          upvoteCount = Math.max(0, upvoteCount - 1);
        } else {
          downvoteCount = Math.max(0, downvoteCount - 1);
        }
        userVote = 0;
      } else if (existingVote) {
        await tx.feedbackVote.update({
          where: {
            threadId_userId: {
              threadId,
              userId: currentUser.id,
            },
          },
          data: {
            value: nextVoteValue,
          },
        });

        if (existingVote.value === 1) {
          upvoteCount = Math.max(0, upvoteCount - 1);
        } else {
          downvoteCount = Math.max(0, downvoteCount - 1);
        }

        if (nextVoteValue === 1) {
          upvoteCount += 1;
        } else {
          downvoteCount += 1;
        }
      } else {
        await tx.feedbackVote.create({
          data: {
            threadId,
            userId: currentUser.id,
            value: nextVoteValue,
          },
        });

        if (nextVoteValue === 1) {
          upvoteCount += 1;
        } else {
          downvoteCount += 1;
        }
      }

      await tx.feedbackThread.update({
        where: { id: threadId },
        data: {
          upvoteCount,
          downvoteCount,
        },
      });

      return {
        userVote,
        upvoteCount,
        downvoteCount,
      };
    });

    if (!result) {
      return NextResponse.json(
        errorResponse('帖子不存在', 'FEEDBACK_THREAD_NOT_FOUND'),
        { status: 404 }
      );
    }

    return NextResponse.json(successResponse(result));
  } catch (error) {
    console.error('反馈帖子投票失败:', error);
    return NextResponse.json(
      errorResponse('投票失败', 'FEEDBACK_THREAD_VOTE_ERROR'),
      { status: 500 }
    );
  }
}
