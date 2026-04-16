/**
 * 下载 API
 * 
 * 处理 Skill 包下载请求和统计
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { successResponse, errorResponse } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// ===========================================
// POST /api/download - 创建下载记录并获取下载链接
// ===========================================
export async function POST(request: NextRequest) {
  try {
    // 验证登录
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        errorResponse('请先登录', 'UNAUTHORIZED'),
        { status: 401 }
      );
    }

    // 解析请求体
    const body = await request.json();
    const { skillId } = body;

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

    // 检查是否已下载过（避免重复计数）
    const existingDownload = await prisma.download.findUnique({
      where: {
        userId_skillId: {
          userId: session.user.id,
          skillId: skillId,
        },
      },
    });

    let downloadCountIncremented = false;

    if (!existingDownload) {
      // 创建下载记录
      await prisma.download.create({
        data: {
          userId: session.user.id,
          skillId: skillId,
        },
      });

      // 增加下载次数
      await prisma.skill.update({
        where: { id: skillId },
        data: { downloadCount: skill.downloadCount + 1 },
      });

      downloadCountIncremented = true;
    }

    // 获取临时下载链接（有效期 1 小时）
    const { generateTempUrl } = await import('@/lib/oss');
    const downloadUrl = await generateTempUrl(skill.fileName, 3600);

    return NextResponse.json(
      successResponse({
        downloadUrl,
        fileName: skill.fileName,
        fileSize: skill.fileSize,
        downloadedBefore: !!existingDownload,
        downloadCountIncremented,
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
