import { type Dirent, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import {
  getWikiLinkText,
  isOrphanMode,
  ORPHAN_MODES,
  type OrphanMode,
  resolveInternalHref,
  stripFrontmatter,
} from '@inkeep/open-knowledge-core';
import { isSystemDoc } from './cc1-broadcast.ts';
import type { ContentFilter } from './content-filter.ts';
import { getDocExtension, isSupportedDocFile, stripDocExtension } from './doc-extensions.ts';

// Line-oriented variant: excludes \n since lines are pre-split.
// cf. packages/core/src/extensions/wiki-link.ts WIKI_LINK_PATTERN (no \n exclusion).
// Sticky flag ('y') enables position-based matching via lastIndex.
const WIKI_LINK_RE = /\[\[([^\n#[\]|]+)(?:#([^\n[\]|]+))?(?:\|([^\n[\]]+))?\]\]/y;

// Inline link form: [text](href) with an optional CommonMark title.
// Sticky flag for position-based matching. Does NOT match reference-style [text][ref].
const MD_LINK_RE =
  /\[([^\]\n]*)\]\((<[^>\n]+>|[^)\s\n]+)(?:\s+(?:"[^"\n]*"|'[^'\n]*'|\([^)\n]*\)))?\)/y;

interface InlineWikiLinkOccurrence {
  target: string;
  start: number;
  end: number;
}

interface FenceState {
  char: '`' | '~';
  length: number;
}

export interface ExtractedWikiLink {
  target: string;
  snippet: string | null;
}

export interface BacklinkEntry {
  source: string;
  snippet: string | null;
}

export interface ForwardLinkEntry {
  target: string;
  snippet: string | null;
}

export interface HubEntry {
  docName: string;
  count: number;
}

export { isOrphanMode, ORPHAN_MODES, type OrphanMode };

interface BranchGraphState {
  backward: Map<string, Map<string, string | null>>;
  forward: Map<string, Set<string>>;
}

interface SerializedBranchGraphState {
  backward: Record<string, Array<BacklinkEntry>>;
  forward: Record<string, string[]>;
}

export interface BacklinkIndexOptions {
  projectDir: string;
  contentDir: string;
  contentFilter?: ContentFilter;
}

function createEmptyState(): BranchGraphState {
  return {
    backward: new Map(),
    forward: new Map(),
  };
}

function normalizeSnippet(snippet: string): string {
  return snippet.replace(/\s+/g, ' ').trim();
}

function snippetAround(text: string, start: number, end: number): string | null {
  const normalizedText = normalizeSnippet(text);
  if (!normalizedText) return null;

  const leftPunctuation = Math.max(
    text.lastIndexOf('.', start - 1),
    text.lastIndexOf('?', start - 1),
    text.lastIndexOf('!', start - 1),
    text.lastIndexOf('\n', start - 1),
  );
  const rightPunctuationCandidates = [
    text.indexOf('.', end),
    text.indexOf('?', end),
    text.indexOf('!', end),
    text.indexOf('\n', end),
  ].filter((idx) => idx >= 0);

  const rawStart = leftPunctuation >= 0 ? leftPunctuation + 1 : Math.max(0, start - 60);
  const rawEnd =
    rightPunctuationCandidates.length > 0
      ? Math.min(...rightPunctuationCandidates) + 1
      : Math.min(text.length, end + 60);

  const prefix = rawStart > 0 ? '…' : '';
  const suffix = rawEnd < text.length ? '…' : '';
  const snippet = normalizeSnippet(text.slice(rawStart, rawEnd));
  if (!snippet) return null;
  return `${prefix}${snippet}${suffix}`;
}

function matchFence(line: string): FenceState | null {
  const match = /^\s{0,3}([`~]{3,})/.exec(line);
  if (!match) return null;
  const fence = match[1];
  const char = fence[0];
  if (char !== '`' && char !== '~') return null;
  return { char, length: fence.length };
}

function isFenceClose(line: string, fence: FenceState): boolean {
  return new RegExp(`^\\s{0,3}\\${fence.char}{${fence.length},}\\s*$`).test(line);
}

function leadingMarkdownPrefixLength(line: string): number {
  const match = /^\s{0,3}(?:#{1,6}\s+|>\s+|(?:[-+*]|\d+[.)])\s+)/.exec(line);
  return match ? match[0].length : 0;
}

function readInlineCode(line: string, start: number): { text: string; nextIndex: number } | null {
  let runLength = 0;
  while (line[start + runLength] === '`') runLength++;
  if (runLength === 0) return null;
  const openEnd = start + runLength;

  // CommonMark §6.1: the closing backtick string must be exactly the same length
  // as the opening string and must not be preceded or followed by a backtick.
  // indexOf() would match inside a longer run, so we scan for exact-length runs.
  let i = openEnd;
  while (i < line.length) {
    if (line[i] !== '`') {
      i++;
      continue;
    }
    let closeLen = 0;
    while (line[i + closeLen] === '`') closeLen++;
    if (closeLen === runLength) {
      return { text: line.slice(openEnd, i), nextIndex: i + runLength };
    }
    i += closeLen;
  }
  return null;
}

function readWikiLink(
  line: string,
  start: number,
): { target: string; alias: string | null; anchor: string | null; nextIndex: number } | null {
  // Uses sticky flag for position-based matching via lastIndex.
  // core's parseWikiLink expects the string to start with '[[' (^ anchor) and
  // cannot be used here where start may be mid-line.
  WIKI_LINK_RE.lastIndex = start;
  const match = WIKI_LINK_RE.exec(line);
  if (!match) return null;

  const target = match[1]?.trim();
  const anchor = match[2]?.trim() || null;
  const alias = match[3]?.trim() || null;
  if (!target) return null;

  return {
    target,
    alias,
    anchor,
    nextIndex: start + match[0].length,
  };
}

function extractWikiLinksFromLine(line: string): {
  text: string;
  occurrences: InlineWikiLinkOccurrence[];
} {
  let flatText = '';
  const occurrences: InlineWikiLinkOccurrence[] = [];
  let idx = leadingMarkdownPrefixLength(line);

  while (idx < line.length) {
    if (line[idx] === '\\' && idx + 1 < line.length) {
      flatText += line[idx + 1];
      idx += 2;
      continue;
    }

    if (line[idx] === '`') {
      const inlineCode = readInlineCode(line, idx);
      if (inlineCode) {
        flatText += inlineCode.text;
        idx = inlineCode.nextIndex;
        continue;
      }
    }

    if (line[idx] === '[' && line[idx + 1] === '[') {
      const wikiLink = readWikiLink(line, idx);
      if (wikiLink) {
        const label = getWikiLinkText(wikiLink);
        const start = flatText.length;
        flatText += label;
        occurrences.push({
          target: wikiLink.target,
          start,
          end: start + label.length,
        });
        idx = wikiLink.nextIndex;
        continue;
      }
    }

    flatText += line[idx];
    idx++;
  }

  return { text: flatText, occurrences };
}

/**
 * Resolve an href (from a markdown inline link) relative to a source docName.
 * Returns the resolved docName (no `.md` extension, no leading `./`) or null if
 * the href is external or escapes the content directory root.
 *
 * Resolution is pure string arithmetic — no filesystem access.
 */
export function resolveMarkdownHref(href: string, sourceDocName: string): string | null {
  return resolveInternalHref(href, sourceDocName)?.docName ?? null;
}

function normalizeMarkdownHref(rawHref: string): string {
  return rawHref.startsWith('<') && rawHref.endsWith('>') ? rawHref.slice(1, -1) : rawHref;
}

function readMarkdownLink(
  line: string,
  start: number,
): { text: string; href: string; nextIndex: number } | null {
  MD_LINK_RE.lastIndex = start;
  const match = MD_LINK_RE.exec(line);
  if (!match) return null;
  return {
    text: match[1] ?? '',
    href: normalizeMarkdownHref(match[2] ?? ''),
    nextIndex: start + match[0].length,
  };
}

function extractMarkdownLinksFromLine(
  line: string,
  sourceDocName: string,
): { text: string; occurrences: InlineWikiLinkOccurrence[] } {
  let flatText = '';
  const occurrences: InlineWikiLinkOccurrence[] = [];
  let idx = leadingMarkdownPrefixLength(line);

  while (idx < line.length) {
    if (line[idx] === '\\' && idx + 1 < line.length) {
      flatText += line[idx + 1];
      idx += 2;
      continue;
    }

    if (line[idx] === '`') {
      const inlineCode = readInlineCode(line, idx);
      if (inlineCode) {
        flatText += inlineCode.text;
        idx = inlineCode.nextIndex;
        continue;
      }
    }

    // Skip wiki-links so they're not double-counted as markdown links
    if (line[idx] === '[' && line[idx + 1] === '[') {
      const wikiLink = readWikiLink(line, idx);
      if (wikiLink) {
        flatText += getWikiLinkText(wikiLink);
        idx = wikiLink.nextIndex;
        continue;
      }
    }

    if (line[idx] === '[' && line[idx - 1] !== '!') {
      const mdLink = readMarkdownLink(line, idx);
      if (mdLink) {
        const resolvedDocName = resolveMarkdownHref(mdLink.href, sourceDocName);
        if (resolvedDocName) {
          const start = flatText.length;
          flatText += mdLink.text;
          occurrences.push({
            target: resolvedDocName,
            start,
            end: start + mdLink.text.length,
          });
        } else {
          // External link — add text to flat buffer without recording
          flatText += mdLink.text;
        }
        idx = mdLink.nextIndex;
        continue;
      }
    }

    flatText += line[idx];
    idx++;
  }

  return { text: flatText, occurrences };
}

export function extractMarkdownLinksFromMarkdown(
  markdown: string,
  sourceDocName: string,
): ExtractedWikiLink[] {
  const source = markdown.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  const lines = source.split('\n');
  const links: ExtractedWikiLink[] = [];
  let fence: FenceState | null = null;

  for (const line of lines) {
    if (fence) {
      if (isFenceClose(line, fence)) fence = null;
    } else {
      const nextFence = matchFence(line);
      if (nextFence) {
        fence = nextFence;
      } else {
        const extracted = extractMarkdownLinksFromLine(line, sourceDocName);
        links.push(
          ...extracted.occurrences.map(({ target, start, end }) => ({
            target,
            snippet: snippetAround(extracted.text, start, end),
          })),
        );
      }
    }
  }

  return links;
}

export function extractWikiLinksFromMarkdown(markdown: string): ExtractedWikiLink[] {
  const source = markdown.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  const lines = source.split('\n');
  const links: ExtractedWikiLink[] = [];
  let fence: FenceState | null = null;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex] ?? '';

    if (fence) {
      if (isFenceClose(line, fence)) fence = null;
    } else {
      const nextFence = matchFence(line);
      if (nextFence) {
        fence = nextFence;
      } else {
        const extracted = extractWikiLinksFromLine(line);
        links.push(
          ...extracted.occurrences.map(({ target, start, end }) => ({
            target,
            snippet: snippetAround(extracted.text, start, end),
          })),
        );
      }
    }
  }

  return links;
}

function serializeState(state: BranchGraphState): SerializedBranchGraphState {
  return {
    backward: Object.fromEntries(
      [...state.backward.entries()].map(([target, sources]) => [
        target,
        [...sources.entries()].map(([source, snippet]) => ({ source, snippet })),
      ]),
    ),
    forward: Object.fromEntries(
      [...state.forward.entries()].map(([source, targets]) => [source, [...targets].sort()]),
    ),
  };
}

function deserializeState(data: SerializedBranchGraphState): BranchGraphState {
  return {
    backward: new Map(
      Object.entries(data.backward ?? {}).map(([target, entries]) => [
        target,
        new Map(entries.map((entry) => [entry.source, entry.snippet ?? null])),
      ]),
    ),
    forward: new Map(
      Object.entries(data.forward ?? {}).map(([source, targets]) => [source, new Set(targets)]),
    ),
  };
}

export class BacklinkIndex {
  private readonly projectDir: string;
  private readonly contentDir: string;
  private readonly contentFilter?: ContentFilter;
  private readonly states = new Map<string, BranchGraphState>();
  private activeBranch = 'main';

  constructor(options: BacklinkIndexOptions) {
    this.projectDir = options.projectDir;
    this.contentDir = options.contentDir;
    this.contentFilter = options.contentFilter;
    this.states.set(this.activeBranch, createEmptyState());
  }

  private getState(branch = this.activeBranch): BranchGraphState {
    let state = this.states.get(branch);
    if (!state) {
      state = createEmptyState();
      this.states.set(branch, state);
    }
    return state;
  }

  getActiveBranch(): string {
    return this.activeBranch;
  }

  switchBranch(branch: string): void {
    this.activeBranch = branch;
    this.getState(branch);
  }

  private cachePath(branch = this.activeBranch): string {
    return resolve(this.projectDir, '.open-knowledge', 'cache', branch, 'backlinks.json');
  }

  updateDocument(docName: string, links: ExtractedWikiLink[], branch = this.activeBranch): void {
    if (isSystemDoc(docName)) return;
    const state = this.getState(branch);
    const priorTargets = state.forward.get(docName) ?? new Set<string>();

    for (const target of priorTargets) {
      const sources = state.backward.get(target);
      if (!sources) continue;
      sources.delete(docName);
      if (sources.size === 0) state.backward.delete(target);
    }

    const nextTargets = new Set<string>();
    state.forward.set(docName, nextTargets);

    for (const link of links) {
      if (!link.target) continue;
      nextTargets.add(link.target);
      let sources = state.backward.get(link.target);
      if (!sources) {
        sources = new Map();
        state.backward.set(link.target, sources);
      }
      if (!sources.has(docName) || (!sources.get(docName) && link.snippet)) {
        sources.set(docName, link.snippet ?? null);
      }
    }
  }

  updateDocumentFromMarkdown(docName: string, markdown: string, branch = this.activeBranch): void {
    try {
      const { body } = stripFrontmatter(markdown);
      const wikiLinks = extractWikiLinksFromMarkdown(body);
      const mdLinks = extractMarkdownLinksFromMarkdown(body, docName);
      // Merge: wiki links take precedence for duplicate targets (they have richer snippet context)
      const seen = new Set(wikiLinks.map((l) => l.target));
      const merged = [...wikiLinks, ...mdLinks.filter((l) => !seen.has(l.target))];
      this.updateDocument(docName, merged, branch);
    } catch (err) {
      console.warn(`[backlinks] Failed to scan ${docName} for link extraction:`, err);
      this.deleteDocument(docName, branch);
    }
  }

  deleteDocument(docName: string, branch = this.activeBranch): void {
    if (isSystemDoc(docName)) return;
    const state = this.getState(branch);
    const targets = state.forward.get(docName) ?? new Set<string>();
    for (const target of targets) {
      const sources = state.backward.get(target);
      if (!sources) continue;
      sources.delete(docName);
      if (sources.size === 0) state.backward.delete(target);
    }
    state.forward.delete(docName);
  }

  renameDocument(
    oldDocName: string,
    newDocName: string,
    markdown: string,
    branch = this.activeBranch,
  ): void {
    this.deleteDocument(oldDocName, branch);
    this.updateDocumentFromMarkdown(newDocName, markdown, branch);
  }

  getBacklinks(target: string, branch = this.activeBranch): BacklinkEntry[] {
    const state = this.getState(branch);
    const sources = state.backward.get(target);
    if (!sources) return [];
    return [...sources.entries()]
      .map(([source, snippet]) => ({ source, snippet }))
      .sort((a, b) => a.source.localeCompare(b.source));
  }

  getForwardLinks(source: string, branch = this.activeBranch): string[] {
    const state = this.getState(branch);
    return [...(state.forward.get(source) ?? new Set<string>())].sort((a, b) => a.localeCompare(b));
  }

  getForwardLinkEntries(source: string, branch = this.activeBranch): ForwardLinkEntry[] {
    const state = this.getState(branch);
    return this.getForwardLinks(source, branch).map((target) => ({
      target,
      snippet: state.backward.get(target)?.get(source) ?? null,
    }));
  }

  getOrphans(allDocs: string[], mode: OrphanMode = 'both', branch = this.activeBranch): string[] {
    const state = this.getState(branch);
    return [...allDocs]
      .filter((docName) => {
        const hasInboundEdges = (state.backward.get(docName)?.size ?? 0) > 0;
        const hasOutboundEdges = (state.forward.get(docName)?.size ?? 0) > 0;

        if (mode === 'incoming') return !hasInboundEdges;
        if (mode === 'outgoing') return !hasOutboundEdges;
        return !hasInboundEdges && !hasOutboundEdges;
      })
      .sort((a, b) => a.localeCompare(b));
  }

  getHubs(limit = 20, branch = this.activeBranch): HubEntry[] {
    const state = this.getState(branch);
    return [...state.backward.entries()]
      .map(([docName, sources]) => ({ docName, count: sources.size }))
      .sort((a, b) =>
        b.count === a.count ? a.docName.localeCompare(b.docName) : b.count - a.count,
      )
      .slice(0, limit);
  }

  getLinkGraph(branch = this.activeBranch): {
    nodes: string[];
    links: Array<{ source: string; target: string }>;
  } {
    const state = this.getState(branch);
    const nodeSet = new Set<string>();
    const links: Array<{ source: string; target: string }> = [];

    for (const [source, targets] of state.forward) {
      nodeSet.add(source);
      for (const target of targets) {
        nodeSet.add(target);
        links.push({ source, target });
      }
    }

    return { nodes: [...nodeSet].sort(), links };
  }

  getLinkGraphNeighborhood(
    centerDocName: string,
    maxDegrees: number,
    branch = this.activeBranch,
  ): {
    nodes: string[];
    links: Array<{ source: string; target: string }>;
  } {
    const state = this.getState(branch);
    const visited = new Set<string>([centerDocName]);
    const queue: Array<{ docName: string; degree: number }> = [
      { docName: centerDocName, degree: 0 },
    ];
    let queueIndex = 0;

    while (queueIndex < queue.length) {
      const current = queue[queueIndex++];
      if (current.degree >= maxDegrees) continue;

      const neighbors = new Set<string>([
        ...(state.forward.get(current.docName) ?? new Set<string>()),
        ...(state.backward.get(current.docName)?.keys() ?? []),
      ]);

      for (const neighbor of neighbors) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        queue.push({ docName: neighbor, degree: current.degree + 1 });
      }
    }

    const links: Array<{ source: string; target: string }> = [];
    for (const [source, targets] of state.forward) {
      if (!visited.has(source)) continue;
      for (const target of targets) {
        if (!visited.has(target)) continue;
        links.push({ source, target });
      }
    }

    return { nodes: [...visited].sort(), links };
  }

  async saveToDisk(branch = this.activeBranch): Promise<void> {
    const filePath = this.cachePath(branch);
    mkdirSync(dirname(filePath), { recursive: true });
    const state = this.getState(branch);
    await writeFile(filePath, JSON.stringify(serializeState(state), null, 2), 'utf-8');
  }

  async loadFromDisk(branch = this.activeBranch): Promise<boolean> {
    const filePath = this.cachePath(branch);
    if (!existsSync(filePath)) return false;
    try {
      const raw = await readFile(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as SerializedBranchGraphState;
      this.states.set(branch, deserializeState(parsed));
      return true;
    } catch (err) {
      console.warn(`[backlinks] Failed to load cache for ${branch}:`, err);
      return false;
    }
  }

  clear(branch = this.activeBranch): void {
    this.states.set(branch, createEmptyState());
  }

  private rebuildFileList(dir: string, docs: string[]): void {
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      console.warn(`[backlinks] Failed to read directory ${dir}:`, err);
      return;
    }
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        const relDir = relative(this.contentDir, fullPath);
        if (this.contentFilter && relDir && this.contentFilter.isDirExcluded(relDir)) continue;
        this.rebuildFileList(fullPath, docs);
        continue;
      }
      if (!entry.isFile() || !isSupportedDocFile(entry.name)) continue;

      const relPath = relative(this.contentDir, fullPath);
      if (this.contentFilter?.isExcluded(relPath)) continue;
      docs.push(stripDocExtension(relPath));
    }
  }

  listDocsOnDisk(): string[] {
    if (!existsSync(this.contentDir)) return [];
    const docs: string[] = [];
    this.rebuildFileList(this.contentDir, docs);
    // Deduplicate: when both foo.md and foo.mdx exist, stripDocExtension maps
    // both to "foo". The extension-precedence winner is resolved later via
    // getDocExtension() when building the on-disk path.
    const unique = Array.from(new Set(docs));
    return unique.sort((a, b) => a.localeCompare(b));
  }

  rebuildFromDisk(branch = this.activeBranch): void {
    const state = createEmptyState();
    for (const docName of this.listDocsOnDisk()) {
      const filePath = resolve(this.contentDir, `${docName}${getDocExtension(docName)}`);
      try {
        const markdown = readFileSync(filePath, 'utf-8');
        const { body } = stripFrontmatter(markdown);
        const wikiLinks = extractWikiLinksFromMarkdown(body);
        const mdLinks = extractMarkdownLinksFromMarkdown(body, docName);
        const seen = new Set(wikiLinks.map((l) => l.target));
        const links = [...wikiLinks, ...mdLinks.filter((l) => !seen.has(l.target))];

        const targets = new Set<string>();
        state.forward.set(docName, targets);
        for (const link of links) {
          if (!link.target) continue;
          targets.add(link.target);
          let sources = state.backward.get(link.target);
          if (!sources) {
            sources = new Map();
            state.backward.set(link.target, sources);
          }
          if (!sources.has(docName) || (!sources.get(docName) && link.snippet)) {
            sources.set(docName, link.snippet ?? null);
          }
        }
      } catch (err) {
        console.warn(`[backlinks] Failed to rebuild entry for ${docName}:`, err);
      }
    }
    this.states.set(branch, state);
  }
}
