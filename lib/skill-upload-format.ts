export const SKILL_UPLOAD_EXTENSIONS = [
  '.zip',
  '.tar.gz',
  '.tgz',
  '.rar',
  '.7z',
  '.skill',
  '.md',
  '.markdown',
  '.txt',
  '.json',
  '.yaml',
  '.yml',
] as const;

export const SKILL_UPLOAD_EXTENSIONS_TEXT = SKILL_UPLOAD_EXTENSIONS.join(' / ');
export const SKILL_UPLOAD_ACCEPT = SKILL_UPLOAD_EXTENSIONS.join(',');

export function detectSkillFileExtension(fileName: string): string {
  const lowerName = (fileName || '').trim().toLowerCase();
  if (!lowerName) return '';

  if (lowerName.endsWith('.tar.gz')) return '.tar.gz';

  for (const ext of SKILL_UPLOAD_EXTENSIONS) {
    if (ext === '.tar.gz') continue;
    if (lowerName.endsWith(ext)) return ext;
  }

  const dot = lowerName.lastIndexOf('.');
  if (dot <= 0 || dot === lowerName.length - 1) {
    return '';
  }

  return lowerName.slice(dot);
}

export function isSupportedSkillFile(fileName: string): boolean {
  const ext = detectSkillFileExtension(fileName);
  return SKILL_UPLOAD_EXTENSIONS.includes(ext as (typeof SKILL_UPLOAD_EXTENSIONS)[number]);
}
