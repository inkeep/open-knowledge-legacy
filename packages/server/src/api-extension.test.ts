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

  test('D-M accept-all: spoofed MIME no longer rejects, file is stored under sanitized name', async () => {
    // Pre-D-M behavior rejected with "Unsupported file type". Under D-M
    // accept-all (SPEC §10), any file under maxBytes is accepted; only
    // the SVG <img>-only routing relies on a successful magic-byte sniff
    // (NFR-3 LOAD-BEARING). The "exe spoofed as .png" test now confirms
    // accept-all + storage; the security posture flips to render-time:
    // unrecognized types serve as opaque blobs, never inline-executed.
    const exeBuffer = Buffer.from('MZexecutable content here');
    const res = await uploadImage(exeBuffer, 'malicious.png', 'docs/guide.md');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; src: string; deduped: boolean };
    expect(body.ok).toBe(true);
    expect(body.src).toBe('malicious.png');
    expect(body.deduped).toBe(false);
  });

  test('SVG accepted with image/svg+xml', async () => {
    const res = await uploadImage(createSvgBuffer(), 'diagram.svg', 'docs/guide.md');
    const body = (await res.json()) as { ok: boolean; src: string };
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.src).toBe('diagram.svg');
  });

  test('numeric suffix collision handling — distinct bytes, same filename', async () => {
    // Pre-seed a file with DIFFERENT bytes than the upload so dedup misses
    // and the collision-suffix loop produces screenshot-1.png. Under
    // pre-FR-2 behavior this fired even with identical bytes; post-FR-2
    // identical-bytes dedup wins (covered separately in the dedup describe).
    writeFileSync(join(contentDir, 'docs', 'screenshot.png'), Buffer.from('different bytes'));
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

  test('FR-8: /api/upload (new primary endpoint) accepts the same payload', async () => {
    const formData = new FormData();
    formData.append('parentDocName', 'docs/guide.md');
    formData.append('file', new Blob([createPngBuffer()]), 'screenshot.png');
    const res = await fetch(`http://localhost:${port}/api/upload`, {
      method: 'POST',
      body: formData,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; src: string; deduped: boolean };
    expect(body.src).toBe('screenshot.png');
    expect(body.deduped).toBe(false);
    expect(existsSync(join(contentDir, 'docs', 'screenshot.png'))).toBe(true);
  });

  test('D-M: PDF accepts and stores under sanitized name', async () => {
    // PDF magic bytes start with %PDF-1.x.
    const pdfBuffer = Buffer.from('%PDF-1.4\n%fake pdf content for test');
    const formData = new FormData();
    formData.append('parentDocName', 'docs/guide.md');
    formData.append('file', new Blob([pdfBuffer]), 'draft.pdf');
    const res = await fetch(`http://localhost:${port}/api/upload`, {
      method: 'POST',
      body: formData,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; src: string };
    expect(body.src).toBe('draft.pdf');
    expect(existsSync(join(contentDir, 'docs', 'draft.pdf'))).toBe(true);
  });

  test('D-M: non-sniffable text file (CSV) accepts under client filename', async () => {
    // CSV has no magic bytes — `file-type` returns undefined. SVG fallback
    // does not match. Pre-D-M this rejected with "Unsupported file type";
    // post-D-M the file lands on disk and emit-shape dispatch decides
    // (markdown-link in the client per FR-1a).
    const csvBuffer = Buffer.from('a,b,c\n1,2,3\n', 'utf-8');
    const formData = new FormData();
    formData.append('parentDocName', 'docs/guide.md');
    formData.append('file', new Blob([csvBuffer]), 'data.csv');
    const res = await fetch(`http://localhost:${port}/api/upload`, {
      method: 'POST',
      body: formData,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; src: string };
    expect(body.src).toBe('data.csv');
    expect(existsSync(join(contentDir, 'docs', 'data.csv'))).toBe(true);
  });

  test('FR-8 deprecation shim: /api/upload-image still works', async () => {
    // The old endpoint forwards to the same handler — clients already in
    // the field continue to function during the one-release shim window.
    const res = await uploadImage(createPngBuffer(), 'screenshot.png', 'docs/guide.md');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; src: string; deduped: boolean };
    expect(body.deduped).toBe(false);
    expect(body.src).toBe('screenshot.png');
  });

  test('NFR-3: SVG extension-fallback preserved — sniff returns image/svg+xml', async () => {
    const res = await uploadImage(createSvgBuffer(), 'diagram.svg', 'docs/guide.md');
    expect(res.status).toBe(200);
    expect(existsSync(join(contentDir, 'docs', 'diagram.svg'))).toBe(true);
  });

  test('response shape always carries the deduped flag (US-006 forward-compat)', async () => {
    const res = await uploadImage(createPngBuffer(), 'shot.png', 'docs/guide.md');
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toHaveProperty('deduped');
    expect(body.deduped).toBe(false);
  });
});

describe('handleUploadImage — config-driven maxBytes (FR-5)', () => {
  let tmpDir: string;
  let contentDir: string;
  let server: import('node:http').Server;
  let port: number;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'upload-maxbytes-'));
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
      // Set an artificially small cap so a 200-byte payload trips rejection.
      getUploadConfig: () => ({
        attachmentFolderPath: './',
        emitFormat: 'wikiembed',
        maxBytes: 100,
        dedup: { mode: 'same-dir', ui: 'toast' },
        wikiEmbedExtensions: ['png'],
      }),
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

  test('over-cap upload rejected with byte-size-specific message', async () => {
    // 250-byte buffer against a 100-byte cap.
    const big = Buffer.alloc(250, 0x42);
    const formData = new FormData();
    formData.append('parentDocName', 'docs/guide.md');
    formData.append('file', new Blob([big]), 'big.bin');
    const res = await fetch(`http://localhost:${port}/api/upload`, {
      method: 'POST',
      body: formData,
    });
    expect(res.status).toBe(413);
    const body = (await res.json()) as {
      ok: boolean;
      error: string;
      message: string;
      maxBytes: number;
    };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('maxBytes');
    expect(body.maxBytes).toBe(100);
    // Message must name the configured limit explicitly (P1.3 — no generic
    // "too large" phrase).
    expect(body.message).toContain('100');
  });

  test('under-cap upload still works with custom config', async () => {
    const tiny = Buffer.from('tiny');
    const formData = new FormData();
    formData.append('parentDocName', 'docs/guide.md');
    formData.append('file', new Blob([tiny]), 'tiny.txt');
    const res = await fetch(`http://localhost:${port}/api/upload`, {
      method: 'POST',
      body: formData,
    });
    expect(res.status).toBe(200);
  });
});

