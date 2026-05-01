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

function asSafeText(input: unknown): string {
  return typeof input === 'string' ? input.trim() : '';
}

export async function PUT(
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
        errorResponse('仅管理员可修改帖子', 'FORBIDDEN'),
        { status: 403 }
      );
    }

    const threadId = params.id;
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

    const updated = await prisma.feedbackThread.update({
      where: { id: threadId },
      data: {
        title,
        content,
      },
      select: {
        id: true,
        title: true,
        content: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(successResponse(updated, '帖子修改成功'));
  } catch (error) {
    console.error('修改反馈帖子失败:', error);
    return NextResponse.json(
      errorResponse('修改帖子失败', 'FEEDBACK_THREAD_UPDATE_ERROR'),
      { status: 500 }
    );
  }
}

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
