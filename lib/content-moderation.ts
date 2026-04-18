const DEFAULT_SENSITIVE_WORDS = [
  '傻逼',
  '傻x',
  '煞笔',
  '脑残',
  '滚蛋',
  '操你',
  '他妈的',
  '诈骗',
  '刷单',
  '赌博',
  '色情',
  '毒品',
  '办证',
];

function normalizeWords(input: string[]): string[] {
  return Array.from(
    new Set(
      input
        .map((item) => item.trim().toLowerCase())
        .filter((item) => item.length >= 2)
    )
  );
}

function getRuntimeWords(): string[] {
  const fromEnv = (process.env.FEEDBACK_SENSITIVE_WORDS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return normalizeWords([...DEFAULT_SENSITIVE_WORDS, ...fromEnv]);
}

function maskWord(word: string): string {
  if (word.length <= 2) {
    return `${word[0]}*`;
  }
  return `${word[0]}${'*'.repeat(Math.max(1, word.length - 2))}${word[word.length - 1]}`;
}

export function detectSensitiveWords(content: string): string[] {
  const text = (content || '').toLowerCase();
  if (!text) return [];

  const words = getRuntimeWords();
  const hitWords = words.filter((word) => text.includes(word));
  return Array.from(new Set(hitWords));
}

export function getSensitiveWordError(content: string): string | null {
  const hits = detectSensitiveWords(content);
  if (hits.length === 0) {
    return null;
  }

  const preview = hits.slice(0, 3).map(maskWord).join('、');
  return `内容包含敏感词（${preview}），请调整后再提交`;
}
