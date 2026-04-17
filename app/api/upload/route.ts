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
    const file = formData.get('file') as File;
    const title = formData.get('title') as string;
    const summary = formData.get('summary') as string;
    const description = formData.get('description') as string;
    const categoryId = formData.get('categoryId') as string;
    const tagsInput = formData.get('tags');

    // 验证必填字段
    if (!file || !title || !summary || !description || !categoryId) {
      return NextResponse.json(
        errorResponse('缺少必填字段', 'VALIDATION_ERROR'),
        { status: 400 }
      );
    }

    if (summary.trim().length < 10) {
      return NextResponse.json(
        errorResponse('功能简介至少 10 个字', 'VALIDATION_ERROR'),
        { status: 400 }
      );
    }

    // 验证文件
    const validation = validateFile(file.name, file.size);
    if (!validation.valid) {
      return NextResponse.json(
        errorResponse(validation.error || '文件验证失败', 'FILE_VALIDATION_ERROR'),
        { status: 400 }
      );
    }

    // 读取文件为 Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 生成安全的文件名
    const safeFileName = sanitizeFileName(file.name);
    const uniqueFileName = `${Date.now()}-${safeFileName}`;

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

    // 上传到 OSS
    const uploadResult = await uploadFile(buffer, uniqueFileName, file.type);
    const normalizedFileType = file.name.toLowerCase().endsWith('.tar.gz')
      ? 'tar.gz'
      : file.name.split('.').pop() || '';

    // 创建技能包记录
    const skill = await prisma.skill.create({
      data: {
        title,
        summary: summary.trim(),
        description,
        categoryId: category.id,
        tags: toPrismaTagsValue(tags, prisma) as any,
        fileName: uploadResult.fileName,
        fileSize: uploadResult.fileSize,
        fileType: normalizedFileType,
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
        fileType: normalizedFileType,
        fileSize: uploadResult.fileSize,
      },
    });

    return NextResponse.json(
      successResponse(
        {
          skill: normalizedSkill,
          fileUrl: uploadResult.url,
        },
        '上传成功'
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
