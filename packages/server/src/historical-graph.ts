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

import { spawn } from 'node:child_process';
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

interface BlobEntry {
  path: string;
  blobSha: string;
}

/**
 * Enumerate supported content blobs in the tree at `sha`. Returns blob SHA +
 * path pairs so callers can stream content via `git cat-file --batch`. Output
 * matches `git ls-tree -r <sha> -- <root>` line format: `<mode> blob <sha>\t<path>`.
 */
async function listContentBlobsAtSha(
  shadow: ShadowHandle,
  sha: string,
  contentRoot: string,
): Promise<BlobEntry[]> {
  const sg = shadowGit(shadow);
  const root = normalizeRoot(contentRoot);
  const args = ['ls-tree', '-r', sha];
  if (root) args.push('--', root);
  let raw: string;
  try {
    raw = await sg.raw(...args);
  } catch {
    return [];
  }
  const entries: BlobEntry[] = [];
  for (const line of raw.split('\n')) {
    if (!line) continue;
    // Format: "<mode> <type> <object>\t<path>"
    const tabIx = line.indexOf('\t');
    if (tabIx < 0) continue;
    const meta = line.slice(0, tabIx).split(/\s+/);
    if (meta.length < 3 || meta[1] !== 'blob') continue;
    const blobSha = meta[2];
    const path = line.slice(tabIx + 1);
    if (root && !path.startsWith(`${root}/`)) continue;
    const tail = root ? path.slice(root.length + 1) : path;
    if (!tail) continue;
    if (tail.startsWith('.open-knowledge/')) continue;
    if (!isSupportedDocFile(tail)) continue;
    entries.push({ path, blobSha });
  }
  return entries;
}

/**
 * Stream many blobs from a bare repo in a single subprocess via
 * `git cat-file --batch`. Much faster than one `git show <sha>:<path>` per
 * file (N spawns → 1 spawn). Returns a Map keyed by blob SHA.
 *
 * Protocol: we write each blob SHA followed by \n to stdin; git writes a
 * header line `<sha> blob <size>\n` followed by exactly <size> bytes of
 * content, then a trailing \n, then the next header.
 */
async function batchReadBlobs(
  shadow: ShadowHandle,
  blobShas: readonly string[],
): Promise<Map<string, string>> {
  if (blobShas.length === 0) return new Map();
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn('git', ['cat-file', '--batch'], {
      env: {
        ...process.env,
        GIT_DIR: shadow.gitDir,
        GIT_WORK_TREE: shadow.workTree,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const chunks: Buffer[] = [];
    let totalLen = 0;
    child.stdout.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
      totalLen += chunk.length;
    });
    child.stderr.on('data', () => {
      /* swallow — individual missing objects surface as "missing" lines on stdout */
    });
    child.on('error', rejectPromise);
    child.on('close', (code) => {
      if (code !== 0) {
        rejectPromise(new Error(`git cat-file --batch exited ${code}`));
        return;
      }
      const buf = Buffer.concat(chunks, totalLen);
      const result = new Map<string, string>();
      let offset = 0;
      while (offset < buf.length) {
        const lineEnd = buf.indexOf(0x0a /* \n */, offset);
        if (lineEnd < 0) break;
        const header = buf.slice(offset, lineEnd).toString('utf8');
        offset = lineEnd + 1;
        // "<sha> missing" — object absent at this revision
        const missingMatch = header.match(/^(\S+) missing$/);
        if (missingMatch) continue;
        // "<sha> <type> <size>"
        const match = header.match(/^(\S+) (\S+) (\d+)$/);
        if (!match) break;
        const [, objSha, , sizeStr] = match;
        const size = Number.parseInt(sizeStr, 10);
        if (Number.isNaN(size)) break;
        const body = buf.slice(offset, offset + size).toString('utf8');
        result.set(objSha, body);
        offset += size + 1; // trailing \n after body
      }
      resolvePromise(result);
    });
    for (const sha of blobShas) child.stdin.write(`${sha}\n`);
    child.stdin.end();
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

  const entries = await listContentBlobsAtSha(shadow, sha, contentRoot);

  // A fresh in-memory index per call — no disk side effects. projectDir /
  // contentDir receive arbitrary sentinel values because all historical calls
  // feed content via `updateDocumentFromMarkdown` and never trigger disk I/O.
  const index = new BacklinkIndex({
    projectDir: shadow.workTree,
    contentDir: shadow.workTree,
  });

  // Batch-read every blob in a single `git cat-file --batch` subprocess.
  // O(N) subprocess spawns collapsed to O(1); on a ~5K-file corpus this turns
  // a ~30s reconstruction into ~1s (validated during QA on this repo).
  const blobShas = entries.map((e) => e.blobSha);
  const blobs = await batchReadBlobs(shadow, blobShas);

  const titles = new Map<string, string>();
  for (const { path, blobSha } of entries) {
    const docName = pathToDocName(path, contentRoot);
    if (!docName) continue;
    const content = blobs.get(blobSha);
    if (content === undefined) continue; // missing blob — skip silently
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
