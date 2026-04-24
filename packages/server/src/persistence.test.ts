import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { mkdir, mkdtemp, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import * as Y from 'yjs';
import { contentHash, isSelfWrite, registerWrite } from './file-watcher';
import { isWithinContentDir, resolveWriterFromOrigin, safeContentPath } from './persistence';
import { FILE_SYSTEM_WRITER, GIT_UPSTREAM_WRITER, SERVICE_WRITER } from './shadow-repo';
import {
  CURRENT_FORMAT_VARIANT,
  CURRENT_SCHEMA_VERSION,
  CURRENT_YJS_VERSION,
  SIDECAR_DIR,
  writeSidecar,
} from './sidecar';
import { createServer } from './standalone';

describe('safeContentPath', () => {
  const contentDir = '/app/content';

  test('allows simple document names', () => {
    const result = safeContentPath('test-doc', contentDir);
    expect(result).toBe(resolve(contentDir, 'test-doc.md'));
  });

  test('rejects path traversal with ../', () => {
    expect(() => safeContentPath('../etc/passwd', contentDir)).toThrow('Invalid document name');
  });

  test('rejects absolute path injection', () => {
    expect(() => safeContentPath('/etc/passwd', contentDir)).toThrow('Invalid document name');
  });

  test('rejects traversal to parent directory', () => {
    expect(() => safeContentPath('../../package.json', contentDir)).toThrow(
      'Invalid document name',
    );
  });

  test('allows subdirectory within content', () => {
    const result = safeContentPath('sub/nested', contentDir);
    expect(result).toBe(resolve(contentDir, 'sub/nested.md'));
  });
});

describe('isWithinContentDir', () => {
  test('returns true for path equal to contentDir', () => {
    expect(isWithinContentDir('/app/content', '/app/content')).toBe(true);
  });

  test('returns true for path inside contentDir', () => {
    expect(isWithinContentDir(`/app/content${sep}file.md`, '/app/content')).toBe(true);
  });

  test('returns true for nested path inside contentDir', () => {
    expect(isWithinContentDir(`/app/content${sep}sub${sep}file.md`, '/app/content')).toBe(true);
  });

  test('returns false for path outside contentDir', () => {
    expect(isWithinContentDir('/tmp/outside.md', '/app/content')).toBe(false);
  });

  test('returns false for path that is a prefix but not a child', () => {
    expect(isWithinContentDir('/app/content-extra/file.md', '/app/content')).toBe(false);
  });
});

describe('symlink-safe atomic write', () => {
  let tmpDir: string;
  let contentDir: string;

  beforeEach(() => {
    tmpDir = realpathSync(mkdtempSync(join(tmpdir(), 'persistence-test-')));
    contentDir = join(tmpDir, 'content');
    mkdirSync(contentDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  async function simulateWrite(documentName: string, markdown: string, cd: string) {
    const requestedPath = safeContentPath(documentName, cd);
    await mkdir(dirname(requestedPath), { recursive: true });

    let canonicalPath: string;
    try {
      canonicalPath = await realpath(requestedPath);
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        canonicalPath = requestedPath;
      } else if (code === 'ELOOP') {
        throw new Error(`Symlink cycle detected at ${requestedPath}`);
      } else {
        throw e;
      }
    }

    if (!isWithinContentDir(canonicalPath, cd)) {
      throw new Error(
        `symlink-escape: ${requestedPath} resolves to ${canonicalPath} outside ${cd}`,
      );
    }

    const tmpPath = `${canonicalPath}.tmp`;
    await writeFile(tmpPath, markdown, 'utf-8');
    await rename(tmpPath, canonicalPath);
    registerWrite(canonicalPath, contentHash(markdown));
  }

  test('preserves symlink when writing to symlinked file', async () => {
    const targetPath = join(contentDir, 'target.md');
    const linkPath = join(contentDir, 'link.md');

    writeFileSync(targetPath, '# Original');
    symlinkSync(targetPath, linkPath);

    expect(lstatSync(linkPath).isSymbolicLink()).toBe(true);

    await simulateWrite('link', '# Updated via symlink', contentDir);

    expect(lstatSync(linkPath).isSymbolicLink()).toBe(true);
    expect(readFileSync(linkPath, 'utf-8')).toBe('# Updated via symlink');
    expect(readFileSync(targetPath, 'utf-8')).toBe('# Updated via symlink');
  });

  test('regular file write is unchanged', async () => {
    const filePath = join(contentDir, 'regular.md');
    writeFileSync(filePath, '# Original');

    await simulateWrite('regular', '# Updated', contentDir);

    expect(readFileSync(filePath, 'utf-8')).toBe('# Updated');
    expect(lstatSync(filePath).isSymbolicLink()).toBe(false);
  });

  test('new file write works (ENOENT fallback)', async () => {
    await simulateWrite('new-file', '# New content', contentDir);

    const filePath = join(contentDir, 'new-file.md');
    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath, 'utf-8')).toBe('# New content');
  });

  test('broken symlink falls back to direct write at original path', async () => {
    const linkPath = join(contentDir, 'orphan.md');
    symlinkSync(join(contentDir, 'nonexistent.md'), linkPath);

    await simulateWrite('orphan', '# Broken link content', contentDir);

    expect(existsSync(linkPath)).toBe(true);
    expect(readFileSync(linkPath, 'utf-8')).toBe('# Broken link content');
  });

  test('cyclic symlink throws ELOOP error', async () => {
    const aPath = join(contentDir, 'cycle-a.md');
    const bPath = join(contentDir, 'cycle-b.md');
    symlinkSync(bPath, aPath);
    symlinkSync(aPath, bPath);

    await expect(simulateWrite('cycle-a', '# Content', contentDir)).rejects.toThrow(
      'Symlink cycle detected',
    );
  });

  test('symlink escaping contentDir is refused', async () => {
    const outsideDir = join(tmpDir, 'outside');
    mkdirSync(outsideDir, { recursive: true });
    const outsideTarget = join(outsideDir, 'secret.md');
    writeFileSync(outsideTarget, '# Secret');

    const escapePath = join(contentDir, 'escape.md');
    symlinkSync(outsideTarget, escapePath);

    await expect(simulateWrite('escape', '# Hacked', contentDir)).rejects.toThrow('symlink-escape');

    expect(lstatSync(escapePath).isSymbolicLink()).toBe(true);
    expect(readFileSync(outsideTarget, 'utf-8')).toBe('# Secret');
  });

  test('tmpPath is colocated with canonical path, not requested path', async () => {
    const subDir = join(contentDir, 'sub');
    mkdirSync(subDir, { recursive: true });
    const targetPath = join(subDir, 'target.md');
    writeFileSync(targetPath, '# Target');

    const linkPath = join(contentDir, 'link.md');
    symlinkSync(targetPath, linkPath);

    await simulateWrite('link', '# Updated', contentDir);

    expect(existsSync(`${linkPath}.tmp`)).toBe(false);
    expect(existsSync(`${targetPath}.tmp`)).toBe(false);
    expect(readFileSync(targetPath, 'utf-8')).toBe('# Updated');
  });

  test('registerWrite uses canonical path for self-write detection', async () => {
    const targetPath = join(contentDir, 'target.md');
    const linkPath = join(contentDir, 'link.md');
    writeFileSync(targetPath, '# Original');
    symlinkSync(targetPath, linkPath);

    const markdown = '# Self-write test';
    await simulateWrite('link', markdown, contentDir);

    const hash = contentHash(markdown);
    expect(isSelfWrite(targetPath, hash)).toBe(true);
    expect(isSelfWrite(linkPath, hash)).toBe(false);
  });
});

// ─── US-013: resolveWriterFromOrigin (D31, D32, FR-16) ───────────────────────

describe('resolveWriterFromOrigin', () => {
  test('local origin with session_id → agent-<sessionId> writer', () => {
    const origin = {
      source: 'local',
      skipStoreHooks: false,
      context: { origin: 'agent-write', paired: true, session_id: 'conn-abc123' },
    };
    const writer = resolveWriterFromOrigin(origin);
    expect(writer).not.toBeNull();
    expect(writer?.id).toBe('agent-conn-abc123');
    expect(writer?.email).toBe('agent-conn-abc123@openknowledge.local');
  });

  test('local undo origin with session_id → agent-<sessionId> writer', () => {
    const origin = {
      source: 'local',
      skipStoreHooks: false,
      context: { origin: 'agent-undo', paired: true, session_id: 'conn-xyz789' },
    };
    const writer = resolveWriterFromOrigin(origin);
    expect(writer?.id).toBe('agent-conn-xyz789');
  });

  test('local file-watcher origin → FILE_SYSTEM_WRITER', () => {
    const origin = {
      source: 'local',
      skipStoreHooks: true,
      context: { origin: 'file-watcher', paired: true },
    };
    const writer = resolveWriterFromOrigin(origin);
    expect(writer).toEqual(FILE_SYSTEM_WRITER);
  });

  test('local upstream-import origin → GIT_UPSTREAM_WRITER', () => {
    const origin = {
      source: 'local',
      context: { origin: 'upstream-import' },
    };
    const writer = resolveWriterFromOrigin(origin);
    expect(writer).toEqual(GIT_UPSTREAM_WRITER);
  });

  test('local rollback-apply origin (no session_id) → SERVICE_WRITER', () => {
    const origin = {
      source: 'local',
      skipStoreHooks: false,
      context: { origin: 'rollback-apply', paired: true },
    };
    const writer = resolveWriterFromOrigin(origin);
    expect(writer).toEqual(SERVICE_WRITER);
  });

  test('connection origin with principalId → principal writer', () => {
    const principalId = 'principal-6f3a9c8b-4e2d-49f1-ac3a-7e8d12c9a0b3';
    const origin = {
      source: 'connection',
      connection: { context: { principalId } },
    };
    const writer = resolveWriterFromOrigin(origin);
    expect(writer).not.toBeNull();
    expect(writer?.id).toBe(principalId);
    expect(writer?.email).toBe(`${principalId}@openknowledge.local`);
  });

  test('connection origin without principalId → SERVICE_WRITER', () => {
    const origin = { source: 'connection', connection: { context: {} } };
    const writer = resolveWriterFromOrigin(origin);
    expect(writer).toEqual(SERVICE_WRITER);
  });

  test('null origin → null', () => {
    expect(resolveWriterFromOrigin(null)).toBeNull();
  });

  test('undefined origin → null', () => {
    expect(resolveWriterFromOrigin(undefined)).toBeNull();
  });

  test('non-object origin → null', () => {
    expect(resolveWriterFromOrigin('string-origin')).toBeNull();
  });

  test('local origin with no context → null', () => {
    expect(resolveWriterFromOrigin({ source: 'local' })).toBeNull();
  });

  test('session_id takes precedence over context.origin in local origin', () => {
    const origin = {
      source: 'local',
      context: { origin: 'agent-write', session_id: 'conn-priority' },
    };
    const writer = resolveWriterFromOrigin(origin);
    // session_id path wins over classified-origin path
    expect(writer?.id).toBe('agent-conn-priority');
  });

  test('connection origin matching loaded principal → uses real display_name/email', () => {
    // Post-QA review fix — Minor 1 (principal-display-name-stub).
    // When ctx.principalId matches loadedPrincipal.id, resolveWriterFromOrigin
    // must emit the real git-config display_name/email instead of "Local User".
    const principalId = 'principal-abc-123';
    const origin = {
      source: 'connection',
      connection: { context: { principalId } },
    };
    const loaded = {
      id: principalId,
      display_name: 'Alice Smith',
      display_email: 'alice@example.com',
      source: 'git-config' as const,
      created_at: '2026-04-22T00:00:00.000Z',
    };
    const writer = resolveWriterFromOrigin(origin, () => loaded);
    expect(writer?.id).toBe(principalId);
    expect(writer?.name).toBe('Alice Smith');
    expect(writer?.email).toBe('alice@example.com');
  });

  test('connection origin with mismatched principalId → stub fallback', () => {
    // Claim doesn't match loaded principal — emit stub so the caller can see
    // the attribution fell through (the onAuthenticate pin prevents this in
    // practice, but resolveWriterFromOrigin should still be safe if reached).
    const origin = {
      source: 'connection',
      connection: { context: { principalId: 'principal-different' } },
    };
    const loaded = {
      id: 'principal-loaded',
      display_name: 'Alice',
      display_email: 'alice@example.com',
      source: 'git-config' as const,
      created_at: '2026-04-22T00:00:00.000Z',
    };
    const writer = resolveWriterFromOrigin(origin, () => loaded);
    expect(writer?.id).toBe('principal-different');
    expect(writer?.name).toBe('Local User');
  });

  test('connection origin with getPrincipal returning null → stub fallback', () => {
    const origin = {
      source: 'connection',
      connection: { context: { principalId: 'principal-abc' } },
    };
    const writer = resolveWriterFromOrigin(origin, () => null);
    expect(writer?.name).toBe('Local User');
  });
});

// ---------------------------------------------------------------------------
// US-004 / Commit 6 — sidecar load path integration tests. Spin a real
// createServer(), seed markdown + sidecar on disk, openDirectConnection to
// force onLoadDocument, assert the resulting Y.Doc state + sidecar file
// state. Uses console.warn capture for the structured-event telemetry.
// ---------------------------------------------------------------------------

interface WarnCall {
  args: unknown[];
}

function captureConsoleWarn(): { calls: WarnCall[]; restore: () => void } {
  const calls: WarnCall[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => {
    calls.push({ args });
  };
  return {
    calls,
    restore: () => {
      console.warn = original;
    },
  };
}

function findWarnEvent(calls: WarnCall[], event: string): Record<string, unknown> | null {
  for (const call of calls) {
    const first = call.args[0];
    if (typeof first !== 'string') continue;
    try {
      const parsed = JSON.parse(first) as Record<string, unknown>;
      if (parsed.event === event) return parsed;
    } catch {
      // Not a structured-warn line — skip.
    }
  }
  return null;
}

describe('onLoadDocument — sidecar load paths (US-004 / Commit 6)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'ok-sidecar-load-'));
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  test('sidecar-happy — sidecar matches disk → applies preserved clientIDs to live Y.Doc', async () => {
    const MARKDOWN = '# Sidecar Happy\n\nContent that the sidecar also carries.\n';
    writeFileSync(join(tmpDir, 'test-doc.md'), MARKDOWN, 'utf-8');

    // Build a sidecar whose serialized content matches the disk markdown.
    // Shortcut: run the fixture through a disposable server's onLoad path
    // by opening the doc once, letting onStoreDocument write the sidecar,
    // then snapshot the state into a second tmpDir... too involved. Simpler:
    // build a throwaway Y.Doc with the same text content, write its state.
    const sidecarDoc = new Y.Doc();
    // Populate fragment by round-tripping markdown through mdManager + schema.
    const { mdManager, schema } = await import('./md-manager');
    const { updateYFragment } = await import('@tiptap/y-tiptap');
    const json = mdManager.parseWithFallback(MARKDOWN);
    const pmNode = schema.nodeFromJSON(json);
    const frag = sidecarDoc.getXmlFragment('default');
    updateYFragment(sidecarDoc, frag, pmNode, { mapping: new Map(), isOMark: new Map() });
    await writeSidecar(tmpDir, 'test-doc', sidecarDoc);
    const preservedClientId = sidecarDoc.clientID;

    const server = createServer({ contentDir: tmpDir, projectDir: tmpDir, quiet: true });
    try {
      await server.ready;
      const conn = await server.hocuspocus.openDirectConnection('test-doc');
      // Release the DirectConnection's hold on the document before destroy
      // so flushPendingStores can unload the doc without hanging. Fetched
      // via hocuspocus.documents.get — matches the pattern in standalone.test.ts.
      const releaseConn = () => {
        const d = server.hocuspocus.documents.get('test-doc');
        d?.removeDirectConnection();
      };
      // Read the loaded Y.Doc state.
      await conn.transact((doc) => {
        const loadedFrag = doc.getXmlFragment('default');
        expect(loadedFrag.length).toBeGreaterThan(0);
        // Sidecar's clientID is present in the loaded doc's store.
        const knownClients = [...doc.store.clients.keys()];
        expect(knownClients.includes(preservedClientId)).toBe(true);
      });
      releaseConn();
    } finally {
      await server.destroy();
    }

    // Sidecar remains on disk after a successful load.
    expect(existsSync(join(tmpDir, SIDECAR_DIR, 'test-doc.bin'))).toBe(true);
  }, 30_000);

  test('sidecar-missing-fallback — no sidecar → markdown load', async () => {
    writeFileSync(join(tmpDir, 'test-doc.md'), '# Only markdown\n\nno sidecar\n', 'utf-8');

    const server = createServer({ contentDir: tmpDir, projectDir: tmpDir, quiet: true });
    try {
      await server.ready;
      const conn = await server.hocuspocus.openDirectConnection('test-doc');
      // Release the DirectConnection's hold on the document before destroy
      // so flushPendingStores can unload the doc without hanging. Fetched
      // via hocuspocus.documents.get — matches the pattern in standalone.test.ts.
      const releaseConn = () => {
        const d = server.hocuspocus.documents.get('test-doc');
        d?.removeDirectConnection();
      };
      await conn.transact((doc) => {
        const frag = doc.getXmlFragment('default');
        expect(frag.length).toBeGreaterThan(0);
      });
      releaseConn();
    } finally {
      await server.destroy();
    }

    // No sidecar was ever created.
    expect(existsSync(join(tmpDir, SIDECAR_DIR, 'test-doc.bin'))).toBe(false);
  }, 30_000);

  test('sidecar-corrupt-fallback — malformed sidecar → deleted, markdown loaded, warn emitted', async () => {
    const MARKDOWN = '# Corrupt Sidecar\n\nmarkdown has content\n';
    writeFileSync(join(tmpDir, 'test-doc.md'), MARKDOWN, 'utf-8');

    // Write a corrupt sidecar (valid header, invalid Yjs body bytes).
    const sidecarPath = join(tmpDir, SIDECAR_DIR, 'test-doc.bin');
    await mkdir(dirname(sidecarPath), { recursive: true });
    const header = JSON.stringify({
      yjsVersion: CURRENT_YJS_VERSION,
      formatVariant: CURRENT_FORMAT_VARIANT,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      writtenAt: new Date().toISOString(),
    });
    const headerBytes = Buffer.from(header, 'utf-8');
    const prefix = Buffer.alloc(4);
    prefix.writeUInt32BE(headerBytes.byteLength, 0);
    const garbageBody = Buffer.from([0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
    writeFileSync(sidecarPath, Buffer.concat([prefix, headerBytes, garbageBody]));

    const capture = captureConsoleWarn();
    const server = createServer({ contentDir: tmpDir, projectDir: tmpDir, quiet: true });
    try {
      await server.ready;
      const conn = await server.hocuspocus.openDirectConnection('test-doc');
      // Release the DirectConnection's hold on the document before destroy
      // so flushPendingStores can unload the doc without hanging. Fetched
      // via hocuspocus.documents.get — matches the pattern in standalone.test.ts.
      const releaseConn = () => {
        const d = server.hocuspocus.documents.get('test-doc');
        d?.removeDirectConnection();
      };
      await conn.transact((doc) => {
        const frag = doc.getXmlFragment('default');
        expect(frag.length).toBeGreaterThan(0);
      });
      releaseConn();
    } finally {
      await server.destroy();
      capture.restore();
    }

    // Corrupt sidecar was deleted + load-failed event emitted.
    expect(existsSync(sidecarPath)).toBe(false);
    const event = findWarnEvent(capture.calls, 'sidecar-load-failed');
    expect(event).not.toBeNull();
    expect(event?.docName).toBe('test-doc');
  }, 30_000);

  test('sidecar-divergent-delete-and-fallback — sidecar content ≠ disk → deleted, markdown loaded, warn emitted', async () => {
    const MARKDOWN = '# Disk Truth\n\nThis is on disk.\n';
    writeFileSync(join(tmpDir, 'test-doc.md'), MARKDOWN, 'utf-8');

    // Build a sidecar with DIFFERENT content than the markdown on disk.
    const { mdManager, schema } = await import('./md-manager');
    const { updateYFragment } = await import('@tiptap/y-tiptap');
    const sidecarDoc = new Y.Doc();
    const SIDECAR_CONTENT = '# Stale Sidecar\n\nsomething the disk no longer has\n';
    const json = mdManager.parseWithFallback(SIDECAR_CONTENT);
    const pmNode = schema.nodeFromJSON(json);
    const frag = sidecarDoc.getXmlFragment('default');
    updateYFragment(sidecarDoc, frag, pmNode, { mapping: new Map(), isOMark: new Map() });
    await writeSidecar(tmpDir, 'test-doc', sidecarDoc);
    const sidecarPath = join(tmpDir, SIDECAR_DIR, 'test-doc.bin');
    expect(existsSync(sidecarPath)).toBe(true);

    const capture = captureConsoleWarn();
    const server = createServer({ contentDir: tmpDir, projectDir: tmpDir, quiet: true });
    try {
      await server.ready;
      const conn = await server.hocuspocus.openDirectConnection('test-doc');
      // Release the DirectConnection's hold on the document before destroy
      // so flushPendingStores can unload the doc without hanging. Fetched
      // via hocuspocus.documents.get — matches the pattern in standalone.test.ts.
      const releaseConn = () => {
        const d = server.hocuspocus.documents.get('test-doc');
        d?.removeDirectConnection();
      };
      await conn.transact((doc) => {
        const loadedFrag = doc.getXmlFragment('default');
        expect(loadedFrag.length).toBeGreaterThan(0);
        // The loaded content reflects the DISK markdown, not the stale sidecar.
        // (Fragment shape varies by serialization — check via serialize round-trip.)
        const nodeJson = (
          doc.getXmlFragment('default') as unknown as { toJSON(): unknown }
        ).toJSON();
        const serialized = JSON.stringify(nodeJson);
        expect(serialized.includes('Disk Truth')).toBe(true);
        expect(serialized.includes('Stale Sidecar')).toBe(false);
      });
      releaseConn();
    } finally {
      await server.destroy();
      capture.restore();
    }

    // Divergent sidecar was deleted + divergent-reload event emitted.
    expect(existsSync(sidecarPath)).toBe(false);
    const event = findWarnEvent(capture.calls, 'sidecar-divergent-reload');
    expect(event).not.toBeNull();
    expect(event?.docName).toBe('test-doc');
    expect(event?.reason).toBe('disk-differs-from-sidecar');
  }, 30_000);
});
