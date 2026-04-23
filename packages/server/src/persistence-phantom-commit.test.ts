/**
 * Regression test for the "phantom principal commit" bug (PR #295).
 *
 * When a browser-connected client performs a content-bearing CRDT transaction
 * that is a semantic no-op at the markdown layer (the canonical case:
 * y-prosemirror's ySyncPlugin appending an empty <paragraph> on every editor
 * mount), `onStoreDocument`'s safety-net used to record the browser's
 * principal as a contributor — producing a phantom commit alongside a later
 * legitimate agent write at L2 fan-out.
 *
 * The fix reorders `onStoreDocument` to compute the markdown and compare it
 * against `currentBase` (via `normalizeBridge` for trailing-whitespace
 * tolerance) BEFORE running the safety-net. Semantic no-ops skip both the
 * disk write AND the principal record; real changes still record per US-024.
 *
 * These tests drive the production `onStoreDocument` path via `createServer`
 * and trigger connection-origin transactions directly on the server-side
 * Y.Doc. Using the real Hocuspocus plumbing guards the specific ordering of
 * (a) markdown computation, (b) normalizeBridge-tolerant comparison against
 * `currentBase`, (c) `recordContributor` call — a future refactor that moves
 * the safety-net back above the gate silently fails Scenario 1 below.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import simpleGit from 'simple-git';
import * as Y from 'yjs';
import { clearContributors, contributorCount } from './contributor-tracker.ts';
import { createServer } from './standalone.ts';

interface Fixture {
  tmpDir: string;
  contentDir: string;
  cleanup: () => void;
}

async function setupFixture(): Promise<Fixture> {
  const tmpDir = mkdtempSync(join(tmpdir(), 'ok-phantom-commit-'));
  const contentDir = tmpDir;
  // Git init so persistence's shadow-repo helpers don't trip on a missing .git/,
  // mirroring persistence-fan-out.test.ts's fixture.
  const git = simpleGit({ baseDir: tmpDir });
  await git.init();
  await git.addConfig('user.name', 'Test User');
  await git.addConfig('user.email', 'test@example.com');
  return {
    tmpDir,
    contentDir,
    cleanup: () => rmSync(tmpDir, { recursive: true, force: true }),
  };
}

describe('onStoreDocument phantom-principal-commit regression (PR #295)', () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await setupFixture();
    clearContributors();
  });

  afterEach(() => {
    clearContributors();
    fixture.cleanup();
  });

  test('y-prosemirror-style empty-paragraph append → principal NOT recorded', async () => {
    writeFileSync(
      join(fixture.contentDir, 'empty-para-doc.md'),
      '# Original heading\n\nOriginal body.\n',
      'utf-8',
    );
    const server = createServer({
      contentDir: fixture.contentDir,
      projectDir: fixture.tmpDir,
      quiet: true,
      // Short debounce so the L1 drain fires before destroy().
      debounce: 100,
      maxDebounce: 500,
      gitEnabled: false,
    });
    await server.ready;
    try {
      // Load the doc — onLoadDocument populates the fragment AND seeds
      // reconciledBase. `openDirectConnection` is the cheapest way to
      // materialize a doc via the real persistence extension.
      const conn = await server.hocuspocus.openDirectConnection('empty-para-doc');
      // Grab the server-side Y.Doc so we can fire a transaction with a
      // spoofed connection origin — the same shape `readSyncStep2`
      // produces for real browser updates (see Hocuspocus server.esm.js).
      const serverDoc = server.hocuspocus.documents.get('empty-para-doc');
      expect(serverDoc).toBeDefined();
      if (!serverDoc) return;

      const connectionOrigin = {
        source: 'connection' as const,
        connection: { context: { principalId: 'principal-test-phantom' } },
      };
      // Fire the exact YXmlEvent shape captured on the live server:
      // `[{retain:N}, {insert:[<paragraph></paragraph>]}]` — semantic
      // no-op, serializes to one extra trailing newline at most.
      serverDoc.transact(() => {
        serverDoc.getXmlFragment('default').push([new Y.XmlElement('paragraph')]);
      }, connectionOrigin);

      // Wait for L1 debounce (100ms) to fire onStoreDocument with the
      // connection origin. Without the wait, `server.destroy()` races the
      // debounced store hook and we only see the synthetic local-origin
      // store Hocuspocus fires on document unload (Hocuspocus server.esm.js
      // line ~1955) — not the path we care about regression-testing.
      await new Promise((resolve) => setTimeout(resolve, 300));
      conn.disconnect();
    } finally {
      await server.destroy();
    }

    // The fix's gate: normalizeBridge(markdown) === normalizeBridge(currentBase)
    // catches this class → safety-net short-circuits → principal is NOT recorded.
    // Pre-fix this would have been 1 (phantom principal entry).
    expect(contributorCount()).toBe(0);
  });

  test('real user edit changes serialized markdown → principal IS recorded', async () => {
    writeFileSync(
      join(fixture.contentDir, 'real-edit-doc.md'),
      '# Original heading\n\nOriginal body.\n',
      'utf-8',
    );
    const server = createServer({
      contentDir: fixture.contentDir,
      projectDir: fixture.tmpDir,
      quiet: true,
      debounce: 100,
      maxDebounce: 500,
      gitEnabled: false,
    });
    await server.ready;
    try {
      const conn = await server.hocuspocus.openDirectConnection('real-edit-doc');
      const serverDoc = server.hocuspocus.documents.get('real-edit-doc');
      expect(serverDoc).toBeDefined();
      if (!serverDoc) return;

      const connectionOrigin = {
        source: 'connection' as const,
        connection: { context: { principalId: 'principal-test-real-edit' } },
      };
      // Real user edit: append a paragraph containing visible text. This
      // produces a markdown change normalizeBridge WILL detect, so the
      // safety-net must still record the principal (US-024 preserved —
      // the fix must not regress the legitimate browser-write case).
      serverDoc.transact(() => {
        const frag = serverDoc.getXmlFragment('default');
        const newPara = new Y.XmlElement('paragraph');
        newPara.insert(0, [new Y.XmlText('appended by the user')]);
        frag.push([newPara]);
      }, connectionOrigin);

      // Wait for L1 debounce (100ms) to fire onStoreDocument. Without the
      // wait, `server.destroy()` below can race the debounced store hook
      // and teardown before the safety-net has a chance to run — the hook
      // IS flushed during destroy, but the disconnect below fires first
      // and changes the clients count, which must not suppress the store.
      await new Promise((resolve) => setTimeout(resolve, 300));
      conn.disconnect();
    } finally {
      await server.destroy();
    }

    expect(contributorCount()).toBe(1);
  });
});
