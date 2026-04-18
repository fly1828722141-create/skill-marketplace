/**
 * Skill API - GET (详情), PUT (更新), DELETE (删除)
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { successResponse, errorResponse } from '@/lib/utils';
import { normalizeTagsFromDb, parseTagsInput, toPrismaTagsValue } from '@/lib/tags';
import { ensureDefaultCategories } from '@/lib/skill-categories';

// ===========================================
// GET /api/skills/[id] - 获取技能包详情
// ===========================================
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const skillId = params.id;

    let skill: any = null;
    try {
      // 原子递增浏览量，返回最新详情
      skill = await prisma.skill.update({
        where: { id: skillId },
        data: {
          viewCount: {
            increment: 1,
          },
        },
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
          downloads: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  avatar: true,
                },
              },
            },
            take: 10,
            orderBy: { downloadedAt: 'desc' },
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
      });
    } catch (error: any) {
      if (error?.code === 'P2025') {
        return NextResponse.json(
          errorResponse('技能包不存在', 'SKILL_NOT_FOUND'),
          { status: 404 }
        );
      }
      throw error;
    }

    const ratingAggregate = await prisma.comment.aggregate({
      where: {
        skillId,
        rating: {
          not: null,
        },
      },
      _avg: {
        rating: true,
      },
    });

    const normalizedSkill = {
      ...skill,
      tags: normalizeTagsFromDb(skill.tags),
      ratingAvg: ratingAggregate._avg.rating ?? null,
      ratingCount: skill._count?.comments ?? 0,
    };

    return NextResponse.json(successResponse(normalizedSkill));
  } catch (error: any) {
    console.error('获取技能包详情失败:', error);
    return NextResponse.json(
      errorResponse('获取技能包详情失败', 'SKILL_FETCH_ERROR'),
      { status: 500 }
    );
  }
}

// ===========================================
// PUT /api/skills/[id] - 更新技能包
// ===========================================
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const skillId = params.id;
    const body = await request.json();
    const { title, summary, description, categoryId, tags } = body;

    // 检查技能包是否存在
    const existingSkill = await prisma.skill.findUnique({
      where: { id: skillId },
    });

    if (!existingSkill) {
      return NextResponse.json(
        errorResponse('技能包不存在', 'SKILL_NOT_FOUND'),
        { status: 404 }
      );
    }

    const normalizedTags =
      tags !== undefined
        ? parseTagsInput(tags)
        : normalizeTagsFromDb(existingSkill.tags);

    let normalizedSummary: string | undefined;
    if (summary !== undefined) {
      if (typeof summary !== 'string' || summary.trim().length < 10) {
        return NextResponse.json(
          errorResponse('功能简介至少 10 个字', 'VALIDATION_ERROR'),
          { status: 400 }
        );
      }
      normalizedSummary = summary.trim();
    }

    let normalizedCategoryId: string | undefined;
    if (categoryId !== undefined) {
      await ensureDefaultCategories();
      const category = await prisma.skillCategory.findUnique({
        where: { id: categoryId },
        select: { id: true, status: true },
      });

      if (!category || category.status !== 'active') {
        return NextResponse.json(
          errorResponse('请选择有效的 Skill 分类', 'VALIDATION_ERROR'),
          { status: 400 }
        );
      }

      normalizedCategoryId = category.id;
    }

    // 更新技能包
    const updatedSkill = await prisma.skill.update({
      where: { id: skillId },
      data: {
        title: title || existingSkill.title,
        summary:
          normalizedSummary !== undefined ? normalizedSummary : existingSkill.summary,
        description: description || existingSkill.description,
        categoryId:
          normalizedCategoryId !== undefined
            ? normalizedCategoryId
            : existingSkill.categoryId,
        tags: toPrismaTagsValue(normalizedTags, prisma) as any,
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
      ...updatedSkill,
      tags: normalizeTagsFromDb(updatedSkill.tags),
    };

    return NextResponse.json(
      successResponse(normalizedSkill, '技能包更新成功')
    );
  } catch (error: any) {
    console.error('更新技能包失败:', error);
    return NextResponse.json(
      errorResponse('更新技能包失败', 'SKILL_UPDATE_ERROR'),
      { status: 500 }
    );
  }
}

// ===========================================
// DELETE /api/skills/[id] - 删除技能包
// ===========================================
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const skillId = params.id;

    // 检查技能包是否存在
    const existingSkill = await prisma.skill.findUnique({
      where: { id: skillId },
    });

    if (!existingSkill) {
      return NextResponse.json(
        errorResponse('技能包不存在', 'SKILL_NOT_FOUND'),
        { status: 404 }
      );
    }

    // 软删除（标记为 deleted）
    await prisma.skill.update({
      where: { id: skillId },
      data: { status: 'deleted' },
    });

    return NextResponse.json(
      successResponse(null, '技能包已删除')
    );
  } catch (error: any) {
    console.error('删除技能包失败:', error);
    return NextResponse.json(
      errorResponse('删除技能包失败', 'SKILL_DELETE_ERROR'),
      { status: 500 }
    );
  }
}
