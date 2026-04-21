import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { isSuperAdminEmail } from '@/lib/dashboard-access';
import { recordEvent } from '@/lib/event-log';
import { errorResponse, successResponse } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function DELETE(
  _request: NextRequest,
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

    if (!isSuperAdminEmail(currentUser.email)) {
      return NextResponse.json(
        errorResponse('仅管理员可删除评价', 'FORBIDDEN'),
        { status: 403 }
      );
    }

    const reviewId = params.id;
    const review = await prisma.comment.findUnique({
      where: { id: reviewId },
      select: {
        id: true,
        userId: true,
        skillId: true,
      },
    });

    if (!review) {
      return NextResponse.json(
        errorResponse('评价不存在', 'REVIEW_NOT_FOUND'),
        { status: 404 }
      );
    }

    await prisma.comment.delete({
      where: { id: reviewId },
    });

    try {
      await recordEvent({
        eventName: 'review_delete',
        module: 'review',
        action: 'delete',
        userId: currentUser.id,
        skillId: review.skillId,
        metadata: {
          reviewId: review.id,
          reviewAuthorId: review.userId,
        },
      });
    } catch (eventError) {
      console.error('记录评价删除事件失败:', eventError);
    }

    return NextResponse.json(
      successResponse(
        {
          id: review.id,
        },
        '评价已删除'
      )
    );
  } catch (error) {
    console.error('删除评价失败:', error);
    return NextResponse.json(
      errorResponse('删除评价失败', 'REVIEW_DELETE_ERROR'),
      { status: 500 }
    );
  }
}
