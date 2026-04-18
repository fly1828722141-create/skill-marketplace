/**
 * 文件上传 API
 * 
 * 处理 Skill 包文件的上传逻辑
 */

import { NextRequest, NextResponse } from 'next/server';
import { uploadFile, validateFile } from '@/lib/oss';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { ensureDefaultCategories } from '@/lib/skill-categories';
import { recordEvent } from '@/lib/event-log';
import { successResponse, errorResponse, sanitizeFileName } from '@/lib/utils';
import { normalizeTagsFromDb, parseTagsInput, toPrismaTagsValue } from '@/lib/tags';

// ===========================================
// POST /api/upload - 上传文件
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

    // 解析 FormData
    const formData = await request.formData();
    const sourceMode = (formData.get('sourceMode') as string) || 'file';
    const isLinkMode = sourceMode === 'link';
    const file = formData.get('file') as File | null;
    const title = formData.get('title') as string;
    const summary = formData.get('summary') as string;
    const description = formData.get('description') as string;
    const categoryId = formData.get('categoryId') as string;
    const tagsInput = formData.get('tags');
    const externalUrlInput = ((formData.get('externalUrl') as string) || '').trim();

    // 验证必填字段
    if (!title || !summary || !description || !categoryId) {
      return NextResponse.json(
        errorResponse('缺少必填字段', 'VALIDATION_ERROR'),
        { status: 400 }
      );
    }

    if (isLinkMode) {
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
    } else if (!file) {
      return NextResponse.json(
        errorResponse('缺少上传文件', 'VALIDATION_ERROR'),
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

    let storedFileName = '';
    let storedFileSize = 0;
    let storedFileType = '';
    let fileUrl = '';

    if (isLinkMode) {
      const normalizedUrl = new URL(externalUrlInput).toString();
      storedFileName = normalizedUrl;
      storedFileType = inferFileTypeFromUrl(normalizedUrl);
      storedFileSize = 0;
      fileUrl = normalizedUrl;
    } else {
      const selectedFile = file as File;

      // 验证文件
      const validation = validateFile(selectedFile.name, selectedFile.size);
      if (!validation.valid) {
        return NextResponse.json(
          errorResponse(validation.error || '文件验证失败', 'FILE_VALIDATION_ERROR'),
          { status: 400 }
        );
      }

      // 读取文件为 Buffer
      const arrayBuffer = await selectedFile.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // 生成安全的文件名
      const safeFileName = sanitizeFileName(selectedFile.name);
      const uniqueFileName = `${Date.now()}-${safeFileName}`;

      // 上传到 OSS
      const uploadResult = await uploadFile(buffer, uniqueFileName, selectedFile.type);
      storedFileName = uploadResult.fileName;
      storedFileSize = uploadResult.fileSize;
      storedFileType = selectedFile.name.toLowerCase().endsWith('.tar.gz')
        ? 'tar.gz'
        : selectedFile.name.split('.').pop() || '';
      fileUrl = uploadResult.url;
    }

    // 创建技能包记录
    const skill = await prisma.skill.create({
      data: {
        title,
        summary: summary.trim(),
        description,
        categoryId: category.id,
        tags: toPrismaTagsValue(tags, prisma) as any,
        fileName: storedFileName,
        fileSize: storedFileSize,
        fileType: storedFileType,
        authorId: currentUser.id,
        status: 'active',
      },
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
        fileType: storedFileType,
        fileSize: storedFileSize,
        sourceMode: isLinkMode ? 'link' : 'file',
      },
    });

    return NextResponse.json(
      successResponse(
        {
          skill: normalizedSkill,
          fileUrl,
        },
        isLinkMode ? '链接发布成功' : '上传成功'
      ),
      { status: 201 }
    );
  } catch (error: any) {
    console.error('文件上传失败:', error);
    return NextResponse.json(
      errorResponse(`上传失败：${error.message}`, 'UPLOAD_ERROR'),
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
