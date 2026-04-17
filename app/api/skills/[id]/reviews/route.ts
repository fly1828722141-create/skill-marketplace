import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { uploadFile } from '@/lib/oss';
import { recordEvent } from '@/lib/event-log';
import { errorResponse, sanitizeFileName, successResponse } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const MAX_REVIEW_IMAGES = 4;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_CONTENT_LENGTH = 2000;

function getValidRating(input: unknown): number | null {
  if (input === null || input === undefined || input === '') return null;
  const parsed = Number(input);
  if (!Number.isInteger(parsed)) return null;
  if (parsed < 1 || parsed > 5) return null;
  return parsed;
}

function getImageFiles(formData: FormData): File[] {
  return formData
    .getAll('images')
    .filter((item): item is File => item instanceof File && item.size > 0);
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const skillId = params.id;
    const currentUser = await getCurrentUser();
    const page = Math.max(1, Number(request.nextUrl.searchParams.get('page') || 1));
    const pageSize = Math.min(
      50,
      Math.max(1, Number(request.nextUrl.searchParams.get('pageSize') || 20))
    );
    const skip = (page - 1) * pageSize;

    const [reviews, total] = await Promise.all([
      prisma.comment.findMany({
        where: { skillId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              avatar: true,
              department: true,
            },
          },
          images: {
            select: {
              id: true,
              url: true,
              fileName: true,
              sortOrder: true,
            },
            orderBy: { sortOrder: 'asc' },
          },
          _count: {
            select: { likes: true },
          },
        },
        orderBy: [{ likeCount: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: pageSize,
      }),
      prisma.comment.count({
        where: { skillId },
      }),
    ]);

    let likedReviewIds = new Set<string>();
    if (currentUser && reviews.length > 0) {
      const likes = await prisma.commentLike.findMany({
        where: {
          userId: currentUser.id,
          commentId: {
            in: reviews.map((review) => review.id),
          },
        },
        select: {
          commentId: true,
        },
      });

      likedReviewIds = new Set(likes.map((item) => item.commentId));
    }

    return NextResponse.json(
      successResponse({
        items: reviews.map((review) => ({
          ...review,
          likeCount: review.likeCount || review._count.likes,
          likedByCurrentUser: likedReviewIds.has(review.id),
        })),
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      })
    );
  } catch (error: any) {
    console.error('获取评论失败:', error);
    return NextResponse.json(
      errorResponse('获取评论失败', 'REVIEWS_FETCH_ERROR'),
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json(
        errorResponse('请先登录后再评价', 'UNAUTHORIZED'),
        { status: 401 }
      );
    }

    const skillId = params.id;
    const skill = await prisma.skill.findUnique({
      where: { id: skillId },
      select: { id: true, status: true },
    });

    if (!skill || skill.status !== 'active') {
      return NextResponse.json(
        errorResponse('技能包不存在或不可评价', 'SKILL_NOT_FOUND'),
        { status: 404 }
      );
    }

    const formData = await request.formData();
    const rawContent = String(formData.get('content') || '');
    const content = rawContent.trim();
    const rawRating = formData.get('rating');
    const rating = getValidRating(rawRating);
    const imageFiles = getImageFiles(formData);

    if (rawRating !== null && rawRating !== '' && rating === null) {
      return NextResponse.json(
        errorResponse('评分必须是 1-5 的整数', 'VALIDATION_ERROR'),
        { status: 400 }
      );
    }

    if (!content && imageFiles.length === 0) {
      return NextResponse.json(
        errorResponse('请填写评价内容或上传图片', 'VALIDATION_ERROR'),
        { status: 400 }
      );
    }

    if (content.length > MAX_CONTENT_LENGTH) {
      return NextResponse.json(
        errorResponse(`评价内容不能超过 ${MAX_CONTENT_LENGTH} 字`, 'VALIDATION_ERROR'),
        { status: 400 }
      );
    }

    if (imageFiles.length > MAX_REVIEW_IMAGES) {
      return NextResponse.json(
        errorResponse(`单条评价最多上传 ${MAX_REVIEW_IMAGES} 张图片`, 'VALIDATION_ERROR'),
        { status: 400 }
      );
    }

    for (const image of imageFiles) {
      if (!image.type.startsWith('image/')) {
        return NextResponse.json(
          errorResponse('评价图片必须是图片格式', 'VALIDATION_ERROR'),
          { status: 400 }
        );
      }

      if (image.size > MAX_IMAGE_SIZE) {
        return NextResponse.json(
          errorResponse('单张图片不能超过 5MB', 'VALIDATION_ERROR'),
          { status: 400 }
        );
      }
    }

    const uploadedImages = await Promise.all(
      imageFiles.map(async (image, index) => {
        const safeName = sanitizeFileName(image.name || `review-${index + 1}.png`);
        const uniqueName = `review-${Date.now()}-${index + 1}-${safeName}`;
        const buffer = Buffer.from(await image.arrayBuffer());
        const uploadResult = await uploadFile(buffer, uniqueName, image.type);

        return {
          url: uploadResult.url,
          fileName: uploadResult.fileName,
          sortOrder: index,
        };
      })
    );

    const review = await prisma.comment.create({
      data: {
        content,
        rating,
        userId: currentUser.id,
        skillId,
        likeCount: 0,
        images: {
          create: uploadedImages,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
            department: true,
          },
        },
        images: {
          select: {
            id: true,
            url: true,
            fileName: true,
            sortOrder: true,
          },
          orderBy: {
            sortOrder: 'asc',
          },
        },
        _count: {
          select: {
            likes: true,
          },
        },
      },
    });

    await recordEvent({
      eventName: 'review_submit_success',
      module: 'review',
      action: 'create',
      userId: currentUser.id,
      skillId,
      metadata: {
        imageCount: uploadedImages.length,
        hasText: Boolean(content),
      },
    });

    return NextResponse.json(
      successResponse(
        {
          ...review,
          likeCount: review.likeCount || review._count.likes,
          likedByCurrentUser: false,
        },
        '评价发布成功'
      ),
      { status: 201 }
    );
  } catch (error: any) {
    console.error('发布评价失败:', error);
    return NextResponse.json(
      errorResponse('发布评价失败', 'REVIEW_CREATE_ERROR'),
      { status: 500 }
    );
  }
}
