/**
 * FR8 / T3 acceptance test — applyExternalChange (file-watcher → CRDT
 * bridge) produces `refs/wip/<branch>/file-system` with a `reconcile:`
 * commit subject per D53 writer-ID taxonomy.
 *
 * Proves the createTestServer({ withShadow: true }) harness covers the
 * third primary write surface — disk writes reconciled into the CRDT.
 *
 * Spec: specs/2026-04-22-per-worker-shadow-repo-test-harness/SPEC.md §FR8
 */

import { describe, expect, test } from 'bun:test';
import { applyExternalChange, shadowGit } from '@inkeep/open-knowledge-server';
import * as Y from 'yjs';
import { createTestServer, requireShadowDir } from './test-harness';

describe('shadow harness — external disk write acceptance', () => {
  test('applyExternalChange produces refs/wip/<branch>/file-system with reconcile: subject', async () => {
    const server = await createTestServer({
      withShadow: true,
      debounce: 60_000,
      maxDebounce: 60_000,
    });
    try {
      const docName = 'shadow-harness-t3';

      // Load the doc via a direct connection + initial mutation so the
      // Y.Doc exists in hocuspocus.documents before applyExternalChange
      // tries to reconcile against it.
      const conn = await server.instance.hocuspocus.openDirectConnection(docName);
      await conn.transact((doc) => {
        const xmlFragment = doc.getXmlFragment('default');
        const paragraph = new Y.XmlElement('paragraph');
        paragraph.insert(0, [new Y.XmlText('initial content')]);
        xmlFragment.insert(0, [paragraph]);
      });

      // Simulate a file-watcher external change. Registers the file-system
      // classified writer via contributor-tracker (D41) and reconciles the
      // disk content into the Y.Doc.
      applyExternalChange(server.instance.hocuspocus, docName, '# From disk\n');

      const doc = server.instance.hocuspocus.documents.get(docName);
      doc?.removeDirectConnection();

      // Drain L1 + L2 deterministically via destroy. The subsequent
      // cleanup() is idempotent.
      await server.instance.destroy();

      const sg = shadowGit({
        gitDir: requireShadowDir(server),
        workTree: server.contentDir,
      });
      const ref = 'refs/wip/main/file-system';
      const sha = (await sg.raw('rev-parse', ref)).trim();
      expect(sha).toMatch(/^[0-9a-f]{40}$/);

      const subject = (await sg.raw('log', '-1', '--format=%s', ref)).trim();
      expect(subject.startsWith('reconcile:')).toBe(true);
      expect(subject).toContain(docName);
    } finally {
      await server.cleanup();
    }
  });
});
