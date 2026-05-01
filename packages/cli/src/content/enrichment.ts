import type { Dirent } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, relative, resolve } from 'node:path';
import { z } from 'zod';
import type { FolderRule } from '../config/schema.ts';
import { OK_DIR } from '../constants.ts';
import { httpGet } from '../mcp/tools/shared.ts';
import { parseFrontmatter } from '../utils/frontmatter.ts';
import { resolveFolderFrontmatter } from './folder-rules.ts';
import { type GitCommit, type ProjectHistorySource, readProjectGitLog } from './project-log.ts';
import { type HistorySource, readShadowLog, type ShadowCommit } from './shadow-log.ts';

export type { GitCommit } from './project-log.ts';

const DIRECTORY_SCAN_CAP = 1000;

const DIR_SKIP: ReadonlySet<string> = new Set([
  '.git',
  OK_DIR,
  'node_modules',
  '.changeset',
  '.claude',
  '.agents',
  'dist',
  'build',
]);

const WIKI_EXT_RE = /\.(md|mdx)$/i;

export interface BacklinkEntry {
  source: string;
  title?: string;
  snippet?: string | null;
}

interface DocumentForwardLinkEntry {
  kind: 'doc';
  docName: string;
  title?: string;
  snippet?: string | null;
}

interface ExternalForwardLinkEntry {
  kind: 'external';
  url: string;
  title?: string;
  snippet?: string | null;
}

export type ForwardLinkEntry = DocumentForwardLinkEntry | ExternalForwardLinkEntry;

export interface DirectoryMeta {
  path: string;
  type: 'directory';
  title?: string;
  description?: string;
  tags?: string[];
  directMdCount: number;
  recursiveMdCount: number;
  childDirCount: number;
  mostRecentMd?: {
    path: string;
    title?: string;
    updatedAt: string;
  };
  truncated: boolean;
}

export interface EnrichedMeta {
  path: string;
  title?: string;
  description?: string;
  tags: string[];
  backlinkCount: number | null;
  backlinks: BacklinkEntry[] | null;
  forwardLinkCount: number | null;
  forwardLinks: ForwardLinkEntry[] | null;
  history: ShadowCommit[] | null;
  historySource: HistorySource | null;
  projectHistory: GitCommit[] | null;
  projectHistorySource: ProjectHistorySource | null;
}

interface EnrichPathDeps {
  projectDir: string;
  serverUrl?: string | undefined;
  historyDepth?: number;
  folderRules?: FolderRule[];
}

interface EnrichPathOptions {
  includeRichFields?: boolean;
}

const FrontmatterSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

export function pathToDocName(relPath: string): string {
  return relPath.replace(/\.md$/, '').replace(/\.mdx$/, '');
}

async function readFrontmatter(
  absPath: string,
): Promise<{ title?: string; description?: string; tags: string[] } | null> {
  try {
    const content = await readFile(absPath, 'utf-8');
    const fm = parseFrontmatter(content, FrontmatterSchema);
    if (!fm) return { tags: [] };
    return { title: fm.title, description: fm.description, tags: fm.tags ?? [] };
  } catch {
    return null;
  }
}

async function fetchBacklinks(
  serverUrl: string | undefined,
  docName: string,
): Promise<BacklinkEntry[] | null> {
  if (!serverUrl) return null;
  const result = await httpGet(serverUrl, `/api/backlinks?docName=${encodeURIComponent(docName)}`);
  if (!result.ok) return null;
  const raw = (result.backlinks ?? result.results ?? result.links) as unknown;
  if (!Array.isArray(raw)) return [];
  const entries: BacklinkEntry[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const rec = item as Record<string, unknown>;
    const source =
      typeof rec.docName === 'string'
        ? rec.docName
        : typeof rec.source === 'string'
          ? rec.source
          : typeof rec.page === 'string'
            ? rec.page
            : undefined;
    if (!source) continue;
    entries.push({
      source,
      title: typeof rec.title === 'string' ? rec.title : undefined,
      snippet: typeof rec.snippet === 'string' ? rec.snippet : null,
    });
  }
  return entries;
}

const BACKLINK_COUNT_CHUNK = 100;

