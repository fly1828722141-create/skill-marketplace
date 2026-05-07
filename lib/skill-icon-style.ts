import type { CSSProperties } from 'react';

interface IconTheme {
  start: string;
  mid: string;
  end: string;
  ring: string;
  glyph: string;
}

const ICON_THEMES: IconTheme[] = [
  { start: '#1f6df2', mid: '#3f8bff', end: '#7fc2ff', ring: '#7ca8ff', glyph: '#f8fbff' },
  { start: '#1a9b72', mid: '#35c093', end: '#7ce3be', ring: '#63cfaa', glyph: '#f6fffb' },
  { start: '#6e54e8', mid: '#8b74f6', end: '#c4b3ff', ring: '#b7a4ff', glyph: '#faf7ff' },
  { start: '#e56d35', mid: '#f28a4f', end: '#ffc190', ring: '#f7b480', glyph: '#fff9f4' },
  { start: '#c4468d', mid: '#e864a8', end: '#ffabc6', ring: '#f29bc3', glyph: '#fff5fb' },
  { start: '#0f8e96', mid: '#27afb7', end: '#79dce0', ring: '#74d1d5', glyph: '#f4feff' },
  { start: '#5060dd', mid: '#6977f1', end: '#a0adff', ring: '#91a1ff', glyph: '#f7f8ff' },
  { start: '#0876bd', mid: '#2097e0', end: '#7fd3ff', ring: '#75c6ef', glyph: '#f5fbff' },
  { start: '#1678a8', mid: '#2fa2d8', end: '#8fdcf3', ring: '#82cee6', glyph: '#f4fbff' },
  { start: '#6b7d2a', mid: '#8ea83f', end: '#c8de72', ring: '#b8d764', glyph: '#fcffef' },
  { start: '#9f5c2d', mid: '#c97737', end: '#edbc77', ring: '#deb06d', glyph: '#fffaf2' },
  { start: '#4b2eb7', mid: '#6a49df', end: '#a88df9', ring: '#9f87f2', glyph: '#f8f4ff' },
];

const ICON_SHAPES = [
  '24% 26% 24% 28% / 28% 24% 30% 22%',
  '22% 28% 22% 30% / 24% 30% 22% 28%',
  '28% 22% 30% 22% / 26% 20% 34% 22%',
  '20% 32% 24% 26% / 26% 22% 30% 22%',
  '26% 24% 28% 24% / 22% 28% 22% 30%',
  '30% 24% 22% 26% / 24% 30% 20% 26%',
];

const ICON_TILTS = [
  'rotate(-2deg)',
  'rotate(-1deg)',
  'rotate(0deg)',
  'rotate(1deg)',
  'rotate(2deg)',
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

type SkillIconCssVars = CSSProperties & {
  '--skill-icon-radius'?: string;
  '--skill-icon-tilt'?: string;
  '--skill-icon-ring-color'?: string;
  '--skill-icon-overlay-color'?: string;
  '--skill-icon-glyph-color'?: string;
};

export function getSkillIconStyle(seed: string): CSSProperties {
  const hash = hashString(seed || 'skill');
  const theme = ICON_THEMES[hash % ICON_THEMES.length];
  const accentTheme = ICON_THEMES[(hash * 7 + 11) % ICON_THEMES.length];
  const angle = 122 + (hash % 46);
  const shadowStrong = hexToRgba(theme.start, 0.34);
  const shadowSoft = hexToRgba(theme.end, 0.2);
  const ringColor = hexToRgba(theme.ring, 0.55);
  const overlayColor = hexToRgba(accentTheme.end, 0.28);
  const glowColor = hexToRgba(accentTheme.start, 0.24);

  const style: SkillIconCssVars = {
    background: [
      `radial-gradient(130% 95% at 16% 8%, rgba(255,255,255,0.64) 0%, rgba(255,255,255,0.14) 34%, rgba(255,255,255,0) 64%)`,
      `radial-gradient(120% 110% at 84% 92%, ${glowColor} 0%, rgba(255,255,255,0) 62%)`,
      `linear-gradient(${angle}deg, ${theme.start} 0%, ${theme.mid} 46%, ${theme.end} 100%)`,
    ].join(', '),
    boxShadow: `0 11px 24px ${shadowStrong}, 0 4px 10px ${shadowSoft}`,
    filter: 'saturate(1.16) contrast(1.05)',
    '--skill-icon-radius': ICON_SHAPES[hash % ICON_SHAPES.length],
    '--skill-icon-tilt': ICON_TILTS[(hash >> 2) % ICON_TILTS.length],
    '--skill-icon-ring-color': ringColor,
    '--skill-icon-overlay-color': overlayColor,
    '--skill-icon-glyph-color': theme.glyph,
  };

  return style;
}
