import type { CSSProperties } from 'react';

const ICON_GRADIENTS: Array<[string, string]> = [
  ['#186df7', '#63b6ff'],
  ['#0a8f6a', '#45d6a8'],
  ['#a85af7', '#d89cff'],
  ['#d46a00', '#ffbb66'],
  ['#0d6b9f', '#53b8ff'],
  ['#b23a68', '#ff85b6'],
  ['#5a4fd6', '#a9a1ff'],
  ['#cf4b2a', '#ff9a6b'],
  ['#0b7d8b', '#5ce0f3'],
  ['#896100', '#f4c44d'],
  ['#1e5e4a', '#67d1a8'],
  ['#8a2c8f', '#df6ef1'],
];

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function hexToRgba(hexColor: string, alpha: number): string {
  const hex = hexColor.replace('#', '');
  const normalized =
    hex.length === 3
      ? hex
          .split('')
          .map((char) => `${char}${char}`)
          .join('')
      : hex;

  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function getSkillIconStyle(seed: string): CSSProperties {
  const hash = hashString(seed || 'skill');
  const [start, end] = ICON_GRADIENTS[hash % ICON_GRADIENTS.length];
  const angle = 118 + (hash % 65);
  const shadowColor = hexToRgba(start, 0.35);

  return {
    background: `linear-gradient(${angle}deg, ${start} 0%, ${end} 100%)`,
    boxShadow: `0 10px 22px ${shadowColor}`,
  };
}

export function getSkillMonogram(title: string): string {
  const clean = (title || '').trim();
  if (!clean) return 'S';
  const first = clean.charAt(0);
  if (/[\u4e00-\u9fa5]/.test(first)) {
    return first;
  }
  return first.toUpperCase();
}
