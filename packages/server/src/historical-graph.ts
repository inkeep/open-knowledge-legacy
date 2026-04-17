/**
 * Historical graph reconstruction — read every content file at a given git
 * commit SHA from the shadow repo, extract links, and return the same
 * `{ nodes, links }` shape as the live `/api/link-graph` payload.
 *
 * Stage 7 (time travel / diff) uses this to answer "what did the graph look
 * like at Save Version N?" without keeping a full historical graph cache.
 * Reconstruction is pure per-call; results are tiny for a demo-scale corpus
 * and have no persistence side effects.
 *
 * The link extraction logic is intentionally shared with `BacklinkIndex` —
 * we instantiate a throwaway index for each reconstruction so the set of
 * supported link shapes (wiki, inline-markdown, external) cannot drift
 * between live and historical views. See `backlink-index.ts`.
 */

import { existsSync } from 'node:fs';
import { BacklinkIndex } from './backlink-index.ts';
import { isSupportedDocFile, stripDocExtension } from './doc-extensions.ts';
import { extractPageTitle } from './page-identity.ts';
import type { ShadowHandle } from './shadow-repo.ts';
import { shadowGit } from './shadow-repo.ts';

export interface HistoricalDocNode {
  kind: 'doc';
  id: string;
  docName: string;
  label: string;
  anchor: string | null;
}

export interface HistoricalExternalNode {
  kind: 'external';
  id: string;
  url: string;
  label: string | null;
}

export type HistoricalGraphNode = HistoricalDocNode | HistoricalExternalNode;

export interface HistoricalGraphLink {
  source: string;
  target: string;
}

export interface HistoricalGraph {
  sha: string;
  nodes: HistoricalGraphNode[];
  links: HistoricalGraphLink[];
}

const SHA_RE = /^[0-9a-f]{40}$/i;

function normalizeRoot(contentRoot: string): string {
  return contentRoot.replace(/^\.\//, '').replace(/\/+$/, '');
}

/**
 * Enumerate content file paths in the tree at `sha`. Returns paths relative
 * to the shadow root (i.e. what `git ls-tree` prints) for any .md/.mdx file
 * under `contentRoot` that `isSupportedDocFile` accepts.
 */
async function listContentFilesAtSha(
  shadow: ShadowHandle,
  sha: string,
  contentRoot: string,
): Promise<string[]> {
  const sg = shadowGit(shadow);
  const root = normalizeRoot(contentRoot);
  // `git ls-tree -r --name-only <sha> [pathspec]` — the pathspec form matches
  // the bare-repo idiom used throughout this codebase (e.g. timeline-query).
  const args = ['ls-tree', '-r', '--name-only', sha];
  if (root) args.push('--', root);
  let raw: string;
  try {
    raw = await sg.raw(...args);
  } catch {
    return [];
  }
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((p) => {
      // Only consider entries under the content root so non-content siblings
      // (upstream-imported artifacts) never contribute to the graph.
      if (root && !p.startsWith(`${root}/`)) return false;
      const tail = root ? p.slice(root.length + 1) : p;
      if (!tail) return false;
      // Must be a supported doc file, and `.open-knowledge/` config / cache
      // trees should never leak into the graph.
      if (tail.startsWith('.open-knowledge/')) return false;
      return isSupportedDocFile(tail);
    });
}

/**
 * Convert a shadow-repo path to a docName.  contentRoot is stripped from the
 * front; the extension (.md / .mdx) is stripped from the tail via the shared
 * helper so the mapping matches live-graph docNames exactly.
 */
function pathToDocName(path: string, contentRoot: string): string {
  const root = normalizeRoot(contentRoot);
  const rel = root && path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;
  return stripDocExtension(rel);
}

/**
 * Reconstruct the graph state exactly as it existed at `sha`. Reads every
 * content file blob via `git show`, feeds the markdown through the same
 * link-extraction pipeline `BacklinkIndex.updateDocumentFromMarkdown` uses
 * live, then exports the `getLinkGraph()` shape.
 *
 * Labels come from each file's first H1 or its docName — the same precedent
 * the live panel uses via `readPageTitleForDocName`.
 */
export async function buildHistoricalGraph(
  shadow: ShadowHandle,
  sha: string,
  contentRoot: string,
): Promise<HistoricalGraph> {
  if (!SHA_RE.test(sha)) {
    throw new Error(`Invalid sha: ${sha}`);
  }
  if (!existsSync(shadow.workTree) || !existsSync(shadow.gitDir)) {
    return { sha, nodes: [], links: [] };
  }

  const sg = shadowGit(shadow);
  const paths = await listContentFilesAtSha(shadow, sha, contentRoot);

  // A fresh in-memory index per call — no disk side effects. projectDir /
  // contentDir receive arbitrary sentinel values because all historical calls
  // feed content via `updateDocumentFromMarkdown` and never trigger disk I/O.
  const index = new BacklinkIndex({
    projectDir: shadow.workTree,
    contentDir: shadow.workTree,
  });

  const titles = new Map<string, string>();
  for (const path of paths) {
    const docName = pathToDocName(path, contentRoot);
    if (!docName) continue;
    let content: string;
    try {
      content = await sg.raw('show', `${sha}:${path}`);
    } catch {
      // Blob missing / corrupt at this revision — skip silently so one bad
      // file never blocks the whole snapshot.
      continue;
    }
    index.updateDocumentFromMarkdown(docName, content);
    titles.set(docName, extractPageTitle(content, docName));
  }

  const { nodes, links } = index.getLinkGraph();
  const enrichedNodes: HistoricalGraphNode[] = nodes.map((node) => {
    if (node.kind === 'doc') {
      return {
        kind: 'doc',
        id: node.id,
        docName: node.docName,
        label: titles.get(node.docName) ?? node.docName,
        anchor: node.anchor,
      };
    }
    return {
      kind: 'external',
      id: node.id,
      url: node.url,
      label: node.label,
    };
  });

  return {
    sha,
    nodes: enrichedNodes,
    links: links.map((l) => ({ source: l.source, target: l.target })),
  };
}

export interface HistoricalGraphDiff {
  from: string;
  to: string;
  addedNodes: HistoricalGraphNode[];
  removedNodes: HistoricalGraphNode[];
  addedLinks: HistoricalGraphLink[];
  removedLinks: HistoricalGraphLink[];
}

function linkKey(link: HistoricalGraphLink): string {
  return `${link.source}\u0000${link.target}`;
}

/**
 * Pure set-difference of two historical graphs. Preserves full node objects
 * (label / kind / url / etc.) on both sides so the client can render labels
 * for removed nodes without a separate lookup.
 */
export function diffHistoricalGraphs(
  from: HistoricalGraph,
  to: HistoricalGraph,
): HistoricalGraphDiff {
  const fromNodeIds = new Set(from.nodes.map((n) => n.id));
  const toNodeIds = new Set(to.nodes.map((n) => n.id));
  const fromLinkKeys = new Set(from.links.map(linkKey));
  const toLinkKeys = new Set(to.links.map(linkKey));

  return {
    from: from.sha,
    to: to.sha,
    addedNodes: to.nodes.filter((n) => !fromNodeIds.has(n.id)),
    removedNodes: from.nodes.filter((n) => !toNodeIds.has(n.id)),
    addedLinks: to.links.filter((l) => !fromLinkKeys.has(linkKey(l))),
    removedLinks: from.links.filter((l) => !toLinkKeys.has(linkKey(l))),
  };
}
