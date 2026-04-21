import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { ensureDefaultCategories } from '@/lib/skill-categories';
import { getFallbackSkillCategories } from '@/lib/category-presets';
import { successResponse } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// ===========================================
// GET /api/categories - 获取数字人列表（兼容旧分类接口）
// ===========================================
export async function GET() {
  const fallbackCategories = getFallbackSkillCategories();

  try {
    try {
      await ensureDefaultCategories();
    } catch (error) {
      console.error('初始化默认数字人失败，继续返回现有列表:', error);
    }

    const categories = await prisma.skillCategory.findMany({
      where: { status: 'active' },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        slug: true,
        name: true,
        icon: true,
        sortOrder: true,
      },
    });

    if (categories.length === 0) {
      return NextResponse.json(
        successResponse(fallbackCategories, '数字人为空，已回退默认数字人')
      );
    }

    return NextResponse.json(successResponse(categories));
  } catch (error: any) {
    console.error('获取数字人列表失败:', error);
    return NextResponse.json(
      successResponse(fallbackCategories, '数字人服务暂时降级，已返回默认数字人')
    );
  }
}
