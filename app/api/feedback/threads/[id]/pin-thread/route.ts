import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { isSuperAdminEmail } from '@/lib/dashboard-access';
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
        errorResponse('请先登录后再操作', 'UNAUTHORIZED'),
        { status: 401 }
      );
    }

    if (!isSuperAdminEmail(currentUser.email)) {
      return NextResponse.json(
        errorResponse('仅管理员可置顶帖子', 'FORBIDDEN'),
        { status: 403 }
      );
    }

    const threadId = params.id;
    const body = await request.json().catch(() => ({}));
    const hasPinnedValue = typeof body?.pinned === 'boolean';

    const thread = await prisma.feedbackThread.findUnique({
      where: { id: threadId },
      select: {
        id: true,
        isPinned: true,
      },
    });

    if (!thread) {
      return NextResponse.json(
        errorResponse('帖子不存在', 'FEEDBACK_THREAD_NOT_FOUND'),
        { status: 404 }
      );
    }

    const nextPinned = hasPinnedValue ? body.pinned : !thread.isPinned;

    const updated = await prisma.feedbackThread.update({
      where: { id: threadId },
      data: {
        isPinned: nextPinned,
      },
      select: {
        id: true,
        isPinned: true,
      },
    });

    return NextResponse.json(successResponse(updated));
  } catch (error) {
    console.error('置顶帖子失败:', error);
    return NextResponse.json(
      errorResponse('置顶帖子失败', 'FEEDBACK_THREAD_PIN_ERROR'),
      { status: 500 }
    );
  }
}
