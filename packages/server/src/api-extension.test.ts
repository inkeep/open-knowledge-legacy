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

  test('long adversarial extension falls back to upload', () => {
    // ext alone = '.' + 'a'.repeat(300) > 255 bytes; while-loop drains stem to
    // empty, then `'upload' + ext` still exceeds the ceiling. Final-pass
    // guard kicks in and substitutes extensionless `'upload'`.
    expect(sanitizeFilename(`x.${'a'.repeat(300)}`)).toBe('upload');
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
      serverInstanceId: 'test-instance',
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
    return fetch(`http://localhost:${port}/api/upload`, {
      method: 'POST',
      body: formData,
    });
  }

  test('happy path: sibling upload with parentDocName', async () => {
    const res = await uploadImage(createPngBuffer(), 'screenshot.png', 'docs/guide.md');
    const body = (await res.json()) as { ok: boolean; src: string };
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    // Server-absolute, contentDir-relative URL — see bare-filename → server-
    // absolute fix in api-extension.ts uploadMediaCore. Resolves correctly
    // against the page's hash-route base URL regardless of the doc's depth.
    expect(body.src).toBe('/docs/screenshot.png');
    expect(existsSync(join(contentDir, 'docs', 'screenshot.png'))).toBe(true);
  });

  test('rejects missing parentDocName', async () => {
    const formData = new FormData();
    formData.append('file', new Blob([createPngBuffer()]), 'test.png');
    const res = await fetch(`http://localhost:${port}/api/upload`, {
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
    expect(body.src).toMatch(/^\/docs\/pasted-\d{8}-\d{6}\.png$/);
  });

  test('D-M accept-all: spoofed MIME no longer rejects, file is stored under sanitized name', async () => {
    // Pre-D-M behavior rejected with "Unsupported file type". Under D-M
    // accept-all (SPEC §10), every file is accepted; post-streaming there
    // is no user-facing byte cap either, only disk fullness. The SVG
    // <img>-only routing relies on a successful magic-byte sniff (NFR-3
    // LOAD-BEARING). The "exe spoofed as .png" test now confirms
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
    expect(body.src).toBe('/docs/diagram.svg');
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
    expect(body.src).toBe('/docs/screenshot-1.png');
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

describe('handleUploadImage — same-dir sha256 dedup (FR-2)', () => {
  let tmpDir: string;
  let contentDir: string;
  let server: import('node:http').Server;
  let port: number;

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

// Shared setup for video / audio upload endpoints. Both endpoints route
// through the same `uploadMediaCore` helper that the image endpoint uses, so
// the per-endpoint tests focus on what differs: the MIME allowlist and the
// route registration. Path-traversal, symlink-escape, and atomic-write
// behavior are exercised by the image-endpoint tests above.
interface UploadTestServer {
  tmpDir: string;
  contentDir: string;
  server: import('node:http').Server;
  port: number;
  cleanup: () => Promise<void>;
}

async function setupUploadTestServer(prefix: string): Promise<UploadTestServer> {
  const tmpDir = await mkdtemp(join(tmpdir(), prefix));
  const contentDir = join(tmpDir, 'content');
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
    serverInstanceId: 'test-instance',
  });

  const { createServer } = await import('node:http');
  const server = createServer((req, res) => {
    // biome-ignore lint/suspicious/noExplicitAny: test harness
    hocuspocus.hooks('onRequest', { request: req, response: res } as any).catch(() => {
      if (!res.writableEnded) {
        res.writeHead(500);
        res.end('Error');
      }
    });
  });

  hocuspocus.configuration.extensions.push(ext);

  const port = await new Promise<number>((res) => {
    server.listen(0, () => {
      const addr = server.address();
      res(typeof addr === 'object' && addr ? addr.port : 0);
    });
  });

  const cleanup = async () => {
    await new Promise<void>((res) => server.close(() => res()));
    await rm(tmpDir, { recursive: true, force: true });
  };

  return { tmpDir, contentDir, server, port, cleanup };
}

async function postUpload(
  port: number,
  endpoint: string,
  file: Buffer,
  filename: string,
  parentDocName: string,
): Promise<Response> {
  const formData = new FormData();
  formData.append('parentDocName', parentDocName);
  formData.append('file', new Blob([file]), filename);
  return fetch(`http://localhost:${port}${endpoint}`, { method: 'POST', body: formData });
}

/** Minimal valid mp4 — a 24-byte `ftyp` box. file-type detects this as video/mp4. */
function createMp4Buffer(): Buffer {
  return Buffer.from([
    0x00,
    0x00,
    0x00,
    0x18, // box size = 24
    0x66,
    0x74,
    0x79,
    0x70, // 'ftyp'
    0x6d,
    0x70,
    0x34,
    0x32, // major brand = 'mp42'
    0x00,
    0x00,
    0x00,
    0x00, // minor version
    0x6d,
    0x70,
    0x34,
    0x32, // compat brand = 'mp42'
    0x69,
    0x73,
    0x6f,
    0x6d, // compat brand = 'isom'
  ]);
}

/** ID3v2 header + MP3 sync frame — file-type detects this as audio/mpeg. */
function createMp3Buffer(): Buffer {
  return Buffer.from([
    0x49,
    0x44,
    0x33, // 'ID3'
    0x04,
    0x00, // ID3v2.4
    0x00, // flags
    0x00,
    0x00,
    0x00,
    0x00, // sync-safe size 0 — no ID3 frames
    0xff,
    0xfb, // MPEG-1 Layer III sync
    0x90,
    0x44, // 128 kbps, 44.1 kHz, stereo
    ...new Array(28).fill(0x00),
  ]);
}

function createPdfBuffer(): Buffer {
  return Buffer.from('%PDF-1.4\n%\xC4\xE5\xF2\xE5');
}

describe('handleUploadVideo', () => {
  let s: UploadTestServer;

  beforeEach(async () => {
    s = await setupUploadTestServer('upload-video-test-');
  });

  afterEach(async () => {
    await s.cleanup();
  });

  test('happy path: valid mp4 stores under sibling dir and returns src', async () => {
    const res = await postUpload(
      s.port,
      '/api/upload-video',
      createMp4Buffer(),
      'demo.mp4',
      'docs/guide.md',
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; src: string };
    expect(body.ok).toBe(true);
    expect(body.src).toBe('/docs/demo.mp4');
    expect(existsSync(join(s.contentDir, 'docs', 'demo.mp4'))).toBe(true);
  });

  test('rejects pdf masquerading as mp4 with 400', async () => {
    const res = await postUpload(
      s.port,
      '/api/upload-video',
      createPdfBuffer(),
      'malicious.mp4',
      'docs/guide.md',
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('Unsupported file type');
  });

  test('rejects 11 MB upload with 413', async () => {
    const oversize = Buffer.alloc(11 * 1024 * 1024, 0x00);
    const res = await postUpload(s.port, '/api/upload-video', oversize, 'big.mp4', 'docs/guide.md');
    expect(res.status).toBe(413);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Payload too large');
  });

  test('cross-endpoint isolation: image endpoint rejects mp4', async () => {
    const res = await postUpload(
      s.port,
      '/api/upload-image',
      createMp4Buffer(),
      'demo.mp4',
      'docs/guide.md',
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('Unsupported file type');
  });
});

describe('handleUploadAudio', () => {
  let s: UploadTestServer;

  beforeEach(async () => {
    s = await setupUploadTestServer('upload-audio-test-');
  });

  afterEach(async () => {
    await s.cleanup();
  });

  test('happy path: valid mp3 stores under sibling dir and returns src', async () => {
    const res = await postUpload(
      s.port,
      '/api/upload-audio',
      createMp3Buffer(),
      'song.mp3',
      'docs/guide.md',
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; src: string };
    expect(body.ok).toBe(true);
    expect(body.src).toBe('/docs/song.mp3');
    expect(existsSync(join(s.contentDir, 'docs', 'song.mp3'))).toBe(true);
  });

  test('rejects pdf masquerading as mp3 with 400', async () => {
    const res = await postUpload(
      s.port,
      '/api/upload-audio',
      createPdfBuffer(),
      'malicious.mp3',
      'docs/guide.md',
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('Unsupported file type');
  });

  test('rejects 11 MB upload with 413', async () => {
    const oversize = Buffer.alloc(11 * 1024 * 1024, 0x00);
    const res = await postUpload(s.port, '/api/upload-audio', oversize, 'big.mp3', 'docs/guide.md');
    expect(res.status).toBe(413);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Payload too large');
  });

  test('cross-endpoint isolation: audio endpoint rejects mp4', async () => {
    const res = await postUpload(
      s.port,
      '/api/upload-audio',
      createMp4Buffer(),
      'video.mp4',
      'docs/guide.md',
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('Unsupported file type');
  });
});
