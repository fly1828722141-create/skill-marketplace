/**
 * Skill 发布 API
 *
 * 纯链接发布模式：仅接受 Skill 外链，不再上传压缩包文件
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { ensureDefaultCategories } from '@/lib/skill-categories';
import { recordEvent } from '@/lib/event-log';
import { successResponse, errorResponse } from '@/lib/utils';
import { normalizeTagsFromDb, parseTagsInput, toPrismaTagsValue } from '@/lib/tags';

// ===========================================
// POST /api/upload - 发布 Skill 链接
// ===========================================
export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json(
        errorResponse('请先登录后再上传 Skill', 'UNAUTHORIZED'),
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const sourceMode = String(formData.get('sourceMode') || '').toLowerCase();
    const title = formData.get('title') as string;
    const summary = formData.get('summary') as string;
    const description = formData.get('description') as string;
    const categoryId = formData.get('categoryId') as string;
    const tagsInput = formData.get('tags');
    const externalUrlRaw = ((formData.get('externalUrl') as string) || '').trim();
    const externalUrlInput = normalizeExternalLinkInput(externalUrlRaw);

    if (sourceMode === 'file') {
      return NextResponse.json(
        errorResponse('当前站点已切换为纯链接发布，不再支持文件上传', 'FILE_UPLOAD_DISABLED'),
        { status: 400 }
      );
    }

    if (!title || !summary || !description || !categoryId) {
      return NextResponse.json(
        errorResponse('缺少必填字段', 'VALIDATION_ERROR'),
        { status: 400 }
      );
    }

    if (!externalUrlInput) {
      return NextResponse.json(
        errorResponse('缺少 Skill 链接', 'VALIDATION_ERROR'),
        { status: 400 }
      );
    }

    if (!isHttpUrl(externalUrlInput)) {
      return NextResponse.json(
        errorResponse('Skill 链接格式不正确，仅支持 http/https', 'VALIDATION_ERROR'),
        { status: 400 }
      );
    }

    if (summary.trim().length < 10) {
      return NextResponse.json(
        errorResponse('功能简介至少 10 个字', 'VALIDATION_ERROR'),
        { status: 400 }
      );
    }

    const tags = parseTagsInput(tagsInput);
    await ensureDefaultCategories();

    const category = await prisma.skillCategory.findFirst({
      where: {
        status: 'active',
        OR: [{ id: categoryId }, { slug: categoryId }],
      },
      select: { id: true },
    });

    if (!category) {
      return NextResponse.json(
        errorResponse('请选择有效的 Skill 分类', 'VALIDATION_ERROR'),
        { status: 400 }
      );
    }

    const normalizedUrl = new URL(externalUrlInput).toString();
    const fileType = inferFileTypeFromUrl(normalizedUrl);

    const createdSkill = await prisma.skill.create({
      data: {
        title,
        summary: summary.trim(),
        description,
        categoryId: category.id,
        tags: toPrismaTagsValue(tags, prisma) as any,
        fileName: normalizedUrl,
        fileSize: 0,
        fileType,
        authorId: currentUser.id,
        status: 'active',
      },
    });

    const skill = await prisma.skill.findUnique({
      where: { id: createdSkill.id },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
        category: {
          select: {
            id: true,
            slug: true,
            name: true,
            icon: true,
          },
        },
      },
    });

    if (!skill) {
      return NextResponse.json(
        errorResponse('发布成功但读取结果失败，请刷新后查看', 'UPLOAD_RESULT_MISSING'),
        { status: 500 }
      );
    }

    const normalizedSkill = {
      ...skill,
      tags: normalizeTagsFromDb(skill.tags),
    };

    await recordEvent({
      eventName: 'skill_upload_success',
      page: '/upload',
      module: 'upload',
      action: 'create',
      userId: currentUser.id,
      skillId: skill.id,
      categoryId: skill.categoryId,
      metadata: {
        fileType,
        fileSize: 0,
        sourceMode: 'link',
        storageMode: 'link',
      },
    });

    return NextResponse.json(
      successResponse(
        {
          skill: normalizedSkill,
          fileUrl: normalizedUrl,
        },
        '链接发布成功'
      ),
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Skill 链接发布失败:', error);
    return NextResponse.json(
      errorResponse(`发布失败：${error.message}`, 'UPLOAD_ERROR'),
      { status: 500 }
    );
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function inferFileTypeFromUrl(value: string): string {
  try {
    const parsed = new URL(value);
    const path = parsed.pathname.toLowerCase();
    if (path.endsWith('.tar.gz')) return 'tar.gz';
    const fileName = path.split('/').pop() || '';
    if (fileName.includes('.')) {
      const ext = fileName.split('.').pop();
      if (ext) return ext;
    }
  } catch {
    // noop
  }
  return 'link';
}

function normalizeExternalLinkInput(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  if (isHttpUrl(trimmed)) return trimmed;

  const urlMatch = trimmed.match(/https?:\/\/[^\s"'<>]+/i);
  if (!urlMatch) return '';

  return urlMatch[0].replace(/[),.;!?]+$/g, '');
}
