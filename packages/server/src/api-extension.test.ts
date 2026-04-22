import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { safeSubdir, sanitizeFilename } from './api-extension.ts';

describe('safeSubdir', () => {
  const baseDir = '/home/user/content';

  test('resolves a valid subdirectory', () => {
    expect(safeSubdir(baseDir, 'notes')).toBe(resolve(baseDir, 'notes'));
  });

  test('resolves nested subdirectories', () => {
    expect(safeSubdir(baseDir, 'notes/meetings')).toBe(resolve(baseDir, 'notes/meetings'));
  });

  test('allows the base directory itself (empty string)', () => {
    expect(safeSubdir(baseDir, '')).toBe(baseDir);
  });

  test('allows "." as the subdirectory', () => {
    expect(safeSubdir(baseDir, '.')).toBe(baseDir);
  });

  test('rejects path traversal with ..', () => {
    expect(() => safeSubdir(baseDir, '..')).toThrow('Invalid directory');
  });

  test('rejects path traversal with ../sibling', () => {
    expect(() => safeSubdir(baseDir, '../etc')).toThrow('Invalid directory');
  });

  test('rejects traversal via nested ../..', () => {
    expect(() => safeSubdir(baseDir, 'sub/../../..')).toThrow('Invalid directory');
  });

  test('rejects absolute paths outside base', () => {
    expect(() => safeSubdir(baseDir, '/etc/passwd')).toThrow('Invalid directory');
  });
});

describe('sanitizeFilename', () => {
  test('strips path separators', () => {
    expect(sanitizeFilename('foo/bar.png')).toBe('foobar.png');
    expect(sanitizeFilename('foo\\bar.png')).toBe('foobar.png');
  });

  test('preserves whitelisted characters (space, dot, dash, underscore)', () => {
    // Space is whitelisted per FR-5 unicode-preserving sanitization — the
    // sanitized "my file _1_.png" is filesystem-safe and matches the macOS
    // Finder/Obsidian ergonomic that users expect.
    expect(sanitizeFilename('my file (1).png')).toBe('my file _1_.png');
  });

  test('preserves simple alphanumeric names byte-identical', () => {
    expect(sanitizeFilename('screenshot-2024.png')).toBe('screenshot-2024.png');
  });

  test('falls back to "upload" for truly empty name', () => {
    expect(sanitizeFilename('')).toBe('upload');
  });

  test('CJK (Japanese) characters preserved', () => {
    expect(sanitizeFilename('会議メモ.pdf')).toBe('会議メモ.pdf');
  });

  test('CJK (Chinese) characters preserved', () => {
    expect(sanitizeFilename('文件.docx')).toBe('文件.docx');
  });

  test('CJK (Korean) characters preserved', () => {
    expect(sanitizeFilename('문서.pdf')).toBe('문서.pdf');
  });

  test('Arabic characters preserved', () => {
    expect(sanitizeFilename('قصة.pdf')).toBe('قصة.pdf');
  });

  test('Cyrillic characters preserved', () => {
    expect(sanitizeFilename('Проект.docx')).toBe('Проект.docx');
  });

  test('emoji preserved — Finder/macOS ergonomics', () => {
    // Documented behavior: `\p{Extended_Pictographic}` pass through so users
    // who drop 'emoji 🎉.png' get a faithful filename on disk.
    expect(sanitizeFilename('emoji 🎉.png')).toBe('emoji 🎉.png');
  });

  test('combining marks (Vietnamese tone, Devanagari) preserved', () => {
    // `\p{M}` covers combining marks so characters that decompose into
    // base+combining (NFD) do not lose their diacritics.
    expect(sanitizeFilename('ghi chú.pdf')).toBe('ghi chú.pdf');
  });

  test('path-escape attempt ../etc/passwd is flattened — no traversal survives', () => {
    // The `/` and `\` are stripped; the remaining `..etcpasswd` sees its
    // dot-run collapsed and leading dot trimmed → 'etcpasswd'.
    expect(sanitizeFilename('../etc/passwd')).toBe('etcpasswd');
  });

  test('Windows-style path traversal stripped', () => {
    // Backslashes are stripped outright (not replaced with `_`) so the
    // final shape collapses intermediate separators — matches the existing
    // shipped behavior for forward slashes (e.g. `foo/bar.png` → `foobar.png`).
    expect(sanitizeFilename('..\\Windows\\System32\\evil.exe')).toBe('WindowsSystem32evil.exe');
  });

  test('null byte stripped', () => {
    expect(sanitizeFilename('foo\x00bar.png')).toBe('foobar.png');
  });

  test('CRLF stripped', () => {
    expect(sanitizeFilename('foo\r\nbar.png')).toBe('foobar.png');
  });

  test('control characters stripped', () => {
    expect(sanitizeFilename('foo\x01\x02\x1fbar.png')).toBe('foobar.png');
  });

  test('DEL (0x7f) stripped', () => {
    expect(sanitizeFilename('foo\x7fbar.png')).toBe('foobar.png');
  });

  test('hidden file leading dot trimmed', () => {
    expect(sanitizeFilename('.env')).toBe('env');
  });

  test('multiple leading dots trimmed', () => {
    expect(sanitizeFilename('...config')).toBe('config');
  });

  test('trailing dots stripped (Windows portability)', () => {
    expect(sanitizeFilename('foo.png...')).toBe('foo.png');
  });

  test('consecutive underscores collapsed', () => {
    expect(sanitizeFilename('foo!!!bar.png')).toBe('foo_bar.png');
  });

  test('dot-only input falls back to upload', () => {
    expect(sanitizeFilename('...')).toBe('upload');
  });

  test('single dot falls back to upload', () => {
    expect(sanitizeFilename('.')).toBe('upload');
  });

  test('pure unsafe-character input falls back to upload', () => {
    // '!!!' → '___' → '_' → leading underscore trimmed → '' → 'upload'
    expect(sanitizeFilename('!!!')).toBe('upload');
  });

  test('mixed script preserved', () => {
    expect(sanitizeFilename('会議-notes-Проект.pdf')).toBe('会議-notes-Проект.pdf');
  });
});

