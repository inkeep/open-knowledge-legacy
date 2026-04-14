/**
 * Tier 1: Bridge integration test matrix
 *
 * Exercises all 12 propagation paths (4 write surfaces × 3 read targets)
 * plus undo/redo through a real Hocuspocus server + real HocuspocusProvider
 * client over WebSocket with setupObservers() wired.
 *
 * Each test verifies content reaches the target surface and asserts the
 * bridge invariant: normalized Y.Text === serialized XmlFragment.
 *
 * Client lifecycle is inside the test body via try/finally (not
 * beforeEach/afterEach) — required for test.concurrent() correctness.
 * Each test uses a per-test unique docName via createTestClient(port).
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { updateYFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import { markUserTyping } from '../../src/editor/observers';

import {
  agentPatch,
  agentRedo,
  agentUndo,
  agentWriteMd,
  assertBridgeInvariant,
  createTestClient,
  createTestServer,
  mdManager,
  pollUntil,
  readTestDoc,
  schema,
  serializeFragment,
  type TestClient,
  type TestServer,
  testReset,
  wait,
} from './test-harness';

/** Simulate WYSIWYG edit: parse markdown and apply to XmlFragment via updateYFragment */
function applyMarkdownToFragment(client: TestClient, md: string): void {
  const json = mdManager.parse(md);
  const pmNode = schema.nodeFromJSON(json);
  const meta = { mapping: new Map(), isOMark: new Map() };
  updateYFragment(client.doc, client.fragment, pmNode, meta);
}

function appendParagraphToFragment(client: TestClient, text: string): void {
  const paragraph = new Y.XmlElement('paragraph');
  const ytext = new Y.XmlText();
  ytext.applyDelta([{ insert: text }]);
  paragraph.insert(0, [ytext]);
  client.fragment.push([paragraph]);
}

function appendWikiLinkToFragment(
  client: TestClient,
  target: string,
  anchor?: string | null,
  alias?: string | null,
): void {
  const paragraph = new Y.XmlElement('paragraph');
  const wikiLink = new Y.XmlElement('wikiLink');
  wikiLink.setAttribute('target', target);
  if (anchor) wikiLink.setAttribute('anchor', anchor);
  if (alias) wikiLink.setAttribute('alias', alias);
  paragraph.insert(0, [wikiLink]);
  client.fragment.push([paragraph]);
}

function normalizeMarkdown(md: string): string {
  return md
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n+$/, '');
}

function assertClientsConverged(...clients: TestClient[]): void {
  const normalized = clients.map((client) => normalizeMarkdown(client.ytext.toString()));
  for (const client of clients) {
    assertBridgeInvariant(client.ytext, client.fragment);
  }
  for (let i = 1; i < normalized.length; i++) {
    expect(normalized[i]).toBe(normalized[0]);
  }
}

let server: TestServer;

beforeAll(async () => {
  server = await createTestServer();
});

afterAll(async () => {
  await server.cleanup();
});

// ─── Smoke ───

describe('smoke', () => {
  test('server starts, client connects, basic round-trip works', async () => {
    const client = await createTestClient(server.port);
    try {
      await agentWriteMd(server.port, '# Hello World', { docName: client.docName });
      await pollUntil(() => client.ytext.toString().includes('Hello World'), 5000);
      expect(client.ytext.toString()).toContain('Hello World');
      assertBridgeInvariant(client.ytext, client.fragment);
    } finally {
      await client.cleanup();
    }
  });
});

// ─── W1: WYSIWYG (XmlFragment) writes ───

