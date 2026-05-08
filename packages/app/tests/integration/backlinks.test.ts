import { test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { createTestClient, createTestServer, pollUntil } from './test-harness';

test('backlink endpoints update after persisted agent writes', async () => {
  const server = await createTestServer();

  try {
    const alpha = await fetch(`http://localhost:${server.port}/api/agent-write-md`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        docName: 'alpha',
        markdown: '# Alpha\n\nLinks to [[beta]].\n',
        position: 'replace',
      }),
    });
    if (!alpha.ok) throw new Error(`alpha write failed: ${alpha.status}`);

    const beta = await fetch(`http://localhost:${server.port}/api/agent-write-md`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        docName: 'beta',
        markdown: '# Beta\n\nBody.\n',
        position: 'replace',
      }),
    });
    if (!beta.ok) throw new Error(`beta write failed: ${beta.status}`);

    await pollUntil(async () => {
      const res = await fetch(`http://localhost:${server.port}/api/backlinks?docName=beta`);
      const data = (await res.json()) as {
        ok: boolean;
        backlinks?: Array<{ source: string; snippet: string | null }>;
      };
      return (
        data.ok &&
        Array.isArray(data.backlinks) &&
        data.backlinks.some(
          (entry) => entry.source === 'alpha' && entry.snippet === 'Links to beta.',
        )
      );
    });
  } finally {
    await server.cleanup();
  }
});

test('backlink endpoints update from live client edits before persistence debounce', async () => {
  const server = await createTestServer({ debounce: 1500, maxDebounce: 2000 });
  const client = await createTestClient(server.port, 'alpha');
  const startedAt = Date.now();

  try {
    client.ytext.insert(0, '# Alpha\n\nLinks to [[beta]].\n');

    await pollUntil(
      async () => {
        const res = await fetch(`http://localhost:${server.port}/api/backlinks?docName=beta`);
        const data = (await res.json()) as {
          ok: boolean;
          backlinks?: Array<{ source: string; snippet: string | null }>;
        };
        return (
          data.ok &&
          Array.isArray(data.backlinks) &&
          data.backlinks.some(
            (entry) => entry.source === 'alpha' && entry.snippet === 'Links to beta.',
          )
        );
      },
      900,
      50,
    );

    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs >= 1500) {
      throw new Error(
        `backlinks only updated after ${elapsedMs}ms, expected before store debounce`,
      );
    }
  } finally {
    await client.cleanup();
    await server.cleanup();
  }
});

test('backlink endpoints update after external disk edits', async () => {
  const server = await createTestServer();

  try {
    writeFileSync(join(server.contentDir, 'beta.md'), '# Beta\n\nBody.\n', 'utf-8');
    writeFileSync(
      join(server.contentDir, 'gamma.md'),
      '# Gamma\n\nReferences [[beta]].\n',
      'utf-8',
    );

    await wait(600);

    await pollUntil(async () => {
      const res = await fetch(`http://localhost:${server.port}/api/backlinks?docName=beta`);
      const data = (await res.json()) as {
        ok: boolean;
        backlinks?: Array<{ source: string }>;
      };
      return (
        data.ok &&
        Array.isArray(data.backlinks) &&
        data.backlinks.some((entry) => entry.source === 'gamma')
      );
    });
  } finally {
    await server.cleanup();
  }
});
