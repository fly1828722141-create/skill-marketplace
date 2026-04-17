import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { ensureDefaultCategories } from '@/lib/skill-categories';
import { errorResponse, successResponse } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// ===========================================
// GET /api/categories - 获取分类列表
// ===========================================
export async function GET() {
  try {
    await ensureDefaultCategories();

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

    return NextResponse.json(successResponse(categories));
  } catch (error: any) {
    console.error('获取分类列表失败:', error);
    return NextResponse.json(
      errorResponse('获取分类列表失败', 'CATEGORY_FETCH_ERROR'),
      { status: 500 }
    );
  }
}
