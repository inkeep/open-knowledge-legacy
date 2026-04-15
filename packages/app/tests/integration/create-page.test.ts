/**
 * Integration tests for `POST /api/create-page` covering the new-file/new-folder
 * sidebar flows.
 *
 * Spins up a real Hocuspocus server via createTestServer (random port,
 * tmp contentDir, debounce=200ms). Every case below uses raw `fetch` against
 * the server exactly as NewItemDialog does in the browser.
 *
 * Scenarios covered:
 *   - QA-001/003 — simple file creation
 *   - QA-002     — composite folder create (kind='folder' flow)
 *   - QA-008     — 409 EEXIST surfaces with structured error body
 *   - QA-009     — server rejects ".." / leading-/ / backslash / null-byte
 *   - QA-010     — reserved __system__ name rejected with 400
 *   - QA-012     — mkdirSync recursive for deep, not-yet-existing folder paths
 *   - QA-017     — `.md` suffix is required (server's hard contract)
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createTestServer, type TestServer } from './test-harness';

let server: TestServer;

beforeAll(async () => {
  server = await createTestServer();
});

afterAll(async () => {
  await server.cleanup();
});

async function createPage(path: string) {
  const res = await fetch(`http://127.0.0.1:${server.port}/api/create-page`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  const body = (await res.json()) as { ok: boolean; docName?: string; error?: string };
  return { status: res.status, body };
}

describe('/api/create-page — simple file', () => {
  test('creates a file at root and returns docName', async () => {
    const { status, body } = await createPage('qa-simple-root.md');
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.docName).toBe('qa-simple-root');
    expect(existsSync(join(server.contentDir, 'qa-simple-root.md'))).toBe(true);
    expect(readFileSync(join(server.contentDir, 'qa-simple-root.md'), 'utf-8')).toBe('');
  });

  test('creates a file in an existing subdirectory', async () => {
    // Create parent via an earlier composite so the directory already exists.
    await createPage('qa-pre/seed.md');
    const { status, body } = await createPage('qa-pre/child.md');
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.docName).toBe('qa-pre/child');
    expect(existsSync(join(server.contentDir, 'qa-pre/child.md'))).toBe(true);
  });
});

describe('/api/create-page — composite folder create (mkdirSync recursive)', () => {
  test('creates a new folder with an initial file in one round-trip', async () => {
    const { status, body } = await createPage('qa-new-folder/index.md');
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.docName).toBe('qa-new-folder/index');
    expect(existsSync(join(server.contentDir, 'qa-new-folder'))).toBe(true);
    expect(existsSync(join(server.contentDir, 'qa-new-folder/index.md'))).toBe(true);
  });

  test('creates deep, multi-level folder path that did not previously exist (QA-012)', async () => {
    const { status, body } = await createPage('deep/nested/folders/that/are/new/home.md');
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.docName).toBe('deep/nested/folders/that/are/new/home');
    expect(existsSync(join(server.contentDir, 'deep/nested/folders/that/are/new/home.md'))).toBe(
      true,
    );
  });
});

describe('/api/create-page — 409 EEXIST (QA-008)', () => {
  test('second create at the same path returns 409 with structured error', async () => {
    const path = 'qa-conflict.md';
    const first = await createPage(path);
    expect(first.status).toBe(200);
    expect(first.body.ok).toBe(true);

    const second = await createPage(path);
    expect(second.status).toBe(409);
    expect(second.body.ok).toBe(false);
    expect(second.body.error).toMatch(/already exists/i);
  });
});

describe('/api/create-page — path rejection (QA-009)', () => {
  test('rejects ".." traversal', async () => {
    const { status, body } = await createPage('docs/../escape.md');
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/\.\.|escape/i);
  });

  test('rejects leading /', async () => {
    const { status, body } = await createPage('/etc/passwd.md');
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
  });

  test('rejects backslashes', async () => {
    const { status, body } = await createPage('docs\\winpath.md');
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
  });

  test('rejects null byte', async () => {
    const { status, body } = await createPage('docs/\0nul.md');
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
  });

  test('rejects missing .md extension', async () => {
    const { status, body } = await createPage('no-extension');
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/\.md/i);
  });
});

describe('/api/create-page — reserved name (QA-010)', () => {
  test('rejects __system__ with 400', async () => {
    const { status, body } = await createPage('__system__.md');
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/reserved/i);
  });
});
