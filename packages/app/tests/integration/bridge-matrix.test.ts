/**
 * Tier 1: Bridge integration test matrix
 *
 * Exercises all 12 propagation paths (4 write surfaces × 3 read targets)
 * plus undo/redo through a real Hocuspocus server + real HocuspocusProvider
 * client over WebSocket with setupObservers() wired.
 *
 * Each test verifies content reaches the target surface and asserts the
 * bridge invariant: normalized Y.Text === serialized XmlFragment.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { updateYFragment } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import { markUserTyping } from '../../src/editor/observers';

import {
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
  let client: TestClient;

  afterEach(() => {
    client?.cleanup();
  });

  test('server starts, client connects, basic round-trip works', async () => {
    await testReset(server.port);
    await wait(300);
    client = await createTestClient(server.port);
    await agentWriteMd(server.port, '# Hello World');
    await pollUntil(() => client.ytext.toString().includes('Hello World'), 5000);
    expect(client.ytext.toString()).toContain('Hello World');
    assertBridgeInvariant(client.ytext, client.fragment);
  });
});

// ─── W1: WYSIWYG (XmlFragment) writes ───

describe('W1: WYSIWYG writes', () => {
  let client: TestClient;

  beforeEach(async () => {
    await testReset(server.port);
    await wait(300);
    client = await createTestClient(server.port);
  });

  afterEach(() => {
    client?.cleanup();
  });

  test('W1→Y.Text: local XmlFragment edit propagates to Y.Text via Observer A', async () => {
    applyMarkdownToFragment(client, '# WYSIWYG Heading\n\nSome paragraph content.');
    await wait(500);
    expect(client.ytext.toString()).toContain('WYSIWYG Heading');
    expect(client.ytext.toString()).toContain('Some paragraph content');
    assertBridgeInvariant(client.ytext, client.fragment);
  });

  test('W1→Disk: local XmlFragment edit persists to .md file', async () => {
    applyMarkdownToFragment(client, '# Disk Test\n\nThis should persist.');
    await pollUntil(() => readTestDoc(server.contentDir).includes('Disk Test'), 5000);
    const diskContent = readTestDoc(server.contentDir);
    expect(diskContent).toContain('Disk Test');
    expect(diskContent).toContain('This should persist');
    assertBridgeInvariant(client.ytext, client.fragment);
  });
});

// ─── W2: Source mode (Y.Text) writes ───

describe('W2: source mode writes', () => {
  let client: TestClient;

  beforeEach(async () => {
    await testReset(server.port);
    await wait(300);
    client = await createTestClient(server.port);
  });

  afterEach(() => {
    client?.cleanup();
  });

  test('W2→XmlFragment: local Y.Text edit propagates to XmlFragment via Observer B', async () => {
    client.doc.transact(() => {
      client.ytext.insert(0, '# Source Heading\n\nTyped in source mode.');
    });
    await wait(500);
    const fragContent = serializeFragment(client.fragment);
    expect(fragContent).toContain('Source Heading');
    expect(fragContent).toContain('Typed in source mode');
    assertBridgeInvariant(client.ytext, client.fragment);
  });

  test('W2→Disk: local Y.Text edit persists to .md file', async () => {
    client.doc.transact(() => {
      client.ytext.insert(0, '# Source Disk\n\nShould reach disk.');
    });
    await pollUntil(() => readTestDoc(server.contentDir).includes('Source Disk'), 5000);
    const diskContent = readTestDoc(server.contentDir);
    expect(diskContent).toContain('Source Disk');
    assertBridgeInvariant(client.ytext, client.fragment);
  });
});

// ─── W3: Agent writes (via API) ───

describe('W3: agent writes', () => {
  let client: TestClient;

  beforeEach(async () => {
    await testReset(server.port);
    await wait(300);
    client = await createTestClient(server.port);
  });

  afterEach(() => {
    client?.cleanup();
  });

  test('W3→Y.Text: agent-write-md propagates to client Y.Text', async () => {
    await agentWriteMd(server.port, '# Agent Heading\n\nAgent wrote this.');
    await wait(500);
    expect(client.ytext.toString()).toContain('Agent Heading');
    expect(client.ytext.toString()).toContain('Agent wrote this');
    assertBridgeInvariant(client.ytext, client.fragment);
  });

  test('W3→XmlFragment: agent-write-md propagates to client XmlFragment', async () => {
    await agentWriteMd(server.port, '# Agent Fragment\n\nVisible in WYSIWYG.');
    await wait(500);
    const fragContent = serializeFragment(client.fragment);
    expect(fragContent).toContain('Agent Fragment');
    expect(fragContent).toContain('Visible in WYSIWYG');
    assertBridgeInvariant(client.ytext, client.fragment);
  });

  test('W3→Disk: agent-write-md persists to .md file', async () => {
    await agentWriteMd(server.port, '# Agent Disk\n\nPersisted by agent.');
    await pollUntil(() => readTestDoc(server.contentDir).includes('Agent Disk'), 5000);
    const diskContent = readTestDoc(server.contentDir);
    expect(diskContent).toContain('Agent Disk');
    expect(diskContent).toContain('Persisted by agent');
    assertBridgeInvariant(client.ytext, client.fragment);
  });
});

// ─── W4: Disk writes (file watcher) ───

describe('W4: disk writes', () => {
  let client: TestClient;

  beforeEach(async () => {
    await testReset(server.port);
    await wait(300);
    client = await createTestClient(server.port);
  });

  afterEach(() => {
    client?.cleanup();
  });

  test('W4→Y.Text: disk file change propagates to client Y.Text', async () => {
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
  });

  test('W4→XmlFragment: disk file change propagates to client XmlFragment', async () => {
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
  });
});

// ─── Undo / Redo ───

describe('undo / redo', () => {
  let client: TestClient;

  beforeEach(async () => {
    await testReset(server.port);
    await wait(300);
    client = await createTestClient(server.port);
  });

  afterEach(() => {
    client?.cleanup();
  });

  test('Undo→Y.Text: agent-undo reverts client Y.Text', async () => {
    await agentWriteMd(server.port, '# Undo Target\n\nThis will be undone.');
    await wait(500);
    expect(client.ytext.toString()).toContain('Undo Target');

    await agentUndo(server.port);
    await wait(500);
    // Explicit check on both surfaces for localized failure diagnosis.
    // assertBridgeInvariant covers this transitively, but direct assertions
    // produce clearer error messages when undo leaves stale content.
    expect(client.ytext.toString()).not.toContain('Undo Target');
    expect(serializeFragment(client.fragment)).not.toContain('Undo Target');
    assertBridgeInvariant(client.ytext, client.fragment);
  });

  test('Undo→XmlFragment: agent-undo reverts client XmlFragment', async () => {
    await agentWriteMd(server.port, '# Undo Fragment\n\nUndone in WYSIWYG.');
    await wait(500);
    expect(serializeFragment(client.fragment)).toContain('Undo Fragment');

    await agentUndo(server.port);
    await wait(500);
    // Explicit check on both surfaces (see above).
    expect(serializeFragment(client.fragment)).not.toContain('Undo Fragment');
    expect(client.ytext.toString()).not.toContain('Undo Fragment');
    assertBridgeInvariant(client.ytext, client.fragment);
  });

  test('Redo→all: agent-redo restores both surfaces', async () => {
    await agentWriteMd(server.port, '# Redo Target\n\nRedo restores this.');
    await wait(500);
    expect(client.ytext.toString()).toContain('Redo Target');

    await agentUndo(server.port);
    await wait(500);
    expect(client.ytext.toString()).not.toContain('Redo Target');

    await agentRedo(server.port);
    await wait(500);
    expect(client.ytext.toString()).toContain('Redo Target');
    expect(serializeFragment(client.fragment)).toContain('Redo Target');
    assertBridgeInvariant(client.ytext, client.fragment);
  });
});

// ─── Initial sync + test reset ───

describe('initial sync and test isolation', () => {
  test('initial sync: server with existing .md file populates client', async () => {
    // Reset to clear any state, then write file content
    await testReset(server.port);
    await wait(300);
    writeFileSync(
      join(server.contentDir, 'test-doc.md'),
      '# Pre-existing\n\nAlready on disk.',
      'utf-8',
    );

    // Connect client — onLoadDocument should populate XmlFragment from disk,
    // which syncs to client, where Observer A populates Y.Text
    const client = await createTestClient(server.port);
    try {
      await pollUntil(() => client.ytext.toString().includes('Pre-existing'), 5000);
      expect(client.ytext.toString()).toContain('Already on disk');
      assertBridgeInvariant(client.ytext, client.fragment);
    } finally {
      client.cleanup();
    }
  });

  test('test-reset isolates state between tests', async () => {
    // Write some content
    const client1 = await createTestClient(server.port);
    await agentWriteMd(server.port, '# Stale Content\n\nShould be gone after reset.');
    await wait(500);
    expect(client1.ytext.toString()).toContain('Stale Content');
    client1.cleanup();

    // Reset
    await testReset(server.port);
    await wait(300);

    // Connect new client — should start fresh
    const client2 = await createTestClient(server.port);
    try {
      await wait(300);
      expect(client2.ytext.toString()).not.toContain('Stale Content');
    } finally {
      client2.cleanup();
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
    clientA = await createTestClient(server.port);
    clientB = await createTestClient(server.port);
  });

  afterEach(async () => {
    clientA?.cleanup();
    clientB?.cleanup();
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
    await wait(400);

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

    await wait(400);
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
});
