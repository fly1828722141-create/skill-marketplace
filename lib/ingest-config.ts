import { DASHBOARD_OWNER_EMAIL } from '@/lib/dashboard-access';

function readEnv(name: string, fallback = ''): string {
  return (process.env[name] || fallback).trim();
}

function readBool(name: string, fallback: boolean): boolean {
  const raw = readEnv(name);
  if (!raw) return fallback;
  const normalized = raw.toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function readInt(name: string, fallback: number, options?: { min?: number; max?: number }): number {
  const raw = readEnv(name);
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  let value = parsed;
  if (typeof options?.min === 'number') value = Math.max(options.min, value);
  if (typeof options?.max === 'number') value = Math.min(options.max, value);
  return value;
}

function readFloat(name: string, fallback: number, options?: { min?: number; max?: number }): number {
  const raw = readEnv(name);
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) return fallback;
  let value = parsed;
  if (typeof options?.min === 'number') value = Math.max(options.min, value);
  if (typeof options?.max === 'number') value = Math.min(options.max, value);
  return value;
}

function readCsv(name: string, fallback: string[]): string[] {
  const raw = readEnv(name);
  const source = raw || fallback.join(',');
  return source
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

const DEFAULT_GITHUB_QUERIES = [
  '"npx skills add" stars:>20 archived:false fork:false',
  '"skills marketplace" "claude" stars:>80 archived:false fork:false',
  '"awesome-codex-skills" archived:false fork:false',
];

const DEFAULT_LICENSE_ALLOWLIST = [
  'mit',
  'apache-2.0',
  'bsd-2-clause',
  'bsd-3-clause',
  'mpl-2.0',
  'isc',
  'unlicense',
];

const DEFAULT_DISCOVER_SORTS: DiscoverSort[] = ['updated', 'stars'];

export type DiscoverSort = 'updated' | 'stars';

export interface IngestQualityWeights {
  stars: number;
  forks: number;
  recentActivity: number;
  issueHealth: number;
}

export interface SkillIngestConfig {
  githubApiBase: string;
  githubToken: string;
  githubQueries: string[];
  discoverSorts: DiscoverSort[];
  discoverPerQuery: number;
  discoverMaxPagesPerQuery: number;
  discoverMaxCandidates: number;
  autopublishEnabled: boolean;
  publishBatchSize: number;
  minStars: number;
  minForks: number;
  qualityWeightStars: number;
  qualityWeightForks: number;
  qualityWeightRecentActivity: number;
  qualityWeightIssueHealth: number;
  maxInactivityDays: number;
  requireLicense: boolean;
  allowedLicenses: string[];
  reviveRejectedEnabled: boolean;
  reviveRejectedMinStars: number;
  reviveRejectedMinForks: number;
  reviveRejectedDeltaStars: number;
  reviveRejectedDeltaForks: number;
  adminEmail: string;
  cronSecret: string;
  hmacSecret: string;
  hmacMaxSkewSeconds: number;
}

function readDiscoverSorts(name: string, fallback: DiscoverSort[]): DiscoverSort[] {
  const raw = readCsv(name, fallback);
  const result: DiscoverSort[] = [];
  for (const item of raw) {
    const normalized = item.trim().toLowerCase();
    if (normalized !== 'updated' && normalized !== 'stars') {
      continue;
    }
    if (result.includes(normalized)) {
      continue;
    }
    result.push(normalized);
  }

  return result.length > 0 ? result : fallback;
}

export function getSkillIngestConfig(): SkillIngestConfig {
  return {
    githubApiBase: readEnv('GITHUB_API_BASE', 'https://api.github.com').replace(/\/+$/, ''),
    githubToken: readEnv('GITHUB_DISCOVERY_TOKEN') || readEnv('GITHUB_TOKEN'),
    githubQueries: readCsv('INGEST_GITHUB_QUERIES', DEFAULT_GITHUB_QUERIES),
    discoverSorts: readDiscoverSorts('INGEST_DISCOVER_SORTS', DEFAULT_DISCOVER_SORTS),
    discoverPerQuery: readInt('INGEST_DISCOVER_PER_QUERY', 15, { min: 1, max: 100 }),
    discoverMaxPagesPerQuery: readInt('INGEST_DISCOVER_MAX_PAGES_PER_QUERY', 3, {
      min: 1,
      max: 10,
    }),
    discoverMaxCandidates: readInt('INGEST_DISCOVER_MAX_CANDIDATES', 80, {
      min: 5,
      max: 500,
    }),
    autopublishEnabled: readBool('INGEST_AUTOPUBLISH_ENABLED', false),
    publishBatchSize: readInt('INGEST_PUBLISH_BATCH_SIZE', 20, { min: 1, max: 200 }),
    minStars: readInt('INGEST_MIN_STARS', 50, { min: 0, max: 200000 }),
    minForks: readInt('INGEST_MIN_FORKS', 5, { min: 0, max: 200000 }),
    qualityWeightStars: readFloat('INGEST_SCORE_WEIGHT_STARS', 0.45, { min: 0, max: 1 }),
    qualityWeightForks: readFloat('INGEST_SCORE_WEIGHT_FORKS', 0.25, { min: 0, max: 1 }),
    qualityWeightRecentActivity: readFloat('INGEST_SCORE_WEIGHT_RECENT_ACTIVITY', 0.2, {
      min: 0,
      max: 1,
    }),
    qualityWeightIssueHealth: readFloat('INGEST_SCORE_WEIGHT_ISSUE_HEALTH', 0.1, {
      min: 0,
      max: 1,
    }),
    maxInactivityDays: readInt('INGEST_MAX_INACTIVITY_DAYS', 240, { min: 1, max: 3650 }),
    requireLicense: readBool('INGEST_REQUIRE_LICENSE', true),
    allowedLicenses: readCsv('INGEST_ALLOWED_LICENSES', DEFAULT_LICENSE_ALLOWLIST).map((key) =>
      key.toLowerCase()
    ),
    reviveRejectedEnabled: readBool('INGEST_REVIVE_REJECTED_ENABLED', true),
    reviveRejectedMinStars: readInt('INGEST_REVIVE_REJECTED_MIN_STARS', 60, {
      min: 0,
      max: 200000,
    }),
    reviveRejectedMinForks: readInt('INGEST_REVIVE_REJECTED_MIN_FORKS', 5, {
      min: 0,
      max: 200000,
    }),
    reviveRejectedDeltaStars: readInt('INGEST_REVIVE_REJECTED_DELTA_STARS', 20, {
      min: 0,
      max: 200000,
    }),
    reviveRejectedDeltaForks: readInt('INGEST_REVIVE_REJECTED_DELTA_FORKS', 3, {
      min: 0,
      max: 200000,
    }),
    adminEmail: readEnv('INGEST_ADMIN_EMAIL', DASHBOARD_OWNER_EMAIL).toLowerCase(),
    cronSecret: readEnv('VERCEL_CRON_SECRET') || readEnv('CRON_SECRET'),
    hmacSecret: readEnv('INGEST_HMAC_SECRET'),
    hmacMaxSkewSeconds: readInt('INGEST_HMAC_MAX_SKEW_SECONDS', 300, {
      min: 30,
      max: 3600,
    }),
  };
}
