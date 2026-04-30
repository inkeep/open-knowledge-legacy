import { toWikiLinkSlug } from '@inkeep/open-knowledge-core';
import { normalizeDocNameInput } from '@/lib/doc-paths';
import { computeAncestors } from './file-tree-utils';

export type ResolvedNavigationTarget =
  | {
      kind: 'doc';
      target: string;
      docName: string;
    }
  | {
      kind: 'folder-index';
      target: string;
      folderPath: string;
      docName: string;
      noteKind: 'canonical-index' | 'legacy-folder-note';
    }
  | {
      kind: 'folder';
      target: string;
      folderPath: string;
    }
  | {
      kind: 'missing';
      target: string;
    };

function normalizeTargetPath(target: string): string {
  return normalizeDocNameInput(target).replace(/\/+$/g, '');
}

export function deriveKnownFolderPaths(docNames: Iterable<string>): Set<string> {
  const folderPaths = new Set<string>();
  for (const docName of docNames) {
    for (const ancestor of computeAncestors(docName)) {
      folderPaths.add(ancestor);
    }
  }
  return folderPaths;
}

/**
 * Bug A widening (2026-04-24). When `options.pagesBySlug` is provided,
 * `pages.has(target)` misses fall back to a slug-keyed lookup so a
 * dropped `.md` file carrying a lowercased slug (e.g. `casecheck123`)
 * resolves against a case-preserved cache entry (e.g. `CaseCheck123`).
 * Returns the canonical docName via the index, which becomes the target
 * of the `doc` result so downstream `hashDocName` navigation hits the
 * correct file. If `pagesBySlug` is omitted the resolver stays exact-
 * match only (backward compatible for tests constructing bare
 * `{pages: new Set(...)}` options).
 */
function slugResolve(
  normalizedTarget: string,
  pagesBySlug: ReadonlyMap<string, string> | undefined,
): string | undefined {
  if (!pagesBySlug) return undefined;
  const slug = toWikiLinkSlug(normalizedTarget);
  if (!slug) return undefined;
  return pagesBySlug.get(slug);
}

export function resolveNavigationTarget(
  target: string,
  options: {
    pages: ReadonlySet<string>;
    folderPaths?: ReadonlySet<string>;
    pagesBySlug?: ReadonlyMap<string, string>;
  },
): ResolvedNavigationTarget {
  const normalizedTarget = normalizeTargetPath(target);
  if (!normalizedTarget) {
    return { kind: 'missing', target: normalizedTarget };
  }

  if (options.pages.has(normalizedTarget)) {
    return {
      kind: 'doc',
      target: normalizedTarget,
      docName: normalizedTarget,
    };
  }

  const slugMatchDocName = slugResolve(normalizedTarget, options.pagesBySlug);
  if (slugMatchDocName) {
    return {
      kind: 'doc',
      target: slugMatchDocName,
      docName: slugMatchDocName,
    };
  }

  const canonicalIndexDocName = `${normalizedTarget}/index`;
  if (options.pages.has(canonicalIndexDocName)) {
    return {
      kind: 'folder-index',
      target: normalizedTarget,
      folderPath: normalizedTarget,
      docName: canonicalIndexDocName,
      noteKind: 'canonical-index',
    };
  }

  const leaf = normalizedTarget.split('/').pop();
  const legacyFolderNoteDocName = leaf ? `${normalizedTarget}/${leaf}` : null;
  if (legacyFolderNoteDocName && options.pages.has(legacyFolderNoteDocName)) {
    return {
      kind: 'folder-index',
      target: normalizedTarget,
      folderPath: normalizedTarget,
      docName: legacyFolderNoteDocName,
      noteKind: 'legacy-folder-note',
    };
  }

  const knownFolderPaths = options.folderPaths ?? deriveKnownFolderPaths(options.pages);
  if (knownFolderPaths.has(normalizedTarget)) {
    return {
      kind: 'folder',
      target: normalizedTarget,
      folderPath: normalizedTarget,
    };
  }

  return {
    kind: 'missing',
    target: normalizedTarget,
  };
}

export function docNameForNavigationTarget(target: ResolvedNavigationTarget): string | null {
  switch (target.kind) {
    case 'doc':
    case 'folder-index':
      return target.docName;
    case 'missing':
      return target.target;
    case 'folder':
      return null;
  }
}
