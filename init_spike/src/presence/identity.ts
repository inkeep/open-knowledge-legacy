import { useMemo } from 'react';

// --- Types ---

export interface AwarenessUser {
  name: string;
  color: string;
  type: 'human' | 'agent';
  coeditor?: string;
  tabId: string;
}

export interface AwarenessState {
  user: AwarenessUser;
  mode: 'wysiwyg' | 'source' | 'idle';
  cursor?: {
    anchor: unknown;
    head: unknown;
  };
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

export function getIdentity(): Identity {
  const params = new URLSearchParams(window.location.search);
  const coeditor = params.get('coeditor') || 'standalone';
  const tabId = crypto.randomUUID();

  let name = localStorage.getItem(LS_NAME_KEY);
  let color = localStorage.getItem(LS_COLOR_KEY);

  if (!name) {
    name = generateRandomName();
    localStorage.setItem(LS_NAME_KEY, name);
  }
  if (!color) {
    color = generateRandomColor();
    localStorage.setItem(LS_COLOR_KEY, color);
  }

  return { name, color, coeditor, tabId };
}

// --- React hook ---

export function useIdentity(): Identity {
  return useMemo(() => getIdentity(), []);
}

// --- Exported for testing ---
export { HUMAN_COLORS, generateRandomName, generateRandomColor };