describe('W1: WYSIWYG writes', () => {
  test.concurrent('W1→Y.Text: local XmlFragment edit propagates to Y.Text via Observer A', async () => {
    const client = await createTestClient(server.port);
    try {
      applyMarkdownToFragment(client, '# WYSIWYG Heading\n\nSome paragraph content.');
      await pollUntil(() => client.ytext.toString().includes('WYSIWYG Heading'), 5000);
      expect(client.ytext.toString()).toContain('WYSIWYG Heading');
      expect(client.ytext.toString()).toContain('Some paragraph content');
      assertBridgeInvariant(client.ytext, client.fragment);
    } finally {
      await client.cleanup();
    }
  });

  test.concurrent('W1→Disk: local XmlFragment edit persists to .md file', async () => {
    const client = await createTestClient(server.port);
    try {
      applyMarkdownToFragment(client, '# Disk Test\n\nThis should persist.');
      await pollUntil(
        () => readTestDoc(server.contentDir, client.docName).includes('Disk Test'),
        5000,
      );
      const diskContent = readTestDoc(server.contentDir, client.docName);
      expect(diskContent).toContain('Disk Test');
      expect(diskContent).toContain('This should persist');
      assertBridgeInvariant(client.ytext, client.fragment);
    } finally {
      await client.cleanup();
    }
  });
});

// ─── W2: Source mode (Y.Text) writes ───

describe('W2: source mode writes', () => {
  test.concurrent('W2→XmlFragment: local Y.Text edit propagates to XmlFragment via Observer B', async () => {
    const client = await createTestClient(server.port);
    try {
      client.doc.transact(() => {
        client.ytext.insert(0, '# Source Heading\n\nTyped in source mode.');
      });
      await pollUntil(() => serializeFragment(client.fragment).includes('Source Heading'), 5000);
      const fragContent = serializeFragment(client.fragment);
      expect(fragContent).toContain('Source Heading');
      expect(fragContent).toContain('Typed in source mode');
      assertBridgeInvariant(client.ytext, client.fragment);
    } finally {
      await client.cleanup();
    }
  });

  test.concurrent('W2→Disk: local Y.Text edit persists to .md file', async () => {
    const client = await createTestClient(server.port);
    try {
      client.doc.transact(() => {
        client.ytext.insert(0, '# Source Disk\n\nShould reach disk.');
      });
      await pollUntil(
        () => readTestDoc(server.contentDir, client.docName).includes('Source Disk'),
        5000,
      );
      const diskContent = readTestDoc(server.contentDir, client.docName);
      expect(diskContent).toContain('Source Disk');
      assertBridgeInvariant(client.ytext, client.fragment);
    } finally {
      await client.cleanup();
    }
  });
});

// ─── W3: Agent writes (via API) ───

