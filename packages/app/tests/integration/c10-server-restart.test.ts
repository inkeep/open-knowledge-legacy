/**
 * C10: Server restart mid-edit — canonical-state recovery via persistence.
 *
 * Validates SPEC §5 failure-path R6 + NFR Reliability row:
 *   "Integration test: kill + restart server mid-edit burst → state converges
 *    on reconnect."
 *
 * Under the server-authoritative observer bridge, the server observer is the
 * sole writer to each derived CRDT. Server restart must not produce divergence
 * because persistence holds canonical state atomically; on reload, XmlFragment
 * and Y.Text are populated from the canonical markdown file, and the server
 * observer attaches in `afterLoadDocument` (post-load). The first observer
 * fire on the freshly-loaded doc compares XmlFragment vs. Y.Text and either
 * early-exits (already in sync from persistence) or performs a corrective
 * sync to Y.Text.
 *
 * Why the test models the scenario as "canonical disk state → fresh server"
 * rather than "same server destroyed then re-created on same dir":
 *
 *   The R6 failure mode is a server crash (kill -9, OOM, oom-killer), not a
 *   clean `destroy()`. A real crash doesn't invoke shutdown ordering — the
 *   process simply dies, leaving on disk whatever persistence last flushed.
 *   Therefore the post-restart behavior is equivalent to "a fresh server
 *   starting against a contentDir containing canonical markdown files":
 *   persistence.onLoadDocument reads the file, populates Y.Doc, the server
 *   observer attaches via afterLoadDocument, and fires on the first change
 *   event (either the populate-from-disk or a subsequent client edit).
 *
 *   This test pre-populates disk with canonical markdown, then starts a
 *   server and connects a client — exercising the exact same code path a
 *   post-crash restart would.
 *
 * Per-test docName isolation. Client lifecycle in try/finally per R8a.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  assertBridgeInvariant,
  createTestClient,
  createTestServer,
  pollUntil,
  serializeFragment,
  type TestServer,
  wait,
} from './test-harness';

let server: TestServer;

beforeAll(async () => {
  server = await createTestServer();
});

afterAll(async () => {
  await server.cleanup();
});

describe('C10: server restart — canonical disk state converges on fresh server+client', () => {
  test('single-document canonical content loads into both XmlFragment and Y.Text with bridge invariant', async () => {
    // Simulates: Server A crashed after persistence flushed this content to
    // disk. Server B starts up (this harness's createTestServer), a client
    // reconnects.
    const docName = `restart-single-${crypto.randomUUID()}`;
    const markerPre = 'C10-pre-restart-content-alpha';
    const canonical = `# Post-restart doc\n\n${markerPre}\n\nSecond paragraph with body text.\n`;

    // Pre-populate the canonical disk state (what persistence would have
    // written before a crash). File watcher will detect this but the client
    // connecting fresh triggers persistence.onLoadDocument to parse and
    // populate Y.Doc.
    writeFileSync(join(server.contentDir, `${docName}.md`), canonical, 'utf-8');
    // Small wait for file watcher to settle (so its 'create' event doesn't
    // race with the client connection).
    await wait(300);

    const client = await createTestClient(server.port, docName);
    try {
      // Persistence.onLoadDocument populates XmlFragment when the doc loads.
      // Server observer attaches via afterLoadDocument; Observer A's first
      // fire on the populated XmlFragment writes Y.Text under
      // OBSERVER_SYNC_ORIGIN. Both propagate to the client via CRDT sync.
      await pollUntil(() => {
        const fragSerialized = serializeFragment(client.fragment);
        const ytextContent = client.ytext.toString();
        return fragSerialized.includes(markerPre) && ytextContent.includes(markerPre);
      }, 5000);

      // Bridge invariant holds post-restart (XmlFragment and Y.Text match
      // modulo trailing whitespace). No duplication introduced by load.
      assertBridgeInvariant(client.ytext, client.fragment);

      // Count occurrences — exactly once on each side (load must not
      // duplicate content, which a buggy observer could do if first-fire
      // didn't early-exit correctly).
      const fragSerialized = serializeFragment(client.fragment);
      const ytextContent = client.ytext.toString();
      const fragOccurrences = (fragSerialized.match(new RegExp(markerPre, 'g')) ?? []).length;
      const ytextOccurrences = (ytextContent.match(new RegExp(markerPre, 'g')) ?? []).length;

      expect(fragOccurrences).toBe(1);
      expect(ytextOccurrences).toBe(1);
    } finally {
      client.cleanup();
    }
  }, 30_000);

  test('multi-paragraph canonical content preserves order and all markers on load', async () => {
    // Richer canonical state with multiple paragraphs — verifies that
    // persistence + server observer together preserve structured content
    // through the load sequence.
    const docName = `restart-multi-${crypto.randomUUID()}`;
    const marker1 = 'C10b-paragraph-one-alpha';
    const marker2 = 'C10b-paragraph-two-bravo';
    const marker3 = 'C10b-paragraph-three-charlie';
    const canonical = `# Multi-paragraph doc\n\n${marker1}\n\n${marker2}\n\n${marker3}\n`;

    writeFileSync(join(server.contentDir, `${docName}.md`), canonical, 'utf-8');
    await wait(300);

    const client = await createTestClient(server.port, docName);
    try {
      await pollUntil(() => {
        const fragSerialized = serializeFragment(client.fragment);
        return (
          fragSerialized.includes(marker1) &&
          fragSerialized.includes(marker2) &&
          fragSerialized.includes(marker3)
        );
      }, 5000);

      assertBridgeInvariant(client.ytext, client.fragment);

      const fragSerialized = serializeFragment(client.fragment);
      const ytextContent = client.ytext.toString();

      // Order preserved (marker1 before marker2 before marker3 in both reps)
      expect(fragSerialized.indexOf(marker1)).toBeLessThan(fragSerialized.indexOf(marker2));
      expect(fragSerialized.indexOf(marker2)).toBeLessThan(fragSerialized.indexOf(marker3));
      expect(ytextContent.indexOf(marker1)).toBeLessThan(ytextContent.indexOf(marker2));
      expect(ytextContent.indexOf(marker2)).toBeLessThan(ytextContent.indexOf(marker3));

      // No duplication
      for (const marker of [marker1, marker2, marker3]) {
        const fragCount = (fragSerialized.match(new RegExp(marker, 'g')) ?? []).length;
        const ytextCount = (ytextContent.match(new RegExp(marker, 'g')) ?? []).length;
        expect(fragCount).toBe(1);
        expect(ytextCount).toBe(1);
      }
    } finally {
      client.cleanup();
    }
  }, 30_000);

  test('client can edit after load — post-restart edits propagate through server observer', async () => {
    // Post-restart, the client must still be able to drive new edits and
    // have them reach both CRDT representations via the server observer.
    // This catches a regression where server observer attachment succeeds
    // but the first-edit sync path is broken.
    const docName = `restart-edit-${crypto.randomUUID()}`;
    const canonicalMarker = 'C10c-loaded-from-disk';
    const newMarker = 'C10c-added-after-reconnect';
    const canonical = `${canonicalMarker}\n`;

    writeFileSync(join(server.contentDir, `${docName}.md`), canonical, 'utf-8');
    await wait(300);

    const client = await createTestClient(server.port, docName);
    try {
      // Wait for initial load to surface on the client.
      await pollUntil(() => client.ytext.toString().includes(canonicalMarker), 5000);

      // Client types at end of Y.Text (simulating source-mode edit).
      const currentText = client.ytext.toString();
      client.doc.transact(() => {
        client.ytext.insert(currentText.length, `\n${newMarker}\n`);
      });

      // New marker must propagate to XmlFragment via server Observer B.
      await pollUntil(() => serializeFragment(client.fragment).includes(newMarker), 5000);

      assertBridgeInvariant(client.ytext, client.fragment);

      const fragSerialized = serializeFragment(client.fragment);
      const ytextContent = client.ytext.toString();

      // Both markers present, no duplication.
      expect(fragSerialized).toContain(canonicalMarker);
      expect(fragSerialized).toContain(newMarker);
      expect(ytextContent).toContain(canonicalMarker);
      expect(ytextContent).toContain(newMarker);

      const canonicalFragCount = (fragSerialized.match(new RegExp(canonicalMarker, 'g')) ?? [])
        .length;
      const newFragCount = (fragSerialized.match(new RegExp(newMarker, 'g')) ?? []).length;
      expect(canonicalFragCount).toBe(1);
      expect(newFragCount).toBe(1);
    } finally {
      client.cleanup();
    }
  }, 30_000);
});