describe('handleUploadImage — same-dir sha256 dedup (FR-2)', () => {
  let tmpDir: string;
  let contentDir: string;
  let server: import('node:http').Server;
  let port: number;
  let dedupMode: 'off' | 'same-dir' = 'same-dir';

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'upload-dedup-'));
    contentDir = join(tmpDir, 'content');
    mkdirSync(contentDir, { recursive: true });
    mkdirSync(join(contentDir, 'docs'), { recursive: true });
    mkdirSync(join(contentDir, 'archive'), { recursive: true });
    writeFileSync(join(contentDir, 'docs', 'guide.md'), '# Guide');
    writeFileSync(join(contentDir, 'archive', 'old.md'), '# Old');

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
      getUploadConfig: () => ({
        attachmentFolderPath: './',
        emitFormat: 'wikiembed',
        maxBytes: 25 * 1024 * 1024,
        // The mode is read per-request, so flipping the closure variable
        // between tests is enough to exercise both branches.
        dedup: { mode: dedupMode, ui: 'toast' },
        wikiEmbedExtensions: ['png', 'jpg'],
      }),
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
    dedupMode = 'same-dir';
    await new Promise<void>((res) => server.close(() => res()));
    await rm(tmpDir, { recursive: true, force: true });
  });

  function pngFixture(): Buffer {
    return Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAABJRElEQrkJggg==',
      'base64',
    );
  }

  async function postUpload(buf: Buffer, filename: string, parent: string): Promise<Response> {
    const formData = new FormData();
    formData.append('parentDocName', parent);
    formData.append('file', new Blob([buf]), filename);
    return fetch(`http://localhost:${port}/api/upload`, { method: 'POST', body: formData });
  }

  test('second upload of identical bytes into same dir → deduped:true, single file on disk', async () => {
    const buf = pngFixture();
    const first = (await (await postUpload(buf, 'shot.png', 'docs/guide.md')).json()) as {
      ok: boolean;
      src: string;
      deduped: boolean;
    };
    expect(first.deduped).toBe(false);
    expect(first.src).toBe('shot.png');
    expect(existsSync(join(contentDir, 'docs', 'shot.png'))).toBe(true);

    const second = (await (await postUpload(buf, 'shot.png', 'docs/guide.md')).json()) as {
      ok: boolean;
      src: string;
      deduped: boolean;
    };
    expect(second.deduped).toBe(true);
    expect(second.src).toBe('shot.png');

    // Disk still has exactly one file in docs/
    expect(existsSync(join(contentDir, 'docs', 'shot.png'))).toBe(true);
    expect(existsSync(join(contentDir, 'docs', 'shot-1.png'))).toBe(false);
  });

  test('dedup matches across rename — second drop with a different filename returns the existing basename', async () => {
    const buf = pngFixture();
    await postUpload(buf, 'shot.png', 'docs/guide.md');
    const second = (await (
      await postUpload(buf, 'completely-different.png', 'docs/guide.md')
    ).json()) as {
      ok: boolean;
      src: string;
      deduped: boolean;
    };
    // Dedup is content-keyed, so second's src is the original existing basename.
    expect(second.deduped).toBe(true);
    expect(second.src).toBe('shot.png');
  });

  test('cross-dir upload with same bytes does NOT dedup (D-D / FR-2 same-dir scope)', async () => {
    const buf = pngFixture();
    const inDocs = (await (await postUpload(buf, 'shot.png', 'docs/guide.md')).json()) as {
      ok: boolean;
      src: string;
      deduped: boolean;
    };
    const inArchive = (await (await postUpload(buf, 'shot.png', 'archive/old.md')).json()) as {
      ok: boolean;
      src: string;
      deduped: boolean;
    };
    expect(inDocs.deduped).toBe(false);
    expect(inArchive.deduped).toBe(false);
    // Both files exist on disk — same bytes, separate paths.
    expect(existsSync(join(contentDir, 'docs', 'shot.png'))).toBe(true);
    expect(existsSync(join(contentDir, 'archive', 'shot.png'))).toBe(true);
  });

  test('upload.dedup.mode = "off" disables the dedup scan', async () => {
    dedupMode = 'off';
    const buf = pngFixture();
    const first = (await (await postUpload(buf, 'shot.png', 'docs/guide.md')).json()) as {
      ok: boolean;
      src: string;
      deduped: boolean;
    };
    const second = (await (await postUpload(buf, 'shot.png', 'docs/guide.md')).json()) as {
      ok: boolean;
      src: string;
      deduped: boolean;
    };
    expect(first.src).toBe('shot.png');
    expect(second.deduped).toBe(false);
    // Without dedup, the collision-suffix loop produces shot-1.png.
    expect(second.src).toBe('shot-1.png');
    expect(existsSync(join(contentDir, 'docs', 'shot.png'))).toBe(true);
    expect(existsSync(join(contentDir, 'docs', 'shot-1.png'))).toBe(true);
  });

  test('dedup ignores non-asset files (markdown sibling does not trigger a hash hit)', async () => {
    // Pre-seed a markdown file that hashes to anything; the dedup scanner
    // must skip it because .md is not in ASSET_EXTENSIONS.
    writeFileSync(join(contentDir, 'docs', 'sibling.md'), 'irrelevant');
    const buf = pngFixture();
    const res = (await (await postUpload(buf, 'shot.png', 'docs/guide.md')).json()) as {
      ok: boolean;
      src: string;
      deduped: boolean;
    };
    expect(res.deduped).toBe(false);
  });
});
