import prisma from '@/lib/prisma';
import { recordEvent } from '@/lib/event-log';
import { ensureDefaultCategories } from '@/lib/skill-categories';
import { getSkillIngestConfig } from '@/lib/ingest-config';
import { parseSkillLinkInput } from '@/lib/skill-link-input';
import { toPrismaTagsValue } from '@/lib/tags';

interface IngestRunContext {
  triggerType: 'admin' | 'cron' | 'hmac' | 'manual';
  triggerLabel: string;
}

interface GitHubSearchResponse {
  total_count: number;
  incomplete_results: boolean;
  items: GitHubRepo[];
}

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  watchers_count: number;
  open_issues_count: number;
  language: string | null;
  archived: boolean;
  disabled: boolean;
  pushed_at: string | null;
  license: {
    key: string;
    name: string;
  } | null;
  topics?: string[];
}

export interface DiscoveryOptions extends IngestRunContext {
  queries?: string[];
  perQuery?: number;
  maxCandidates?: number;
}

export interface DiscoveryResult {
  runId: string;
  scannedCount: number;
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
  totalCandidates: number;
  exhausted: boolean;
}

export interface PublishOptions extends IngestRunContext {
  batchSize?: number;
  onlyApproved?: boolean;
  candidateIds?: string[];
}

export interface PublishResult {
  runId: string;
  selectedCount: number;
  publishedCount: number;
  heldCount: number;
  failedCount: number;
}

interface AutoDecision {
  allow: boolean;
  note: string;
}

function uniqueStrings(items: Array<string | null | undefined>, max = 10): string[] {
  const result: string[] = [];
  for (const raw of items) {
    if (typeof raw !== 'string') continue;
    const normalized = raw.trim().toLowerCase();
    if (!normalized) continue;
    if (normalized.length > 32) continue;
    if (result.includes(normalized)) continue;
    result.push(normalized);
    if (result.length >= max) break;
  }
  return result;
}

function normalizeTitle(repo: GitHubRepo): string {
  const transformed = repo.name.replace(/[_-]+/g, ' ').trim();
  if (!transformed) return repo.full_name;
  return transformed
    .split(' ')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ')
    .slice(0, 120);
}

function normalizeSummary(input: string, fallback: string): string {
  const text = (input || '').trim() || fallback;
  if (text.length >= 10) return text.slice(0, 200);
  return `${text}（自动收录）`.slice(0, 200);
}

function buildDescription(repo: GitHubRepo): string {
  const lines = [
    `自动收录来源：${repo.html_url}`,
    '',
    repo.description || '该仓库暂无描述，已按规则自动收录为待验证 Skill。',
    '',
    `Stars: ${repo.stargazers_count}`,
    `Forks: ${repo.forks_count}`,
    `Language: ${repo.language || 'Unknown'}`,
    `License: ${repo.license?.key || 'Unknown'}`,
  ];

  return lines.join('\n').slice(0, 4000);
}

function buildInstallCommand(repo: GitHubRepo): string {
  return `npx skills add ${repo.html_url}`;
}

function pickCategoryId(options: {
  categories: Array<{ id: string; slug: string; name: string }>;
  title: string;
  summary: string;
  tags: string[];
}): string | null {
  const { categories, title, summary, tags } = options;
  if (!categories.length) return null;

  const bySlug = new Map(categories.map((category) => [category.slug, category.id]));
  const searchable = `${title} ${summary} ${tags.join(' ')}`.toLowerCase();

  const rules: Array<{ slug: string; keywords: string[] }> = [
    {
      slug: 'productivity-automation',
      keywords: ['automation', 'agent', 'bot', 'workflow', 'office', 'productivity'],
    },
    {
      slug: 'dev-engineering',
      keywords: ['dev', 'code', 'sdk', 'api', 'typescript', 'javascript', 'python', 'rust', 'go'],
    },
    {
      slug: 'data-analytics',
      keywords: ['data', 'analysis', 'analytics', 'ml', 'ai', 'research', 'etl'],
    },
    {
      slug: 'content-writing-translation',
      keywords: ['content', 'writing', 'translation', 'copywriting', 'seo'],
    },
    {
      slug: 'design-media',
      keywords: ['design', 'image', 'video', 'media', 'audio', 'illustration', 'ui', 'ux'],
    },
    {
      slug: 'operations-support',
      keywords: ['support', 'sales', 'ops', 'customer', 'crm', 'ticket'],
    },
  ];

  for (const rule of rules) {
    const categoryId = bySlug.get(rule.slug);
    if (!categoryId) continue;
    if (rule.keywords.some((keyword) => searchable.includes(keyword))) {
      return categoryId;
    }
  }

  return categories[0]?.id || null;
}

