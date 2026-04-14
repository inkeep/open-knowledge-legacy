import type { Identity } from '../types/identity';
import { safeLocalStorageGet, safeLocalStorageSet } from './local-storage.ts';

// --- Constants ---

export const HUMAN_COLORS = [
  '#f0ece3', // warm gray
  '#fff5e1', // cream
  '#f9e1db', // peach blush
  '#f5def7', // blush
  '#ece2fb', // violet
  '#dce8fa', // azure
  '#DBF3FB', // sky
] as const;

// --- Color derivation ---

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s * 100, l * 100];
}

function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100;
  const ln = l / 100;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = ln - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Derives a dark, readable foreground color from a pastel background color.
 * Preserves the hue, drops lightness to ~32%, sets saturation to 45%.
 */
export function deriveIconColor(hex: string): string {
  const [h] = hexToHsl(hex);
  return hslToHex(h, 45, 32);
}

const ADJECTIVES = [
  'Curious',
  'Brave',
  'Clever',
  'Swift',
  'Gentle',
  'Bright',
  'Wise',
  'Bold',
  'Calm',
  'Keen',
] as const;

const ANIMALS = [
  'Bird',
  'Cat',
  'Dog',
  'Fish',
  'Mouse',
  'Rabbit',
  'Shrimp',
  'Snail',
  'Squirrel',
  'Turtle',
] as const;

const LS_NAME_KEY = 'ok-user-name-v2';
const LS_COLOR_KEY = 'ok-user-color-v2';

// --- Helpers ---

function randomElement<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateRandomName(): string {
  return `${randomElement(ADJECTIVES)} ${randomElement(ANIMALS)}`;
}

export function generateRandomColor(): string {
  return randomElement(HUMAN_COLORS);
}

// --- Core ---

export function getIdentity(): Identity {
  const params = new URLSearchParams(window.location.search);
  const coeditor = params.get('coeditor') || 'standalone';
  const tabId = crypto.randomUUID();

  let name = safeLocalStorageGet(LS_NAME_KEY);
  let color = safeLocalStorageGet(LS_COLOR_KEY);

  if (!name) {
    name = generateRandomName();
    safeLocalStorageSet(LS_NAME_KEY, name);
  }
  if (!color) {
    color = generateRandomColor();
    safeLocalStorageSet(LS_COLOR_KEY, color);
  }

  return { name, color, coeditor, tabId };
}
