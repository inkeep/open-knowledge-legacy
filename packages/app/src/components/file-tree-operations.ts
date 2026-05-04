import { type FileEntry, isAssetEntry } from '@/components/file-tree-utils';

export interface RenamedDocMapping {
  fromDocName: string;
  toDocName: string;
}

export interface FileTreeTarget {
  kind: 'folder' | 'file';
  path: string;
  name: string;
  docExt?: string;
}

export function normalizeRenameValue(_kind: FileTreeTarget['kind'], value: string): string {
  return value.trim();
}

export function isValidNodeName(value: string): boolean {
  return (
    !['', '.', '..'].includes(value) &&
    !value.includes('/') &&
    !value.includes('\\') &&
    !value.includes('\x00')
  );
}

export function buildRenamedNodePath(target: FileTreeTarget, nextName: string): string {
  const normalizedName = normalizeRenameValue(target.kind, nextName);
  const segments = target.path.split('/');
  segments[segments.length - 1] = normalizedName;
  return segments.join('/');
}

export function applyRenameToDocuments(
  documents: FileEntry[],
  renamed: RenamedDocMapping[],
): FileEntry[] {
  if (renamed.length === 0) return documents;
  const renamedMap = new Map(renamed.map((entry) => [entry.fromDocName, entry.toDocName]));
  return documents.map((doc) =>
    isAssetEntry(doc)
      ? doc
      : {
          ...doc,
          docName: renamedMap.get(doc.docName) ?? doc.docName,
        },
  );
}

export function applyDeleteToDocuments(
  documents: FileEntry[],
  deletedDocNames: string[],
): FileEntry[] {
  if (deletedDocNames.length === 0) return documents;
  const deleted = new Set(deletedDocNames);
  return documents.filter((doc) => isAssetEntry(doc) || !deleted.has(doc.docName));
}

export function remapActiveDocName(
  activeDocName: string | null,
  renamed: RenamedDocMapping[],
): string | null {
  if (!activeDocName) return null;
  return renamed.find((entry) => entry.fromDocName === activeDocName)?.toDocName ?? activeDocName;
}
