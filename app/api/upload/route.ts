/**
 * Skill 发布 API
 *
 * 支持：
 * 1) 链接发布（link）
 * 2) 文件发布（github-package，内部使用 Git 仓库存储）
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { ensureDefaultCategories } from '@/lib/skill-categories';
import { recordEvent } from '@/lib/event-log';
import { successResponse, errorResponse } from '@/lib/utils';
import { normalizeTagsFromDb, parseTagsInput, toPrismaTagsValue } from '@/lib/tags';
import {
  isGitHubSkillPublishConfigured,
  publishSkillPackageToGitHub,
} from '@/lib/github-skill-publish';
import { validateFile } from '@/lib/oss';

type UploadSourceMode = 'link' | 'github-package';

// ===========================================
// POST /api/upload - 发布 Skill
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

    const formData = await request.formData();
    const sourceMode = parseSourceMode(String(formData.get('sourceMode') || ''));
    const title = formData.get('title') as string;
    const summary = formData.get('summary') as string;
    const description = formData.get('description') as string;
    const categoryId = formData.get('categoryId') as string;
    const tagsInput = formData.get('tags');

    // link 模式字段
    const externalUrlRaw = ((formData.get('externalUrl') as string) || '').trim();
    const externalUrlInput = normalizeExternalLinkInput(externalUrlRaw);

    // 文件发布模式字段
    const packageFile = formData.get('file') as File | null;

    if (!title || !summary || !description || !categoryId) {
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
        errorResponse('请选择有效的数字人', 'VALIDATION_ERROR'),
        { status: 400 }
      );
    }

    let fileName = '';
    let fileSize = 0;
    let fileType = 'link';
    let fileUrl = '';
    let installCommand = '';
    let githubPackageUrl = '';
    let githubSkillSlug = '';

    if (sourceMode === 'link') {
      if (!externalUrlInput) {
        return NextResponse.json(
          errorResponse('缺少 Skill 链接', 'VALIDATION_ERROR'),
          { status: 400 }
        );
      }

      if (!isHttpUrl(externalUrlInput)) {
        return NextResponse.json(
          errorResponse('Skill 链接格式不正确，仅支持 http/https', 'VALIDATION_ERROR'),
          { status: 400 }
        );
      }

      const normalizedUrl = new URL(externalUrlInput).toString();
      fileName = normalizedUrl;
      fileSize = 0;
      fileType = inferFileTypeFromUrl(normalizedUrl);
      fileUrl = normalizedUrl;
    } else {
      if (!isGitHubSkillPublishConfigured()) {
        return NextResponse.json(
          errorResponse(
            '文件发布服务暂未配置，请联系管理员开启',
            'GITHUB_PUBLISH_NOT_CONFIGURED'
          ),
          { status: 503 }
        );
      }

      if (!packageFile) {
        return NextResponse.json(
          errorResponse('请先选择待发布文件', 'VALIDATION_ERROR'),
          { status: 400 }
        );
      }

      const validation = validateFile(packageFile.name, packageFile.size);
      if (!validation.valid) {
        return NextResponse.json(
          errorResponse(validation.error || '文件验证失败', 'FILE_VALIDATION_ERROR'),
          { status: 400 }
        );
      }

      const packageBuffer = Buffer.from(await packageFile.arrayBuffer());
      const githubResult = await publishSkillPackageToGitHub({
        fileBuffer: packageBuffer,
        originalFileName: packageFile.name,
        title,
        summary,
        description,
        tags,
        uploader: {
          id: currentUser.id,
          name: currentUser.name,
          email: currentUser.email,
        },
      });

      // 对外统一走“链接技能”展示：详情页可直接展示安装链接与安装命令
      fileName = githubResult.sourceUrl;
      fileSize = packageFile.size;
      fileType = inferFileTypeFromFileName(packageFile.name);
      fileUrl = githubResult.sourceUrl;
      installCommand = githubResult.installCommand;
      githubPackageUrl = githubResult.packageUrl;
      githubSkillSlug = githubResult.skillSlug;
    }

    const createdSkill = await prisma.skill.create({
      data: {
        title,
        summary: summary.trim(),
        description,
        categoryId: category.id,
        tags: toPrismaTagsValue(tags, prisma) as any,
        fileName,
        fileSize,
        fileType,
        authorId: currentUser.id,
        status: 'active',
      },
    });

    const skill = await prisma.skill.findUnique({
      where: { id: createdSkill.id },
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

    if (!skill) {
      return NextResponse.json(
        errorResponse('发布成功但读取结果失败，请刷新后查看', 'UPLOAD_RESULT_MISSING'),
        { status: 500 }
      );
    }

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
        sourceMode,
        storageMode: sourceMode === 'github-package' ? 'github' : 'link',
        githubSkillSlug: githubSkillSlug || undefined,
      },
    });

    return NextResponse.json(
      successResponse(
        {
          skill: normalizedSkill,
          fileUrl,
          sourceUrl: fileUrl,
          installCommand: installCommand || undefined,
          packageUrl: githubPackageUrl || undefined,
          skillInstallLink:
            sourceMode === 'github-package' ? fileUrl : undefined,
          aiInstallGithubLink:
            sourceMode === 'github-package' ? fileUrl : undefined,
          sourceMode,
        },
        sourceMode === 'github-package' ? '文件已发布，安装命令已生成' : '链接发布成功'
      ),
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Skill 发布失败:', error);
    return NextResponse.json(
      errorResponse(`发布失败：${error.message}`, 'UPLOAD_ERROR'),
      { status: 500 }
    );
  }
}

function parseSourceMode(input: string): UploadSourceMode {
  return input === 'github-package' || input === 'file' ? 'github-package' : 'link';
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function inferFileTypeFromFileName(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.tar.gz')) return 'tar.gz';
  const dot = lower.lastIndexOf('.');
  if (dot < 0 || dot === lower.length - 1) return 'zip';
  return lower.slice(dot + 1);
}

function inferFileTypeFromUrl(value: string): string {
  try {
    const parsed = new URL(value);
    const path = parsed.pathname.toLowerCase();
    if (path.endsWith('.tar.gz')) return 'tar.gz';
    const fileName = path.split('/').pop() || '';
    if (fileName.includes('.')) {
      const ext = fileName.split('.').pop();
      if (ext) return ext;
    }
  } catch {
    // noop
  }
  return 'link';
}

function normalizeExternalLinkInput(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  if (isHttpUrl(trimmed)) return trimmed;

  const urlMatch = trimmed.match(/https?:\/\/[^\s"'<>]+/i);
  if (!urlMatch) return '';

  return urlMatch[0].replace(/[),.;!?]+$/g, '');
}
