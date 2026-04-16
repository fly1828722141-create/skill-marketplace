/**
 * Skill API - GET (详情), PUT (更新), DELETE (删除)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { successResponse, errorResponse } from '@/lib/utils';
import { normalizeTagsFromDb, parseTagsInput, toPrismaTagsValue } from '@/lib/tags';

// ===========================================
// GET /api/skills/[id] - 获取技能包详情
// ===========================================
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const skillId = params.id;

    // 查询技能包详情
    const skill = await prisma.skill.findUnique({
      where: { id: skillId },
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
      },
    });

    if (!skill) {
      return NextResponse.json(
        errorResponse('技能包不存在', 'SKILL_NOT_FOUND'),
        { status: 404 }
      );
    }

    // 增加浏览次数
    await prisma.skill.update({
      where: { id: skillId },
      data: { viewCount: skill.viewCount + 1 },
    });

    const normalizedSkill = {
      ...skill,
      tags: normalizeTagsFromDb(skill.tags),
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
    // 验证登录
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        errorResponse('请先登录', 'UNAUTHORIZED'),
        { status: 401 }
      );
    }

    const skillId = params.id;
    const body = await request.json();
    const { title, description, tags } = body;

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

    // 验证权限（只有作者可以修改）
    if (existingSkill.authorId !== session.user.id) {
      return NextResponse.json(
        errorResponse('无权限修改此技能包', 'FORBIDDEN'),
        { status: 403 }
      );
    }

    const normalizedTags =
      tags !== undefined
        ? parseTagsInput(tags)
        : normalizeTagsFromDb(existingSkill.tags);

    // 更新技能包
    const updatedSkill = await prisma.skill.update({
      where: { id: skillId },
      data: {
        title: title || existingSkill.title,
        description: description || existingSkill.description,
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
    // 验证登录
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        errorResponse('请先登录', 'UNAUTHORIZED'),
        { status: 401 }
      );
    }

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

    // 验证权限（只有作者可以删除）
    if (existingSkill.authorId !== session.user.id) {
      return NextResponse.json(
        errorResponse('无权限删除此技能包', 'FORBIDDEN'),
        { status: 403 }
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
