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

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { updateYFragment } from '@tiptap/y-tiptap';

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
      await wait(500);
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
      await wait(500);
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
      await wait(500);
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
      await wait(500);
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
      await wait(500);
      expect(client.ytext.toString()).toContain('Undo Target');

      await agentUndo(server.port, client.docName);
      await wait(500);
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
      await wait(500);
      expect(serializeFragment(client.fragment)).toContain('Undo Fragment');

      await agentUndo(server.port, client.docName);
      await wait(500);
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
      await wait(500);
      expect(client.ytext.toString()).toContain('Redo Target');

      await agentUndo(server.port, client.docName);
      await wait(500);
      expect(client.ytext.toString()).not.toContain('Redo Target');

      await agentRedo(server.port, client.docName);
      await wait(500);
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
