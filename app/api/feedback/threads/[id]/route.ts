import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { isSuperAdminEmail } from '@/lib/dashboard-access';
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
        errorResponse('仅管理员可删除帖子', 'FORBIDDEN'),
        { status: 403 }
      );
    }

    const threadId = params.id;
    const thread = await prisma.feedbackThread.findUnique({
      where: { id: threadId },
      select: { id: true },
    });

    if (!thread) {
      return NextResponse.json(
        errorResponse('帖子不存在', 'FEEDBACK_THREAD_NOT_FOUND'),
        { status: 404 }
      );
    }

    await prisma.feedbackThread.delete({
      where: { id: threadId },
    });

    return NextResponse.json(
      successResponse(
        {
          id: threadId,
        },
        '帖子已删除'
      )
    );
  } catch (error) {
    console.error('删除反馈帖子失败:', error);
    return NextResponse.json(
      errorResponse('删除帖子失败', 'FEEDBACK_THREAD_DELETE_ERROR'),
      { status: 500 }
    );
  }
}
