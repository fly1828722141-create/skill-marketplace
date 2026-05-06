/**
 * 解析 Skill 外链输入：
 * - 纯 URL
 * - 包含 URL 的命令文本
 * - npx skills add owner/repo@skill 形式
 */

export interface ParsedSkillLinkInput {
  sourceType: 'url' | 'command';
  storageValue: string;
  sourceUrl?: string;
  installCommand?: string;
}

interface ParsedRepoSpec {
  owner: string;
  repo: string;
  inlineSkillSlug?: string;
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function stripWrappingQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function pickToken(groups: Array<string | undefined>): string {
  for (const group of groups) {
    if (typeof group === 'string' && group.trim()) {
      return group.trim();
    }
  }
  return '';
}

function trimTrailingPunctuation(value: string): string {
  return value.replace(/[),.;!?]+$/g, '');
}

function normalizeHttpUrl(value: string): string | null {
  const candidate = trimTrailingPunctuation(stripWrappingQuotes(value.trim()));
  if (!candidate || !isHttpUrl(candidate)) {
    return null;
  }

  try {
    return new URL(candidate).toString();
  } catch {
    return null;
  }
}

function extractFirstHttpUrl(input: string): string | null {
  const match = input.match(/https?:\/\/[^\s"'<>]+/i);
  if (!match) return null;
  return normalizeHttpUrl(match[0]);
}

function normalizeSkillSlug(value: string): string {
  return trimTrailingPunctuation(stripWrappingQuotes(value.trim()));
}

function parseRepoSpec(value: string): ParsedRepoSpec | null {
  const normalized = value.trim().replace(/^github:/i, '');
  const match = normalized.match(
    /^([a-z0-9._-]+)\/([a-z0-9._-]+?)(?:@([a-z0-9._-]+))?$/i
  );
  if (!match) return null;

  const owner = match[1];
  const repo = match[2].replace(/\.git$/i, '');
  if (!owner || !repo) return null;

  return {
    owner,
    repo,
    inlineSkillSlug: match[3] || undefined,
  };
}

function parseSkillsAddCommand(input: string): { sourceValue: string; skillSlug?: string } | null {
  const sourceMatch = input.match(
    /\bskills\s+add\s+("([^"]+)"|'([^']+)'|([^\s]+))/i
  );
  if (!sourceMatch) return null;

  const sourceValue = stripWrappingQuotes(
    pickToken([sourceMatch[2], sourceMatch[3], sourceMatch[4], sourceMatch[1]])
  );
  if (!sourceValue) return null;

  const skillMatch = input.match(
    /--skill(?:=|\s+)("([^"]+)"|'([^']+)'|([^\s]+))/i
  );
  const parsedSkill = skillMatch
    ? normalizeSkillSlug(
        pickToken([skillMatch[2], skillMatch[3], skillMatch[4], skillMatch[1]])
      )
    : '';

  return {
    sourceValue,
    skillSlug: parsedSkill || undefined,
  };
}

function buildInstallCommand(source: string, skillSlug?: string): string {
  const normalizedSlug = skillSlug ? normalizeSkillSlug(skillSlug) : '';
  return normalizedSlug
    ? `npx skills add ${source} --skill ${normalizedSlug}`
    : `npx skills add ${source}`;
}

function fromHttpUrl(url: string, skillSlug?: string, forceCommand = false): ParsedSkillLinkInput {
  const installCommand = buildInstallCommand(url, skillSlug);
  const useCommandStorage = forceCommand || Boolean(skillSlug);

  return {
    sourceType: useCommandStorage ? 'command' : 'url',
    storageValue: useCommandStorage ? installCommand : url,
    sourceUrl: url,
    installCommand,
  };
}

function fromRepoSpec(repo: ParsedRepoSpec, skillSlug?: string): ParsedSkillLinkInput {
  const normalizedSkill = normalizeSkillSlug(skillSlug || repo.inlineSkillSlug || '');
  const repoRef = `${repo.owner}/${repo.repo}`;

  return {
    sourceType: 'command',
    storageValue: buildInstallCommand(repoRef, normalizedSkill || undefined),
    sourceUrl: `https://github.com/${repo.owner}/${repo.repo}`,
    installCommand: buildInstallCommand(repoRef, normalizedSkill || undefined),
  };
}

export function parseSkillLinkInput(input: string): ParsedSkillLinkInput | null {
  const trimmed = (input || '').trim();
  if (!trimmed) return null;

  const command = parseSkillsAddCommand(trimmed);
  if (command) {
    const commandUrl = normalizeHttpUrl(command.sourceValue) || extractFirstHttpUrl(command.sourceValue);
    if (commandUrl) {
      return fromHttpUrl(commandUrl, command.skillSlug, true);
    }

    const commandRepo = parseRepoSpec(command.sourceValue);
    if (commandRepo) {
      return fromRepoSpec(commandRepo, command.skillSlug);
    }
  }

  const directUrl = normalizeHttpUrl(trimmed) || extractFirstHttpUrl(trimmed);
  if (directUrl) {
    return fromHttpUrl(directUrl);
  }

  const directRepo = parseRepoSpec(trimmed);
  if (directRepo) {
    return fromRepoSpec(directRepo);
  }

  return null;
}
