import { safeLocalStorageGet, safeLocalStorageSet } from '@inkeep/open-knowledge-core';
import { createContext, type ReactNode, use, useState } from 'react';

export const MIN_DEPTH = 0;
export const DEFAULT_DEPTH = 1;
export const MAX_DEPTH = 5;

const LS_KEY = 'ok-graph-depth-v1';

function readPersistedDepth(): number {
  const raw = safeLocalStorageGet(LS_KEY);
  if (raw === null) return DEFAULT_DEPTH;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_DEPTH;
  return Math.max(MIN_DEPTH, Math.min(MAX_DEPTH, parsed));
}

const DepthContext = createContext<number>(DEFAULT_DEPTH);
const SetDepthContext = createContext<(value: number) => void>(() => {});

export function DirectoryColorProvider({ children }: { children: ReactNode }) {
  const [depth, setDepthRaw] = useState(readPersistedDepth);

  const setDepth = (value: number) => {
    const clamped = Math.max(MIN_DEPTH, Math.min(MAX_DEPTH, value));
    setDepthRaw(clamped);
    safeLocalStorageSet(LS_KEY, String(clamped));
  };

  return (
    <DepthContext value={depth}>
      <SetDepthContext value={setDepth}>{children}</SetDepthContext>
    </DepthContext>
  );
}

export function useDirectoryColorDepth(): number {
  return use(DepthContext);
}

export function useSetDirectoryColorDepth(): (value: number) => void {
  return use(SetDepthContext);
}
