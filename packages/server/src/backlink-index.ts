import { type Dirent, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import {
  getWikiLinkText,
  MarkdownManager,
  sharedExtensions,
  stripFrontmatter,
} from '@inkeep/open-knowledge-core';
import type { ContentFilter } from './content-filter.ts';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });

interface PMNodeJson {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: PMNodeJson[];
}

export interface ExtractedWikiLink {
  target: string;
  snippet: string | null;
}

export interface BacklinkEntry {
  source: string;
  snippet: string | null;
}

export interface HubEntry {
  docName: string;
  count: number;
}

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

function collectInlineWikiLinks(node: PMNodeJson): ExtractedWikiLink[] {
  const children = node.content ?? [];
  let flatText = '';
  const occurrences: Array<{ target: string; start: number; end: number }> = [];

  for (const child of children) {
    if (child.type === 'text') {
      flatText += child.text ?? '';
      continue;
    }
    if (child.type === 'hardBreak') {
      flatText += '\n';
      continue;
    }
    if (child.type !== 'wikiLink') continue;

    const target = typeof child.attrs?.target === 'string' ? child.attrs.target.trim() : '';
    if (!target) continue;

    const alias = typeof child.attrs?.alias === 'string' ? child.attrs.alias : null;
    const anchor = typeof child.attrs?.anchor === 'string' ? child.attrs.anchor : null;
    const label = getWikiLinkText({ target, alias, anchor });
    const start = flatText.length;
    flatText += label;
    occurrences.push({ target, start, end: flatText.length });
  }

  return occurrences.map((occurrence) => ({
    target: occurrence.target,
    snippet: snippetAround(flatText, occurrence.start, occurrence.end),
  }));
}

export function extractWikiLinksFromProsemirrorJson(json: PMNodeJson): ExtractedWikiLink[] {
  const links: ExtractedWikiLink[] = [];

  function walk(node: PMNodeJson): void {
    const children = node.content ?? [];
    const hasDirectInlineWikiLink = children.some((child) => child.type === 'wikiLink');

    if (hasDirectInlineWikiLink) {
      links.push(...collectInlineWikiLinks(node));
    }

    for (const child of children) {
      if (child.type === 'wikiLink') continue;
      walk(child);
    }
  }

  walk(json);
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
      const json = mdManager.parse(body) as PMNodeJson;
      this.updateDocument(docName, extractWikiLinksFromProsemirrorJson(json), branch);
    } catch (err) {
      console.warn(`[backlinks] Failed to parse ${docName} for link extraction:`, err);
      this.deleteDocument(docName, branch);
    }
  }

  deleteDocument(docName: string, branch = this.activeBranch): void {
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

  getOrphans(allDocs: string[], branch = this.activeBranch): string[] {
    const state = this.getState(branch);
    return [...allDocs]
      .filter((docName) => {
        const backlinks = state.backward.get(docName);
        return !backlinks || backlinks.size === 0;
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
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;

      const relPath = relative(this.contentDir, fullPath);
      if (this.contentFilter?.isExcluded(relPath)) continue;
      docs.push(relPath.slice(0, -3));
    }
  }

  listDocsOnDisk(): string[] {
    if (!existsSync(this.contentDir)) return [];
    const docs: string[] = [];
    this.rebuildFileList(this.contentDir, docs);
    return docs.sort((a, b) => a.localeCompare(b));
  }

  rebuildFromDisk(branch = this.activeBranch): void {
    const state = createEmptyState();
    for (const docName of this.listDocsOnDisk()) {
      const filePath = resolve(this.contentDir, `${docName}.md`);
      try {
        const markdown = readFileSync(filePath, 'utf-8');
        const { body } = stripFrontmatter(markdown);
        const json = mdManager.parse(body) as PMNodeJson;
        const links = extractWikiLinksFromProsemirrorJson(json);

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
