/**
 * Skills API - GET (列表) 和 POST (创建)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { successResponse, errorResponse, calculatePagination } from '@/lib/utils';
import {
  isSqliteProvider,
  normalizeTagsFromDb,
  parseTagsInput,
  toPrismaTagsValue,
} from '@/lib/tags';

// ===========================================
// GET /api/skills - 获取技能包列表
// ===========================================
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    
    // 解析查询参数
    const keyword = searchParams.get('keyword') || undefined;
    const tags = parseTagsInput(searchParams.get('tags'));
    const authorId = searchParams.get('authorId') || undefined;
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortOrder = searchParams.get('sortOrder') || 'desc';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);

    // 计算分页
    const { skip, take } = calculatePagination({ page, pageSize });

    // 构建查询条件
    const where: any = {
      status: 'active',
    };

    if (keyword) {
      where.OR = [
        { title: { contains: keyword } },
        { description: { contains: keyword } },
      ];
    }

    if (tags.length > 0) {
      if (isSqliteProvider(prisma)) {
        where.AND = [
          ...(where.AND || []),
          ...tags.map((tag) => ({
            tags: {
              contains: tag,
            },
          })),
        ];
      } else {
        where.tags = {
          hasSome: tags,
        };
      }
    }

    if (authorId) {
      where.authorId = authorId;
    }

    // 查询数据库
    const [skills, total] = await Promise.all([
      prisma.skill.findMany({
        where,
        include: {
          author: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
              department: true,
            },
          },
        },
        skip,
        take,
        orderBy: {
          [sortBy]: sortOrder,
        },
      }),
      prisma.skill.count({ where }),
    ]);

    const normalizedSkills = skills.map((skill) => ({
      ...skill,
      tags: normalizeTagsFromDb(skill.tags),
    }));
    const totalPages = Math.ceil(total / pageSize);

    return NextResponse.json(
      successResponse({
        items: normalizedSkills,
        total,
        page,
        pageSize,
        totalPages,
      })
    );
  } catch (error: any) {
    console.error('获取技能包列表失败:', error);
    return NextResponse.json(
      errorResponse('获取技能包列表失败', 'SKILLS_FETCH_ERROR'),
      { status: 500 }
    );
  }
}

// ===========================================
// POST /api/skills - 创建新技能包
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
    const { title, description, tags, fileName, fileSize, fileType } = body;
    const normalizedTags = parseTagsInput(tags);

    // 验证必填字段
    if (!title || !description || !fileName || !fileSize || !fileType) {
      return NextResponse.json(
        errorResponse('缺少必填字段', 'VALIDATION_ERROR'),
        { status: 400 }
      );
    }

    // 创建技能包记录
    const skill = await prisma.skill.create({
      data: {
        title,
        description,
        tags: toPrismaTagsValue(normalizedTags, prisma) as any,
        fileName,
        fileSize,
        fileType,
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

    const normalizedSkill = {
      ...skill,
      tags: normalizeTagsFromDb(skill.tags),
    };

    return NextResponse.json(
      successResponse(normalizedSkill, '技能包创建成功'),
      { status: 201 }
    );
  } catch (error: any) {
    console.error('创建技能包失败:', error);
    return NextResponse.json(
      errorResponse('创建技能包失败', 'SKILL_CREATE_ERROR'),
      { status: 500 }
    );
  }
}
