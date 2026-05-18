import type { RenamedDocMapping } from '@inkeep/open-knowledge-core';
import {
  type FileEntry,
  isAssetEntry,
  isDocumentEntry,
  isFolderEntry,
} from '@/components/file-tree-utils';

export type { RenamedDocMapping };

export interface RenamedFolderMapping {
  fromPath: string;
  toPath: string;
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
  renamedFolders: RenamedFolderMapping[] = [],
): FileEntry[] {
  if (renamed.length === 0 && renamedFolders.length === 0) return documents;
  const renamedMap = new Map(renamed.map((entry) => [entry.fromDocName, entry.toDocName]));
  return documents.map((entry) => {
    if (isDocumentEntry(entry)) {
      return {
        ...entry,
        docName: renamedMap.get(entry.docName) ?? entry.docName,
      };
    }
    if (isFolderEntry(entry)) {
      return {
        ...entry,
        path: remapPathForFolderRenames(entry.path, renamedFolders),
      };
    }
    if (isAssetEntry(entry)) {
      return {
        ...entry,
        path: remapPathForFolderRenames(entry.path, renamedFolders),
      };
    }
    return entry;
  });
}

export function applyDeleteToDocuments(
  documents: FileEntry[],
  deletedDocNames: string[],
  deletedFolderPath?: string,
): FileEntry[] {
  if (deletedDocNames.length === 0 && !deletedFolderPath) return documents;
  const deleted = new Set(deletedDocNames);
  return documents.filter((entry) => {
    if (isDocumentEntry(entry)) {
      return !deleted.has(entry.docName) && !isPathInsideFolder(entry.docName, deletedFolderPath);
    }
    if (isFolderEntry(entry) || isAssetEntry(entry)) {
      return !isPathInsideFolder(entry.path, deletedFolderPath);
    }
    return true;
  });
}

export function remapActiveDocName(
  activeDocName: string | null,
  renamed: RenamedDocMapping[],
): string | null {
  if (!activeDocName) return null;
  return renamed.find((entry) => entry.fromDocName === activeDocName)?.toDocName ?? activeDocName;
}

export function planRenameCleanupCalls(
  renamed: readonly RenamedDocMapping[],
  poolActiveDocName: string | null,
): string[] {
  return renamed.flatMap((entry) => {
    const serverPushHandledTo = poolActiveDocName === entry.toDocName;
    return serverPushHandledTo ? [entry.fromDocName] : [entry.fromDocName, entry.toDocName];
  });
}

function remapPathForFolderRenames(path: string, renamedFolders: RenamedFolderMapping[]): string {
  for (const { fromPath, toPath } of renamedFolders) {
    if (path === fromPath) return toPath;
    if (path.startsWith(`${fromPath}/`)) return `${toPath}${path.slice(fromPath.length)}`;
  }
  return path;
}

function isPathInsideFolder(path: string, folderPath: string | undefined): boolean {
  return !!folderPath && (path === folderPath || path.startsWith(`${folderPath}/`));
}
