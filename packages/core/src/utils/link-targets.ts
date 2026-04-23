import { type ResolvedInternalHref, resolveInternalHref } from './resolve-internal-href.ts';

export interface DocLinkTarget extends ResolvedInternalHref {
  kind: 'doc';
}

export interface ExternalLinkTarget {
  kind: 'external';
  url: string;
}

export interface AnchorLinkTarget {
  kind: 'anchor';
  anchor: string;
}

/**
 * Asset link — reference to a non-markdown file on disk (PDF, video, audio,
 * archive, etc.) OR an external URL pointing at an asset extension. The
 * renderer routes `asset` clicks through the asset-click dispatcher + registry
 * rather than doc-navigation. Distinguishing this kind from `doc` is what
 * prevents the post-reload regression where asset hrefs get stuffed into
 * bogus docNames (e.g. `notes/docs/meeting.pdf`).
 */
export interface AssetLinkTarget {
  kind: 'asset';
  url: string;
  ext: string;
}

export type ClassifiedLinkTarget =
  | DocLinkTarget
  | ExternalLinkTarget
  | AnchorLinkTarget
  | AssetLinkTarget;

const URI_SCHEME_RE = /^[a-zA-Z][a-zA-Z\d+\-.]*:/;

/**
 * Extract a lowercased extension from a relative-path href (no scheme, no
 * fragment, no query). Returns null for extensionless paths. Anchor/query
 * stripped because extension lives before them.
 */
function extractAssetExtension(href: string): string | null {
  const pathOnly = href.split(/[?#]/)[0] ?? href;
  const match = pathOnly.match(/\.([a-z0-9]+)$/i);
  return match ? (match[1] ?? '').toLowerCase() : null;
}

function splitDocNameSegments(docName: string): string[] {
  return docName.split('/').filter(Boolean);
}

export function isExternalHref(value: string): boolean {
  const trimmed = value.trim();
  return URI_SCHEME_RE.test(trimmed) || trimmed.startsWith('//');
}

export function classifyMarkdownHref(
  href: string,
  sourceDocName: string,
): ClassifiedLinkTarget | null {
  const trimmed = href.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('#')) {
    const anchor = trimmed.slice(1).trim();
    return anchor ? { kind: 'anchor', anchor } : null;
  }

  const internal = resolveInternalHref(trimmed, sourceDocName);
  if (internal) {
    return {
      kind: 'doc',
      docName: internal.docName,
      anchor: internal.anchor,
    };
  }

  if (isExternalHref(trimmed) || trimmed.startsWith('/')) {
    return { kind: 'external', url: trimmed };
  }

  // Relative path that didn't resolve as a markdown doc AND isn't an
  // external URL. If it has a non-markdown extension, treat it as an
  // asset reference — the click dispatcher will route it to a registered
  // viewer or OS delegation. Without this branch, post-reload clicks on
  // `![[meeting.pdf]]` fall back to `null` (unresolved) and end up
  // rendering as a broken doc-link.
  const ext = extractAssetExtension(trimmed);
  if (ext && ext !== 'md' && ext !== 'mdx') {
    return { kind: 'asset', url: trimmed, ext };
  }

  return null;
}

export function classifyWikiLinkTarget(
  target: string,
  anchor: string | null,
): DocLinkTarget | ExternalLinkTarget | null {
  const trimmed = target.trim();
  if (!trimmed) return null;

  if (isExternalHref(trimmed)) {
    return {
      kind: 'external',
      url: anchor ? `${trimmed}#${anchor}` : trimmed,
    };
  }

  return {
    kind: 'doc',
    docName: trimmed,
    anchor: anchor?.trim() || null,
  };
}

/**
 * Resolve a relative asset href (like `./meeting.pdf`, `../shared/photo.png`)
 * against the source doc's dirname to produce a project-root-relative path.
 *
 * Used by the asset-click dispatcher's Electron branch (`shell.openAsset`
 * expects a project-relative path) and by the right-click context menu
 * builder. Mirrors `resolveInternalHref`'s path-walking logic but preserves
 * the file extension (non-md/mdx) rather than stripping it.
 *
 * Refuses paths that escape the project root — returns `null` if `..`
 * pops past the source doc's top-level directory. This is the renderer-
 * side "eager refusal" before IPC; the main-process `isPathWithinProject`
 * + `realpath` in `openAssetSafely` is the authoritative defense-in-depth.
 *
 * Contract:
 *   - Input `href` MUST be relative (no scheme, no `//`, no leading `/`)
 *     and non-empty. Inputs that violate this return `null`.
 *   - `#anchor` and `?query` suffixes are preserved in the input form but
 *     stripped from the returned project-relative path (the path is the
 *     canonical filesystem location; anchor/query are URL concerns).
 *   - Source doc at the root (no `/` in `sourceDocName`) means `dirParts`
 *     starts empty; any `..` pops fail → returns `null`.
 */
export function resolveAssetProjectPath(href: string, sourceDocName: string): string | null {
  const trimmed = href.trim();
  if (!trimmed) return null;

  // External / anchor-only / absolute → not a resolvable relative asset.
  if (URI_SCHEME_RE.test(trimmed)) return null;
  if (trimmed.startsWith('//') || trimmed.startsWith('/') || trimmed.startsWith('#')) return null;

  // Strip anchor + query from the path portion (same-shape as
  // `resolveInternalHref`). The returned project-rel-path is a filesystem
  // location; the URL-layer concerns live on the original href.
  const hashIdx = trimmed.indexOf('#');
  const pathPart = hashIdx >= 0 ? trimmed.slice(0, hashIdx) : trimmed;
  const cleanPath = (pathPart.split('?')[0] ?? '').trim();
  if (!cleanPath) return null;

  const dirParts = sourceDocName.includes('/') ? sourceDocName.split('/').slice(0, -1) : [];

  for (const seg of cleanPath.split('/')) {
    if (seg === '..') {
      if (dirParts.length === 0) return null;
      dirParts.pop();
    } else if (seg !== '.' && seg !== '') {
      dirParts.push(seg);
    }
  }

  if (dirParts.length === 0) return null;
  return dirParts.join('/');
}

export function buildRelativeMarkdownHref(
  sourceDocName: string,
  targetDocName: string,
  anchor: string | null = null,
): string {
  const sourceDirSegments = splitDocNameSegments(sourceDocName);
  sourceDirSegments.pop();

  const targetSegments = splitDocNameSegments(targetDocName);

  let commonPrefixLength = 0;
  while (
    commonPrefixLength < sourceDirSegments.length &&
    commonPrefixLength < targetSegments.length &&
    sourceDirSegments[commonPrefixLength] === targetSegments[commonPrefixLength]
  ) {
    commonPrefixLength += 1;
  }

  const upSegments = sourceDirSegments.slice(commonPrefixLength).map(() => '..');
  const downSegments = targetSegments.slice(commonPrefixLength);
  let relativePath = [...upSegments, ...downSegments].join('/');

  if (!relativePath) {
    relativePath = targetSegments.at(-1) ?? targetDocName;
  }

  if (!relativePath.startsWith('./') && !relativePath.startsWith('../')) {
    relativePath = `./${relativePath}`;
  }

  return `${relativePath}.md${anchor ? `#${anchor}` : ''}`;
}
