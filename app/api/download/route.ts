/**
 * 下载 API
 * 
 * 处理 Skill 包下载请求和统计
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { recordEvent } from '@/lib/event-log';
import { successResponse, errorResponse } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// ===========================================
// POST /api/download - 创建下载记录并获取下载链接
// ===========================================
export async function POST(request: NextRequest) {
  try {
    // 解析请求体
    const body = await request.json();
    const { skillId, anonymousId, sessionId, mode } = body;
    const actionMode = mode === 'copy' ? 'copy' : 'download';
    const currentUser = await getCurrentUser();

    if (actionMode === 'download' && !currentUser) {
      return NextResponse.json(
        errorResponse('请先登录 Google 账号后下载 Skill', 'UNAUTHORIZED'),
        { status: 401 }
      );
    }

    if (!skillId) {
      return NextResponse.json(
        errorResponse('缺少技能包 ID', 'VALIDATION_ERROR'),
        { status: 400 }
      );
    }

    // 检查技能包是否存在
    const skill = await prisma.skill.findUnique({
      where: { id: skillId },
    });

    if (!skill) {
      return NextResponse.json(
        errorResponse('技能包不存在', 'SKILL_NOT_FOUND'),
        { status: 404 }
      );
    }

    // 已登录用户每次点击都计一次下载
    const updatedSkill = await prisma.skill.update({
      where: { id: skillId },
      data: {
        downloadCount: {
          increment: 1,
        },
      },
      select: {
        downloadCount: true,
      },
    });

    let downloadedBefore = false;

    if (currentUser) {
      const existingDownload = await prisma.download.findUnique({
        where: {
          userId_skillId: {
            userId: currentUser.id,
            skillId,
          },
        },
        select: { id: true },
      });

      downloadedBefore = Boolean(existingDownload);

      if (existingDownload) {
        await prisma.download.update({
          where: {
            userId_skillId: {
              userId: currentUser.id,
              skillId,
            },
          },
          data: {
            downloadedAt: new Date(),
          },
        });
      } else {
        await prisma.download.create({
          data: {
            userId: currentUser.id,
            skillId,
          },
        });
      }
    }

    await recordEvent({
      eventName: 'skill_download_click',
      page: '/skills/[id]',
      module: 'skill-detail',
      action: actionMode,
      userId: currentUser?.id || null,
      skillId,
      anonymousId: typeof anonymousId === 'string' ? anonymousId : null,
      sessionId: typeof sessionId === 'string' ? sessionId : null,
    });

    if (actionMode === 'copy') {
      return NextResponse.json(
        successResponse({
          mode: actionMode,
          downloadCountIncremented: true,
          totalDownloads: updatedSkill.downloadCount,
          downloadedBefore,
        })
      );
    }

    let downloadUrl = '';
    const isExternalLinkSkill =
      skill.fileType?.toLowerCase() === 'link' || /^https?:\/\//i.test(skill.fileName);

    if (isExternalLinkSkill) {
      if (!/^https?:\/\//i.test(skill.fileName)) {
        return NextResponse.json(
          errorResponse('外链 Skill 地址无效', 'INVALID_LINK'),
          { status: 400 }
        );
      }
      downloadUrl = skill.fileName;
    } else {
      // 获取临时下载链接（有效期 1 小时）
      const { generateTempUrl } = await import('@/lib/oss');
      downloadUrl = await generateTempUrl(skill.fileName, 3600);
    }

    return NextResponse.json(
      successResponse({
        downloadUrl,
        fileName: skill.fileName,
        fileSize: skill.fileSize,
        sourceMode: isExternalLinkSkill ? 'link' : 'file',
        downloadedBefore,
        downloadCountIncremented: true,
        totalDownloads: updatedSkill.downloadCount,
      })
    );
  } catch (error: any) {
    console.error('下载处理失败:', error);
    return NextResponse.json(
      errorResponse(`下载失败：${error.message}`, 'DOWNLOAD_ERROR'),
      { status: 500 }
    );
  }
}

// ===========================================
// GET /api/download/stats/[skillId] - 获取下载统计
// ===========================================
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const skillId = searchParams.get('skillId');

    if (!skillId) {
      return NextResponse.json(
        errorResponse('缺少技能包 ID', 'VALIDATION_ERROR'),
        { status: 400 }
      );
    }

    // 查询下载统计
    const skill = await prisma.skill.findUnique({
      where: { id: skillId },
      include: {
        downloads: {
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
          orderBy: { downloadedAt: 'desc' },
          take: 50,
        },
        _count: {
          select: { downloads: true },
        },
      },
    });

    if (!skill) {
      return NextResponse.json(
        errorResponse('技能包不存在', 'SKILL_NOT_FOUND'),
        { status: 404 }
      );
    }

    return NextResponse.json(
      successResponse({
        skillId: skill.id,
        totalDownloads: skill.downloadCount,
        recentDownloads: skill.downloads.map(d => ({
          user: d.user,
          downloadedAt: d.downloadedAt,
        })),
      })
    );
  } catch (error: any) {
    console.error('获取下载统计失败:', error);
    return NextResponse.json(
      errorResponse('获取下载统计失败', 'DOWNLOAD_STATS_ERROR'),
      { status: 500 }
    );
  }
}
