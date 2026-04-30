import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestServer, type TestServer } from './test-harness';

let server: TestServer;

beforeAll(async () => {
  const contentDir = realpathSync(mkdtempSync(join(tmpdir(), 'ok-sidebar-assets-')));
  mkdirSync(join(contentDir, 'docs', 'media'), { recursive: true });
  writeFileSync(
    join(contentDir, 'docs', 'guide.md'),
    [
      '# Guide',
      '',
      '![diagram](./media/diagram.png)',
      '',
      '[linked image](./media/diagram.png)',
      '<img src="/docs/media/root.png" alt="Root referenced asset" />',
      '[remote image](https://example.com/remote.png)',
      '',
    ].join('\n'),
    'utf-8',
  );
  writeFileSync(join(contentDir, 'docs', 'media', 'diagram.png'), 'png bytes');
  writeFileSync(join(contentDir, 'docs', 'media', 'root.png'), 'root png bytes');
  writeFileSync(join(contentDir, 'docs', 'media', 'unreferenced.png'), 'unused bytes');

  server = await createTestServer({ contentDir, keepContentDir: false });
});

afterAll(async () => {
  await server.cleanup();
});

describe('/api/documents sidebar asset rows', () => {
  test('returns referenced local assets as non-document rows', async () => {
    const res = await fetch(`http://localhost:${server.port}/api/documents`);
    expect(res.ok).toBe(true);
    const body = (await res.json()) as {
      ok: boolean;
      documents: Array<{
        kind?: string;
        docName: string;
        path?: string;
        assetExt?: string;
        mediaKind?: string;
        referencedBy?: string[];
      }>;
    };

    const doc = body.documents.find((entry) => entry.docName === 'docs/guide');
    expect(doc?.kind).toBe('document');

    const asset = body.documents.find((entry) => entry.path === 'docs/media/diagram.png');
    expect(asset).toMatchObject({
      kind: 'asset',
      docName: 'docs/media/diagram.png',
      assetExt: '.png',
      mediaKind: 'image',
      referencedBy: ['docs/guide'],
    });

    const rootAsset = body.documents.find((entry) => entry.path === 'docs/media/root.png');
    expect(rootAsset).toMatchObject({
      kind: 'asset',
      docName: 'docs/media/root.png',
      assetExt: '.png',
      mediaKind: 'image',
      referencedBy: ['docs/guide'],
    });

    expect(body.documents.some((entry) => entry.path === 'docs/media/unreferenced.png')).toBe(
      false,
    );
    expect(body.documents.some((entry) => entry.path === 'https://example.com/remote.png')).toBe(
      false,
    );
  });
});
