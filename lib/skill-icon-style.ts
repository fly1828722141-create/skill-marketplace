import type { CSSProperties } from 'react';

const ICON_GRADIENTS: Array<[string, string]> = [
  ['#2c7cf7', '#67b7ff'],
  ['#32b47e', '#67ddba'],
  ['#7f67f8', '#b7abff'],
  ['#ef7d3c', '#ffb36e'],
  ['#34a1bf', '#70dbef'],
  ['#f25f8f', '#ff94bd'],
  ['#4f69f2', '#93a2ff'],
  ['#3a9eea', '#7fceff'],
  ['#00a2a8', '#5ed8d5'],
  ['#9b7bf9', '#d3b9ff'],
  ['#e97a55', '#ffc08e'],
  ['#24a46f', '#6fd5a6'],
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
  const angle = 134 + (hash % 30);
  const shadowColor = hexToRgba(start, 0.33);
  const ambientColor = hexToRgba(end, 0.2);

  return {
    background: `linear-gradient(${angle}deg, ${start} 0%, ${end} 100%)`,
    boxShadow: `0 10px 20px ${shadowColor}, 0 3px 8px ${ambientColor}`,
  };
}
