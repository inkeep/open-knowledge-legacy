/** Shared data model and navigation helpers for the file sidebar. */

export interface DocumentEntry {
  kind?: 'document';
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
  mediaKind: 'image' | 'video';
  size: number;
  modified: string;
  referencedBy?: string[];
}

export type FileEntry = DocumentEntry | AssetEntry;
export type DocEntry = DocumentEntry;

export function isAssetEntry(entry: FileEntry): entry is AssetEntry {
  return entry.kind === 'asset';
}

export function isDocumentEntry(entry: FileEntry): entry is DocumentEntry {
  return !isAssetEntry(entry);
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
