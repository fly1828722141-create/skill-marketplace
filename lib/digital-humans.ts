import { DEFAULT_SKILL_CATEGORIES_PRESET } from '@/lib/category-presets';

export const DIGITAL_HUMAN_MIGRATION_EVENT = 'system_migrate_digital_humans_v1';
export const DEFAULT_DIGITAL_HUMAN_SLUG = 'data-analysis-expert';
export const HUMAN_ICON_FALLBACK = 'generic';

const HUMAN_ICON_SET = new Set([
  'data',
  'video',
  'dev',
  'content',
  'office',
  'image',
  'marketing',
  'biz',
  HUMAN_ICON_FALLBACK,
]);

export const CORE_DIGITAL_HUMAN_SLUGS = DEFAULT_SKILL_CATEGORIES_PRESET.map((item) => item.slug);
export const CORE_DIGITAL_HUMAN_SLUG_SET = new Set(CORE_DIGITAL_HUMAN_SLUGS);

export function normalizeHumanName(input: string): string {
  return input.trim().replace(/\s+/g, ' ');
}

export function normalizeHumanSlug(input: string): string {
  const value = input
    .trim()
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/[^\w\u4e00-\u9fa5\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (value) return value;
  return `digital-human-${Date.now().toString(36)}`;
}

export function normalizeHumanIcon(icon?: string | null): string {
  if (!icon) return HUMAN_ICON_FALLBACK;
  const normalized = icon.trim().toLowerCase();
  return HUMAN_ICON_SET.has(normalized) ? normalized : HUMAN_ICON_FALLBACK;
}

