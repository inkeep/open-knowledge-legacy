/**
 * Tests for extractPageTitle — the title extraction logic used by GET /api/pages.
 *
 * Priority: frontmatter `title:` field → first `# heading` line → filename without extension.
 */
import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { createApiExtension, extractPageTitle } from './api-extension.ts';
import type { FileIndexEntry } from './file-watcher.ts';

describe('extractPageTitle', () => {
  test('returns frontmatter title when present', () => {
    const content = '---\ntitle: My Great Page\nauthor: Alice\n---\n\n# Different Heading\n\nBody.';
    expect(extractPageTitle(content, 'my-great-page')).toBe('My Great Page');
  });

  test('trims whitespace from frontmatter title', () => {
    const content = '---\ntitle:   Trimmed Title   \n---\n\nBody.';
    expect(extractPageTitle(content, 'filename')).toBe('Trimmed Title');
  });

  test('falls through to first heading when frontmatter has no title', () => {
    const content = '---\nauthor: Bob\n---\n\n# First Heading\n\nBody.';
    expect(extractPageTitle(content, 'filename')).toBe('First Heading');
  });

  test('falls through to heading when no frontmatter', () => {
    const content = '# Just a Heading\n\nBody text here.';
    expect(extractPageTitle(content, 'filename')).toBe('Just a Heading');
  });

  test('falls through to filename when no frontmatter title and no heading', () => {
    const content = 'Just plain text with no heading.';
    expect(extractPageTitle(content, 'my-page')).toBe('my-page');
  });

  test('falls through to filename for empty file', () => {
    expect(extractPageTitle('', 'empty-doc')).toBe('empty-doc');
  });

  test('does not pick up title: in the body (outside frontmatter)', () => {
    const content = 'No frontmatter here.\n\ntitle: This is in the body.\n\n# Real Heading\n';
    expect(extractPageTitle(content, 'filename')).toBe('Real Heading');
  });

  test('handles frontmatter with no closing delimiter gracefully — falls to heading', () => {
    // Malformed frontmatter: no closing ---
    const content = '---\ntitle: Orphaned\n\n# Heading\n\nBody.';
    // No closing ---, so frontmatter is not recognized — falls to heading
    expect(extractPageTitle(content, 'filename')).toBe('Heading');
  });

  test('trims ## and deeper headings — only # heading used', () => {
    const content = '## Second Level\n\n### Third Level\n\nBody.';
    // No # heading, falls to filename
    expect(extractPageTitle(content, 'filename')).toBe('filename');
  });

  test('picks up # heading that follows frontmatter', () => {
    const content = '---\ndate: 2026-01-01\n---\n\n# Actual Title\n\nContent.';
    expect(extractPageTitle(content, 'filename')).toBe('Actual Title');
  });

  test('strips double quotes from frontmatter title', () => {
    const content = '---\ntitle: "Quoted: Title"\n---\n\nBody.';
    expect(extractPageTitle(content, 'filename')).toBe('Quoted: Title');
  });

  test('strips single quotes from frontmatter title', () => {
    const content = "---\ntitle: 'Single Quoted'\n---\n\nBody.";
    expect(extractPageTitle(content, 'filename')).toBe('Single Quoted');
  });

  test('does not strip mismatched quotes from frontmatter title', () => {
    const content = '---\ntitle: "Mismatched\'\n---\n\nBody.';
    expect(extractPageTitle(content, 'filename')).toBe('"Mismatched\'');
  });
});

function makeReq(method: string): IncomingMessage {
  const readable = Readable.from(Buffer.from('')) as unknown as IncomingMessage;
  readable.method = method;
  readable.url = '/api/pages';
  readable.headers = { host: 'localhost' };
  return readable;
}

interface CapturedResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

function makeRes(): { res: ServerResponse; captured: CapturedResponse } {
  const captured: CapturedResponse = { status: 0, headers: {}, body: '' };
  const res = {
    writeHead(status: number, headers?: Record<string, string>) {
      captured.status = status;
      if (headers) Object.assign(captured.headers, headers);
    },
    end(body?: string) {
      captured.body = body ?? '';
    },
  } as unknown as ServerResponse;
  return { res, captured };
}

function buildFileIndex(dir: string, base = ''): ReadonlyMap<string, FileIndexEntry> {
  const index = new Map<string, FileIndexEntry>();
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      for (const [k, v] of buildFileIndex(join(dir, entry.name), rel)) {
        index.set(k, v);
      }
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      const st = statSync(join(dir, entry.name));
      index.set(rel.slice(0, -3), { size: st.size, modified: st.mtime.toISOString() });
    }
  }
  return index;
}

async function callPages(contentDir: string, method = 'GET'): Promise<CapturedResponse> {
  const fileIndex = buildFileIndex(contentDir);
  const ext = createApiExtension({
    hocuspocus: {} as unknown as Parameters<typeof createApiExtension>[0]['hocuspocus'],
    sessionManager: {} as unknown as Parameters<typeof createApiExtension>[0]['sessionManager'],
    contentDir,
    getFileIndex: () => fileIndex,
  });
  const req = makeReq(method);
  const { res, captured } = makeRes();
  await (
    ext as {
      onRequest: (ctx: { request: IncomingMessage; response: ServerResponse }) => Promise<void>;
    }
  ).onRequest({ request: req, response: res });
  return captured;
}

describe('GET /api/pages', () => {
  test('returns ok: true and lists markdown files recursively', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ok-pages-'));
    try {
      writeFileSync(join(dir, 'root.md'), '# Root\n', 'utf-8');
      mkdirSync(join(dir, 'nested/deeper'), { recursive: true });
      writeFileSync(join(dir, 'nested/deeper/page.md'), '# Nested Page\n', 'utf-8');

      const result = await callPages(dir);

      expect(result.status).toBe(200);
      const body = JSON.parse(result.body) as {
        ok?: boolean;
        pages?: Array<{ docName: string; title: string }>;
      };
      expect(body.ok).toBe(true);
      expect(body.pages).toEqual([
        { docName: 'nested/deeper/page', title: 'Nested Page' },
        { docName: 'root', title: 'Root' },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('returns JSON 405 envelope for unsupported methods', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ok-pages-'));
    try {
      const result = await callPages(dir, 'POST');

      expect(result.status).toBe(405);
      const body = JSON.parse(result.body) as Record<string, unknown>;
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Method not allowed');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
