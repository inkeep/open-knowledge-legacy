import { useState } from 'react';

// --- Types ---

export interface AwarenessUser {
  name: string;
  color: string;
  type: 'human' | 'agent';
  icon?: string;
  coeditor?: string;
  tabId: string;
}

export interface AwarenessState {
  user: AwarenessUser;
  mode: 'wysiwyg' | 'source' | 'idle' | 'editing';
  cursor?: {
    anchor: unknown;
    head: unknown;
  };
}

/** Entry in Y.Map('activity') side-channel for agent write attribution. */
export interface ActivityEntry {
  agentId: string;
  timestamp: number;
  type: 'insert' | 'replace' | 'delete';
  description?: string;
}

export interface Identity {
  name: string;
  color: string;
  coeditor: string;
  tabId: string;
}

// --- Constants ---

const HUMAN_COLORS = [
  '#3784FF', // azure
  '#7C3AED', // violet
  '#10B981', // emerald
  '#F43F5E', // rose
  '#F59E0B', // amber
  '#06B6D4', // cyan
  '#4F46E5', // indigo
  '#EC4899', // pink
] as const;

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
  'Otter',
  'Fox',
  'Hawk',
  'Bear',
  'Wolf',
  'Lynx',
  'Crane',
  'Deer',
  'Owl',
  'Hare',
] as const;

const LS_NAME_KEY = 'ok-user-name';
const LS_COLOR_KEY = 'ok-user-color';

// --- Helpers ---

function randomElement<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateRandomName(): string {
  return `${randomElement(ADJECTIVES)} ${randomElement(ANIMALS)}`;
}

function generateRandomColor(): string {
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

// --- React hook ---

export function useIdentity(): Identity {
  // Lazy initializer — identity is derived once per component mount (stable per tab).
  // useState(() => ...) runs the initializer once and caches it for the component lifetime.
  const [identity] = useState(getIdentity);
  return identity;
}

// --- Exported for testing ---
export { generateRandomColor, generateRandomName, HUMAN_COLORS };
