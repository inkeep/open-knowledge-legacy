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

  test('replaces unsafe characters with underscore', () => {
    expect(sanitizeFilename('my file (1).png')).toBe('my_file__1_.png');
  });

  test('preserves safe characters', () => {
    expect(sanitizeFilename('screenshot-2024.png')).toBe('screenshot-2024.png');
  });

  test('falls back to "upload" for truly empty name', () => {
    expect(sanitizeFilename('')).toBe('upload');
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
    // Server-absolute, contentDir-relative URL — see bare-filename → server-
    // absolute fix in api-extension.ts uploadMediaCore. Resolves correctly
    // against the page's hash-route base URL regardless of the doc's depth.
    expect(body.src).toBe('/docs/screenshot.png');
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
    expect(body.src).toMatch(/^\/docs\/pasted-\d{8}-\d{6}\.png$/);
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
    expect(body.src).toBe('/docs/diagram.svg');
  });

  test('numeric suffix collision handling', async () => {
    // Write the first file directly
    writeFileSync(join(contentDir, 'docs', 'screenshot.png'), createPngBuffer());
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
