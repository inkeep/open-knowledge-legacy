import { type Dirent, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import {
  classifyMarkdownHref,
  classifyWikiLinkTarget,
  getWikiLinkText,
  isOrphanMode,
  ORPHAN_MODES,
  type OrphanMode,
  resolveInternalHref,
  stripFrontmatter,
} from '@inkeep/open-knowledge-core';
import { isConfigDoc, isSystemDoc } from './cc1-broadcast.ts';
import type { ContentFilter } from './content-filter.ts';
import { getDocExtension, isSupportedDocFile, stripDocExtension } from './doc-extensions.ts';

const WIKI_LINK_RE = /\[\[([^\n#[\]|]+)(?:#([^\n[\]|]+))?(?:\|([^\n[\]]+))?\]\]/y;

const MD_LINK_RE =
  /\[([^\]\n]*)\]\((<[^>\n]+>|[^)\s\n]+)(?:\s+(?:"[^"\n]*"|'[^'\n]*'|\([^)\n]*\)))?\)/y;

interface InlineWikiLinkOccurrence {
  target: string;
  anchor: string | null;
  start: number;
  end: number;
}

interface FenceState {
  char: '`' | '~';
  length: number;
}

export interface ExtractedWikiLink {
  target: string;
  anchor: string | null;
  snippet: string | null;
}

interface ExtractedExternalLink {
  url: string;
  label: string | null;
  snippet: string | null;
}

export interface BacklinkEntry {
  source: string;
  anchor: string | null;
  snippet: string | null;
}

interface DocumentForwardLinkEntry {
  kind: 'doc';
  target: string;
  anchor: string | null;
  snippet: string | null;
}

interface ExternalForwardLinkEntry {
  kind: 'external';
  url: string;
  label: string | null;
  snippet: string | null;
}

type ForwardLinkEntry = DocumentForwardLinkEntry | ExternalForwardLinkEntry;

export interface HubEntry {
  docName: string;
  count: number;
}

interface DeadLinkEntry {
  target: string;
  sources: BacklinkEntry[];
}

interface DocGraphNode {
  kind: 'doc';
  id: string;
  docName: string;
  anchor: string | null;
}

interface ExternalGraphNode {
  kind: 'external';
  id: string;
  url: string;
  label: string | null;
}

export type GraphNode = DocGraphNode | ExternalGraphNode;

export { isOrphanMode, ORPHAN_MODES, type OrphanMode };

interface BranchGraphState {
  backward: Map<string, Map<string, { anchor: string | null; snippet: string | null }>>;
  forward: Map<string, Set<string>>;
  externalForward: Map<string, Map<string, { label: string | null; snippet: string | null }>>;
  externalBackward: Map<string, Map<string, { label: string | null; snippet: string | null }>>;
}

interface SerializedBranchGraphState {
  backward: Record<string, Array<BacklinkEntry>>;
  forward: Record<string, string[]>;
  externalForward: Record<
    string,
    Array<{ url: string; label: string | null; snippet: string | null }>
  >;
}

interface BacklinkIndexOptions {
  projectDir: string;
  contentDir: string;
  contentFilter?: ContentFilter;
}

function createEmptyState(): BranchGraphState {
  return {
    backward: new Map(),
    forward: new Map(),
    externalForward: new Map(),
    externalBackward: new Map(),
  };
}

function mergeLinkMeta(
  existing: { anchor: string | null; snippet: string | null } | undefined,
  next: { anchor: string | null; snippet: string | null },
): { anchor: string | null; snippet: string | null } {
  if (!existing) return next;
  return {
    anchor: existing.anchor ?? next.anchor,
    snippet: existing.snippet ?? next.snippet,
  };
}

function getRepresentativeAnchor(
  sources: Map<string, { anchor: string | null; snippet: string | null }> | undefined,
): string | null {
  if (!sources) return null;
  for (const [, meta] of [...sources.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (meta.anchor) return meta.anchor;
  }
  return null;
}

function externalNodeId(url: string): string {
  return `external:${url}`;
}

function externalUrlFromNodeId(id: string): string | null {
  return id.startsWith('external:') ? id.slice('external:'.length) : null;
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
        const classified = classifyWikiLinkTarget(wikiLink.target, wikiLink.anchor);
        if (classified?.kind === 'doc') {
          occurrences.push({
            target: classified.docName,
            anchor: classified.anchor,
            start,
            end: start + label.length,
          });
        }
        idx = wikiLink.nextIndex;
        continue;
      }
    }

    flatText += line[idx];
    idx++;
  }

  return { text: flatText, occurrences };
}

function extractExternalWikiLinksFromLine(line: string): {
  text: string;
  occurrences: Array<{ url: string; label: string | null; start: number; end: number }>;
} {
  let flatText = '';
  const occurrences: Array<{ url: string; label: string | null; start: number; end: number }> = [];
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
        const classified = classifyWikiLinkTarget(wikiLink.target, wikiLink.anchor);
        if (classified?.kind === 'external') {
          occurrences.push({
            url: classified.url,
            label,
            start,
            end: start + label.length,
          });
        }
        idx = wikiLink.nextIndex;
        continue;
      }
    }

    flatText += line[idx];
    idx++;
  }

  return { text: flatText, occurrences };
}

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
        const classified = classifyMarkdownHref(mdLink.href, sourceDocName);
        if (classified?.kind === 'doc') {
          const start = flatText.length;
          flatText += mdLink.text;
          occurrences.push({
            target: classified.docName,
            anchor: classified.anchor,
            start,
            end: start + mdLink.text.length,
          });
        } else {
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

function extractExternalMarkdownLinksFromLine(
  line: string,
  sourceDocName: string,
): {
  text: string;
  occurrences: Array<{ url: string; label: string | null; start: number; end: number }>;
} {
  let flatText = '';
  const occurrences: Array<{ url: string; label: string | null; start: number; end: number }> = [];
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
        flatText += getWikiLinkText(wikiLink);
        idx = wikiLink.nextIndex;
        continue;
      }
    }

    if (line[idx] === '[' && line[idx - 1] !== '!') {
      const mdLink = readMarkdownLink(line, idx);
      if (mdLink) {
        const classified = classifyMarkdownHref(mdLink.href, sourceDocName);
        flatText += mdLink.text;
        if (classified?.kind === 'external') {
          const start = flatText.length - mdLink.text.length;
          occurrences.push({
            url: classified.url,
            label: mdLink.text || null,
            start,
            end: start + mdLink.text.length,
          });
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
          ...extracted.occurrences.map(({ target, anchor, start, end }) => ({
            target,
            anchor,
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
          ...extracted.occurrences.map(({ target, anchor, start, end }) => ({
            target,
            anchor,
            snippet: snippetAround(extracted.text, start, end),
          })),
        );
      }
    }
  }

  return links;
}

function extractExternalWikiLinksFromMarkdown(markdown: string): ExtractedExternalLink[] {
  const source = markdown.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  const lines = source.split('\n');
  const links: ExtractedExternalLink[] = [];
  let fence: FenceState | null = null;

  for (const line of lines) {
    if (fence) {
      if (isFenceClose(line, fence)) fence = null;
    } else {
      const nextFence = matchFence(line);
      if (nextFence) {
        fence = nextFence;
      } else {
        const extracted = extractExternalWikiLinksFromLine(line);
        links.push(
          ...extracted.occurrences.map(({ url, label, start, end }) => ({
            url,
            label,
            snippet: snippetAround(extracted.text, start, end),
          })),
        );
      }
    }
  }

  return links;
}

function extractExternalMarkdownLinksFromMarkdown(
  markdown: string,
  sourceDocName: string,
): ExtractedExternalLink[] {
  const source = markdown.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  const lines = source.split('\n');
  const links: ExtractedExternalLink[] = [];
  let fence: FenceState | null = null;

  for (const line of lines) {
    if (fence) {
      if (isFenceClose(line, fence)) fence = null;
    } else {
      const nextFence = matchFence(line);
      if (nextFence) {
        fence = nextFence;
      } else {
        const extracted = extractExternalMarkdownLinksFromLine(line, sourceDocName);
        links.push(
          ...extracted.occurrences.map(({ url, label, start, end }) => ({
            url,
            label,
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
        [...sources.entries()].map(([source, meta]) => ({
          source,
          anchor: meta.anchor,
          snippet: meta.snippet,
        })),
      ]),
    ),
    forward: Object.fromEntries(
      [...state.forward.entries()].map(([source, targets]) => [source, [...targets].sort()]),
    ),
    externalForward: Object.fromEntries(
      [...state.externalForward.entries()].map(([source, targets]) => [
        source,
        [...targets.entries()]
          .map(([url, meta]) => ({
            url,
            label: meta.label,
            snippet: meta.snippet,
          }))
          .sort((a, b) => a.url.localeCompare(b.url)),
      ]),
    ),
  };
}

function buildExternalBackward(
  externalForward: BranchGraphState['externalForward'],
): BranchGraphState['externalBackward'] {
  const externalBackward = new Map<
    string,
    Map<string, { label: string | null; snippet: string | null }>
  >();

  for (const [source, targets] of externalForward) {
    for (const [url, meta] of targets) {
      let sources = externalBackward.get(url);
      if (!sources) {
        sources = new Map();
        externalBackward.set(url, sources);
      }
      sources.set(source, meta);
    }
  }

  return externalBackward;
}

function deserializeState(data: SerializedBranchGraphState): BranchGraphState {
  const externalForward = new Map(
    Object.entries(data.externalForward ?? {}).map(([source, targets]) => [
      source,
      new Map(
        targets.map((target) => [
          target.url,
          {
            label: target.label ?? null,
            snippet: target.snippet ?? null,
          },
        ]),
      ),
    ]),
  );

  return {
    backward: new Map(
      Object.entries(data.backward ?? {}).map(([target, entries]) => [
        target,
        new Map(
          entries.map((entry) => [
            entry.source,
            {
              anchor: entry.anchor ?? null,
              snippet: entry.snippet ?? null,
            },
          ]),
        ),
      ]),
    ),
    forward: new Map(
      Object.entries(data.forward ?? {}).map(([source, targets]) => [source, new Set(targets)]),
    ),
    externalForward,
    externalBackward: buildExternalBackward(externalForward),
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
    return resolve(this.projectDir, '.ok', 'cache', branch, 'backlinks.json');
  }

  updateDocument(
    docName: string,
    links: ExtractedWikiLink[],
    externalLinks: ExtractedExternalLink[] = [],
    branch = this.activeBranch,
  ): void {
    if (isSystemDoc(docName) || isConfigDoc(docName)) return;
    const state = this.getState(branch);
    const priorTargets = state.forward.get(docName) ?? new Set<string>();
    const priorExternalTargets = state.externalForward.get(docName) ?? new Map();

    for (const target of priorTargets) {
      const sources = state.backward.get(target);
      if (!sources) continue;
      sources.delete(docName);
      if (sources.size === 0) state.backward.delete(target);
    }

    for (const url of priorExternalTargets.keys()) {
      const sources = state.externalBackward.get(url);
      if (!sources) continue;
      sources.delete(docName);
      if (sources.size === 0) state.externalBackward.delete(url);
    }

    const nextTargets = new Set<string>();
    const nextExternalTargets = new Map<string, { label: string | null; snippet: string | null }>();
    state.forward.set(docName, nextTargets);
    state.externalForward.set(docName, nextExternalTargets);

    for (const link of links) {
      if (!link.target) continue;
      nextTargets.add(link.target);
      let sources = state.backward.get(link.target);
      if (!sources) {
        sources = new Map();
        state.backward.set(link.target, sources);
      }
      sources.set(
        docName,
        mergeLinkMeta(sources.get(docName), { anchor: link.anchor, snippet: link.snippet }),
      );
    }

    for (const link of externalLinks) {
      if (!link.url) continue;
      nextExternalTargets.set(link.url, {
        label: link.label,
        snippet: link.snippet,
      });
      let sources = state.externalBackward.get(link.url);
      if (!sources) {
        sources = new Map();
        state.externalBackward.set(link.url, sources);
      }
      if (!sources.has(docName) || (!sources.get(docName)?.snippet && link.snippet)) {
        sources.set(docName, {
          label: link.label,
          snippet: link.snippet,
        });
      }
    }
  }

  updateDocumentFromMarkdown(docName: string, markdown: string, branch = this.activeBranch): void {
    try {
      const { body } = stripFrontmatter(markdown);
      const wikiLinks = extractWikiLinksFromMarkdown(body);
      const mdLinks = extractMarkdownLinksFromMarkdown(body, docName);
      const wikiExternalLinks = extractExternalWikiLinksFromMarkdown(body);
      const mdExternalLinks = extractExternalMarkdownLinksFromMarkdown(body, docName);
      const seen = new Set(wikiLinks.map((l) => l.target));
      const merged = [...wikiLinks, ...mdLinks.filter((l) => !seen.has(l.target))];
      const externalSeen = new Set(wikiExternalLinks.map((l) => l.url));
      const mergedExternal = [
        ...wikiExternalLinks,
        ...mdExternalLinks.filter((link) => !externalSeen.has(link.url)),
      ];
      this.updateDocument(docName, merged, mergedExternal, branch);
    } catch (err) {
      console.warn(`[backlinks] Failed to scan ${docName} for link extraction:`, err);
      this.deleteDocument(docName, branch);
    }
  }

  deleteDocument(docName: string, branch = this.activeBranch): void {
    if (isSystemDoc(docName) || isConfigDoc(docName)) return;
    const state = this.getState(branch);
    const targets = state.forward.get(docName) ?? new Set<string>();
    const externalTargets = state.externalForward.get(docName) ?? new Map();
    for (const target of targets) {
      const sources = state.backward.get(target);
      if (!sources) continue;
      sources.delete(docName);
      if (sources.size === 0) state.backward.delete(target);
    }
    for (const url of externalTargets.keys()) {
      const sources = state.externalBackward.get(url);
      if (!sources) continue;
      sources.delete(docName);
      if (sources.size === 0) state.externalBackward.delete(url);
    }
    state.forward.delete(docName);
    state.externalForward.delete(docName);
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
      .map(([source, meta]) => ({ source, anchor: meta.anchor, snippet: meta.snippet }))
      .sort((a, b) => a.source.localeCompare(b.source));
  }

  getBacklinkCount(target: string, branch = this.activeBranch): number {
    const state = this.getState(branch);
    return state.backward.get(target)?.size ?? 0;
  }

  getForwardLinks(source: string, branch = this.activeBranch): string[] {
    const state = this.getState(branch);
    return [...(state.forward.get(source) ?? new Set<string>())].sort((a, b) => a.localeCompare(b));
  }

  getForwardLinkEntries(source: string, branch = this.activeBranch): ForwardLinkEntry[] {
    const state = this.getState(branch);
    const internalEntries: ForwardLinkEntry[] = this.getForwardLinks(source, branch).map(
      (target) => ({
        kind: 'doc',
        target,
        anchor: state.backward.get(target)?.get(source)?.anchor ?? null,
        snippet: state.backward.get(target)?.get(source)?.snippet ?? null,
      }),
    );
    const externalEntries: ForwardLinkEntry[] = [
      ...(state.externalForward.get(source) ?? new Map()).entries(),
    ]
      .map(([url, meta]) => ({
        kind: 'external' as const,
        url,
        label: meta.label,
        snippet: meta.snippet,
      }))
      .sort((a, b) => a.url.localeCompare(b.url));
    return [...internalEntries, ...externalEntries];
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

  getDeadLinks(
    admittedDocs: Iterable<string>,
    sourceDocNames?: readonly string[],
    branch = this.activeBranch,
  ): DeadLinkEntry[] {
    const state = this.getState(branch);
    const admittedDocSet = new Set(admittedDocs);
    const sourceDocSet = sourceDocNames?.length ? new Set(sourceDocNames) : null;

    return [...state.backward.entries()]
      .filter(([target, sources]) => {
        if (admittedDocSet.has(target)) return false;
        if (!sourceDocSet) return sources.size > 0;
        for (const source of sources.keys()) {
          if (sourceDocSet.has(source)) return true;
        }
        return false;
      })
      .map(([target, sources]) => ({
        target,
        sources: [...sources.entries()]
          .filter(([source]) => !sourceDocSet || sourceDocSet.has(source))
          .map(([source, meta]) => ({ source, anchor: meta.anchor, snippet: meta.snippet }))
          .sort((a, b) => a.source.localeCompare(b.source)),
      }))
      .filter((entry) => entry.sources.length > 0)
      .sort((a, b) =>
        b.sources.length === a.sources.length
          ? a.target.localeCompare(b.target)
          : b.sources.length - a.sources.length,
      );
  }

  getLinkGraph(branch = this.activeBranch): {
    nodes: GraphNode[];
    links: Array<{ source: string; target: string }>;
  } {
    const state = this.getState(branch);
    const nodes = new Map<string, GraphNode>();
    const links: Array<{ source: string; target: string }> = [];

    for (const [source, targets] of state.forward) {
      nodes.set(source, {
        kind: 'doc',
        id: source,
        docName: source,
        anchor: getRepresentativeAnchor(state.backward.get(source)),
      });
      for (const target of targets) {
        nodes.set(target, {
          kind: 'doc',
          id: target,
          docName: target,
          anchor: getRepresentativeAnchor(state.backward.get(target)),
        });
        links.push({ source, target });
      }
    }

    for (const [source, targets] of state.externalForward) {
      nodes.set(source, {
        kind: 'doc',
        id: source,
        docName: source,
        anchor: getRepresentativeAnchor(state.backward.get(source)),
      });
      for (const [url, meta] of targets) {
        const id = externalNodeId(url);
        nodes.set(id, { kind: 'external', id, url, label: meta.label });
        links.push({ source, target: id });
      }
    }

    return {
      nodes: [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id)),
      links,
    };
  }

  getLinkGraphNeighborhood(
    centerDocName: string,
    maxDegrees: number,
    branch = this.activeBranch,
  ): {
    nodes: GraphNode[];
    links: Array<{ source: string; target: string }>;
  } {
    const state = this.getState(branch);
    const externalLabelsByUrl = new Map<string, string | null>();
    for (const targets of state.externalForward.values()) {
      for (const [url, meta] of targets) {
        if (!externalLabelsByUrl.has(url)) {
          externalLabelsByUrl.set(url, meta.label);
        }
      }
    }
    const visited = new Set<string>([centerDocName]);
    const queue: Array<{ nodeId: string; degree: number }> = [{ nodeId: centerDocName, degree: 0 }];
    let queueIndex = 0;

    while (queueIndex < queue.length) {
      const current = queue[queueIndex++];
      if (current.degree >= maxDegrees) continue;

      const currentExternalUrl = externalUrlFromNodeId(current.nodeId);
      const neighbors = new Set<string>();

      if (currentExternalUrl) {
        for (const source of state.externalBackward.get(currentExternalUrl)?.keys() ?? []) {
          neighbors.add(source);
        }
      } else {
        for (const target of state.forward.get(current.nodeId) ?? new Set<string>()) {
          neighbors.add(target);
        }
        for (const url of state.externalForward.get(current.nodeId)?.keys() ?? []) {
          neighbors.add(externalNodeId(url));
        }
        for (const source of state.backward.get(current.nodeId)?.keys() ?? []) {
          neighbors.add(source);
        }
      }

      for (const neighbor of neighbors) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        queue.push({ nodeId: neighbor, degree: current.degree + 1 });
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

    for (const [source, targets] of state.externalForward) {
      if (!visited.has(source)) continue;
      for (const url of targets.keys()) {
        const id = externalNodeId(url);
        if (!visited.has(id)) continue;
        links.push({ source, target: id });
      }
    }

    const nodes = [...visited].sort().map<GraphNode>((nodeId) => {
      const url = externalUrlFromNodeId(nodeId);
      if (!url) {
        return {
          kind: 'doc',
          id: nodeId,
          docName: nodeId,
          anchor: getRepresentativeAnchor(state.backward.get(nodeId)),
        };
      }
      return {
        kind: 'external',
        id: nodeId,
        url,
        label: externalLabelsByUrl.get(url) ?? null,
      };
    });

    return { nodes, links };
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
        const wikiExternalLinks = extractExternalWikiLinksFromMarkdown(body);
        const mdExternalLinks = extractExternalMarkdownLinksFromMarkdown(body, docName);
        const seen = new Set(wikiLinks.map((l) => l.target));
        const links = [...wikiLinks, ...mdLinks.filter((l) => !seen.has(l.target))];
        const externalSeen = new Set(wikiExternalLinks.map((l) => l.url));
        const externalLinks = [
          ...wikiExternalLinks,
          ...mdExternalLinks.filter((link) => !externalSeen.has(link.url)),
        ];

        const targets = new Set<string>();
        const externalTargets = new Map<string, { label: string | null; snippet: string | null }>();
        state.forward.set(docName, targets);
        state.externalForward.set(docName, externalTargets);
        for (const link of links) {
          if (!link.target) continue;
          targets.add(link.target);
          let sources = state.backward.get(link.target);
          if (!sources) {
            sources = new Map();
            state.backward.set(link.target, sources);
          }
          sources.set(
            docName,
            mergeLinkMeta(sources.get(docName), { anchor: link.anchor, snippet: link.snippet }),
          );
        }
        for (const link of externalLinks) {
          if (!link.url) continue;
          externalTargets.set(link.url, {
            label: link.label,
            snippet: link.snippet,
          });
          let sources = state.externalBackward.get(link.url);
          if (!sources) {
            sources = new Map();
            state.externalBackward.set(link.url, sources);
          }
          sources.set(docName, {
            label: link.label,
            snippet: link.snippet,
          });
        }
      } catch (err) {
        console.warn(`[backlinks] Failed to rebuild entry for ${docName}:`, err);
      }
    }
    this.states.set(branch, state);
  }
}