export async function fetchBacklinkCountsBatch(
  serverUrl: string | undefined,
  docNames: string[],
): Promise<Map<string, number> | null> {
  if (!serverUrl || docNames.length === 0) return null;
  const unique = [...new Set(docNames)];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += BACKLINK_COUNT_CHUNK) {
    chunks.push(unique.slice(i, i + BACKLINK_COUNT_CHUNK));
  }
  const results = await Promise.all(
    chunks.map(async (chunk) => {
      const param = encodeURIComponent(chunk.join(','));
      const result = await httpGet(serverUrl, `/api/backlink-counts?docNames=${param}`);
      if (!result.ok) return null;
      return (result.counts ?? {}) as Record<string, unknown>;
    }),
  );
  const out = new Map<string, number>();
  let anySuccess = false;
  for (const chunkResult of results) {
    if (!chunkResult) continue;
    anySuccess = true;
    for (const [name, val] of Object.entries(chunkResult)) {
      if (typeof val === 'number' && Number.isFinite(val)) out.set(name, val);
    }
  }
  return anySuccess ? out : null;
}

async function fetchForwardLinks(
  serverUrl: string | undefined,
  docName: string,
): Promise<ForwardLinkEntry[] | null> {
  if (!serverUrl) return null;
  const result = await httpGet(
    serverUrl,
    `/api/forward-links?docName=${encodeURIComponent(docName)}`,
  );
  if (!result.ok) return null;
  const raw = (result.forwardLinks ?? result.links ?? result.results) as unknown;
  if (!Array.isArray(raw)) return [];
  const entries: ForwardLinkEntry[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const rec = item as Record<string, unknown>;
    if (rec.kind === 'external' && typeof rec.url === 'string') {
      entries.push({
        kind: 'external',
        url: rec.url,
        title: typeof rec.title === 'string' ? rec.title : undefined,
        snippet: typeof rec.snippet === 'string' ? rec.snippet : null,
      });
      continue;
    }
    const docNameValue = typeof rec.docName === 'string' ? rec.docName : undefined;
    if (!docNameValue) continue;
    entries.push({
      kind: 'doc',
      docName: docNameValue,
      title: typeof rec.title === 'string' ? rec.title : undefined,
      snippet: typeof rec.snippet === 'string' ? rec.snippet : null,
    });
  }
  return entries;
}

function mergeFileAndFolder(
  fileFm: { title?: string; description?: string; tags: string[] } | null,
  folderRules: FolderRule[] | undefined,
  relPath: string,
): { title?: string; description?: string; tags: string[] } {
  const rules = folderRules ?? [];
  const folderFm = rules.length === 0 ? {} : resolveFolderFrontmatter(rules, relPath);
  const title = fileFm?.title ?? folderFm.title;
  const description = fileFm?.description ?? folderFm.description;
  const fileTags = fileFm?.tags ?? [];
  const folderTags = folderFm.tags ?? [];
  let tags: string[];
  if (folderTags.length === 0) {
    tags = fileTags;
  } else {
    const seen = new Set<string>();
    tags = [];
    for (const tag of folderTags) {
      if (!seen.has(tag)) {
        seen.add(tag);
        tags.push(tag);
      }
    }
    for (const tag of fileTags) {
      if (!seen.has(tag)) {
        seen.add(tag);
        tags.push(tag);
      }
    }
  }
  return { title, description, tags };
}

