/**
 * V5: Git auto-persistence pipeline.
 *
 * Layer 1 (CRDT → disk): onStoreDocument serializes Y.Doc → markdown → .md file
 * Layer 2 (disk → git): afterStoreDocument commits to refs/wip/main via git plumbing
 *
 * Hocuspocus config: debounce=2000, maxDebounce=10000 (L1)
 * Git commit debounced separately: 30s idle after last disk write (L2)
 */
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Extension } from '@hocuspocus/server';
import { getSchema } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import { updateYFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import simpleGit from 'simple-git';
import { prependFrontmatter, stripFrontmatter } from '../editor/extensions/frontmatter';
import { sharedExtensions } from '../editor/extensions/shared';
import { contentHash, registerWrite } from './file-watcher';

if (!import.meta.dirname) {
  throw new Error('[persistence] import.meta.dirname is undefined — cannot resolve paths');
}
const CONTENT_DIR = resolve(import.meta.dirname, '../../content');
const PROJECT_DIR = resolve(import.meta.dirname, '../..');

const mdManager = new MarkdownManager({ extensions: sharedExtensions });
const schema = getSchema(sharedExtensions);

const git = simpleGit(PROJECT_DIR, { timeout: { block: 30_000 } });

// Track frontmatter per document (set when loading, re-prepended on save)
const frontmatterCache = new Map<string, string>();

export function safeContentPath(documentName: string): string {
  const filePath = resolve(CONTENT_DIR, `${documentName}.md`);
  if (!filePath.startsWith(`${CONTENT_DIR}/`)) {
    throw new Error(`Invalid document name: ${documentName}`);
  }
  return filePath;
}

// Debounce git commits: 30s after last disk write
let gitCommitTimer: ReturnType<typeof setTimeout> | null = null;
const GIT_DEBOUNCE_MS = 30_000;

async function commitToWipRef(): Promise<void> {
  // Use a temporary index to avoid polluting the developer's staging area.
  // GIT_INDEX_FILE isolates our write-tree from the shared .git/index.
  const tmpIndex = resolve(PROJECT_DIR, '.git/index-wip');
  const env = { GIT_INDEX_FILE: tmpIndex };
  try {
    // Seed temp index from HEAD's tree (or start empty for first commit)
    try {
      const headTree = (await git.raw('rev-parse', 'HEAD^{tree}')).trim();
      await git.env(env).raw('read-tree', headTree);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('unknown revision') || msg.includes('bad revision')) {
        console.log('[persistence] Empty repo — starting with empty index');
      } else {
        console.error('[persistence] Failed to read HEAD tree, falling back to empty index:', e);
      }
    }

    await git.env(env).raw('add', 'content/');
    const treeSha = (await git.env(env).raw('write-tree')).trim();

    let parentSha: string | null = null;
    try {
      parentSha = (await git.raw('rev-parse', 'refs/wip/main')).trim();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes('unknown revision') && !msg.includes('bad revision')) {
        throw e; // Re-throw unexpected errors
      }
      // First commit — no parent (expected)
    }

    const args = ['commit-tree', treeSha, '-m', `WIP auto-save ${new Date().toISOString()}`];
    if (parentSha) args.push('-p', parentSha);

    const commitSha = (await git.raw(...args)).trim();
    await git.raw('update-ref', 'refs/wip/main', commitSha);
    console.log(`[persistence] Git commit: ${commitSha.slice(0, 8)} on refs/wip/main`);
  } catch (e) {
    console.error('[persistence] Git commit failed:', e);
  } finally {
    try {
      unlinkSync(tmpIndex);
    } catch {
      // ignore cleanup failure
    }
  }
}

let commitInFlight: Promise<void> | null = null;
let pendingAfterCommit = false;

