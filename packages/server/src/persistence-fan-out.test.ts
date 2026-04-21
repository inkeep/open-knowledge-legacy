/**
 * Per-writer L2 fan-out tests (US-014, FR-7).
 *
 * Verifies that commitToWipRef fans out one commitWipFromTree call per
 * contributor in the snapshot, with all per-writer commits sharing the
 * same tree SHA.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as Y from 'yjs';
import { recordContributor, swapContributors } from './contributor-tracker.ts';
import { historyGit, initHistoryRepo } from './history-repo.ts';
import { createServer } from './standalone.ts';

describe('persistence L2 fan-out (US-014)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ok-fanout-test-'));
    // Clear any module-level contributor state from prior tests
    swapContributors();
  });

  afterEach(() => {
    swapContributors(); // drain to prevent leaking into next test
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('two contributors → two WIP refs sharing the same tree SHA', async () => {
    const projectDir = tmpDir;
    const contentDir = join(tmpDir, 'content');
    mkdirSync(contentDir, { recursive: true });
    const historyHandle = await initHistoryRepo(projectDir);

    const server = createServer({
      contentDir,
      projectDir,
      contentRoot: 'content',
      quiet: true,
      debounce: 60_000,
      historyRepo: historyHandle,
    });
    await server.ready;

    // Seed two distinct writers before the L2 drain fires
    recordContributor('test-doc', 'agent-s1', 'Session 1', 'agent-s1');
    recordContributor('test-doc', 'agent-s2', 'Session 2', 'agent-s2');

    // Mutate the doc to ensure onStoreDocument has something to flush
    const conn = await server.hocuspocus.openDirectConnection('test-doc');
    await conn.transact((doc) => {
      const xmlFragment = doc.getXmlFragment('default');
      const paragraph = new Y.XmlElement('paragraph');
      paragraph.insert(0, [new Y.XmlText('fan-out test')]);
      xmlFragment.insert(0, [paragraph]);
    });

    const doc = server.hocuspocus.documents.get('test-doc');
    expect(doc).toBeDefined();
    doc?.removeDirectConnection();

    await server.destroy();

    // Both writers should have WIP refs
    const sg = historyGit(historyHandle);
    const s1Sha = (await sg.raw('rev-parse', 'refs/wip/main/agent-s1')).trim();
    const s2Sha = (await sg.raw('rev-parse', 'refs/wip/main/agent-s2')).trim();
    expect(s1Sha).toBeTruthy();
    expect(s2Sha).toBeTruthy();

    // Different commits (different parents, same tree)
    expect(s1Sha).not.toBe(s2Sha);

    // Both commits point to the same tree SHA (FR-7: shared tree in one drain)
    const s1Tree = (await sg.raw('rev-parse', `${s1Sha}^{tree}`)).trim();
    const s2Tree = (await sg.raw('rev-parse', `${s2Sha}^{tree}`)).trim();
    expect(s1Tree).toBe(s2Tree);
  });

  test('SERVICE_WRITER fallback when snapshot is empty', async () => {
    const projectDir = tmpDir;
    const contentDir = join(tmpDir, 'content');
    mkdirSync(contentDir, { recursive: true });
    const historyHandle = await initHistoryRepo(projectDir);

    const server = createServer({
      contentDir,
      projectDir,
      contentRoot: 'content',
      quiet: true,
      debounce: 60_000,
      historyRepo: historyHandle,
    });
    await server.ready;

    // No contributors recorded — should fall back to SERVICE_WRITER
    const conn = await server.hocuspocus.openDirectConnection('test-doc');
    await conn.transact((doc) => {
      const xmlFragment = doc.getXmlFragment('default');
      const paragraph = new Y.XmlElement('paragraph');
      paragraph.insert(0, [new Y.XmlText('service-writer test')]);
      xmlFragment.insert(0, [paragraph]);
    });

    const doc = server.hocuspocus.documents.get('test-doc');
    doc?.removeDirectConnection();

    await server.destroy();

    const sg = historyGit(historyHandle);
    const wipRefs = (await sg.raw('for-each-ref', '--format=%(refname)', 'refs/wip/')).trim();
    expect(wipRefs).toBeTruthy(); // at least one ref exists
  });
});
