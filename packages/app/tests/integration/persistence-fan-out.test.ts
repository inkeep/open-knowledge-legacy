/**
 * US-029: Per-writer L2 fan-out integration tests (FR-7, US-014, US-016).
 *
 * Verifies that commitToWipRef fans out one commitWipFromTree call per
 * contributor in the snapshot, with all per-writer commits sharing the same
 * tree SHA. Also verifies file-system writer and concurrent writer scenarios.
 *
 * Mirrors packages/server/src/persistence-fan-out.test.ts but imports from
 * @inkeep/open-knowledge-server (the published package) so regressions in the
 * compiled artifact surface at integration tier (not just server unit tier).
 *
 * Migrated 2026-04-22 (specs/2026-04-22-per-worker-shadow-repo-test-harness/
 * US-005 / FR6) from hand-forked `initShadowRepo` + raw `createServer` to the
 * `createTestServer({ withShadow: true })` harness opt-in. The nested-dir
 * projectDir/contentDir layout is preserved at the server-tier sibling
 * (packages/server/src/persistence-fan-out.test.ts:35-43) — this integration
 * test exercises the flat harness layout where contentDir === projectDir,
 * which is the shape every history-adjacent app test will use.
 *
 * Uses try/finally for server lifecycle per the harness convention
 * (test-harness.ts:16-17) and matching the FR8 shadow-harness-*.test.ts
 * acceptance tests — avoids the `let server: TestServer` + afterEach pattern
 * that would mask a createTestServer throw with a `Cannot read 'cleanup' of
 * undefined` TypeError in afterEach.
 */

import { describe, expect, test } from 'bun:test';
import {
  applyExternalChange,
  FILE_SYSTEM_WRITER,
  recordContributor,
  shadowGit,
} from '@inkeep/open-knowledge-server';
import * as Y from 'yjs';
import { createTestServer, requireShadowDir } from './test-harness';