describe('W3: agent writes', () => {
  test.concurrent('W3→Y.Text: agent-write-md propagates to client Y.Text', async () => {
    const client = await createTestClient(server.port);
    try {
      await agentWriteMd(server.port, '# Agent Heading\n\nAgent wrote this.', {
        docName: client.docName,
      });
      await pollUntil(() => client.ytext.toString().includes('Agent Heading'), 5000);
      expect(client.ytext.toString()).toContain('Agent Heading');
      expect(client.ytext.toString()).toContain('Agent wrote this');
      assertBridgeInvariant(client.ytext, client.fragment);
    } finally {
      await client.cleanup();
    }
  });

  test.concurrent('W3→XmlFragment: agent-write-md propagates to client XmlFragment', async () => {
    const client = await createTestClient(server.port);
    try {
      await agentWriteMd(server.port, '# Agent Fragment\n\nVisible in WYSIWYG.', {
        docName: client.docName,
      });
      await pollUntil(() => serializeFragment(client.fragment).includes('Agent Fragment'), 5000);
      const fragContent = serializeFragment(client.fragment);
      expect(fragContent).toContain('Agent Fragment');
      expect(fragContent).toContain('Visible in WYSIWYG');
      assertBridgeInvariant(client.ytext, client.fragment);
    } finally {
      await client.cleanup();
    }
  });

  test.concurrent('W3→Disk: agent-write-md persists to .md file', async () => {
    const client = await createTestClient(server.port);
    try {
      await agentWriteMd(server.port, '# Agent Disk\n\nPersisted by agent.', {
        docName: client.docName,
      });
      await pollUntil(
        () => readTestDoc(server.contentDir, client.docName).includes('Agent Disk'),
        5000,
      );
      const diskContent = readTestDoc(server.contentDir, client.docName);
      expect(diskContent).toContain('Agent Disk');
      expect(diskContent).toContain('Persisted by agent');
      assertBridgeInvariant(client.ytext, client.fragment);
    } finally {
      await client.cleanup();
    }
  });

  // Agent-patch (find-and-replace) covers a distinct code path from agent-write-md —
  // it mutates an existing span via ytext.delete + ytext.insert instead of append/prepend.
  // These tests closed a coverage gap that existed before this PR (agent-patch landed in
  // PR #31 without integration tests; agent-write-md had full W3 coverage).
  test.concurrent('W3-patch→Y.Text: agent-patch replaces target span in Y.Text', async () => {
    const client = await createTestClient(server.port);
    try {
      await agentWriteMd(server.port, '# Header\n\nOriginal body text.', {
        docName: client.docName,
      });
      await pollUntil(() => client.ytext.toString().includes('Original body text'), 5000);

      const result = await agentPatch(
        server.port,
        'Original body text',
        'Replaced body text',
        client.docName,
      );
      expect(result.ok).toBe(true);
      await pollUntil(() => client.ytext.toString().includes('Replaced body text'), 5000);
      expect(client.ytext.toString()).not.toContain('Original body text');
      expect(client.ytext.toString()).toContain('Header');
      assertBridgeInvariant(client.ytext, client.fragment);
    } finally {
      await client.cleanup();
    }
  });

  test.concurrent('W3-patch→XmlFragment: agent-patch propagates to XmlFragment', async () => {
    const client = await createTestClient(server.port);
    try {
      await agentWriteMd(server.port, '# Title\n\nFoo bar baz qux.', { docName: client.docName });
      await pollUntil(() => serializeFragment(client.fragment).includes('Foo bar'), 5000);

      const result = await agentPatch(server.port, 'Foo bar', 'FOO BAR', client.docName);
      expect(result.ok).toBe(true);
      await pollUntil(() => serializeFragment(client.fragment).includes('FOO BAR'), 5000);
      const fragContent = serializeFragment(client.fragment);
      expect(fragContent).toContain('FOO BAR');
      expect(fragContent).toContain('baz qux');
      assertBridgeInvariant(client.ytext, client.fragment);
    } finally {
      await client.cleanup();
    }
  });

  test.concurrent('W3-patch: agent-patch with unknown find text returns 404 without mutating', async () => {
    const client = await createTestClient(server.port);
    try {
      await agentWriteMd(server.port, '# Seed\n\nUntouched content.', {
        docName: client.docName,
      });
      await pollUntil(() => client.ytext.toString().includes('Untouched content'), 5000);

      const before = client.ytext.toString();
      const result = await agentPatch(
        server.port,
        'text-that-is-not-in-the-document',
        'replacement',
        client.docName,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(404);
      // The content must not have been mutated
      await wait(300);
      expect(client.ytext.toString()).toBe(before);
      assertBridgeInvariant(client.ytext, client.fragment);
    } finally {
      await client.cleanup();
    }
  });
});

// ─── W4: Disk writes (file watcher) ───
// W4 tests use explicit 'test-doc' because they write to disk by filename
// and the file watcher maps filename → docName.

describe('W4: disk writes', () => {
  test('W4→Y.Text: disk file change propagates to client Y.Text', async () => {
    await testReset(server.port);
    await wait(300);
    const client = await createTestClient(server.port, 'test-doc');
    try {
      // Wait for file watcher to settle after testReset's writeFileSync
      await wait(500);
      writeFileSync(
        join(server.contentDir, 'test-doc.md'),
        '# From Disk\n\nWritten externally.',
        'utf-8',
      );
      await pollUntil(() => client.ytext.toString().includes('From Disk'), 10_000);
      expect(client.ytext.toString()).toContain('Written externally');
      assertBridgeInvariant(client.ytext, client.fragment);
    } finally {
      await client.cleanup();
    }
  });

  test('W4→XmlFragment: disk file change propagates to client XmlFragment', async () => {
    await testReset(server.port);
    await wait(300);
    const client = await createTestClient(server.port, 'test-doc');
    try {
      await wait(500);
      writeFileSync(
        join(server.contentDir, 'test-doc.md'),
        '# Disk Fragment\n\nVisible in WYSIWYG from disk.',
        'utf-8',
      );
      await pollUntil(() => serializeFragment(client.fragment).includes('Disk Fragment'), 10_000);
      const fragContent = serializeFragment(client.fragment);
      expect(fragContent).toContain('Visible in WYSIWYG from disk');
      assertBridgeInvariant(client.ytext, client.fragment);
    } finally {
      await client.cleanup();
    }
  });
});

// ─── Undo / Redo ───

describe('undo / redo', () => {
  test.concurrent('Undo→Y.Text: agent-undo reverts client Y.Text', async () => {
    const client = await createTestClient(server.port);
    try {
      await agentWriteMd(server.port, '# Undo Target\n\nThis will be undone.', {
        docName: client.docName,
      });
      await pollUntil(() => client.ytext.toString().includes('Undo Target'), 5000);
      expect(client.ytext.toString()).toContain('Undo Target');

      await agentUndo(server.port, client.docName);
      await pollUntil(() => !client.ytext.toString().includes('Undo Target'), 5000);
      expect(client.ytext.toString()).not.toContain('Undo Target');
      expect(serializeFragment(client.fragment)).not.toContain('Undo Target');
      assertBridgeInvariant(client.ytext, client.fragment);
    } finally {
      await client.cleanup();
    }
  });

  test.concurrent('Undo→XmlFragment: agent-undo reverts client XmlFragment', async () => {
    const client = await createTestClient(server.port);
    try {
      await agentWriteMd(server.port, '# Undo Fragment\n\nUndone in WYSIWYG.', {
        docName: client.docName,
      });
      await pollUntil(() => serializeFragment(client.fragment).includes('Undo Fragment'), 5000);
      expect(serializeFragment(client.fragment)).toContain('Undo Fragment');

      await agentUndo(server.port, client.docName);
      await pollUntil(() => !serializeFragment(client.fragment).includes('Undo Fragment'), 5000);
      expect(serializeFragment(client.fragment)).not.toContain('Undo Fragment');
      expect(client.ytext.toString()).not.toContain('Undo Fragment');
      assertBridgeInvariant(client.ytext, client.fragment);
    } finally {
      await client.cleanup();
    }
  });

  test.concurrent('Redo→all: agent-redo restores both surfaces', async () => {
    const client = await createTestClient(server.port);
    try {
      await agentWriteMd(server.port, '# Redo Target\n\nRedo restores this.', {
        docName: client.docName,
      });
      await pollUntil(() => client.ytext.toString().includes('Redo Target'), 5000);
      expect(client.ytext.toString()).toContain('Redo Target');

      await agentUndo(server.port, client.docName);
      await pollUntil(() => !client.ytext.toString().includes('Redo Target'), 5000);
      expect(client.ytext.toString()).not.toContain('Redo Target');

      await agentRedo(server.port, client.docName);
      await pollUntil(() => client.ytext.toString().includes('Redo Target'), 5000);
      expect(client.ytext.toString()).toContain('Redo Target');
      expect(serializeFragment(client.fragment)).toContain('Redo Target');
      assertBridgeInvariant(client.ytext, client.fragment);
    } finally {
      await client.cleanup();
    }
  });
});

// ─── Initial sync + test reset ───
// These tests verify shared-state behavior and MUST use explicit 'test-doc'.
// They stay on plain test() — NOT test.concurrent().

describe('initial sync and test isolation', () => {
  test('initial sync: server with existing .md file populates client', async () => {
    await testReset(server.port);
    await wait(300);
    writeFileSync(
      join(server.contentDir, 'test-doc.md'),
      '# Pre-existing\n\nAlready on disk.',
      'utf-8',
    );

    const client = await createTestClient(server.port, 'test-doc');
    try {
      await pollUntil(() => client.ytext.toString().includes('Pre-existing'), 5000);
      expect(client.ytext.toString()).toContain('Already on disk');
      assertBridgeInvariant(client.ytext, client.fragment);
    } finally {
      await client.cleanup();
    }
  });

  test('opening a file without edits does not rewrite disk in normalized form', async () => {
    // Regression: Hocuspocus fires onStoreDocument after the first-pass
    // observer sync that populates Y.Text from the freshly-loaded
    // XmlFragment. That mutation is semantically a no-op, but without a
    // gate the store handler rewrites the file in TipTap's normalized form
    // (padded tables, added backslash-escapes, etc.), polluting the user's
    // git working tree on mere file open.
    //
    // Tight (unpadded) GFM table — serialization pads columns to the widest
    // cell, so this exact byte sequence differs from what TipTap emits.
    // We use a unique docName so the file-watcher update event fires before
    // the doc loads (no-op path, no reconciliation), and the subsequent
    // load+store cycle compares against the serialized-at-load baseline.
    const docName = `no-op-store-${crypto.randomUUID()}`;
    const originalBytes = '# Title\n\n| A | B |\n| - | - |\n| 1 | 22 |\n';
    const filePath = join(server.contentDir, `${docName}.md`);
    writeFileSync(filePath, originalBytes, 'utf-8');
    // Let the file-watcher's "no loaded doc" branch drain before we open it.
    await wait(500);

    const client = await createTestClient(server.port, docName);
    try {
      await pollUntil(() => client.ytext.toString().includes('Title'), 5000);
      // Wait well past the server debounce (200ms) so any scheduled store
      // has a chance to fire.
      await wait(800);

      const diskAfter = readTestDoc(server.contentDir, docName);
      expect(diskAfter).toBe(originalBytes);
    } finally {
      await client.cleanup();
    }
  });

  test('opening a file with frontmatter without edits does not rewrite disk', async () => {
    // Companion to the preceding test — the no-op gate must hold on the
    // frontmatter round-trip path too. `onLoadDocument` routes frontmatter
    // through `stripFrontmatter` → `prependFrontmatter` before writing the
    // reconciledBase; `onStoreDocument` does the same before comparing.
    // A subtle byte-level drift (e.g. a stray newline between `---` and the
    // body) would break the equality check for frontmatter files while
    // leaving the non-frontmatter case passing.
    const docName = `no-op-fm-${crypto.randomUUID()}`;
    const originalBytes =
      '---\ntitle: Test\ntags: [a, b]\n---\n\n# Content\n\n| A | B |\n| - | - |\n| 1 | 22 |\n';
    const filePath = join(server.contentDir, `${docName}.md`);
    writeFileSync(filePath, originalBytes, 'utf-8');
    await wait(500);

    const client = await createTestClient(server.port, docName);
    try {
      await pollUntil(() => client.ytext.toString().includes('Content'), 5000);
      await wait(800);

      const diskAfter = readTestDoc(server.contentDir, docName);
      expect(diskAfter).toBe(originalBytes);
    } finally {
      await client.cleanup();
    }
  });

  test('test-reset isolates state between tests', async () => {
    await testReset(server.port);
    await wait(300);
    const client1 = await createTestClient(server.port, 'test-doc');
    await agentWriteMd(server.port, '# Stale Content\n\nShould be gone after reset.');
    await pollUntil(() => client1.ytext.toString().includes('Stale Content'), 5000);
    expect(client1.ytext.toString()).toContain('Stale Content');
    await client1.cleanup();

    await testReset(server.port);
    await wait(300);

    const client2 = await createTestClient(server.port, 'test-doc');
    try {
      await wait(300);
      expect(client2.ytext.toString()).not.toContain('Stale Content');
    } finally {
      await client2.cleanup();
    }
  });
});

// ─── Multi-client sync ───

describe('multi-client sync', () => {
  let clientA: TestClient;
  let clientB: TestClient;

  beforeEach(async () => {
    await testReset(server.port);
    await wait(300);
    // Multi-client tests MUST share a docName so the CRDT layer links both
    // providers to the same Y.Doc. Pass 'test-doc' explicitly — the default
    // is per-test randomUUID for isolation, which would produce two
    // independent docs that never sync.
    clientA = await createTestClient(server.port, 'test-doc');
    clientB = await createTestClient(server.port, 'test-doc');
  });

  afterEach(async () => {
    // cleanup() is async as of 79d1b51 (testReset wrapped in try/catch).
    // Missing await would let the test.concurrent() runner race ahead into
    // the next test before the server-side doc unloads.
    await clientA?.cleanup();
    await clientB?.cleanup();
    // Wait for WebSocket connections to fully close before the next testReset.
    // provider.destroy() sends a close frame but the socket close is async —
    // if we proceed immediately, old providers can reconnect into the reset
    // document and push stale state from previous tests.
    await wait(300);
  });

  test('client A WYSIWYG edit propagates to client B source view', async () => {
    appendParagraphToFragment(clientA, 'Client A wrote from WYSIWYG.');

    await pollUntil(() => clientB.ytext.toString().includes('Client A wrote from WYSIWYG.'), 5000);

    expect(clientB.ytext.toString()).toContain('Client A wrote from WYSIWYG.');
    expect(serializeFragment(clientB.fragment)).toContain('Client A wrote from WYSIWYG.');
    assertClientsConverged(clientA, clientB);
  });

  test('client A source edit propagates to client B WYSIWYG view', async () => {
    clientA.doc.transact(() => {
      clientA.ytext.insert(0, '# Shared Heading\n\nClient A typed from source mode.\n');
    }, 'user-edit');

    await pollUntil(
      () => serializeFragment(clientB.fragment).includes('Client A typed from source mode.'),
      5000,
    );

    expect(serializeFragment(clientB.fragment)).toContain('Shared Heading');
    expect(serializeFragment(clientB.fragment)).toContain('Client A typed from source mode.');
    assertClientsConverged(clientA, clientB);
  });

  test('simultaneous cross-mode edits on two clients converge', async () => {
    await agentWriteMd(server.port, '# Shared Base\n\nStarting point.');
    await pollUntil(() => clientA.ytext.toString().includes('Shared Base'), 5000);
    await pollUntil(() => clientB.ytext.toString().includes('Shared Base'), 5000);

    appendParagraphToFragment(clientA, 'CLIENT-A-WYSIWYG-MARKER');

    clientB.doc.transact(() => {
      clientB.ytext.insert(clientB.ytext.length, '\n\nCLIENT-B-SOURCE-MARKER\n');
    }, 'user-edit');

    await pollUntil(() => clientA.ytext.toString().includes('CLIENT-B-SOURCE-MARKER'), 5000);
    await pollUntil(() => clientB.ytext.toString().includes('CLIENT-A-WYSIWYG-MARKER'), 5000);
    // Wait for observer debounces (50ms each) + remote-tree grace window (150ms) to settle.
    // Increased from 400ms to 800ms to account for unified pipeline serialize latency.
    await wait(800);

    expect(clientA.ytext.toString()).toContain('CLIENT-A-WYSIWYG-MARKER');
    expect(clientA.ytext.toString()).toContain('CLIENT-B-SOURCE-MARKER');
    expect(clientB.ytext.toString()).toContain('CLIENT-A-WYSIWYG-MARKER');
    expect(clientB.ytext.toString()).toContain('CLIENT-B-SOURCE-MARKER');
    assertClientsConverged(clientA, clientB);
  });

  test('local typing defer does not block remote source edits from another client', async () => {
    await agentWriteMd(server.port, '# Base\n\nSeed content.');
    await pollUntil(() => clientA.ytext.toString().includes('Seed content.'), 5000);
    await pollUntil(() => clientB.ytext.toString().includes('Seed content.'), 5000);

    const typingInterval = setInterval(() => markUserTyping(clientA.doc), 50);
    markUserTyping(clientA.doc);

    appendParagraphToFragment(clientA, 'CLIENT-A-LOCAL-TYPING');

    clientB.doc.transact(() => {
      clientB.ytext.insert(clientB.ytext.length, '\n\nCLIENT-B-REMOTE-SOURCE\n');
    }, 'user-edit');

    await wait(800);
    clearInterval(typingInterval);
    await pollUntil(() => clientA.ytext.toString().includes('CLIENT-B-REMOTE-SOURCE'), 5000);

    expect(clientA.ytext.toString()).toContain('CLIENT-A-LOCAL-TYPING');
    expect(clientA.ytext.toString()).toContain('CLIENT-B-REMOTE-SOURCE');
    expect(clientB.ytext.toString()).toContain('CLIENT-A-LOCAL-TYPING');
    expect(clientB.ytext.toString()).toContain('CLIENT-B-REMOTE-SOURCE');
    assertClientsConverged(clientA, clientB);
  });

  test('agent write after two-client cross-mode edits propagate preserves all contributions', async () => {
    await agentWriteMd(server.port, '# Shared Base\n\nSeed content.');
    await pollUntil(() => clientA.ytext.toString().includes('Seed content.'), 5000);
    await pollUntil(() => clientB.ytext.toString().includes('Seed content.'), 5000);

    appendParagraphToFragment(clientA, 'CLIENT-A-WYSIWYG-EDIT');

    clientB.doc.transact(() => {
      clientB.ytext.insert(clientB.ytext.length, '\n\nCLIENT-B-SOURCE-EDIT\n');
    }, 'user-edit');

    // The server agent write operates on server-side Y.Text. Wait for both client edits
    // to cross the local bridge and become shared state before appending agent content.
    await pollUntil(() => clientA.ytext.toString().includes('CLIENT-B-SOURCE-EDIT'), 5000);
    await pollUntil(() => clientB.ytext.toString().includes('CLIENT-A-WYSIWYG-EDIT'), 5000);
    await wait(400);

    await agentWriteMd(server.port, '## Agent Contribution\n\nSERVER-AGENT-CONTENT');

    await pollUntil(() => clientA.ytext.toString().includes('SERVER-AGENT-CONTENT'), 5000);
    await pollUntil(() => clientB.ytext.toString().includes('SERVER-AGENT-CONTENT'), 5000);
    await pollUntil(() => clientA.ytext.toString().includes('CLIENT-B-SOURCE-EDIT'), 5000);
    await pollUntil(() => clientB.ytext.toString().includes('CLIENT-A-WYSIWYG-EDIT'), 5000);

    expect(clientA.ytext.toString()).toContain('CLIENT-A-WYSIWYG-EDIT');
    expect(clientA.ytext.toString()).toContain('CLIENT-B-SOURCE-EDIT');
    expect(clientA.ytext.toString()).toContain('SERVER-AGENT-CONTENT');
    expect(clientB.ytext.toString()).toContain('CLIENT-A-WYSIWYG-EDIT');
    expect(clientB.ytext.toString()).toContain('CLIENT-B-SOURCE-EDIT');
    expect(clientB.ytext.toString()).toContain('SERVER-AGENT-CONTENT');
    assertClientsConverged(clientA, clientB);
  });

  test('wiki-link atom node inserted by client A converges on client B', async () => {
    appendWikiLinkToFragment(clientA, 'test-page', 'Heading', 'Display');

    await pollUntil(() => clientB.ytext.toString().includes('[[test-page#Heading|Display]]'), 5000);

    expect(clientB.ytext.toString()).toContain('[[test-page#Heading|Display]]');
    assertClientsConverged(clientA, clientB);
  });

  test('wiki-link atom node mixed with text in same paragraph converges across clients', async () => {
    const paragraph = new Y.XmlElement('paragraph');
    const before = new Y.XmlText();
    before.applyDelta([{ insert: 'See ' }]);
    const wikiLink = new Y.XmlElement('wikiLink');
    wikiLink.setAttribute('target', 'Page');
    wikiLink.setAttribute('anchor', 'Section');
    wikiLink.setAttribute('alias', 'here');
    const after = new Y.XmlText();
    after.applyDelta([{ insert: ' for details.' }]);
    paragraph.insert(0, [before, wikiLink, after]);
    clientA.fragment.push([paragraph]);

    await pollUntil(() => clientB.ytext.toString().includes('[[Page#Section|here]]'), 5000);

    expect(clientB.ytext.toString()).toContain('See [[Page#Section|here]] for details.');
    assertClientsConverged(clientA, clientB);
  });

  // Reverse direction (source→tree): exercises Observer B's inline parser for [[...]]
  // syntax under multi-client sync. Pairs with the two tree→text tests above to close
  // bidirectional coverage for atom nodes — Observer A (tree→text) serializes the
  // wikiLink node to markdown; Observer B (text→tree) parses markdown [[...]] back
  // into a structured wikiLink atom node. Different code paths, both need multi-client
  // coverage per S7.
  test('wiki-link written as raw source text by client B materializes as atom node on client A', async () => {
    clientB.doc.transact(() => {
      clientB.ytext.insert(0, 'See [[Page#Section|here]] for details.\n');
    }, 'user-edit');

    // Observer B on clientB parses the markdown into a wikiLink atom node in its
    // XmlFragment; the XmlFragment update propagates to clientA via CRDT sync; on
    // clientA, serializeFragment round-trips the atom node back to [[...]] markdown.
    await pollUntil(
      () => serializeFragment(clientA.fragment).includes('[[Page#Section|here]]'),
      5000,
    );

    expect(serializeFragment(clientA.fragment)).toContain('See [[Page#Section|here]] for details.');
    expect(clientA.ytext.toString()).toContain('See [[Page#Section|here]] for details.');

    // Structural verification: the wikiLink exists as an atom node in clientA's
    // XmlFragment (not just raw text). Without this, the test would pass even if
    // Observer B failed to parse [[...]] into a structured node — raw text
    // round-trips identically through serialization.
    const pmJson = JSON.stringify(yXmlFragmentToProsemirrorJSON(clientA.fragment));
    expect(pmJson).toContain('"type":"wikiLink"');
    expect(pmJson).toContain('"target":"Page"');
    expect(pmJson).toContain('"anchor":"Section"');
    expect(pmJson).toContain('"alias":"here"');

    assertClientsConverged(clientA, clientB);
  });
});

// ─── V2: External-write convergence window (R11) ───

describe('V2: external-write convergence window', () => {
  test('agent write via API → content arrives during debounce window (R11)', async () => {
    const client = await createTestClient(server.port);
    try {
      // Write via agent API (uses client's unique docName)
      await agentWriteMd(server.port, '# V2 Test\n\nAgent content here.', {
        docName: client.docName,
      });

      // Poll until content arrives — during Observer A debounce window,
      // content may be in raw or canonical form (both acceptable)
      await pollUntil(() => client.ytext.toString().includes('V2 Test'), 5000);

      const textContent = normalizeMarkdown(client.ytext.toString());
      expect(textContent).toContain('V2 Test');
      expect(textContent).toContain('Agent content');

      // Bridge invariant should hold after convergence
      assertBridgeInvariant(client.ytext, client.fragment);
    } finally {
      await client.cleanup();
    }
  });
});
