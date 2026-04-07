/**
 * V5: Git auto-persistence pipeline.
 *
 * Layer 1 (CRDT → disk): onStoreDocument serializes Y.Doc → markdown → .md file
 * Layer 2 (disk → git): afterStoreDocument commits to refs/wip/main via git plumbing
 *
 * Hocuspocus config: debounce=2000, maxDebounce=10000 (L1)
 * Git commit debounced separately: 30s idle after last disk write (L2)
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Extension } from '@hocuspocus/server';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Table } from '@tiptap/extension-table';
import { MarkdownManager } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import { yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import simpleGit from 'simple-git';
import { prependFrontmatter } from '../editor/extensions/frontmatter';
import { JsxComponent } from '../editor/extensions/jsx-component';

const CONTENT_DIR = resolve(import.meta.dirname ?? '.', '../../content');
const PROJECT_DIR = resolve(import.meta.dirname ?? '.', '../..');

const mdManager = new MarkdownManager({
  extensions: [
    StarterKit.configure({ undoRedo: false }),
    Link,
    Table,
    Image,
    TaskList,
    TaskItem,
    JsxComponent,
  ],
});

const git = simpleGit(PROJECT_DIR);

// Track frontmatter per document (set when loading, re-prepended on save)
const frontmatterCache = new Map<string, string>();

// Debounce git commits: 30s after last disk write
let gitCommitTimer: ReturnType<typeof setTimeout> | null = null;
const GIT_DEBOUNCE_MS = 30_000;

async function commitToWipRef(): Promise<void> {
  try {
    await git.add('content/');
    const treeSha = (await git.raw('write-tree')).trim();

    let parentSha: string | null = null;
    try {
      parentSha = (await git.raw('rev-parse', 'refs/wip/main')).trim();
    } catch {
      // First commit — no parent
    }

    const args = ['commit-tree', treeSha, '-m', `WIP auto-save ${new Date().toISOString()}`];
    if (parentSha) args.push('-p', parentSha);

    const commitSha = (await git.raw(...args)).trim();
    await git.raw('update-ref', 'refs/wip/main', commitSha);
    console.log(`[persistence] Git commit: ${commitSha.slice(0, 8)} on refs/wip/main`);
  } catch (e) {
    console.error('[persistence] Git commit failed:', e);
  }
}

function scheduleGitCommit(): void {
  if (gitCommitTimer) clearTimeout(gitCommitTimer);
  gitCommitTimer = setTimeout(() => {
    commitToWipRef();
    gitCommitTimer = null;
  }, GIT_DEBOUNCE_MS);
}

export function createPersistenceExtension(): Extension {
  return {
    async onStoreDocument({ document, documentName }) {
      try {
        const xmlFragment = document.getXmlFragment('default');
        const json = yXmlFragmentToProsemirrorJSON(xmlFragment);

        // Serialize ProseMirror JSON → markdown
        const body = mdManager.serialize(json);
        const frontmatter = frontmatterCache.get(documentName) || '';
        const markdown = prependFrontmatter(frontmatter, body);

        // Write to disk (Layer 1)
        const filePath = resolve(CONTENT_DIR, `${documentName}.md`);
        writeFileSync(filePath, markdown, 'utf-8');
        console.log(`[persistence] Wrote ${filePath} (${markdown.length} bytes)`);

        // Schedule git commit (Layer 2)
        scheduleGitCommit();
      } catch (e) {
        console.error('[persistence] onStoreDocument failed:', e);
      }
    },
  };
}

/** Store frontmatter for a document (called when loading file from disk) */
export function cacheFrontmatter(documentName: string, frontmatter: string): void {
  frontmatterCache.set(documentName, frontmatter);
}
