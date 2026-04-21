import { sanitizeFileName } from '@/lib/utils';
import { detectSkillFileExtension } from '@/lib/skill-upload-format';

interface GitHubSkillPublisherConfig {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  basePath: string;
}

interface GitHubUploader {
  id: string;
  name?: string | null;
  email?: string | null;
}

export interface GitHubSkillPublishInput {
  fileBuffer: Buffer;
  originalFileName: string;
  title: string;
  summary: string;
  description: string;
  tags: string[];
  uploader: GitHubUploader;
}

export interface GitHubSkillPublishResult {
  repoUrl: string;
  skillSlug: string;
  skillPath: string;
  sourceUrl: string;
  packageUrl: string;
  installCommand: string;
}

function readEnv(name: string, fallback = ''): string {
  return (process.env[name] || fallback).trim();
}

function normalizeBasePath(input: string): string {
  const normalized = input.replace(/^\/+|\/+$/g, '');
  return normalized || 'skills';
}

function getConfig(): GitHubSkillPublisherConfig {
  return {
    token: readEnv('GITHUB_TOKEN'),
    owner: readEnv('GITHUB_SKILL_OWNER'),
    repo: readEnv('GITHUB_SKILL_REPO'),
    branch: readEnv('GITHUB_SKILL_BRANCH', 'main'),
    basePath: normalizeBasePath(readEnv('GITHUB_SKILL_BASE_PATH', 'skills')),
  };
}

export function isGitHubSkillPublishConfigured(): boolean {
  const config = getConfig();
  return Boolean(config.token && config.owner && config.repo);
}

export function buildSkillsAddCommand(repoUrl: string, skillSlug: string): string {
  return `npx skills add ${repoUrl} --skill ${skillSlug}`;
}

function slugify(input: string): string {
  const normalized = input
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'skill';
}

function buildUniqueSlug(title: string): string {
  const base = slugify(title).slice(0, 48);
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${base}-${stamp}${rand}`.replace(/-+/g, '-');
}

function detectPackageExt(fileName: string): string {
  const ext = detectSkillFileExtension(fileName);
  return ext || '.zip';
}

function encodeRepoPath(path: string): string {
  return path
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function buildRepoUrl(config: GitHubSkillPublisherConfig): string {
  return `https://github.com/${config.owner}/${config.repo}`;
}

function buildTreeUrl(config: GitHubSkillPublisherConfig, skillPath: string): string {
  return `${buildRepoUrl(config)}/tree/${encodeURIComponent(config.branch)}/${encodeRepoPath(skillPath)}`;
}

function buildRawUrl(config: GitHubSkillPublisherConfig, path: string): string {
  return `https://raw.githubusercontent.com/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/${encodeRepoPath(path)}`;
}

async function putFileToGitHub(options: {
  config: GitHubSkillPublisherConfig;
  path: string;
  content: Buffer;
  message: string;
}): Promise<void> {
  const { config, path, content, message } = options;
  const endpoint = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${encodeRepoPath(path)}`;

  const response = await fetch(endpoint, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'skill-marketplace-publisher',
    },
    body: JSON.stringify({
      message,
      content: content.toString('base64'),
      branch: config.branch,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`文件提交失败(${response.status}): ${text.slice(0, 240)}`);
  }
}

export async function publishSkillPackageToGitHub(
  input: GitHubSkillPublishInput
): Promise<GitHubSkillPublishResult> {
  const config = getConfig();

  if (!isGitHubSkillPublishConfigured()) {
    throw new Error('文件发布服务暂未配置');
  }

  const repoUrl = buildRepoUrl(config);
  const packageExt = detectPackageExt(input.originalFileName);
  const safeOriginalName = sanitizeFileName(input.originalFileName || `skill${packageExt}`);
  const skillSlug = buildUniqueSlug(input.title);
  const skillPath = `${config.basePath}/${skillSlug}`;
  const packagePath = `${skillPath}/${safeOriginalName}`;
  const metaPath = `${skillPath}/skill.json`;
  const readmePath = `${skillPath}/README.md`;
  const packageUrl = buildRawUrl(config, packagePath);

  const installCommand = `npx skills add ${packageUrl}`;
  const meta = {
    schemaVersion: 1,
    title: input.title,
    slug: skillSlug,
    summary: input.summary,
    tags: input.tags,
    uploadedAt: new Date().toISOString(),
    uploader: {
      id: input.uploader.id,
      name: input.uploader.name || null,
      email: input.uploader.email || null,
    },
    package: {
      fileName: safeOriginalName,
      extension: packageExt.replace(/^\./, ''),
      size: input.fileBuffer.length,
      rawUrl: packageUrl,
    },
  };

  const readme = [
    `# ${input.title}`,
    '',
    `- slug: \`${skillSlug}\``,
    `- uploaded_at: ${meta.uploadedAt}`,
    `- package: ${safeOriginalName}`,
    '',
    '## Summary',
    '',
    input.summary || 'N/A',
    '',
    '## Description',
    '',
    input.description || 'N/A',
    '',
    '## Install',
    '',
    '```bash',
    installCommand,
    '```',
    '',
    '## Package URL',
    '',
    packageUrl,
    '',
  ].join('\n');

  const commitPrefix = `skill(${skillSlug})`;

  await putFileToGitHub({
    config,
    path: packagePath,
    content: input.fileBuffer,
    message: `${commitPrefix}: add package ${safeOriginalName}`,
  });

  await putFileToGitHub({
    config,
    path: metaPath,
    content: Buffer.from(JSON.stringify(meta, null, 2), 'utf8'),
    message: `${commitPrefix}: add skill metadata`,
  });

  await putFileToGitHub({
    config,
    path: readmePath,
    content: Buffer.from(readme, 'utf8'),
    message: `${commitPrefix}: add skill readme`,
  });

  return {
    repoUrl,
    skillSlug,
    skillPath,
    sourceUrl: buildTreeUrl(config, skillPath),
    packageUrl,
    installCommand,
  };
}