describe('handleUploadImage', () => {
  let tmpDir: string;
  let contentDir: string;
  let server: import('node:http').Server;
  let port: number;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'upload-test-'));
    contentDir = join(tmpDir, 'content');
    mkdirSync(contentDir, { recursive: true });
    mkdirSync(join(contentDir, 'docs'), { recursive: true });
    writeFileSync(join(contentDir, 'docs', 'guide.md'), '# Guide');

    const { Hocuspocus } = await import('@hocuspocus/server');
    const { AgentSessionManager } = await import('./agent-sessions.ts');
    const { createApiExtension } = await import('./api-extension.ts');

    const hocuspocus = new Hocuspocus({ quiet: true });
    const sessionManager = new AgentSessionManager(hocuspocus);
    const ext = createApiExtension({
      hocuspocus,
      sessionManager,
      contentDir,
      getFileIndex: () => new Map(),
    });

    const { createServer } = await import('node:http');
    server = createServer((req, res) => {
      // biome-ignore lint/suspicious/noExplicitAny: test harness
      hocuspocus.hooks('onRequest', { request: req, response: res } as any).catch(() => {
        if (!res.writableEnded) {
          res.writeHead(500);
          res.end('Error');
        }
      });
    });

    hocuspocus.configuration.extensions.push(ext);

    port = await new Promise<number>((res) => {
      server.listen(0, () => {
        const addr = server.address();
        res(typeof addr === 'object' && addr ? addr.port : 0);
      });
    });
  });

  afterEach(async () => {
    await new Promise<void>((res) => server.close(() => res()));
    await rm(tmpDir, { recursive: true, force: true });
  });

  function createPngBuffer(): Buffer {
    // Minimal valid PNG (1x1 transparent pixel)
    return Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAABJRElEQrkJggg==',
      'base64',
    );
  }

  function createSvgBuffer(): Buffer {
    return Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>',
    );
  }

  async function uploadImage(
    file: Buffer,
    filename: string,
    parentDocName: string,
  ): Promise<Response> {
    const formData = new FormData();
    formData.append('parentDocName', parentDocName);
    formData.append('file', new Blob([file]), filename);
    return fetch(`http://localhost:${port}/api/upload-image`, {
      method: 'POST',
      body: formData,
    });
  }

  test('happy path: sibling upload with parentDocName', async () => {
    const res = await uploadImage(createPngBuffer(), 'screenshot.png', 'docs/guide.md');
    const body = (await res.json()) as { ok: boolean; src: string };
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.src).toBe('screenshot.png');
    expect(existsSync(join(contentDir, 'docs', 'screenshot.png'))).toBe(true);
  });

  test('rejects missing parentDocName', async () => {
    const formData = new FormData();
    formData.append('file', new Blob([createPngBuffer()]), 'test.png');
    const res = await fetch(`http://localhost:${port}/api/upload-image`, {
      method: 'POST',
      body: formData,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('parentDocName is required');
  });

  test('rejects parentDocName with .. traversal', async () => {
    const res = await uploadImage(createPngBuffer(), 'test.png', '../../etc/passwd.md');
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('path-escape');
  });

  test('rejects absolute parentDocName', async () => {
    const res = await uploadImage(createPngBuffer(), 'test.png', '/etc/passwd.md');
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('path-escape');
  });

  test('rejects parentDocName with NUL byte', async () => {
    const res = await uploadImage(createPngBuffer(), 'test.png', 'docs/\x00evil.md');
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('path-escape');
  });

  test('paste timestamp-stem synthesis for generic filename', async () => {
    const res = await uploadImage(createPngBuffer(), 'image.png', 'docs/guide.md');
    const body = (await res.json()) as { ok: boolean; src: string };
    expect(res.status).toBe(200);
    expect(body.src).toMatch(/^pasted-\d{8}-\d{6}\.png$/);
  });

  test('rejects spoofed MIME (exe renamed to .png)', async () => {
    const exeBuffer = Buffer.from('MZexecutable content here');
    const res = await uploadImage(exeBuffer, 'malicious.png', 'docs/guide.md');
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('Unsupported file type');
  });

  test('SVG accepted with image/svg+xml', async () => {
    const res = await uploadImage(createSvgBuffer(), 'diagram.svg', 'docs/guide.md');
    const body = (await res.json()) as { ok: boolean; src: string };
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.src).toBe('diagram.svg');
  });

  test('numeric suffix collision handling', async () => {
    // Write the first file directly
    writeFileSync(join(contentDir, 'docs', 'screenshot.png'), createPngBuffer());
    const res = await uploadImage(createPngBuffer(), 'screenshot.png', 'docs/guide.md');
    const body = (await res.json()) as { ok: boolean; src: string };
    expect(res.status).toBe(200);
    expect(body.src).toBe('screenshot-1.png');
  });

  test('symlink escape rejected', async () => {
    const escapeTarget = join(tmpDir, 'outside');
    mkdirSync(escapeTarget, { recursive: true });
    symlinkSync(escapeTarget, join(contentDir, 'docs', 'escape'));

    const res = await uploadImage(createPngBuffer(), 'test.png', 'docs/escape/x.md');
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('path-escape');
  });
});
