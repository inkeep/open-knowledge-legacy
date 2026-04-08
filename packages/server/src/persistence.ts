/**
 * Git auto-persistence pipeline.
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
import {
  prependFrontmatter,
  sharedExtensions,
  stripFrontmatter,
} from '@inkeep/open-knowledge-core';
import { getSchema } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import { updateYFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import simpleGit from 'simple-git';
import { contentHash, registerWrite } from './file-watcher';

export interface PersistenceOptions {
  contentDir: string;
  projectDir: string;
  gitEnabled?: boolean;
  commitDebounceMs?: number;
  wipRef?: string;
}

const mdManager = new MarkdownManager({ extensions: sharedExtensions });
const schema = getSchema(sharedExtensions);

// Track frontmatter per document (set when loading, re-prepended on save)
const frontmatterCache = new Map<string, string>();

export function safeContentPath(documentName: string, contentDir: string): string {
  const filePath = resolve(contentDir, `${documentName}.md`);
  if (!filePath.startsWith(`${contentDir}/`)) {
    throw new Error(`Invalid document name: ${documentName}`);
  }
  return filePath;
}

export function createPersistenceExtension(options?: PersistenceOptions): Extension {
  const contentDir = options?.contentDir ?? process.cwd();
  const projectDir = options?.projectDir ?? process.cwd();
  const gitEnabled = options?.gitEnabled ?? true;
  const commitDebounceMs = options?.commitDebounceMs ?? 30_000;
  const wipRef = options?.wipRef ?? 'refs/wip/main';

  const git = simpleGit(projectDir, { timeout: { block: 30_000 } });

  // Debounce git commits
  let gitCommitTimer: ReturnType<typeof setTimeout> | null = null;
  let consecutiveGitFailures = 0;
  let commitInFlight: Promise<void> | null = null;
  let pendingAfterCommit = false;

  async function commitToWipRef(): Promise<void> {
    const tmpIndex = resolve(projectDir, '.git/index-wip');
    const env = { GIT_INDEX_FILE: tmpIndex };
    try {
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
        parentSha = (await git.raw('rev-parse', wipRef)).trim();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.includes('unknown revision') && !msg.includes('bad revision')) {
          throw e;
        }
      }

      const args = ['commit-tree', treeSha, '-m', `WIP auto-save ${new Date().toISOString()}`];
      if (parentSha) args.push('-p', parentSha);

      const commitSha = (await git.raw(...args)).trim();
      await git.raw('update-ref', wipRef, commitSha);
      consecutiveGitFailures = 0;
      console.log(`[persistence] Git commit: ${commitSha.slice(0, 8)} on ${wipRef}`);
    } catch (e) {
      consecutiveGitFailures++;
      console.error(`[persistence] Git commit failed (attempt ${consecutiveGitFailures}):`, e);
      if (consecutiveGitFailures >= 3) {
        console.error(
          '[persistence] CRITICAL: Git auto-save has failed 3+ times. Version history is NOT being recorded.',
        );
      }
    } finally {
      try {
        unlinkSync(tmpIndex);
      } catch {
        // ignore cleanup failure
      }
    }
  }

  function scheduleGitCommit(): void {
    if (!gitEnabled) return;
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
    }, commitDebounceMs);
  }

  return {
    async onLoadDocument({ document, documentName }) {
      const filePath = safeContentPath(documentName, contentDir);
      if (!existsSync(filePath)) return;

      const raw = readFileSync(filePath, 'utf-8');
      const { frontmatter, body } = stripFrontmatter(raw);

      if (frontmatter) {
        frontmatterCache.set(documentName, frontmatter);
        const metaMap = document.getMap('metadata');
        metaMap.set('frontmatter', frontmatter);
      }

      const json = mdManager.parse(body);
      if (json) {
        const xmlFragment = document.getXmlFragment('default');
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
    },

    async onStoreDocument({ document, documentName }) {
      const xmlFragment = document.getXmlFragment('default');
      const json = yXmlFragmentToProsemirrorJSON(xmlFragment);

      const body = mdManager.serialize(json);
      const metaMap = document.getMap('metadata');
      const fmFromDoc = metaMap.get('frontmatter');
      const frontmatter =
        typeof fmFromDoc === 'string' ? fmFromDoc : frontmatterCache.get(documentName) || '';
      const markdown = prependFrontmatter(frontmatter, body);

      const filePath = safeContentPath(documentName, contentDir);
      const tmpPath = `${filePath}.tmp`;

      try {
        await writeFile(tmpPath, markdown, 'utf-8');
        await rename(tmpPath, filePath);
        registerWrite(filePath, contentHash(markdown));
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

      scheduleGitCommit();
    },
  };
}
