/**
 * Skill API - GET (详情), PUT (更新), DELETE (删除)
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { canManageSkill } from '@/lib/dashboard-access';
import { successResponse, errorResponse } from '@/lib/utils';
import { normalizeTagsFromDb, parseTagsInput, toPrismaTagsValue } from '@/lib/tags';
import { ensureDefaultCategories } from '@/lib/skill-categories';

interface ResolvedInstallInfo {
  installCommand?: string;
  packageUrl?: string;
}

interface ParsedGitHubTreeUrl {
  owner: string;
  repo: string;
  branch: string;
  repoPath: string;
  skillSlug: string;
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function decodePathSegment(input: string): string {
  try {
    return decodeURIComponent(input);
  } catch {
    return input;
  }
}

function encodePathSegments(input: string): string {
  return input
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function parseGitHubTreeUrl(sourceUrl: string): ParsedGitHubTreeUrl | null {
  try {
    const parsed = new URL(sourceUrl);
    const host = parsed.hostname.toLowerCase();
    if (host !== 'github.com' && host !== 'www.github.com') {
      return null;
    }

    const parts = parsed.pathname
      .split('/')
      .filter(Boolean)
      .map((segment) => decodePathSegment(segment));

    if (parts.length < 4) {
      return null;
    }

    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/, '');
    const treeOrBlobIndex = parts.findIndex(
      (segment, index) => index >= 2 && (segment === 'tree' || segment === 'blob')
    );

    if (treeOrBlobIndex < 0 || parts.length <= treeOrBlobIndex + 1) {
      return null;
    }

    const remainder = parts.slice(treeOrBlobIndex + 1);
    const skillsIndex = remainder.findIndex((segment) => segment.toLowerCase() === 'skills');
    const branchParts = skillsIndex > 0 ? remainder.slice(0, skillsIndex) : remainder.slice(0, 1);
    const repoPathParts = skillsIndex > 0 ? remainder.slice(skillsIndex) : remainder.slice(1);
    const branch = branchParts.join('/').trim();
    const repoPath = repoPathParts.join('/').trim();

    if (!owner || !repo || !branch) {
      return null;
    }

    let skillSlug = '';
    if (repoPathParts.length > 0) {
      const repoSkillsIndex = repoPathParts.findIndex(
        (segment) => segment.toLowerCase() === 'skills'
      );
      if (repoSkillsIndex >= 0 && repoPathParts.length > repoSkillsIndex + 1) {
        skillSlug = repoPathParts[repoSkillsIndex + 1].trim();
      } else if (repoPathParts.length === 1) {
        skillSlug = repoPathParts[0].trim();
      }
    }

    return {
      owner,
      repo,
      branch,
      repoPath,
      skillSlug,
    };
  } catch {
    return null;
  }
}

function buildRepoUrl(owner: string, repo: string): string {
  return `https://github.com/${owner}/${repo}`;
}

function buildRawGithubUrl(
  owner: string,
  repo: string,
  branch: string,
  repoPath: string
): string {
  return `https://raw.githubusercontent.com/${owner}/${repo}/${encodePathSegments(
    branch
  )}/${encodePathSegments(repoPath)}`;
}

async function resolveInstallInfo(sourceUrl: string): Promise<ResolvedInstallInfo> {
  if (!isHttpUrl(sourceUrl)) {
    return {};
  }

  const githubTreeInfo = parseGitHubTreeUrl(sourceUrl);
  if (!githubTreeInfo) {
    return {
      installCommand: `npx skills add ${sourceUrl}`,
    };
  }

  const repoUrl = buildRepoUrl(githubTreeInfo.owner, githubTreeInfo.repo);
  const fallbackInstallCommand = githubTreeInfo.skillSlug
    ? `npx skills add ${repoUrl} --skill ${githubTreeInfo.skillSlug}`
    : `npx skills add ${repoUrl}`;

  if (!githubTreeInfo.repoPath) {
    return { installCommand: fallbackInstallCommand };
  }

  try {
    const skillJsonPath = `${githubTreeInfo.repoPath.replace(/\/+$/, '')}/skill.json`;
    const manifestUrl = buildRawGithubUrl(
      githubTreeInfo.owner,
      githubTreeInfo.repo,
      githubTreeInfo.branch,
      skillJsonPath
    );

    const abortController = new AbortController();
    const timeoutHandle = setTimeout(() => abortController.abort(), 3000);
    let manifestResponse: Response;

    try {
      manifestResponse = await fetch(manifestUrl, {
        cache: 'no-store',
        signal: abortController.signal,
      });
    } finally {
      clearTimeout(timeoutHandle);
    }

    if (!manifestResponse.ok) {
      return { installCommand: fallbackInstallCommand };
    }

    const manifest = await manifestResponse.json();
    const packageUrl =
      typeof manifest?.package?.rawUrl === 'string' ? manifest.package.rawUrl.trim() : '';

    if (isHttpUrl(packageUrl)) {
      return {
        installCommand: fallbackInstallCommand,
        packageUrl,
      };
    }
  } catch {
    // 忽略外部源解析失败，回退到仓库安装命令
  }

  return { installCommand: fallbackInstallCommand };
}

// ===========================================
// GET /api/skills/[id] - 获取技能包详情
// ===========================================
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const skillId = params.id;
    const shouldTrackView = request.nextUrl.searchParams.get('track') !== '0';

    let skill: any = null;
    try {
      const includeConfig = {
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
      } as const;

      if (shouldTrackView) {
        // 原子递增浏览量，返回最新详情
        skill = await prisma.skill.update({
          where: { id: skillId },
          data: {
            viewCount: {
              increment: 1,
            },
          },
          ...includeConfig,
        });
      } else {
        skill = await prisma.skill.findUnique({
          where: { id: skillId },
          ...includeConfig,
        });
      }
    } catch (error: any) {
      if (error?.code === 'P2025') {
        return NextResponse.json(
          errorResponse('技能包不存在', 'SKILL_NOT_FOUND'),
          { status: 404 }
        );
      }
      throw error;
    }

    if (!skill) {
      return NextResponse.json(
        errorResponse('技能包不存在', 'SKILL_NOT_FOUND'),
        { status: 404 }
      );
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

    const installInfo = await resolveInstallInfo(skill.fileName);

    const normalizedSkill = {
      ...skill,
      tags: normalizeTagsFromDb(skill.tags),
      ratingAvg: ratingAggregate._avg.rating ?? null,
      ratingCount: skill._count?.comments ?? 0,
      installCommand: installInfo.installCommand,
      packageUrl: installInfo.packageUrl,
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
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json(
        errorResponse('请先登录后再修改 Skill', 'UNAUTHORIZED'),
        { status: 401 }
      );
    }

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

    if (!canManageSkill(currentUser.email, currentUser.id, existingSkill.authorId)) {
      return NextResponse.json(
        errorResponse('仅作者或管理员可修改该 Skill', 'FORBIDDEN'),
        { status: 403 }
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
          errorResponse('请选择有效的数字人', 'VALIDATION_ERROR'),
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
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json(
        errorResponse('请先登录后再删除 Skill', 'UNAUTHORIZED'),
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

    if (!canManageSkill(currentUser.email, currentUser.id, existingSkill.authorId)) {
      return NextResponse.json(
        errorResponse('仅作者或管理员可删除该 Skill', 'FORBIDDEN'),
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