function scheduleGitCommit(): void {
  if (gitCommitTimer) clearTimeout(gitCommitTimer);
  gitCommitTimer = setTimeout(() => {
    gitCommitTimer = null;
    if (commitInFlight) {
      pendingAfterCommit = true;
      return;
    }
    commitInFlight = commitToWipRef().finally(() => {
      commitInFlight = null;
      if (pendingAfterCommit) {
        pendingAfterCommit = false;
        scheduleGitCommit();
      }
    });
  }, GIT_DEBOUNCE_MS);
}

// Flush pending git commit on shutdown — keep process alive until commit completes
let shutdownRegistered = false;
function handleShutdown(): void {
  if (gitCommitTimer) {
    clearTimeout(gitCommitTimer);
    gitCommitTimer = null;
  }
  const flush = async () => {
    if (commitInFlight) await commitInFlight;
    await commitToWipRef();
  };
  flush()
    .catch((e) => console.error('[persistence] Shutdown commit failed:', e))
    .finally(() => process.exit(0));
}
if (!shutdownRegistered) {
  shutdownRegistered = true;
  process.on('SIGINT', handleShutdown);
  process.on('SIGTERM', handleShutdown);
}

export function createPersistenceExtension(): Extension {
  return {
    async onLoadDocument({ document, documentName }) {
      const filePath = safeContentPath(documentName);
      if (!existsSync(filePath)) return;

      const raw = readFileSync(filePath, 'utf-8');
      const { frontmatter, body } = stripFrontmatter(raw);

      if (frontmatter) {
        frontmatterCache.set(documentName, frontmatter);
        // Store frontmatter in Y.Doc metadata map so clients can read it
        const metaMap = document.getMap('metadata');
        metaMap.set('frontmatter', frontmatter);
      }

      // Parse markdown → ProseMirror JSON → apply to Y.Doc
      const json = mdManager.parse(body);
      if (json) {
        const xmlFragment = document.getXmlFragment('default');
        // Only populate if the fragment is empty (first load)
        if (xmlFragment.length === 0) {
          const pmNode = schema.nodeFromJSON(json);
          updateYFragment(document, xmlFragment, pmNode, {
            mapping: new Map(),
            isOMark: new Map(),
          });
          console.log(
            `[persistence] Loaded ${filePath} into Y.Doc (${xmlFragment.length} children)`,
          );
        }
      }
      // Errors propagate to Hocuspocus, which rejects the connection —
      // preventing empty docs from overwriting existing files.
    },

    async onStoreDocument({ document, documentName }) {
      const xmlFragment = document.getXmlFragment('default');
      const json = yXmlFragmentToProsemirrorJSON(xmlFragment);

      // Serialize ProseMirror JSON → markdown
      const body = mdManager.serialize(json);
      // Prefer frontmatter from Y.Doc metadata map (synced by client), fall back to local cache
      const metaMap = document.getMap('metadata');
      const fmFromDoc = metaMap.get('frontmatter');
      const frontmatter =
        typeof fmFromDoc === 'string' ? fmFromDoc : frontmatterCache.get(documentName) || '';
      const markdown = prependFrontmatter(frontmatter, body);

      // Atomic write: write to temp file then rename (Layer 1)
      const filePath = safeContentPath(documentName);
      const tmpPath = `${filePath}.tmp`;

      // Record content hash BEFORE writing — Layer 1 of disk bridge feedback prevention.
      // The file-watcher checks this hash to skip our own persistence writes.
      registerWrite(filePath, contentHash(markdown));

      try {
        await writeFile(tmpPath, markdown, 'utf-8');
        await rename(tmpPath, filePath);
      } catch (e) {
        try {
          unlinkSync(tmpPath);
        } catch {
          /* cleanup best-effort */
        }
        console.error(`[persistence] Failed to save ${documentName}:`, e);
        throw e;
      }
      console.log(`[persistence] Wrote ${filePath} (${markdown.length} bytes)`);

      // Schedule git commit (Layer 2)
      scheduleGitCommit();
      // Errors propagate to Hocuspocus — clients are notified of save failure.
    },
  };
}
