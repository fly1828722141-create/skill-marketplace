/**
 * 标签字段兼容处理：
 * - PostgreSQL schema: tags 为 string[]
 * - SQLite schema: tags 为 string（逗号分隔）
 */

function normalizeRawTagList(tags: string): string[] {
  return tags
    .replace(/，/g, ',')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function parseTagsInput(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input
      .map((tag) => String(tag).trim())
      .filter(Boolean);
  }

  if (typeof input === 'string') {
    return normalizeRawTagList(input);
  }

  return [];
}

export function normalizeTagsFromDb(input: unknown): string[] {
  return parseTagsInput(input);
}

export function isSqliteProvider(prismaClient: unknown): boolean {
  return (prismaClient as any)?._engineConfig?.activeProvider === 'sqlite';
}

export function toPrismaTagsValue(input: unknown, prismaClient: unknown): string[] | string {
  const tags = parseTagsInput(input);
  return isSqliteProvider(prismaClient) ? tags.join(',') : tags;
}
