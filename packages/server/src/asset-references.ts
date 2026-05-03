import { realpathSync, type Stats, statSync } from 'node:fs';
import { extname, normalize, resolve, sep } from 'node:path';
import {
  createCodeFenceTracker,
  mediaKindForSidebarAssetExtension,
  resolveAssetProjectPath,
  SIDEBAR_RENDERABLE_ASSET_EXTENSIONS,
} from '@inkeep/open-knowledge-core';
import type { FileIndexEntry } from './file-watcher.ts';
import { isWithinContentDir } from './persistence.ts';

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

const MARKDOWN_LINK_OR_IMAGE_RE =
  /!?\[[^\]\n]*(?:\][^[\]\n]*)?\]\((?:<([^>\n]+)>|([^)\s]+))(?:\s+['"][^'"]*['"])?\)/g;
const WIKI_LINK_OR_EMBED_RE = /!?\[\[([^[\]|#]+?)(?:#[^\]|]+?)?(?:\|[^\]]+?)?\]\]/g;
const HTML_SRC_RE = /<(?:img|image|video)\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/gi;

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
  return mediaKindForSidebarAssetExtension(ext);
}

function collectHrefsFromLine(line: string, hrefs: Set<string>): void {
  for (const match of line.matchAll(MARKDOWN_LINK_OR_IMAGE_RE)) {
    const href = match[1] ?? match[2];
    if (href) hrefs.add(href);
  }
  for (const match of line.matchAll(WIKI_LINK_OR_EMBED_RE)) {
    const target = match[1];
    if (target) hrefs.add(target);
  }
  for (const match of line.matchAll(HTML_SRC_RE)) {
    const src = match[2];
    if (src) hrefs.add(src);
  }
}

function stripHtmlComments(line: string, state: { inComment: boolean }): string {
  let rest = line;
  let visible = '';
  while (rest.length > 0) {
    if (state.inComment) {
      const end = rest.indexOf('-->');
      if (end === -1) return visible;
      rest = rest.slice(end + 3);
      state.inComment = false;
      continue;
    }
    const start = rest.indexOf('<!--');
    if (start === -1) return visible + rest;
    visible += rest.slice(0, start);
    rest = rest.slice(start + 4);
    state.inComment = true;
  }
  return visible;
}

export function extractLocalAssetHrefs(markdown: string): string[] {
  const hrefs = new Set<string>();
  const isInCodeFence = createCodeFenceTracker();
  const htmlCommentState = { inComment: false };
  for (const rawLine of markdown.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n')) {
    if (isInCodeFence(rawLine)) continue;
    const line = stripHtmlComments(rawLine, htmlCommentState).replace(/`[^`]*`/g, '');
    collectHrefsFromLine(line, hrefs);
  }
  return [...hrefs];
}

interface ResolvedReferencedAsset {
  absolutePath: string;
  relativePath: string;
  stat: Stats;
}

function resolveReferencedAssetWithinContentDir(args: {
  contentDir: string;
  fromDocName: string;
  href: string;
}): ResolvedReferencedAsset | null {
  const href = decodeHrefPath(args.href);
  if (!href || isRemoteOrOpaqueHref(href)) return null;
  const ext = extname(href).slice(1).toLowerCase();
  if (!SIDEBAR_RENDERABLE_ASSET_EXTENSIONS.has(ext)) return null;

  const relativeAssetPath = resolveAssetProjectPath(href, args.fromDocName);
  if (!relativeAssetPath) return null;
  const requestedPath = resolve(args.contentDir, relativeAssetPath);
  let canonicalPath: string;
  let stat: Stats;
  try {
    canonicalPath = normalize(realpathSync(requestedPath));
    if (!isWithinContentDir(canonicalPath, args.contentDir)) return null;
    stat = statSync(canonicalPath);
  } catch {
    return null;
  }
  if (!stat.isFile()) return null;
  return {
    absolutePath: canonicalPath,
    relativePath: toContentRelativePath(args.contentDir, canonicalPath),
    stat,
  };
}

export function resolveReferencedAssetPath(args: {
  contentDir: string;
  fromDocName: string;
  href: string;
}): string | null {
  const contentDir = normalize(realpathSync(args.contentDir));
  return resolveReferencedAssetWithinContentDir({ ...args, contentDir })?.absolutePath ?? null;
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
  const contentDir = normalize(realpathSync(args.contentDir));
  const byPath = new Map<string, ReferencedAssetEntry>();
  for (const [docName, entry] of args.fileIndex) {
    const markdown = args.readMarkdown(entry.canonicalPath);
    if (markdown === null) continue;
    for (const href of extractLocalAssetHrefs(markdown)) {
      const asset = resolveReferencedAssetWithinContentDir({
        contentDir,
        fromDocName: docName,
        href,
      });
      if (!asset) continue;
      const mediaKind = mediaKindForAssetPath(asset.absolutePath);
      if (!mediaKind) continue;
      const existing = byPath.get(asset.relativePath);
      if (existing) {
        if (!existing.referencedBy.includes(docName)) existing.referencedBy.push(docName);
        continue;
      }
      byPath.set(asset.relativePath, {
        kind: 'asset',
        path: asset.relativePath,
        assetExt: extname(asset.relativePath).toLowerCase(),
        mediaKind,
        size: asset.stat.size,
        modified: asset.stat.mtime.toISOString(),
        referencedBy: [docName],
      });
    }
  }
  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}