describe('persistence L2 fan-out integration (US-014, FR-7)', () => {
  test('two contributors → two WIP refs sharing the same tree SHA', async () => {
    const server = await createTestServer({
      withShadow: true,
      debounce: 60_000,
      maxDebounce: 60_000,
    });
    try {
      // Seed two distinct writers before the L2 drain fires
      recordContributor('test-doc', 'agent-s1', 'Session 1', 'agent-s1');
      recordContributor('test-doc', 'agent-s2', 'Session 2', 'agent-s2');

      // Mutate the doc so onStoreDocument has content to flush
      const conn = await server.instance.hocuspocus.openDirectConnection('test-doc');
      await conn.transact((doc) => {
        const xmlFragment = doc.getXmlFragment('default');
        const paragraph = new Y.XmlElement('paragraph');
        paragraph.insert(0, [new Y.XmlText('fan-out integration test')]);
        xmlFragment.insert(0, [paragraph]);
      });

      const doc = server.instance.hocuspocus.documents.get('test-doc');
      expect(doc).toBeDefined();
      doc?.removeDirectConnection();

      // server.destroy() drains the pending L2 commit. The refs need to be
      // available to assert BEFORE cleanup runs, so destroy explicitly here.
      // Subsequent cleanup() is idempotent.
      await server.instance.destroy();

      // Both writers must have WIP refs
      const sg = shadowGit({ gitDir: requireShadowDir(server), workTree: server.contentDir });
      const s1Sha = (await sg.raw('rev-parse', 'refs/wip/main/agent-s1')).trim();
      const s2Sha = (await sg.raw('rev-parse', 'refs/wip/main/agent-s2')).trim();
      expect(s1Sha).toBeTruthy();
      expect(s2Sha).toBeTruthy();

      // Different commits (different parents / timestamps)
      expect(s1Sha).not.toBe(s2Sha);

      // Both commits share the same tree SHA (FR-7: one tree per drain cycle)
      const s1Tree = (await sg.raw('rev-parse', `${s1Sha}^{tree}`)).trim();
      const s2Tree = (await sg.raw('rev-parse', `${s2Sha}^{tree}`)).trim();
      expect(s1Tree).toBe(s2Tree);
    } finally {
      await server.cleanup();
    }
  });

  test('SERVICE_WRITER fallback when snapshot is empty', async () => {
    const server = await createTestServer({
      withShadow: true,
      debounce: 60_000,
      maxDebounce: 60_000,
    });
    try {
      // No contributors recorded — persistence uses SERVICE_WRITER fallback
      const conn = await server.instance.hocuspocus.openDirectConnection('test-doc');
      await conn.transact((doc) => {
        const xmlFragment = doc.getXmlFragment('default');
        const paragraph = new Y.XmlElement('paragraph');
        paragraph.insert(0, [new Y.XmlText('service-writer fallback test')]);
        xmlFragment.insert(0, [paragraph]);
      });

      const doc = server.instance.hocuspocus.documents.get('test-doc');
      doc?.removeDirectConnection();

      await server.instance.destroy();

      const sg = shadowGit({ gitDir: requireShadowDir(server), workTree: server.contentDir });
      const wipRefs = (await sg.raw('for-each-ref', '--format=%(refname)', 'refs/wip/')).trim();
      expect(wipRefs).toBeTruthy();
    } finally {
      await server.cleanup();
    }
  });

  test('applyExternalChange → commit on refs/wip/<branch>/file-system', async () => {
    const server = await createTestServer({
      withShadow: true,
      debounce: 60_000,
      maxDebounce: 60_000,
    });
    try {
      // Load the doc via a direct connection + mutation
      const conn = await server.instance.hocuspocus.openDirectConnection('fs-writer-doc');
      await conn.transact((doc) => {
        const xmlFragment = doc.getXmlFragment('default');
        const paragraph = new Y.XmlElement('paragraph');
        paragraph.insert(0, [new Y.XmlText('initial content')]);
        xmlFragment.insert(0, [paragraph]);
      });

      // Simulate a file-watcher external change — registers file-system contributor (D41)
      applyExternalChange(server.instance.hocuspocus, 'fs-writer-doc', '# Updated from disk\n');

      const doc = server.instance.hocuspocus.documents.get('fs-writer-doc');
      doc?.removeDirectConnection();

      await server.instance.destroy();

      const sg = shadowGit({ gitDir: requireShadowDir(server), workTree: server.contentDir });
      const fsRef = (await sg.raw('rev-parse', 'refs/wip/main/file-system')).trim();
      expect(fsRef).toBeTruthy();

      // Commit subject must use reconcile: prefix (D53)
      const subject = (
        await sg.raw('log', '-1', '--format=%s', 'refs/wip/main/file-system')
      ).trim();
      expect(subject).toBe('reconcile: fs-writer-doc');
    } finally {
      await server.cleanup();
    }
  });

  test('concurrent agent + file-watcher → two commits sharing tree SHA', async () => {
    const server = await createTestServer({
      withShadow: true,
      debounce: 60_000,
      maxDebounce: 60_000,
    });
    try {
      // Load the doc
      const conn = await server.instance.hocuspocus.openDirectConnection('concurrent-doc');
      await conn.transact((doc) => {
        const xmlFragment = doc.getXmlFragment('default');
        const paragraph = new Y.XmlElement('paragraph');
        paragraph.insert(0, [new Y.XmlText('concurrent test')]);
        xmlFragment.insert(0, [paragraph]);
      });

      // Agent contributor (simulating an agent write)
      recordContributor('concurrent-doc', 'agent-s1', 'Session 1', 'agent-s1');

      // File-watcher contributor (simulating an external disk change)
      applyExternalChange(server.instance.hocuspocus, 'concurrent-doc', '# Updated concurrently\n');

      const doc = server.instance.hocuspocus.documents.get('concurrent-doc');
      doc?.removeDirectConnection();

      await server.instance.destroy();

      const sg = shadowGit({ gitDir: requireShadowDir(server), workTree: server.contentDir });

      // Both refs must exist after the drain
      const agentSha = (await sg.raw('rev-parse', 'refs/wip/main/agent-s1')).trim();
      const fsSha = (await sg.raw('rev-parse', 'refs/wip/main/file-system')).trim();
      expect(agentSha).toBeTruthy();
      expect(fsSha).toBeTruthy();

      // Different commits (two writers) but same tree SHA (FR-7: shared tree per drain)
      expect(agentSha).not.toBe(fsSha);
      const agentTree = (await sg.raw('rev-parse', `${agentSha}^{tree}`)).trim();
      const fsTree = (await sg.raw('rev-parse', `${fsSha}^{tree}`)).trim();
      expect(agentTree).toBe(fsTree);

      // FILE_SYSTEM_WRITER.id is 'file-system' (D8, D41)
      expect(FILE_SYSTEM_WRITER.id).toBe('file-system');
    } finally {
      await server.cleanup();
    }
  });
});
