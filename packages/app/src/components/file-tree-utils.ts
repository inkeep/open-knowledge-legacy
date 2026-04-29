/** Shared data model and navigation helpers for the file sidebar. */

export interface DocEntry {
  docName: string;
  /**
   * On-disk extension — `.md` (default) or `.mdx`. Surfaced by `/api/documents`
   * via `getDocExtension(docName)`. Carrying it on the entry lets the sidebar
   * adapter map `docName` ↔ `treePath` faithfully and lets display sites
   * (delete-confirmation dialog, drag previews, rename hints) render the
   * actual extension instead of hardcoding `.md`. Optional for backward
   * compat; defaults to `.md` at every consumer.
   */
  docExt?: string;
  size: number;
  modified: string;
  isSymlink?: boolean;
  canonicalDocName?: string | null;
  targetPath?: string | null;
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
