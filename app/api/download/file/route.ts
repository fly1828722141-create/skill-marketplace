import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { errorResponse } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function toSafeAsciiFileName(input: string): string {
  const normalized = input
    .replace(/[\r\n]/g, '')
    .replace(/[/\\?%*:|"<>]/g, '-')
    .trim();
  if (!normalized) return 'skill-package.zip';

  const ascii = normalized.replace(/[^\x20-\x7E]/g, '_');
  return ascii || 'skill-package.zip';
}

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json(
        errorResponse('请先登录后下载 Skill', 'UNAUTHORIZED'),
        { status: 401 }
      );
    }

    const skillId = request.nextUrl.searchParams.get('skillId');
    if (!skillId) {
      return NextResponse.json(
        errorResponse('缺少技能包 ID', 'VALIDATION_ERROR'),
        { status: 400 }
      );
    }

    const skill = await prisma.skill.findUnique({
      where: { id: skillId },
      select: {
        id: true,
        status: true,
        fileName: true,
        fileType: true,
      },
    });

    if (!skill || skill.status !== 'active') {
      return NextResponse.json(
        errorResponse('技能包不存在或不可下载', 'SKILL_NOT_FOUND'),
        { status: 404 }
      );
    }

    const fileBlob = await prisma.skillFileBlob.findUnique({
      where: { skillId },
      select: {
        fileData: true,
        originalName: true,
        mimeType: true,
      },
    });

    if (!fileBlob) {
      return NextResponse.json(
        errorResponse('文件不存在或已迁移到外部存储', 'FILE_NOT_FOUND'),
        { status: 404 }
      );
    }

    const originalName = fileBlob.originalName || skill.fileName || 'skill-package';
    const asciiName = toSafeAsciiFileName(originalName);
    const utf8Name = encodeURIComponent(originalName);

    return new NextResponse(new Uint8Array(fileBlob.fileData), {
      status: 200,
      headers: {
        'Content-Type': fileBlob.mimeType || 'application/octet-stream',
        'Content-Length': String(fileBlob.fileData.length),
        'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`,
        'Cache-Control': 'private, no-store, max-age=0',
      },
    });
  } catch (error: any) {
    console.error('下载数据库文件失败:', error);
    return NextResponse.json(
      errorResponse('下载失败，请稍后重试', 'DOWNLOAD_FILE_ERROR'),
      { status: 500 }
    );
  }
}