export async function enrichPath(
  relPathInput: string,
  deps: EnrichPathDeps,
  options: EnrichPathOptions = {},
): Promise<EnrichedMeta> {
  const relPath = relPathInput.replace(/^\.\//, '').replace(/^\/+/, '');
  const absPath = resolve(deps.projectDir, relPath);
  const historyDepth = deps.historyDepth ?? 5;
  const rich = options.includeRichFields === true;

  const fmPromise = readFrontmatter(absPath);

  if (!rich) {
    const fm = await fmPromise;
    const merged = mergeFileAndFolder(fm, deps.folderRules, relPath);
    return {
      path: relPath,
      title: merged.title,
      description: merged.description,
      tags: merged.tags,
      backlinkCount: null,
      backlinks: null,
      forwardLinkCount: null,
      forwardLinks: null,
      history: null,
      historySource: null,
      projectHistory: null,
      projectHistorySource: null,
    };
  }

  const [fm, backlinks, forwardLinks, shadow, project] = await Promise.all([
    fmPromise,
    fetchBacklinks(deps.serverUrl, pathToDocName(relPath)).catch(() => null),
    fetchForwardLinks(deps.serverUrl, pathToDocName(relPath)).catch(() => null),
    readShadowLog(deps.projectDir, relPath, historyDepth).catch(() => ({
      commits: [] as ShadowCommit[],
      source: 'shadow-repo' as HistorySource,
    })),
    readProjectGitLog(deps.projectDir, relPath, historyDepth).catch(() => ({
      commits: [] as GitCommit[],
      source: 'git' as ProjectHistorySource,
    })),
  ]);

  const merged = mergeFileAndFolder(fm, deps.folderRules, relPath);
  return {
    path: relPath,
    title: merged.title,
    description: merged.description,
    tags: merged.tags,
    backlinkCount: backlinks?.length ?? null,
    backlinks,
    forwardLinkCount: forwardLinks?.length ?? null,
    forwardLinks,
    history: shadow.commits,
    historySource: shadow.source,
    projectHistory: project.commits,
    projectHistorySource: project.source,
  };
}

export type EnrichedEntry = EnrichedMeta | DirectoryMeta;

interface DirScanResult {
  directMdCount: number;
  recursiveMdCount: number;
  childDirCount: number;
  mostRecent: { absPath: string; relPath: string; mtimeMs: number } | null;
  truncated: boolean;
}

async function scanDirectory(absDir: string, projectDir: string): Promise<DirScanResult> {
  const result: DirScanResult = {
    directMdCount: 0,
    recursiveMdCount: 0,
    childDirCount: 0,
    mostRecent: null,
    truncated: false,
  };
  let visited = 0;
  const queue: { path: string; depth: number }[] = [{ path: absDir, depth: 0 }];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    if (visited >= DIRECTORY_SCAN_CAP) {
      result.truncated = true;
      break;
    }
    let entries: Dirent[];
    try {
      entries = await readdir(current.path, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (visited >= DIRECTORY_SCAN_CAP) {
        result.truncated = true;
        break;
      }
      visited++;
      const name = entry.name;
      if (entry.isDirectory()) {
        if (DIR_SKIP.has(name) || name.startsWith('.')) continue;
        if (current.depth === 0) result.childDirCount++;
        queue.push({ path: `${current.path}/${name}`, depth: current.depth + 1 });
      } else if (entry.isFile() && WIKI_EXT_RE.test(name)) {
        result.recursiveMdCount++;
        if (current.depth === 0) result.directMdCount++;
        const absFile = `${current.path}/${name}`;
        try {
          const st = await stat(absFile);
          if (!result.mostRecent || st.mtimeMs > result.mostRecent.mtimeMs) {
            const rel = relative(projectDir, absFile);
            const relPath = rel.split(/[\\/]/).filter(Boolean).join('/');
            result.mostRecent = { absPath: absFile, relPath, mtimeMs: st.mtimeMs };
          }
        } catch {}
      }
    }
  }
  return result;
}

export async function enrichDirectory(
  relPathInput: string,
  deps: Pick<EnrichPathDeps, 'projectDir' | 'folderRules'>,
): Promise<DirectoryMeta> {
  const relPath = relPathInput.replace(/^\.\//, '').replace(/^\/+/, '').replace(/\/+$/, '');
  const absDir = resolve(deps.projectDir, relPath);
  const scan = await scanDirectory(absDir, deps.projectDir);

  let mostRecentMd: DirectoryMeta['mostRecentMd'];
  if (scan.mostRecent) {
    const fm = await readFrontmatter(scan.mostRecent.absPath);
    mostRecentMd = {
      path: scan.mostRecent.relPath,
      title: fm?.title ?? basename(scan.mostRecent.relPath),
      updatedAt: new Date(scan.mostRecent.mtimeMs).toISOString(),
    };
  }

  const result: DirectoryMeta = {
    path: relPath,
    type: 'directory',
    directMdCount: scan.directMdCount,
    recursiveMdCount: scan.recursiveMdCount,
    childDirCount: scan.childDirCount,
    mostRecentMd,
    truncated: scan.truncated,
  };

  const rules = deps.folderRules ?? [];
  if (rules.length > 0) {
    const folderFm = resolveFolderFrontmatter(rules, relPath);
    if (folderFm.title !== undefined) result.title = folderFm.title;
    if (folderFm.description !== undefined) result.description = folderFm.description;
    if (folderFm.tags !== undefined && folderFm.tags.length > 0) result.tags = folderFm.tags;
  }

  return result;
}
