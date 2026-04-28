import type { DocEntry } from '@/components/file-tree-utils';

export interface RenamedDocMapping {
  fromDocName: string;
  toDocName: string;
}

export interface FileTreeTarget {
  kind: 'folder' | 'file';
  path: string;
  name: string;
  /**
   * On-disk extension for files (`.md` / `.mdx`); undefined for folders. The
   * adapter detects the actual extension when building targets so display
   * sites (delete-confirmation dialog, rename hints, drag previews) render
   * the truth instead of a hardcoded `.md`. Folders carry no extension.
   */
  docExt?: string;
}

export function normalizeRenameValue(_kind: FileTreeTarget['kind'], value: string): string {
  // PRESERVE user-typed extension when present — it's the signal the server
  // uses to detect an extension-change rename (e.g., `foo.md` → `foo.mdx`).
  // The rename input is pre-filled with the extension-less path, so a plain
  // edit produces a plain bare name; typing a supported extension opts into
  // the extension-change path via `resolveContentEntryPath`'s explicit-ext
  // detection in `packages/server/src/api-extension.ts`.
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
