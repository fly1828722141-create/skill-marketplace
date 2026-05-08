import { getSkillIngestConfig, type SkillsShView } from '@/lib/ingest-config';

interface SkillsShApiSkill {
  id?: string;
  slug?: string;
  name?: string;
  source?: string;
  installs?: number;
  sourceType?: string;
  installUrl?: string | null;
  url?: string;
  isDuplicate?: boolean;
  isOfficial?: boolean;
}

interface SkillsShApiResponse {
  data?: SkillsShApiSkill[];
  pagination?: {
    page?: number;
    perPage?: number;
    total?: number;
    hasMore?: boolean;
  };
}

export interface SkillsShSkillItem {
  source: string;
  skillId: string;
  name: string;
  installs: number;
  sourceType: 'github' | 'well-known' | 'unknown';
  installUrl: string | null;
  url: string;
  view: SkillsShView;
  isOfficial: boolean;
  isDuplicate: boolean;
}

export interface SkillsShFetchResult {
  items: SkillsShSkillItem[];
  mode: 'none' | 'api' | 'html' | 'mixed';
  errors: string[];
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function isGitHubSource(source: string): boolean {
  return /^[a-z0-9._-]+\/[a-z0-9._-]+$/i.test((source || '').trim());
}

function routeFromView(view: SkillsShView): string {
  if (view === 'trending') return '/trending';
  if (view === 'hot') return '/hot';
  return '/';
}

function parseSourceType(rawType: string | undefined, source: string): 'github' | 'well-known' | 'unknown' {
  const normalized = (rawType || '').trim().toLowerCase();
  if (normalized === 'github') return 'github';
  if (normalized === 'well-known') return 'well-known';
  if (isGitHubSource(source)) return 'github';
  if (source.includes('.')) return 'well-known';
  return 'unknown';
}

function toSafeInt(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function buildSkillPageUrl(source: string, skillId: string): string {
  const segments = [source, skillId]
    .map((item) => String(item || '').trim().replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .map((item) => encodeURIComponent(item));
  if (segments.length < 2) return 'https://skills.sh';
  return `https://skills.sh/${segments.join('/')}`;
}

function normalizeInstallUrl(source: string, sourceType: 'github' | 'well-known' | 'unknown', installUrl?: string | null): string | null {
  const rawInstallUrl = String(installUrl || '').trim();
  if (rawInstallUrl && isHttpUrl(rawInstallUrl)) {
    return rawInstallUrl;
  }
  if (sourceType === 'github' || isGitHubSource(source)) {
    return `https://github.com/${source}`;
  }
  if (sourceType === 'well-known') {
    if (isHttpUrl(source)) return source;
    if (source.includes('.')) return `https://${source}`;
  }
  return null;
}

function normalizeSkillId(item: SkillsShApiSkill): string {
  const slug = String(item.slug || '').trim();
  if (slug) return slug;

  const source = String(item.source || '').trim();
  const id = String(item.id || '').trim();
  if (source && id.startsWith(`${source}/`)) {
    return id.slice(source.length + 1);
  }

  if (id.includes('/')) {
    const segments = id.split('/').filter(Boolean);
    return segments[segments.length - 1] || '';
  }

  return id;
}

function parseApiSkill(item: SkillsShApiSkill, view: SkillsShView): SkillsShSkillItem | null {
  const source = String(item.source || '').trim();
  const skillId = normalizeSkillId(item).trim();
  if (!source || !skillId) return null;

  const sourceType = parseSourceType(item.sourceType, source);
  const name = String(item.name || '').trim() || skillId;
  const installs = toSafeInt(item.installs);
  const url = String(item.url || '').trim() || buildSkillPageUrl(source, skillId);
  const installUrl = normalizeInstallUrl(source, sourceType, item.installUrl);

  return {
    source,
    skillId,
    name,
    installs,
    sourceType,
    installUrl,
    url,
    view,
    isOfficial: item.isOfficial === true,
    isDuplicate: item.isDuplicate === true,
  };
}

function decodeEscapedHtmlValue(value: string): string {
  try {
    return JSON.parse(`"${value.replace(/"/g, '\\"')}"`);
  } catch {
    return value.replace(/\\\//g, '/');
  }
}

function parseHtmlSkills(html: string, view: SkillsShView): SkillsShSkillItem[] {
  const pattern =
    /\\"source\\":\\"([^\\"]+)\\",\\"skillId\\":\\"([^\\"]+)\\",\\"name\\":\\"([^\\"]+)\\",\\"installs\\":(\d+)(?:,\\"isOfficial\\":(true|false))?/g;

  const items: SkillsShSkillItem[] = [];
  let match: RegExpExecArray | null = null;
  while ((match = pattern.exec(html)) !== null) {
    const source = decodeEscapedHtmlValue(match[1] || '').trim();
    const skillId = decodeEscapedHtmlValue(match[2] || '').trim();
    const name = decodeEscapedHtmlValue(match[3] || '').trim() || skillId;
    if (!source || !skillId) continue;

    const sourceType = parseSourceType(undefined, source);
    items.push({
      source,
      skillId,
      name,
      installs: toSafeInt(match[4]),
      sourceType,
      installUrl: normalizeInstallUrl(source, sourceType, null),
      url: buildSkillPageUrl(source, skillId),
      view,
      isOfficial: match[5] === 'true',
      isDuplicate: false,
    });
  }

  return items;
}

function mergeItems(items: SkillsShSkillItem[]): SkillsShSkillItem[] {
  const merged = new Map<string, SkillsShSkillItem>();

  for (const item of items) {
    const key = `${item.source.toLowerCase()}::${item.skillId.toLowerCase()}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...item });
      continue;
    }

    existing.installs = Math.max(existing.installs, item.installs);
    existing.isOfficial = existing.isOfficial || item.isOfficial;
    existing.isDuplicate = existing.isDuplicate || item.isDuplicate;
    if (!existing.installUrl && item.installUrl) {
      existing.installUrl = item.installUrl;
    }
    if (!existing.url && item.url) {
      existing.url = item.url;
    }
  }

  return [...merged.values()].sort((left, right) => {
    if (right.installs !== left.installs) return right.installs - left.installs;
    const sourceDiff = left.source.localeCompare(right.source);
    if (sourceDiff !== 0) return sourceDiff;
    return left.skillId.localeCompare(right.skillId);
  });
}

async function fetchSkillsByApiView(view: SkillsShView): Promise<SkillsShSkillItem[]> {
  const config = getSkillIngestConfig();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'skill-marketplace-ingest',
  };
  if (config.skillsShApiKey) {
    headers.Authorization = `Bearer ${config.skillsShApiKey}`;
  }

  const items: SkillsShSkillItem[] = [];

  for (let page = 0; page < config.skillsShMaxPages; page += 1) {
    const params = new URLSearchParams({
      view,
      page: String(page),
      per_page: String(config.skillsShPerPage),
    });

    const response = await fetch(`${config.skillsShApiBase}/skills?${params.toString()}`, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(config.skillsShRequestTimeoutMs),
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error(`skills.sh API ${response.status} 需要认证`);
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`skills.sh API 请求失败(${response.status}): ${body.slice(0, 160)}`);
    }

    const payload = (await response.json()) as SkillsShApiResponse;
    const data = Array.isArray(payload?.data) ? payload.data : [];
    for (const entry of data) {
      const parsed = parseApiSkill(entry, view);
      if (parsed) {
        items.push(parsed);
      }
    }

    const hasMore = payload?.pagination?.hasMore === true;
    if (!hasMore || data.length < config.skillsShPerPage) {
      break;
    }
  }

  return items;
}

async function fetchSkillsByHtmlView(view: SkillsShView): Promise<SkillsShSkillItem[]> {
  const config = getSkillIngestConfig();
  const route = routeFromView(view);
  const response = await fetch(`https://skills.sh${route}`, {
    method: 'GET',
    headers: {
      Accept: 'text/html',
      'User-Agent': 'skill-marketplace-ingest',
    },
    signal: AbortSignal.timeout(config.skillsShRequestTimeoutMs),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`skills.sh 页面抓取失败(${response.status}): ${body.slice(0, 160)}`);
  }

  const html = await response.text();
  return parseHtmlSkills(html, view);
}

export async function fetchSkillsShSkills(): Promise<SkillsShFetchResult> {
  const config = getSkillIngestConfig();
  if (!config.skillsShEnabled) {
    return {
      items: [],
      mode: 'none',
      errors: [],
    };
  }

  const views = [...new Set(config.skillsShViews)].filter(Boolean);
  const items: SkillsShSkillItem[] = [];
  const errors: string[] = [];

  let apiSucceeded = 0;
  let htmlSucceeded = 0;
  let forceHtmlFallback = !config.skillsShPreferApi && !config.skillsShApiKey;

  for (const view of views) {
    if (!forceHtmlFallback) {
      try {
        const apiItems = await fetchSkillsByApiView(view);
        apiSucceeded += 1;
        if (apiItems.length > 0) {
          items.push(...apiItems);
        }
        continue;
      } catch (error: any) {
        const message = String(error?.message || 'unknown');
        errors.push(`[${view}] api: ${message}`);
        if (!config.skillsShApiKey && /需要认证|401|403/.test(message)) {
          forceHtmlFallback = true;
        }
      }
    }

    try {
      const htmlItems = await fetchSkillsByHtmlView(view);
      htmlSucceeded += 1;
      if (htmlItems.length > 0) {
        items.push(...htmlItems);
      }
    } catch (error: any) {
      errors.push(`[${view}] html: ${String(error?.message || 'unknown')}`);
    }
  }

  const mode: SkillsShFetchResult['mode'] =
    apiSucceeded > 0 && htmlSucceeded > 0
      ? 'mixed'
      : apiSucceeded > 0
        ? 'api'
        : htmlSucceeded > 0
          ? 'html'
          : 'none';

  return {
    items: mergeItems(items),
    mode,
    errors,
  };
}
