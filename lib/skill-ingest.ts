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
  maxPagesPerQuery?: number;
  maxCandidates?: number;
}

export interface DiscoveryResult {
  runId: string;
  scannedCount: number;
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
  qualityFilteredCount: number;
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

interface CollectionDecision {
  allow: boolean;
  reason: string;
}

interface RejectedReviveDecision {
  revive: boolean;
  note?: string;
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

interface CategoryRule {
  slugs: string[];
  aliases: string[];
  keywords: string[];
}

const CATEGORY_RULES: CategoryRule[] = [
  {
    slugs: ['development-coding', 'dev-engineering'],
    aliases: ['开发工具与编程', '开发与编程', 'development & coding'],
    keywords: [
      'code',
      'coding',
      'programming',
      'developer',
      'refactor',
      'lint',
      'sast',
      'debug',
      'unit test',
      'testing',
      'git',
      'pull request',
      'typescript',
      'javascript',
      'node',
      'python',
      'java',
      'rust',
      'golang',
      'sdk',
      'api',
      '代码',
      '编程',
      '开发',
      '重构',
      '代码审查',
      '静态分析',
      '漏洞扫描',
      '调试',
      '测试',
      '版本控制',
    ],
  },
  {
    slugs: ['data-processing-analytics', 'data-analytics'],
    aliases: ['数据处理与分析', '数据分析与研究', 'data & analytics'],
    keywords: [
      'data',
      'analytics',
      'analysis',
      'database',
      'sql',
      'postgres',
      'mysql',
      'mongodb',
      'schema',
      'etl',
      'pipeline',
      'dashboard',
      'report',
      'chart',
      'bi',
      'recharts',
      'csv',
      'json',
      'pandas',
      '数据',
      '数据库',
      '查询',
      '分析',
      '报表',
      '可视化',
      '同环比',
      '数据工程',
      '数据清洗',
    ],
  },
  {
    slugs: ['documents-productivity', 'productivity-automation', 'content-writing-translation'],
    aliases: ['文档与办公', '办公效率与自动化', 'documents & productivity'],
    keywords: [
      'document',
      'doc',
      'docx',
      'pdf',
      'markdown',
      'word',
      'excel',
      'xlsx',
      'ppt',
      'pptx',
      'presentation',
      'latex',
      'office',
      '文档',
      '办公',
      '表格',
      '演示',
      '幻灯片',
      '排版',
      '出版',
      'markdown',
    ],
  },
  {
    slugs: ['browser-web'],
    aliases: ['浏览器与网络', 'browser & web'],
    keywords: [
      'browser',
      'web',
      'playwright',
      'puppeteer',
      'scrape',
      'scraper',
      'crawler',
      'dom',
      'lighthouse',
      'frontend test',
      'api tester',
      'network monitor',
      '网页',
      '浏览器',
      '抓取',
      '爬虫',
      '接口测试',
      '网络监控',
      '性能分析',
      '兼容性',
    ],
  },
  {
    slugs: ['system-files', 'operations-support'],
    aliases: ['系统与文件', 'system & files'],
    keywords: [
      'filesystem',
      'file system',
      'file manager',
      'shell',
      'terminal',
      'bash',
      'zsh',
      'linux',
      'cpu',
      'memory',
      'disk',
      'process',
      'docker',
      'kubernetes',
      'deployment',
      'ci/cd',
      'env',
      '系统',
      '文件',
      '目录',
      '命令行',
      '脚本',
      '系统监控',
      '运维',
      '部署',
      '容器',
    ],
  },
  {
    slugs: ['communication-collaboration', 'operations-support'],
    aliases: ['通信与协作', 'communication & collaboration', '客服与销售运营'],
    keywords: [
      'email',
      'gmail',
      'mail',
      'calendar',
      'schedule',
      'slack',
      'dingtalk',
      'feishu',
      'meeting',
      'transcript',
      'voice',
      'customer support',
      'ticket',
      '邮件',
      '日历',
      '日程',
      '协作',
      '沟通',
      '会议',
      '语音转写',
      '纪要',
      '客服',
    ],
  },
  {
    slugs: ['search-knowledge', 'data-analytics', 'content-writing-translation'],
    aliases: ['搜索与知识', 'search & knowledge'],
    keywords: [
      'search',
      'retrieval',
      'knowledge',
      'wiki',
      'notion',
      'confluence',
      'arxiv',
      'scholar',
      'pubmed',
      'patent',
      'obsidian',
      'notes',
      'rag',
      '搜索',
      '检索',
      '知识库',
      '文档查询',
      '论文',
      '学术',
      '笔记',
      '知识图谱',
    ],
  },
  {
    slugs: ['media-creativity', 'design-media'],
    aliases: ['多媒体与创意', '设计与多媒体', 'media & creativity'],
    keywords: [
      'image',
      'video',
      'audio',
      'ocr',
      'ffmpeg',
      'whisper',
      'tts',
      'figma',
      'design',
      'ux',
      'ui',
      'poster',
      'subtitle',
      '图像',
      '图片',
      '视频',
      '音频',
      '创意',
      '设计',
      '海报',
      '字幕',
    ],
  },
  {
    slugs: ['third-party-integrations', 'operations-support'],
    aliases: ['第三方服务集成', 'third-party integrations'],
    keywords: [
      'integration',
      'saas',
      'salesforce',
      'hubspot',
      'jira',
      'sap',
      'crm',
      'erp',
      'maps',
      'amap',
      'google maps',
      'ecommerce',
      'shopify',
      'amazon',
      'twitter',
      'instagram',
      'weibo',
      '第三方',
      '集成',
      '地图',
      '电商',
      '社交媒体',
      '企业 saas',
    ],
  },
  {
    slugs: ['ai-enhancement-automation', 'productivity-automation'],
    aliases: ['ai 增强与自动化', 'ai增强与自动化', '办公效率与自动化'],
    keywords: [
      'prompt',
      'workflow',
      'orchestration',
      'agent',
      'autogpt',
      'fact checker',
      'moderation',
      'quality check',
      'automation',
      'skill discovery',
      'install skill',
      '提示词',
      '工作流',
      '编排',
      '自动化',
      '质量检查',
      '事实核查',
      '技能发现',
      '技能安装',
    ],
  },
];

function normalizeCategoryKey(input: string): string {
  return (input || '')
    .toLowerCase()
    .replace(/[\s\-_/&+（）()]/g, '')
    .trim();
}

function resolveCategoryIdByRule(
  categories: Array<{ id: string; slug: string; name: string }>,
  rule: CategoryRule
): string | null {
  const slugSet = new Set(rule.slugs.map((item) => item.toLowerCase()));
  for (const category of categories) {
    if (slugSet.has((category.slug || '').toLowerCase())) {
      return category.id;
    }
  }

  const normalizedAliases = rule.aliases.map(normalizeCategoryKey).filter(Boolean);
  for (const category of categories) {
    const normalizedName = normalizeCategoryKey(category.name || '');
    if (!normalizedName) continue;
    if (
      normalizedAliases.some(
        (alias) =>
          normalizedName === alias ||
          normalizedName.includes(alias) ||
          alias.includes(normalizedName)
      )
    ) {
      return category.id;
    }
  }

  return null;
}

function scoreCategoryRule(searchable: string, rule: CategoryRule): number {
  let score = 0;
  const terms = [...new Set(rule.keywords.map((item) => item.toLowerCase().trim()).filter(Boolean))];
  for (const term of terms) {
    if (!searchable.includes(term)) continue;
    if (term.length >= 10) {
      score += 3;
    } else if (term.length >= 5) {
      score += 2;
    } else {
      score += 1;
    }
  }
  return score;
}

function pickCategoryId(options: {
  categories: Array<{ id: string; slug: string; name: string }>;
  title: string;
  summary: string;
  description?: string;
  tags: string[];
}): string | null {
  const { categories, title, summary, description = '', tags } = options;
  if (!categories.length) return null;

  const searchable = `${title} ${summary} ${description} ${tags.join(' ')}`.toLowerCase();
  let bestMatch: { categoryId: string; score: number; ruleIndex: number } | null = null;

  for (const [ruleIndex, rule] of CATEGORY_RULES.entries()) {
    const categoryId = resolveCategoryIdByRule(categories, rule);
    if (!categoryId) continue;

    const score = scoreCategoryRule(searchable, rule);
    if (score <= 0) continue;

    if (
      !bestMatch ||
      score > bestMatch.score ||
      (score === bestMatch.score && ruleIndex < bestMatch.ruleIndex)
    ) {
      bestMatch = { categoryId, score, ruleIndex };
    }
  }

  if (bestMatch) {
    return bestMatch.categoryId;
  }

  const othersCategory = categories.find(
    (category) =>
      (category.slug || '').toLowerCase() === 'others' ||
      normalizeCategoryKey(category.name || '') === normalizeCategoryKey('其他')
  );
  if (othersCategory) {
    return othersCategory.id;
  }

  return categories[0]?.id || null;
}

export function resolveCategoryIdByContent(options: {
  categories: Array<{ id: string; slug: string; name: string }>;
  title: string;
  summary?: string | null;
  description?: string | null;
  tags?: string[] | null;
}): string | null {
  return pickCategoryId({
    categories: options.categories,
    title: String(options.title || ''),
    summary: String(options.summary || ''),
    description: String(options.description || ''),
    tags: Array.isArray(options.tags) ? options.tags : [],
  });
}

function evaluateCollectionDecision(repo: GitHubRepo): CollectionDecision {
  const config = getSkillIngestConfig();

  if (repo.archived || repo.disabled) {
    return {
      allow: false,
      reason: '仓库已归档或禁用',
    };
  }

  const stars = Number(repo.stargazers_count || 0);
  if (stars < config.minStars) {
    return {
      allow: false,
      reason: `Star 低于阈值（${stars} < ${config.minStars}）`,
    };
  }

  const forks = Number(repo.forks_count || 0);
  if (forks < config.minForks) {
    return {
      allow: false,
      reason: `Fork 低于阈值（${forks} < ${config.minForks}）`,
    };
  }

  if (config.requireLicense) {
    const license = (repo.license?.key || '').toLowerCase();
    if (!license) {
      return {
        allow: false,
        reason: '缺少 License 信息',
      };
    }

    if (!config.allowedLicenses.includes(license)) {
      return {
        allow: false,
        reason: `License 不在允许列表（${license}）`,
      };
    }
  }

  if (repo.pushed_at) {
    const pushedAt = new Date(repo.pushed_at);
    if (!Number.isNaN(pushedAt.getTime())) {
      const inactiveDays =
        (Date.now() - pushedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (inactiveDays > config.maxInactivityDays) {
        return {
          allow: false,
          reason: `仓库超过 ${config.maxInactivityDays} 天未更新`,
        };
      }
    }
  } else {
    return {
      allow: false,
      reason: '缺少更新时间',
    };
  }

  return {
    allow: true,
    reason: '命中收录规则',
  };
}

function evaluateRejectedRevive(options: {
  previousStatus: string;
  previousStars: number;
  previousForks: number;
  nextStars: number;
  nextForks: number;
}): RejectedReviveDecision {
  const config = getSkillIngestConfig();
  if (!config.reviveRejectedEnabled) {
    return { revive: false };
  }

  if (options.previousStatus !== 'rejected') {
    return { revive: false };
  }

  const starDelta = Math.max(0, options.nextStars - options.previousStars);
  const forkDelta = Math.max(0, options.nextForks - options.previousForks);

  const reachedAbsoluteThreshold =
    options.nextStars >= config.reviveRejectedMinStars ||
    options.nextForks >= config.reviveRejectedMinForks;
  const reachedGrowthThreshold =
    starDelta >= config.reviveRejectedDeltaStars ||
    forkDelta >= config.reviveRejectedDeltaForks;

  if (!reachedAbsoluteThreshold && !reachedGrowthThreshold) {
    return { revive: false };
  }

  return {
    revive: true,
    note: `历史拒绝后热度提升，自动恢复待处理（Star ${options.previousStars}→${options.nextStars}，Fork ${options.previousForks}→${options.nextForks}）`,
  };
}

function evaluateAutoDecision(candidate: {
  status: string;
  archived: boolean;
  disabled: boolean;
  stars: number;
  forks: number;
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

  if (candidate.forks < config.minForks) {
    return {
      allow: false,
      note: `Fork 低于阈值（${candidate.forks} < ${config.minForks}）`,
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

async function requestGitHubSearch(
  query: string,
  perPage: number,
  page: number
): Promise<GitHubSearchResponse> {
  const config = getSkillIngestConfig();
  const params = new URLSearchParams({
    q: query,
    sort: 'updated',
    order: 'desc',
    per_page: String(perPage),
    page: String(page),
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

async function findExistingSkillIdBySource(repo: GitHubRepo): Promise<string | null> {
  const installCommand = buildInstallCommand(repo);
  const parsed = parseSkillLinkInput(installCommand);
  const installStorage = parsed?.storageValue || installCommand;

  const existing = await prisma.skill.findFirst({
    where: {
      OR: [{ fileName: installStorage }, { fileName: repo.html_url }],
      status: {
        in: ['active', 'archived'],
      },
    },
    select: {
      id: true,
    },
  });

  return existing?.id || null;
}

async function upsertCandidateFromRepo(repo: GitHubRepo): Promise<'inserted' | 'updated'> {
  const sourceId = String(repo.id);
  const dedupeKey = `github:${sourceId}`;
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
  const existingSkillId = await findExistingSkillIdBySource(repo);

  const data = {
    source: 'github',
    sourceId,
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

  const existing = await prisma.ingestCandidate.findFirst({
    where: {
      source: 'github',
      OR: [{ sourceId }, { dedupeKey }, { repoFullName: repo.full_name }],
    },
    select: {
      id: true,
      status: true,
      stars: true,
      forks: true,
    },
  });

  if (!existing) {
    await prisma.ingestCandidate.create({
      data: {
        ...data,
        status: existingSkillId ? 'published' : 'pending',
        autoDecision: existingSkillId ? 'allow' : null,
        autoDecisionNote: existingSkillId ? '已存在同源 Skill，自动标记已发布' : null,
        publishedSkillId: existingSkillId || null,
        publishedAt: existingSkillId ? now : null,
        failureReason: null,
        discoveredAt: now,
      },
    });
    return 'inserted';
  }

  const updateData: Record<string, unknown> = {
    ...data,
  };

  if (existingSkillId) {
    updateData.status = 'published';
    updateData.autoDecision = 'allow';
    updateData.autoDecisionNote = '已存在同源 Skill，自动标记已发布';
    updateData.publishedSkillId = existingSkillId;
    updateData.publishedAt = now;
    updateData.failureReason = null;
  } else {
    const reviveDecision = evaluateRejectedRevive({
      previousStatus: existing.status,
      previousStars: Number(existing.stars || 0),
      previousForks: Number(existing.forks || 0),
      nextStars: data.stars,
      nextForks: data.forks,
    });

    if (existing.status === 'failed' || reviveDecision.revive) {
      updateData.status = 'pending';
      updateData.failureReason = null;
      updateData.autoDecisionNote = reviveDecision.note || null;
    } else {
      updateData.status = existing.status;
      updateData.failureReason = undefined;
    }

    updateData.autoDecision = null;
    if (!reviveDecision.revive) {
      updateData.autoDecisionNote = null;
    }
  }

  await prisma.ingestCandidate.update({
    where: { id: existing.id },
    data: updateData,
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
    resolveCategoryIdByContent({
      categories: options.categories,
      title: candidate.title,
      summary: candidate.summary || '',
      description: candidate.description || '',
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
  const normalizedQueries = [...new Set(queries)];
  const perQuery = options.perQuery || config.discoverPerQuery;
  const maxPagesPerQuery = options.maxPagesPerQuery || config.discoverMaxPagesPerQuery;
  const maxCandidates = options.maxCandidates || config.discoverMaxCandidates;

  const run = await createIngestRun({
    runType: 'discover',
    triggerType: options.triggerType,
    triggerLabel: options.triggerLabel,
    querySnapshot: JSON.stringify({
      queries: normalizedQueries,
      perQuery,
      maxPagesPerQuery,
      maxCandidates,
      schedule: 'round-robin',
    }),
  });

  let scannedCount = 0;
  let insertedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let qualityFilteredCount = 0;

  try {
    const seen = new Set<string>();
    const exhaustedQueryIndex = new Set<number>();

    for (let page = 1; page <= maxPagesPerQuery; page += 1) {
      if (seen.size >= maxCandidates) break;

      let pageFetchedAny = false;

      for (let queryIndex = 0; queryIndex < normalizedQueries.length; queryIndex += 1) {
        if (seen.size >= maxCandidates) break;
        if (exhaustedQueryIndex.has(queryIndex)) continue;

        const query = normalizedQueries[queryIndex];
        const response = await requestGitHubSearch(query, perQuery, page);
        const items = Array.isArray(response.items) ? response.items : [];
        if (items.length === 0) {
          exhaustedQueryIndex.add(queryIndex);
          continue;
        }

        pageFetchedAny = true;

        for (const repo of items) {
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

          const collectionDecision = evaluateCollectionDecision(repo);
          if (!collectionDecision.allow) {
            qualityFilteredCount += 1;
            continue;
          }

          const result = await upsertCandidateFromRepo(repo);
          if (result === 'inserted') insertedCount += 1;
          if (result === 'updated') updatedCount += 1;
        }

        if (items.length < perQuery) {
          exhaustedQueryIndex.add(queryIndex);
        }
      }

      if (!pageFetchedAny) {
        break;
      }

      if (exhaustedQueryIndex.size >= normalizedQueries.length) {
        break;
      }
    }

    await finishIngestRun(run.id, {
      status: 'success',
      scannedCount,
      insertedCount,
      updatedCount,
      skippedCount,
      message: `扫描 ${scannedCount} 条，质量过滤 ${qualityFilteredCount}，新增 ${insertedCount}，更新 ${updatedCount}`,
    });

    return {
      runId: run.id,
      scannedCount,
      insertedCount,
      updatedCount,
      skippedCount,
      qualityFilteredCount,
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
