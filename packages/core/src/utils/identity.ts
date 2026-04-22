import type { Identity } from '../types/identity';

// --- Constants ---

export const AGENT_COLORS = [
  '#D97757', // claude
  '#1B1912', // cursor
  '#F9F3E9', // windsurf
  '#7A9DFF', // openai/codex
  '#8534F3', // github/copilot
  '#9663F0', // cline
  '#727CF3', // bot
] as const;

/** Per-icon color palette — one entry per known agent client type. */
export const AGENT_ICON_COLORS: Record<string, string> = {
  claude: '#D97757', // warm orange
  cursor: '#1B1912', // dark (Cursor brand)
  windsurf: '#0B100F', // dark (Windsurf brand)
  openai: '#7A9DFF', // blue (Codex brand)
  github: '#8534F3', // purple (Copilot brand)
  cline: '#9663F0', // purple (Cline brand)
  bot: '#727CF3', // indigo (generic agent fallback)
};

export const HUMAN_COLORS = [
  '#f0ece3', // warm gray
  '#fff5e1', // cream
  '#f9e1db', // peach blush
  '#f5def7', // blush
  '#ece2fb', // violet
  '#dce8fa', // azure
  '#DBF3FB', // sky
] as const;

/**
 * Deterministic hex color from a stable palette for a given seed string.
 * Shared between server (agent awareness) and app (TimelinePanel).
 */
export function colorFromSeed(seed: string): string {
  let hash = 0;
  for (const ch of seed) hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0;
  return AGENT_COLORS[Math.abs(hash) % AGENT_COLORS.length];
}

/**
 * Map known MCP `clientInfo.name` values to icon identifiers used by both
 * the presence bar (`AGENT_ICON_COLORS[icon]`) and the Timeline dot-color
 * derivation. Unknown clients map to `'bot'` so the fallback indigo color
 * is reached via the icon table, not via the colorFromSeed hash palette
 * (which can collide between e.g. `claude-code` and `cursor-vscode`).
 *
 * Kept in core so app (TimelinePanel) and server (api-extension +
 * agent-sessions) use the identical mapping — drift between surfaces is
 * how dot-color/badge-color become inconsistent for the same agent.
 */
const ICON_MAP: Record<string, string> = {
  'claude-code': 'claude',
  'claude-ai': 'claude',
  cursor: 'cursor',
  'cursor-vscode': 'cursor',
  cascade: 'windsurf',
  codex: 'openai',
  copilot: 'github',
  cline: 'cline',
};

export function iconFromClientName(name?: string): string {
  return name ? (ICON_MAP[name] ?? 'bot') : 'bot';
}

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

/**
 * Safe localStorage getter — returns null on any access error (Safari private
 * browsing, iframe sandboxing, user-disabled storage). Without this guard, the
 * entire editor mount crashes in private browsing mode.
 */
function safeLocalStorageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Safe localStorage setter — silently no-ops on error. */
function safeLocalStorageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Swallow — QuotaExceededError in private browsing, etc.
    // Identity stays fresh-per-session, which is the correct graceful degradation.
  }
}

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
