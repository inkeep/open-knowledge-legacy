import { existsSync, realpathSync, statSync } from 'node:fs';
import { extname, normalize, resolve, sep } from 'node:path';
import { resolveAssetProjectPath } from '@inkeep/open-knowledge-core';
import type { FileIndexEntry } from './file-watcher.ts';

type AssetMediaKind = 'image' | 'video';

interface ReferencedAssetEntry {
  kind: 'asset';
  path: string;
  assetExt: string;
  mediaKind: AssetMediaKind;
  size: number;
  modified: string;
  referencedBy: string[];
}

const REFERENCED_ASSET_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'mp4']);
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg']);
const VIDEO_EXTENSIONS = new Set(['mp4']);

const MARKDOWN_LINK_OR_IMAGE_RE =
  /!?\[[^\]\n]*(?:\][^[\]\n]*)?\]\((?:<([^>\n]+)>|([^)\s]+))(?:\s+['"][^'"]*['"])?\)/g;
const WIKI_LINK_OR_EMBED_RE = /!?\[\[([^[\]|#]+?)(?:#[^\]|]+?)?(?:\|[^\]]+?)?\]\]/g;
const HTML_SRC_RE = /<(?:img|image|video)\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/gi;

function isWithinDirectory(child: string, parent: string): boolean {
  const normalizedChild = normalize(child);
  const normalizedParent = normalize(parent);
  return (
    normalizedChild === normalizedParent || normalizedChild.startsWith(`${normalizedParent}${sep}`)
  );
}

function isRemoteOrOpaqueHref(href: string): boolean {
  return (
    href.startsWith('#') ||
    href.startsWith('//') ||
    href.startsWith('data:') ||
    /^[a-z][a-z0-9+.-]*:/i.test(href)
  );
}

function stripHrefDecorations(rawHref: string): string {
  const trimmed = rawHref.trim().replace(/^<(.+)>$/, '$1');
  const hashIndex = trimmed.indexOf('#');
  const withoutHash = hashIndex >= 0 ? trimmed.slice(0, hashIndex) : trimmed;
  const queryIndex = withoutHash.indexOf('?');
  return queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
}

function decodeHrefPath(rawHref: string): string {
  const stripped = stripHrefDecorations(rawHref);
  try {
    return decodeURI(stripped);
  } catch {
    return stripped;
  }
}

export function mediaKindForAssetPath(path: string): AssetMediaKind | null {
  const ext = extname(path).slice(1).toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  return null;
}

export function extractLocalAssetHrefs(markdown: string): string[] {
  const hrefs = new Set<string>();
  for (const match of markdown.matchAll(MARKDOWN_LINK_OR_IMAGE_RE)) {
    const href = match[1] ?? match[2];
    if (href) hrefs.add(href);
  }
  for (const match of markdown.matchAll(WIKI_LINK_OR_EMBED_RE)) {
    const target = match[1];
    if (target) hrefs.add(target);
  }
  for (const match of markdown.matchAll(HTML_SRC_RE)) {
    const src = match[2];
    if (src) hrefs.add(src);
  }
  return [...hrefs];
}

export function resolveReferencedAssetPath(args: {
  contentDir: string;
  fromDocName: string;
  href: string;
}): string | null {
  const href = decodeHrefPath(args.href);
  if (!href || isRemoteOrOpaqueHref(href)) return null;
  const ext = extname(href).slice(1).toLowerCase();
  if (!REFERENCED_ASSET_EXTENSIONS.has(ext)) return null;

  const contentDir = realpathSync(args.contentDir);
  const relativeAssetPath = resolveAssetProjectPath(href, args.fromDocName);
  if (!relativeAssetPath) return null;
  const requestedPath = resolve(contentDir, relativeAssetPath);
  let canonicalPath: string;
  try {
    canonicalPath = realpathSync(requestedPath);
  } catch {
    return null;
  }
  if (!isWithinDirectory(canonicalPath, contentDir)) return null;
  if (!existsSync(canonicalPath)) return null;
  const stat = statSync(canonicalPath);
  if (!stat.isFile()) return null;
  return normalize(canonicalPath);
}

export function toContentRelativePath(contentDir: string, absolutePath: string): string {
  const normalizedRoot = normalize(realpathSync(contentDir));
  const normalizedPath = normalize(absolutePath);
  return normalizedPath
    .slice(normalizedRoot.length + (normalizedRoot.endsWith(sep) ? 0 : 1))
    .split(sep)
    .join('/');
}

export function collectReferencedAssets(args: {
  contentDir: string;
  fileIndex: ReadonlyMap<string, FileIndexEntry>;
  readMarkdown: (path: string) => string | null;
}): ReferencedAssetEntry[] {
  const byPath = new Map<string, ReferencedAssetEntry>();
  for (const [docName, entry] of args.fileIndex) {
    const markdown = args.readMarkdown(entry.canonicalPath);
    if (markdown === null) continue;
    for (const href of extractLocalAssetHrefs(markdown)) {
      const assetPath = resolveReferencedAssetPath({
        contentDir: args.contentDir,
        fromDocName: docName,
        href,
      });
      if (!assetPath) continue;
      const mediaKind = mediaKindForAssetPath(assetPath);
      if (!mediaKind) continue;
      const stat = statSync(assetPath);
      const relativePath = toContentRelativePath(args.contentDir, assetPath);
      const existing = byPath.get(relativePath);
      if (existing) {
        if (!existing.referencedBy.includes(docName)) existing.referencedBy.push(docName);
        continue;
      }
      byPath.set(relativePath, {
        kind: 'asset',
        path: relativePath,
        assetExt: extname(relativePath).toLowerCase(),
        mediaKind,
        size: stat.size,
        modified: stat.mtime.toISOString(),
        referencedBy: [docName],
      });
    }
  }
  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}
