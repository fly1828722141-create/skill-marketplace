import { getSkillIngestConfig, type IngestQualityWeights } from '@/lib/ingest-config';

interface QualityScoreInput {
  stars: number;
  forks: number;
  openIssues: number;
  pushedAt: Date | string | null;
}

function clamp(value: number, min = 0, max = 1): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function normalizeQualityWeights(weights: IngestQualityWeights): IngestQualityWeights {
  const safeWeights = {
    stars: Math.max(0, Number(weights.stars || 0)),
    forks: Math.max(0, Number(weights.forks || 0)),
    recentActivity: Math.max(0, Number(weights.recentActivity || 0)),
    issueHealth: Math.max(0, Number(weights.issueHealth || 0)),
  };

  const total =
    safeWeights.stars +
    safeWeights.forks +
    safeWeights.recentActivity +
    safeWeights.issueHealth;

  if (total <= 0) {
    return {
      stars: 0.45,
      forks: 0.25,
      recentActivity: 0.2,
      issueHealth: 0.1,
    };
  }

  return {
    stars: safeWeights.stars / total,
    forks: safeWeights.forks / total,
    recentActivity: safeWeights.recentActivity / total,
    issueHealth: safeWeights.issueHealth / total,
  };
}

export function resolveDefaultQualityWeights(): IngestQualityWeights {
  const config = getSkillIngestConfig();
  return normalizeQualityWeights({
    stars: config.qualityWeightStars,
    forks: config.qualityWeightForks,
    recentActivity: config.qualityWeightRecentActivity,
    issueHealth: config.qualityWeightIssueHealth,
  });
}

function normalizeStarScore(stars: number): number {
  return clamp(Math.log10(Math.max(0, stars) + 1) / 3);
}

function normalizeForkScore(forks: number): number {
  return clamp(Math.log10(Math.max(0, forks) + 1) / 2.5);
}

function normalizeRecentActivityScore(pushedAt: Date | string | null, maxInactivityDays: number): number {
  if (!pushedAt) return 0;
  const parsed = pushedAt instanceof Date ? pushedAt : new Date(pushedAt);
  if (Number.isNaN(parsed.getTime())) return 0;
  const inactiveDays = (Date.now() - parsed.getTime()) / (1000 * 60 * 60 * 24);
  if (inactiveDays <= 0) return 1;
  return clamp(1 - inactiveDays / maxInactivityDays);
}

function normalizeIssueHealthScore(openIssues: number, stars: number, forks: number): number {
  const denominator = Math.max(20, stars + forks);
  const issueRatio = Math.max(0, openIssues) / denominator;
  return clamp(1 - issueRatio * 2.2);
}

export function calculateQualityScore(
  input: QualityScoreInput,
  weights: IngestQualityWeights
): number {
  const config = getSkillIngestConfig();
  const normalizedWeights = normalizeQualityWeights(weights);

  const starsScore = normalizeStarScore(input.stars);
  const forksScore = normalizeForkScore(input.forks);
  const recentActivityScore = normalizeRecentActivityScore(input.pushedAt, config.maxInactivityDays);
  const issueHealthScore = normalizeIssueHealthScore(input.openIssues, input.stars, input.forks);

  const score =
    starsScore * normalizedWeights.stars +
    forksScore * normalizedWeights.forks +
    recentActivityScore * normalizedWeights.recentActivity +
    issueHealthScore * normalizedWeights.issueHealth;

  return Number((score * 100).toFixed(2));
}
