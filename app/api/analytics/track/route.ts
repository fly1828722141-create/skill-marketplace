import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { errorResponse, successResponse } from '@/lib/utils';
import { recordEvent } from '@/lib/event-log';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const currentUser = await getCurrentUser();

    const eventName =
      typeof body?.eventName === 'string' ? body.eventName.trim() : '';

    if (!eventName) {
      return NextResponse.json(
        errorResponse('eventName 不能为空', 'VALIDATION_ERROR'),
        { status: 400 }
      );
    }

    const ok = await recordEvent({
      eventName,
      page: body?.page,
      module: body?.module,
      action: body?.action,
      skillId: body?.skillId,
      categoryId: body?.categoryId,
      sessionId: body?.sessionId,
      anonymousId: body?.anonymousId,
      metadata: body?.metadata,
      userId: currentUser?.id ?? null,
    });

    return NextResponse.json(
      successResponse({
        tracked: ok,
      })
    );
  } catch (error: any) {
    console.error('埋点上报失败:', error);
    return NextResponse.json(
      errorResponse('埋点上报失败', 'TRACK_EVENT_ERROR'),
      { status: 500 }
    );
  }
}