function evaluateAutoDecision(candidate: {
  status: string;
  archived: boolean;
  disabled: boolean;
  stars: number;
  licenseKey: string | null;
  pushedAt: Date | null;
}): AutoDecision {
  const config = getSkillIngestConfig();

  if (candidate.status === 'approved') {
    return {
      allow: true,
      note: '管理员已审批通过',
    };
  }

  if (!config.autopublishEnabled) {
    return {
      allow: false,
      note: '自动发布已关闭',
    };
  }

  if (candidate.archived || candidate.disabled) {
    return {
      allow: false,
      note: '仓库已归档或已禁用',
    };
  }

  if (candidate.stars < config.minStars) {
    return {
      allow: false,
      note: `Star 低于阈值（${candidate.stars} < ${config.minStars}）`,
    };
  }

  if (config.requireLicense) {
    const license = (candidate.licenseKey || '').toLowerCase();
    if (!license) {
      return {
        allow: false,
        note: '缺少 License 信息',
      };
    }

    if (!config.allowedLicenses.includes(license)) {
      return {
        allow: false,
        note: `License 不在允许列表（${license}）`,
      };
    }
  }

  if (candidate.pushedAt) {
    const inactiveDays = (Date.now() - candidate.pushedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (inactiveDays > config.maxInactivityDays) {
      return {
        allow: false,
        note: `仓库超过 ${config.maxInactivityDays} 天未更新`,
      };
    }
  }

  return {
    allow: true,
    note: '命中自动发布规则',
  };
}

async function requestGitHubSearch(query: string, perPage: number): Promise<GitHubSearchResponse> {
  const config = getSkillIngestConfig();
  const params = new URLSearchParams({
    q: query,
    sort: 'updated',
    order: 'desc',
    per_page: String(perPage),
    page: '1',
  });

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'skill-marketplace-ingest',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  if (config.githubToken) {
    headers.Authorization = `Bearer ${config.githubToken}`;
  }

  const response = await fetch(`${config.githubApiBase}/search/repositories?${params.toString()}`, {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub 搜索失败(${response.status}): ${body.slice(0, 180)}`);
  }

  const json = (await response.json()) as GitHubSearchResponse;
  return json;
}

async function createIngestRun(options: {
  runType: 'discover' | 'publish';
  triggerType: string;
  triggerLabel: string;
  querySnapshot?: string;
}) {
  return prisma.ingestRun.create({
    data: {
      runType: options.runType,
      triggerType: options.triggerType,
      triggerLabel: options.triggerLabel,
      querySnapshot: options.querySnapshot || null,
      status: 'running',
    },
    select: {
      id: true,
    },
  });
}

async function finishIngestRun(
  runId: string,
  data: {
    status: 'success' | 'failed';
    scannedCount?: number;
    insertedCount?: number;
    updatedCount?: number;
    skippedCount?: number;
    selectedCount?: number;
    publishedCount?: number;
    failedCount?: number;
    heldCount?: number;
    message?: string;
  }
) {
  await prisma.ingestRun.update({
    where: { id: runId },
    data: {
      status: data.status,
      scannedCount: data.scannedCount,
      insertedCount: data.insertedCount,
      updatedCount: data.updatedCount,
      skippedCount: data.skippedCount,
      selectedCount: data.selectedCount,
      publishedCount: data.publishedCount,
      failedCount: data.failedCount,
      heldCount: data.heldCount,
      message: data.message || null,
      finishedAt: new Date(),
    },
  });
}

async function upsertCandidateFromRepo(repo: GitHubRepo): Promise<'inserted' | 'updated'> {
  const dedupeKey = `github:${repo.full_name.toLowerCase()}`;
  const title = normalizeTitle(repo);
  const summary = normalizeSummary(
    repo.description || '',
    `自动收录自 GitHub 开源仓库 ${repo.full_name}`
  );
  const description = buildDescription(repo);
  const tags = uniqueStrings([
    repo.language,
    ...(Array.isArray(repo.topics) ? repo.topics : []),
    'open-source',
    'auto-ingest',
  ]);

  const now = new Date();
  const pushedAt = repo.pushed_at ? new Date(repo.pushed_at) : null;

  const data = {
    source: 'github',
    sourceId: String(repo.id),
    dedupeKey,
    repoFullName: repo.full_name,
    repoUrl: repo.html_url,
    sourceUrl: repo.html_url,
    installCommand: buildInstallCommand(repo),
    title,
    summary,
    description,
    tags,
    licenseKey: repo.license?.key?.toLowerCase() || null,
    language: repo.language || null,
    pushedAt,
    stars: Number(repo.stargazers_count || 0),
    forks: Number(repo.forks_count || 0),
    watchers: Number(repo.watchers_count || 0),
    openIssues: Number(repo.open_issues_count || 0),
    archived: Boolean(repo.archived),
    disabled: Boolean(repo.disabled),
    lastSeenAt: now,
  };

  const existing = await prisma.ingestCandidate.findUnique({
    where: { dedupeKey },
    select: {
      id: true,
      status: true,
    },
  });

  if (!existing) {
    await prisma.ingestCandidate.create({
      data: {
        ...data,
        status: 'pending',
        discoveredAt: now,
      },
    });
    return 'inserted';
  }

  await prisma.ingestCandidate.update({
    where: { id: existing.id },
    data: {
      ...data,
      status: existing.status === 'failed' ? 'pending' : existing.status,
      failureReason: existing.status === 'failed' ? null : undefined,
      autoDecision: null,
      autoDecisionNote: null,
    },
  });
  return 'updated';
}

async function ensureIngestAdminUser(): Promise<{ id: string; email: string }> {
  const config = getSkillIngestConfig();
  const email = config.adminEmail;

  const existing = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
    },
  });

  if (existing) {
    return {
      id: existing.id,
      email: existing.email,
    };
  }

  const displayName = email.split('@')[0] || 'ingest-admin';

  try {
    const created = await prisma.user.create({
      data: {
        name: displayName,
        email,
        department: 'Automation',
        provider: 'system',
        providerAccountId: `system:${email}`,
        lastLoginAt: new Date(),
      },
      select: {
        id: true,
        email: true,
      },
    });

    return {
      id: created.id,
      email: created.email,
    };
  } catch {
    const fallback = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
      },
    });

    if (!fallback) {
      throw new Error(`无法创建或读取自动发布管理员账号: ${email}`);
    }

    return {
      id: fallback.id,
      email: fallback.email,
    };
  }
}

async function ensureActiveCategories() {
  await ensureDefaultCategories();
  return prisma.skillCategory.findMany({
    where: { status: 'active' },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      slug: true,
      name: true,
    },
  });
}

function buildCandidateDescriptionFallback(candidate: {
  repoUrl: string;
  summary: string | null;
  stars: number;
  licenseKey: string | null;
}): string {
  const lines = [
    `自动收录来源：${candidate.repoUrl}`,
    '',
    candidate.summary || '自动收录 Skill',
    '',
    `Stars: ${candidate.stars}`,
    `License: ${candidate.licenseKey || 'Unknown'}`,
  ];

  return lines.join('\n');
}

async function publishSingleCandidate(options: {
  candidateId: string;
  adminUserId: string;
  categories: Array<{ id: string; slug: string; name: string }>;
}): Promise<'published' | 'held' | 'failed'> {
  const candidate = await prisma.ingestCandidate.findUnique({
    where: { id: options.candidateId },
  });

  if (!candidate) {
    return 'failed';
  }

  if (candidate.status === 'published' || candidate.status === 'rejected') {
    return 'held';
  }

  const decision = evaluateAutoDecision(candidate);
  if (!decision.allow) {
    await prisma.ingestCandidate.update({
      where: { id: candidate.id },
      data: {
        autoDecision: 'hold',
        autoDecisionNote: decision.note,
      },
    });
    return 'held';
  }

  const parsed = parseSkillLinkInput(candidate.installCommand || candidate.sourceUrl || candidate.repoUrl);
  if (!parsed) {
    await prisma.ingestCandidate.update({
      where: { id: candidate.id },
      data: {
        status: 'failed',
        autoDecision: 'allow',
        autoDecisionNote: decision.note,
        failureReason: '安装命令解析失败',
      },
    });
    return 'failed';
  }

  const existingSkill = await prisma.skill.findFirst({
    where: {
      OR: [{ fileName: parsed.storageValue }, { fileName: candidate.sourceUrl }],
      status: {
        in: ['active', 'archived'],
      },
    },
    select: {
      id: true,
    },
  });

  if (existingSkill) {
    await prisma.ingestCandidate.update({
      where: { id: candidate.id },
      data: {
        status: 'published',
        autoDecision: 'allow',
        autoDecisionNote: `${decision.note}（重复源已存在）`,
        publishedSkillId: existingSkill.id,
        publishedAt: new Date(),
        failureReason: null,
      },
    });
    return 'published';
  }

  const categoryId =
    candidate.categoryId ||
    pickCategoryId({
      categories: options.categories,
      title: candidate.title,
      summary: candidate.summary || '',
      tags: candidate.tags,
    });

  if (!categoryId) {
    await prisma.ingestCandidate.update({
      where: { id: candidate.id },
      data: {
        status: 'failed',
        autoDecision: 'allow',
        autoDecisionNote: decision.note,
        failureReason: '未找到可用分类',
      },
    });
    return 'failed';
  }

  const summary = normalizeSummary(candidate.summary || '', `自动收录自 ${candidate.repoFullName}`);
  const description = (candidate.description || buildCandidateDescriptionFallback(candidate)).slice(
    0,
    4000
  );
  const tags = uniqueStrings([...(candidate.tags || []), 'auto-ingest'], 12);

  try {
    const createdSkill = await prisma.skill.create({
      data: {
        title: candidate.title.slice(0, 120),
        summary,
        description,
        categoryId,
        tags: toPrismaTagsValue(tags, prisma) as any,
        fileName: parsed.storageValue,
        fileSize: 0,
        fileType: 'link',
        authorId: options.adminUserId,
        status: 'active',
      },
      select: {
        id: true,
      },
    });

    await prisma.ingestCandidate.update({
      where: { id: candidate.id },
      data: {
        status: 'published',
        autoDecision: 'allow',
        autoDecisionNote: decision.note,
        publishedSkillId: createdSkill.id,
        publishedAt: new Date(),
        categoryId,
        failureReason: null,
      },
    });

    await recordEvent({
      eventName: 'skill_ingest_publish_success',
      page: '/api/ingest/publish-worker',
      module: 'skill-ingest',
      action: 'auto_publish',
      userId: options.adminUserId,
      skillId: createdSkill.id,
      categoryId,
      metadata: {
        candidateId: candidate.id,
        repoFullName: candidate.repoFullName,
        source: candidate.source,
      },
    });

    return 'published';
  } catch (error: any) {
    await prisma.ingestCandidate.update({
      where: { id: candidate.id },
      data: {
        status: 'failed',
        autoDecision: 'allow',
        autoDecisionNote: decision.note,
        failureReason: `发布失败: ${(error?.message || 'unknown').slice(0, 300)}`,
      },
    });

    return 'failed';
  }
}

export async function runGitHubDiscovery(options: DiscoveryOptions): Promise<DiscoveryResult> {
  const config = getSkillIngestConfig();
  const queries =
    Array.isArray(options.queries) && options.queries.length > 0
      ? options.queries.map((item) => item.trim()).filter(Boolean)
      : config.githubQueries;
  const perQuery = options.perQuery || config.discoverPerQuery;
  const maxCandidates = options.maxCandidates || config.discoverMaxCandidates;

  const run = await createIngestRun({
    runType: 'discover',
    triggerType: options.triggerType,
    triggerLabel: options.triggerLabel,
    querySnapshot: JSON.stringify({ queries, perQuery, maxCandidates }),
  });

  let scannedCount = 0;
  let insertedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  try {
    const seen = new Set<string>();

    for (const query of queries) {
      if (seen.size >= maxCandidates) break;

      const response = await requestGitHubSearch(query, perQuery);
      for (const repo of response.items || []) {
        if (seen.size >= maxCandidates) break;

        const key = String(repo.id);
        if (seen.has(key)) {
          skippedCount += 1;
          continue;
        }
        seen.add(key);

        if (!repo.full_name || !repo.html_url) {
          skippedCount += 1;
          continue;
        }

        scannedCount += 1;

        const result = await upsertCandidateFromRepo(repo);
        if (result === 'inserted') insertedCount += 1;
        if (result === 'updated') updatedCount += 1;
      }
    }

    await finishIngestRun(run.id, {
      status: 'success',
      scannedCount,
      insertedCount,
      updatedCount,
      skippedCount,
      message: `扫描 ${scannedCount} 条，新增 ${insertedCount}，更新 ${updatedCount}`,
    });

    return {
      runId: run.id,
      scannedCount,
      insertedCount,
      updatedCount,
      skippedCount,
      totalCandidates: seen.size,
      exhausted: seen.size >= maxCandidates,
    };
  } catch (error: any) {
    await finishIngestRun(run.id, {
      status: 'failed',
      scannedCount,
      insertedCount,
      updatedCount,
      skippedCount,
      message: (error?.message || 'discover failed').slice(0, 500),
    });
    throw error;
  }
}

export async function runPublishWorker(options: PublishOptions): Promise<PublishResult> {
  const config = getSkillIngestConfig();
  const batchSize = options.batchSize || config.publishBatchSize;

  const run = await createIngestRun({
    runType: 'publish',
    triggerType: options.triggerType,
    triggerLabel: options.triggerLabel,
    querySnapshot: JSON.stringify({
      batchSize,
      onlyApproved: Boolean(options.onlyApproved),
      candidateIds: options.candidateIds || [],
    }),
  });

  try {
    const where: any = options.candidateIds?.length
      ? {
          id: {
            in: options.candidateIds,
          },
        }
      : options.onlyApproved
        ? {
            status: 'approved',
          }
        : {
            status: {
              in: ['pending', 'approved'],
            },
          };

    const candidates = await prisma.ingestCandidate.findMany({
      where,
      orderBy: [{ status: 'asc' }, { discoveredAt: 'desc' }],
      take: batchSize,
      select: {
        id: true,
      },
    });

    const selectedCount = candidates.length;
    let publishedCount = 0;
    let heldCount = 0;
    let failedCount = 0;

    if (selectedCount > 0) {
      const admin = await ensureIngestAdminUser();
      const categories = await ensureActiveCategories();

      for (const candidate of candidates) {
        const result = await publishSingleCandidate({
          candidateId: candidate.id,
          adminUserId: admin.id,
          categories,
        });

        if (result === 'published') publishedCount += 1;
        if (result === 'held') heldCount += 1;
        if (result === 'failed') failedCount += 1;
      }
    }

    await finishIngestRun(run.id, {
      status: 'success',
      selectedCount,
      publishedCount,
      heldCount,
      failedCount,
      message: `待处理 ${selectedCount}，成功发布 ${publishedCount}`,
    });

    return {
      runId: run.id,
      selectedCount,
      publishedCount,
      heldCount,
      failedCount,
    };
  } catch (error: any) {
    await finishIngestRun(run.id, {
      status: 'failed',
      message: (error?.message || 'publish failed').slice(0, 500),
    });
    throw error;
  }
}
