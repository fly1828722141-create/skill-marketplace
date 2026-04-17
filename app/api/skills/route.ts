/**
 * Skills API - GET (列表) 和 POST (创建)
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { ensureDefaultCategories } from '@/lib/skill-categories';
import { recordEvent } from '@/lib/event-log';
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
    const categoryId = searchParams.get('categoryId') || undefined;
    const sortByInput = searchParams.get('sortBy') || 'createdAt';
    const sortOrderInput = searchParams.get('sortOrder') || 'desc';
    const sortBy = ['createdAt', 'downloadCount', 'viewCount', 'updatedAt'].includes(
      sortByInput
    )
      ? sortByInput
      : 'createdAt';
    const sortOrder = sortOrderInput === 'asc' ? 'asc' : 'desc';
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

    if (categoryId) {
      const matchedCategory = await prisma.skillCategory.findFirst({
        where: {
          status: 'active',
          OR: [{ id: categoryId }, { slug: categoryId }],
        },
        select: { id: true },
      });
      where.categoryId = matchedCategory?.id ?? categoryId;
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
          category: {
            select: {
              id: true,
              slug: true,
              name: true,
              icon: true,
            },
          },
          _count: {
            select: {
              comments: true,
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
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        errorResponse('请先登录后再上传 Skill', 'UNAUTHORIZED'),
        { status: 401 }
      );
    }

    // 解析请求体
    const body = await request.json();
    const {
      title,
      summary,
      description,
      categoryId,
      tags,
      fileName,
      fileSize,
      fileType,
    } = body;
    const normalizedTags = parseTagsInput(tags);

    // 验证必填字段
    if (
      !title ||
      !summary ||
      !description ||
      !categoryId ||
      !fileName ||
      !fileSize ||
      !fileType
    ) {
      return NextResponse.json(
        errorResponse('缺少必填字段', 'VALIDATION_ERROR'),
        { status: 400 }
      );
    }

    if (typeof summary !== 'string' || summary.trim().length < 10) {
      return NextResponse.json(
        errorResponse('功能简介至少 10 个字', 'VALIDATION_ERROR'),
        { status: 400 }
      );
    }

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

    // 创建技能包记录
    const skill = await prisma.skill.create({
      data: {
        title,
        summary: summary.trim(),
        description,
        categoryId: category.id,
        tags: toPrismaTagsValue(normalizedTags, prisma) as any,
        fileName,
        fileSize,
        fileType,
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
        fileType,
        fileSize,
        source: 'json-api',
      },
    });

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
