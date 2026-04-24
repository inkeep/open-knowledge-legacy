import type { DocEntry, TreeNode } from '@/components/file-tree-utils';

export interface RenamedDocMapping {
  fromDocName: string;
  toDocName: string;
}

export type FileTreeTarget = Pick<TreeNode, 'kind' | 'path' | 'name'>;

export function normalizeRenameValue(kind: TreeNode['kind'], value: string): string {
  const trimmed = value.trim();
  if (kind === 'file') {
    // Strips either supported doc extension so the rename dialog shows the
    // bare name; re-appended by the write path per the file's current ext
    // (precedence: .mdx wins — see `packages/server/src/doc-extensions.ts`).
    return trimmed.replace(/\.(mdx|md)$/i, '');
  }
  return trimmed;
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
  documents: DocEntry[],
  renamed: RenamedDocMapping[],
): DocEntry[] {
  if (renamed.length === 0) return documents;
  const renamedMap = new Map(renamed.map((entry) => [entry.fromDocName, entry.toDocName]));
  return documents.map((doc) => ({
    ...doc,
    docName: renamedMap.get(doc.docName) ?? doc.docName,
  }));
}

export function applyDeleteToDocuments(
  documents: DocEntry[],
  deletedDocNames: string[],
): DocEntry[] {
  if (deletedDocNames.length === 0) return documents;
  const deleted = new Set(deletedDocNames);
  return documents.filter((doc) => !deleted.has(doc.docName));
}

export function remapActiveDocName(
  activeDocName: string | null,
  renamed: RenamedDocMapping[],
): string | null {
  if (!activeDocName) return null;
  return renamed.find((entry) => entry.fromDocName === activeDocName)?.toDocName ?? activeDocName;
}
