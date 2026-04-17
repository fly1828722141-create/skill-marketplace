import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { recordEvent } from '@/lib/event-log';
import { errorResponse, successResponse } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json(
        errorResponse('请先登录后点赞', 'UNAUTHORIZED'),
        { status: 401 }
      );
    }

    const reviewId = params.id;

    const result = await prisma.$transaction(async (tx) => {
      const review = await tx.comment.findUnique({
        where: { id: reviewId },
        select: {
          id: true,
          likeCount: true,
          skillId: true,
        },
      });

      if (!review) {
        return null;
      }

      const existingLike = await tx.commentLike.findUnique({
        where: {
          commentId_userId: {
            commentId: reviewId,
            userId: currentUser.id,
          },
        },
        select: { id: true },
      });

      if (existingLike) {
        await tx.commentLike.delete({
          where: {
            commentId_userId: {
              commentId: reviewId,
              userId: currentUser.id,
            },
          },
        });

        const updatedReview = await tx.comment.update({
          where: { id: reviewId },
          data:
            review.likeCount > 0
              ? {
                  likeCount: {
                    decrement: 1,
                  },
                }
              : {
                  likeCount: 0,
                },
          select: {
            likeCount: true,
            skillId: true,
          },
        });

        return {
          liked: false,
          likeCount: updatedReview.likeCount,
          skillId: updatedReview.skillId,
        };
      }

      await tx.commentLike.create({
        data: {
          commentId: reviewId,
          userId: currentUser.id,
        },
      });

      const updatedReview = await tx.comment.update({
        where: { id: reviewId },
        data: {
          likeCount: {
            increment: 1,
          },
        },
        select: {
          likeCount: true,
          skillId: true,
        },
      });

      return {
        liked: true,
        likeCount: updatedReview.likeCount,
        skillId: updatedReview.skillId,
      };
    });

    if (!result) {
      return NextResponse.json(
        errorResponse('评价不存在', 'REVIEW_NOT_FOUND'),
        { status: 404 }
      );
    }

    await recordEvent({
      eventName: 'review_like_toggle',
      module: 'review',
      action: result.liked ? 'like' : 'unlike',
      userId: currentUser.id,
      skillId: result.skillId,
      metadata: {
        reviewId,
        liked: result.liked,
      },
    });

    return NextResponse.json(successResponse(result));
  } catch (error: any) {
    console.error('点赞失败:', error);
    return NextResponse.json(
      errorResponse('点赞失败', 'REVIEW_LIKE_ERROR'),
      { status: 500 }
    );
  }
}
