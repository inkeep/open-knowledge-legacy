import type { InlineAssetMediaKind } from '@inkeep/open-knowledge-core';

export interface DocumentEntry {
  kind: 'document';
  docName: string;
  docExt?: string;
  size: number;
  modified: string;
  isSymlink?: boolean;
  canonicalDocName?: string | null;
  targetPath?: string | null;
}

interface AssetEntry {
  kind: 'asset';
  path: string;
  assetExt: string;
  mediaKind: InlineAssetMediaKind | null;
  size: number;
  modified: string;
  referencedBy?: string[];
}

interface FolderEntry {
  kind: 'folder';
  path: string;
  size: number;
  modified: string;
}

export type FileEntry = DocumentEntry | AssetEntry | FolderEntry;
export type DocEntry = DocumentEntry;

export function isAssetEntry(entry: FileEntry): entry is AssetEntry {
  return entry.kind === 'asset';
}

export function isDocumentEntry(entry: FileEntry): entry is DocumentEntry {
  return entry.kind === 'document';
}

export function isFolderEntry(entry: FileEntry): entry is FolderEntry {
  return entry.kind === 'folder';
}

export function computeAncestors(docName: string | null): string[] {
  if (!docName) return [];
  const segments = docName.split('/').filter(Boolean);
  const ancestors: string[] = [];
  for (let i = 1; i < segments.length; i++) {
    ancestors.push(segments.slice(0, i).join('/'));
  }
  return ancestors;
}

export function defaultInitialDir(activeDocName: string | null): string {
  if (!activeDocName) return '';
  const slash = activeDocName.lastIndexOf('/');
  return slash > 0 ? activeDocName.slice(0, slash) : '';
}

export function filterVisibleEntries<T extends { kind?: unknown; docName?: string; path?: string }>(
  entries: ReadonlyArray<T>,
  showHiddenFiles = false,
): T[] {
  return entries.filter((entry) => {
    const ref = entry.docName ?? entry.path ?? '';
    if (ref === '') return false;
    if (showHiddenFiles) return true;
    return !ref.split('/').some((seg) => seg.startsWith('.'));
  });
}
