/**
 * 文件上传 API
 * 
 * 处理 Skill 包文件的上传逻辑
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { uploadFile, validateFile } from '@/lib/oss';
import prisma from '@/lib/prisma';
import { successResponse, errorResponse, sanitizeFileName } from '@/lib/utils';

// ===========================================
// POST /api/upload - 上传文件
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

    // 解析 FormData
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const title = formData.get('title') as string;
    const description = formData.get('description') as string;
    const tagsString = formData.get('tags') as string;

    // 验证必填字段
    if (!file || !title || !description) {
      return NextResponse.json(
        errorResponse('缺少必填字段', 'VALIDATION_ERROR'),
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

    // 上传到 OSS
    const uploadResult = await uploadFile(buffer, uniqueFileName, file.type);

    // 创建技能包记录
    const skill = await prisma.skill.create({
      data: {
        title,
        description,
        tags: tagsString || '', // SQLite 使用字符串，PostgreSQL 会在写入时自动转换
        fileName: uploadResult.fileName,
        fileSize: uploadResult.fileSize,
        fileType: file.name.split('.').pop() || '',
        authorId: session.user.id,
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
      },
    });

    return NextResponse.json(
      successResponse(
        {
          skill,
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
