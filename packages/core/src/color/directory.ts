import {
  DIRECTORY_FALLBACK_DARK,
  DIRECTORY_FALLBACK_LIGHT,
  DIRECTORY_PALETTE_DARK,
  DIRECTORY_PALETTE_LIGHT,
} from './palette.ts';

export type DirectoryColorOptions = {
  depth: number;
  theme: 'light' | 'dark';
};

function djb2(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return hash >>> 0;
}

/** Prefix-truncation bucket: first `min(depth, segments.length)` segments, or null for flat-root / depth 0. */
export function bucketKeyForPath(path: string, depth: number): string | null {
  if (depth === 0) return null;
  const segments = path.split('/').filter((s) => s.length > 0);
  if (segments.length === 0) return null;
  return segments.slice(0, Math.min(depth, segments.length)).join('/');
}

/** Color for a document node — strips the terminal filename segment before bucketing. */
export function colorForDocName(docName: string, options: DirectoryColorOptions): string {
  const parts = docName.split('/');
  const dirSegments = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
  const bucket = bucketKeyForPath(dirSegments, options.depth);
  if (bucket === null) {
    return options.theme === 'dark' ? DIRECTORY_FALLBACK_DARK : DIRECTORY_FALLBACK_LIGHT;
  }
  const palette = options.theme === 'dark' ? DIRECTORY_PALETTE_DARK : DIRECTORY_PALETTE_LIGHT;
  return palette[djb2(bucket) % palette.length];
}

/** Color for a sidebar folder — buckets the full path (no filename stripping). */
export function colorForFolderPath(folderPath: string, options: DirectoryColorOptions): string {
  const bucket = bucketKeyForPath(folderPath, options.depth);
  if (bucket === null) {
    return options.theme === 'dark' ? DIRECTORY_FALLBACK_DARK : DIRECTORY_FALLBACK_LIGHT;
  }
  const palette = options.theme === 'dark' ? DIRECTORY_PALETTE_DARK : DIRECTORY_PALETTE_LIGHT;
  return palette[djb2(bucket) % palette.length];
}
