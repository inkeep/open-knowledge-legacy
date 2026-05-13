import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DocumentListSuccessSchema } from '@inkeep/open-knowledge-core';
import { createTestServer, type TestServer, wait } from './test-harness';

describe('/api/documents empty folder — boot-time', () => {
  let server: TestServer;

  beforeAll(async () => {
    const contentDir = realpathSync(mkdtempSync(join(tmpdir(), 'ok-empty-folder-boot-')));
    writeFileSync(join(contentDir, 'readme.md'), '# Root\n', 'utf-8');
    mkdirSync(join(contentDir, 'empty-folder'), { recursive: true });
    mkdirSync(join(contentDir, 'nested', 'empty-child'), { recursive: true });
    server = await createTestServer({ contentDir, keepContentDir: false });
  });

  afterAll(async () => {
    await server.cleanup();
  });

  test('returns empty subfolder created before server start', async () => {
    const res = await fetch(`http://localhost:${server.port}/api/documents`);
    expect(res.ok).toBe(true);
    const body = DocumentListSuccessSchema.parse(await res.json());
    const folders = body.documents.filter((e) => e.kind === 'folder');
    const folderPaths = folders.map((e) => e.path);
    expect(folderPaths).toContain('empty-folder');
  });

  test('returns nested empty folder hierarchy created before server start', async () => {
    const res = await fetch(`http://localhost:${server.port}/api/documents`);
    expect(res.ok).toBe(true);
    const body = DocumentListSuccessSchema.parse(await res.json());
    const folderPaths = body.documents.filter((e) => e.kind === 'folder').map((e) => e.path);
    expect(folderPaths).toContain('nested');
    expect(folderPaths).toContain('nested/empty-child');
  });
});

describe('/api/documents empty folder — live creation', () => {
  let server: TestServer;

  beforeAll(async () => {
    const contentDir = realpathSync(mkdtempSync(join(tmpdir(), 'ok-empty-folder-live-')));
    writeFileSync(join(contentDir, 'readme.md'), '# Root\n', 'utf-8');
    server = await createTestServer({ contentDir, keepContentDir: false });
  });

  afterAll(async () => {
    await server.cleanup();
  });

  test('detects empty folder created externally after server start', async () => {
    mkdirSync(join(server.contentDir, 'live-empty'));

    const deadline = Date.now() + 10_000;
    let found = false;
    while (Date.now() < deadline) {
      const res = await fetch(`http://localhost:${server.port}/api/documents`).catch(() => null);
      if (res?.ok) {
        const body = DocumentListSuccessSchema.parse(await res.json());
        if (body.documents.some((e) => e.kind === 'folder' && e.path === 'live-empty')) {
          found = true;
          break;
        }
      }
      await wait(100);
    }

    expect(found).toBe(true);
  });

  test('detects deeply-nested empty folder hierarchy created with mkdir -p', async () => {
    mkdirSync(join(server.contentDir, 'deep', 'nested', 'empty'), { recursive: true });

    const deadline = Date.now() + 10_000;
    let deepFound = false;
    while (Date.now() < deadline) {
      const res = await fetch(`http://localhost:${server.port}/api/documents`).catch(() => null);
      if (res?.ok) {
        const body = DocumentListSuccessSchema.parse(await res.json());
        const folderPaths = body.documents
          .filter((e) => e.kind === 'folder')
          .map((e) => e.path ?? '');
        if (
          folderPaths.includes('deep') &&
          folderPaths.includes('deep/nested') &&
          folderPaths.includes('deep/nested/empty')
        ) {
          deepFound = true;
          break;
        }
      }
      await wait(100);
    }

    expect(deepFound).toBe(true);
  });
});
