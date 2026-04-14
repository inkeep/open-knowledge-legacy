/**
 * Integration test: `.mdx` file extension is first-class end-to-end.
 *
 * Proves the extension-aware path resolver (packages/server/src/doc-extensions.ts)
 * flows through the file watcher, content filter, persistence, and API layers.
 *
 * Regression safeguard: without the extension-aware plumbing, a `.mdx` file
 * would be invisible to the watcher, and a write-back would create a sibling
 * `.md` file instead of updating the `.mdx` source.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  agentWriteMd,
  createTestClient,
  createTestServer,
  pollUntil,
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

describe('.mdx extension end-to-end', () => {
  test('watcher picks up a .mdx file and CRDT mirrors its content', async () => {
    const docName = `mdx-read-${crypto.randomUUID()}`;
    const filePath = join(server.contentDir, `${docName}.mdx`);
    writeFileSync(filePath, '# Hello from MDX\n\nInitial MDX content.\n', 'utf-8');
    // Give the watcher a moment to notice the new file.
    await wait(500);

    const client = await createTestClient(server.port, docName);
    try {
      await pollUntil(() => client.ytext.toString().includes('Hello from MDX'), 5000);
      expect(client.ytext.toString()).toContain('Initial MDX content');
    } finally {
      await client.cleanup();
    }
  });

  test('agent write to a .mdx-backed docName writes back to the .mdx file', async () => {
    const docName = `mdx-writeback-${crypto.randomUUID()}`;
    const mdxPath = join(server.contentDir, `${docName}.mdx`);
    const mdPath = join(server.contentDir, `${docName}.md`);
    writeFileSync(mdxPath, '# Seed\n', 'utf-8');
    await wait(500);

    const client = await createTestClient(server.port, docName);
    try {
      await pollUntil(() => client.ytext.toString().includes('Seed'), 5000);

      await agentWriteMd(server.port, '\n\nAppended by agent.\n', {
        docName,
        position: 'append',
      });

      // Allow L1 debounce (200ms in tests) to fire and persist to disk.
      await wait(800);

      const mdxAfter = readFileSync(mdxPath, 'utf-8');
      expect(mdxAfter).toContain('Appended by agent');
      // Critical invariant: no shadow .md file should be created.
      expect(existsSync(mdPath)).toBe(false);
    } finally {
      await client.cleanup();
    }
  });
});
