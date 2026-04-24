/**
 * Sidecar primitives — unit tests for the happy path, corruption defense,
 * and version handling. Integration coverage (onStoreDocument writes the
 * sidecar, onLoadDocument reads it) lives in persistence.test.ts. Bug-class
 * end-to-end coverage of the whole restart-recovery flow is the 11-test
 * integration suite.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as Y from 'yjs';
import {
  CURRENT_FORMAT_VARIANT,
  CURRENT_SCHEMA_VERSION,
  CURRENT_YJS_VERSION,
  deleteSidecar,
  deleteSidecarsForBranch,
  listSidecars,
  readSidecar,
  SIDECAR_DIR,
  writeSidecar,
} from './sidecar.ts';

let contentDir: string;

beforeEach(async () => {
  contentDir = await mkdtemp(join(tmpdir(), 'ok-sidecar-'));
});

afterEach(async () => {
  await rm(contentDir, { recursive: true, force: true });
});

function docWithContent(text: string): Y.Doc {
  const doc = new Y.Doc();
  doc.getText('source').insert(0, text);
  return doc;
}

describe('writeSidecar + readSidecar round-trip', () => {
  test('round-trips a non-empty Y.Doc via applyFn', async () => {
    const src = docWithContent('hello sidecar');
    await writeSidecar(contentDir, 'test-doc', src);

    const result = await readSidecar(contentDir, 'test-doc');
    expect(result).not.toBeNull();
    if (!result) throw new Error('readSidecar returned null');
    expect(result.header.yjsVersion).toBe(CURRENT_YJS_VERSION);
    expect(result.header.formatVariant).toBe(CURRENT_FORMAT_VARIANT);
    expect(result.header.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.header.writtenAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const dst = new Y.Doc();
    const ok = await result.applyFn(dst);
    expect(ok).toBe(true);
    expect(dst.getText('source').toString()).toBe('hello sidecar');
  });

  test('empty Y.Doc round-trips to empty Y.Doc', async () => {
    const src = new Y.Doc();
    await writeSidecar(contentDir, 'empty-doc', src);

    const result = await readSidecar(contentDir, 'empty-doc');
    if (!result) throw new Error('expected non-null result');
    const dst = new Y.Doc();
    const ok = await result.applyFn(dst);
    expect(ok).toBe(true);
    expect(dst.getText('source').toString()).toBe('');
  });

  test('sidecar lands at <contentDir>/.open-knowledge/ystate/<docName>.bin', async () => {
    const src = docWithContent('placement');
    await writeSidecar(contentDir, 'my-doc', src);
    expect(existsSync(join(contentDir, SIDECAR_DIR, 'my-doc.bin'))).toBe(true);
  });

  test('multiple writeSidecar calls overwrite in place (atomic rename)', async () => {
    const firstDoc = docWithContent('first');
    await writeSidecar(contentDir, 'overwrite-doc', firstDoc);
    const secondDoc = docWithContent('second');
    await writeSidecar(contentDir, 'overwrite-doc', secondDoc);

    const result = await readSidecar(contentDir, 'overwrite-doc');
    if (!result) throw new Error('expected non-null result');
    const dst = new Y.Doc();
    await result.applyFn(dst);
    expect(dst.getText('source').toString()).toBe('second');
  });
});

describe('readSidecar — missing / corrupt files', () => {
  test('missing sidecar returns null', async () => {
    const result = await readSidecar(contentDir, 'no-such-doc');
    expect(result).toBeNull();
  });

  test('truncated file (header-length > file size) returns null', async () => {
    const path = join(contentDir, SIDECAR_DIR, 'truncated.bin');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(contentDir, SIDECAR_DIR), { recursive: true });
    // Write a 4-byte header claiming 9999999 bytes follow, then zero body.
    const prefix = Buffer.alloc(4);
    prefix.writeUInt32BE(9_999_999, 0);
    writeFileSync(path, prefix);

    const result = await readSidecar(contentDir, 'truncated');
    expect(result).toBeNull();
  });

  test('file smaller than 4-byte prefix returns null', async () => {
    const path = join(contentDir, SIDECAR_DIR, 'tiny.bin');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(contentDir, SIDECAR_DIR), { recursive: true });
    writeFileSync(path, Buffer.from([0x01])); // 1 byte

    const result = await readSidecar(contentDir, 'tiny');
    expect(result).toBeNull();
  });

  test('non-JSON header returns null', async () => {
    const path = join(contentDir, SIDECAR_DIR, 'bad-header.bin');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(contentDir, SIDECAR_DIR), { recursive: true });
    const junk = Buffer.from('not json at all', 'utf-8');
    const prefix = Buffer.alloc(4);
    prefix.writeUInt32BE(junk.byteLength, 0);
    writeFileSync(path, Buffer.concat([prefix, junk]));

    const result = await readSidecar(contentDir, 'bad-header');
    expect(result).toBeNull();
  });

  test('header missing required fields returns null', async () => {
    const path = join(contentDir, SIDECAR_DIR, 'partial-header.bin');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(contentDir, SIDECAR_DIR), { recursive: true });
    // Header missing `schemaVersion` and `writtenAt` — Zod rejects.
    const header = JSON.stringify({
      yjsVersion: CURRENT_YJS_VERSION,
      formatVariant: CURRENT_FORMAT_VARIANT,
    });
    const headerBytes = Buffer.from(header, 'utf-8');
    const prefix = Buffer.alloc(4);
    prefix.writeUInt32BE(headerBytes.byteLength, 0);
    writeFileSync(path, Buffer.concat([prefix, headerBytes]));

    const result = await readSidecar(contentDir, 'partial-header');
    expect(result).toBeNull();
  });

  test('header with wrong formatVariant returns null', async () => {
    const path = join(contentDir, SIDECAR_DIR, 'wrong-variant.bin');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(contentDir, SIDECAR_DIR), { recursive: true });
    const header = JSON.stringify({
      yjsVersion: CURRENT_YJS_VERSION,
      formatVariant: 'v99',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      writtenAt: new Date().toISOString(),
    });
    const headerBytes = Buffer.from(header, 'utf-8');
    const prefix = Buffer.alloc(4);
    prefix.writeUInt32BE(headerBytes.byteLength, 0);
    writeFileSync(path, Buffer.concat([prefix, headerBytes]));

    const result = await readSidecar(contentDir, 'wrong-variant');
    expect(result).toBeNull();
  });

  test('header with Yjs MAJOR mismatch returns null', async () => {
    const path = join(contentDir, SIDECAR_DIR, 'yjs-major-mismatch.bin');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(contentDir, SIDECAR_DIR), { recursive: true });
    const header = JSON.stringify({
      yjsVersion: '14.0.0',
      formatVariant: CURRENT_FORMAT_VARIANT,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      writtenAt: new Date().toISOString(),
    });
    const headerBytes = Buffer.from(header, 'utf-8');
    const prefix = Buffer.alloc(4);
    prefix.writeUInt32BE(headerBytes.byteLength, 0);
    writeFileSync(path, Buffer.concat([prefix, headerBytes]));

    const result = await readSidecar(contentDir, 'yjs-major-mismatch');
    expect(result).toBeNull();
  });

  test('header with future schemaVersion returns null', async () => {
    const path = join(contentDir, SIDECAR_DIR, 'future-schema.bin');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(contentDir, SIDECAR_DIR), { recursive: true });
    const header = JSON.stringify({
      yjsVersion: CURRENT_YJS_VERSION,
      formatVariant: CURRENT_FORMAT_VARIANT,
      schemaVersion: CURRENT_SCHEMA_VERSION + 1,
      writtenAt: new Date().toISOString(),
    });
    const headerBytes = Buffer.from(header, 'utf-8');
    const prefix = Buffer.alloc(4);
    prefix.writeUInt32BE(headerBytes.byteLength, 0);
    writeFileSync(path, Buffer.concat([prefix, headerBytes]));

    const result = await readSidecar(contentDir, 'future-schema');
    expect(result).toBeNull();
  });

  test('body bytes corrupt — applyFn returns false (does not throw)', async () => {
    const path = join(contentDir, SIDECAR_DIR, 'corrupt-body.bin');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(contentDir, SIDECAR_DIR), { recursive: true });
    const header = JSON.stringify({
      yjsVersion: CURRENT_YJS_VERSION,
      formatVariant: CURRENT_FORMAT_VARIANT,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      writtenAt: new Date().toISOString(),
    });
    const headerBytes = Buffer.from(header, 'utf-8');
    const prefix = Buffer.alloc(4);
    prefix.writeUInt32BE(headerBytes.byteLength, 0);
    // Random non-Yjs bytes for the body.
    const junkBody = Buffer.from([0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
    writeFileSync(path, Buffer.concat([prefix, headerBytes, junkBody]));

    const result = await readSidecar(contentDir, 'corrupt-body');
    if (!result) throw new Error('expected header to parse even with corrupt body');
    const dst = new Y.Doc();
    const ok = await result.applyFn(dst);
    expect(ok).toBe(false);
  });
});

describe('deleteSidecar + deleteSidecarsForBranch', () => {
  test('deleteSidecar removes an existing sidecar', async () => {
    await writeSidecar(contentDir, 'to-delete', docWithContent('x'));
    expect(existsSync(join(contentDir, SIDECAR_DIR, 'to-delete.bin'))).toBe(true);

    await deleteSidecar(contentDir, 'to-delete');
    expect(existsSync(join(contentDir, SIDECAR_DIR, 'to-delete.bin'))).toBe(false);
  });

  test('deleteSidecar is a no-op when the file is absent', async () => {
    // Must not throw.
    await deleteSidecar(contentDir, 'never-existed');
  });

  test('deleteSidecarsForBranch removes all sidecars', async () => {
    await writeSidecar(contentDir, 'a', docWithContent('a'));
    await writeSidecar(contentDir, 'b', docWithContent('b'));
    await writeSidecar(contentDir, 'c', docWithContent('c'));
    expect((await listSidecars(contentDir)).sort()).toEqual(['a', 'b', 'c']);

    await deleteSidecarsForBranch(contentDir);
    expect(await listSidecars(contentDir)).toEqual([]);
  });

  test('deleteSidecarsForBranch is a no-op when the dir is absent', async () => {
    // Must not throw even when no sidecar was ever written.
    await deleteSidecarsForBranch(contentDir);
    expect(await listSidecars(contentDir)).toEqual([]);
  });

  test('deleteSidecarsForBranch leaves the dir in a writable state', async () => {
    await writeSidecar(contentDir, 'x', docWithContent('x'));
    await deleteSidecarsForBranch(contentDir);
    // Subsequent write should succeed without mkdir race.
    await writeSidecar(contentDir, 'y', docWithContent('y'));
    expect(await listSidecars(contentDir)).toEqual(['y']);
  });
});

describe('writeSidecar — non-L1 failure modes are non-blocking to caller', () => {
  test('writeSidecar throws when the parent directory cannot be created', async () => {
    // Pointing at a path where mkdir fails — e.g., a file with the same name
    // as the expected directory. We create a file at <contentDir>/.open-knowledge
    // so `mkdir` trying to make that a directory errors out.
    writeFileSync(join(contentDir, '.open-knowledge'), 'blocks dir creation', 'utf-8');
    await expect(writeSidecar(contentDir, 'will-fail', docWithContent('x'))).rejects.toThrow();
    // Caller (persistence.ts) wraps in try/catch — this is the contract:
    // the helper raises, the L1 pipeline swallows + logs.
  });
});

describe('body bytes preserve Y.Doc clientID identity', () => {
  test('applying the sidecar onto a fresh Y.Doc preserves the source clientID', async () => {
    const src = new Y.Doc();
    src.getText('source').insert(0, 'carry over');
    const srcClientId = src.clientID;
    await writeSidecar(contentDir, 'id-carry', src);

    const result = await readSidecar(contentDir, 'id-carry');
    if (!result) throw new Error('expected result');
    const dst = new Y.Doc();
    await result.applyFn(dst);
    // Yjs store carries items keyed by clientID. After apply, the dst store
    // should know the source's clientID (in addition to its own).
    const knownClients = [...dst.store.clients.keys()];
    expect(knownClients.includes(srcClientId)).toBe(true);
    // Content matches, too.
    expect(dst.getText('source').toString()).toBe('carry over');
  });
});

describe('header carries bounded content for forward-compat', () => {
  test('optional clientIdToWriter field is serialized and read back', async () => {
    const src = new Y.Doc();
    // We can't write the header directly from writeSidecar (v1 omits the
    // field), but readSidecar must accept it when a future writer adds it.
    const path = join(contentDir, SIDECAR_DIR, 'with-map.bin');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(contentDir, SIDECAR_DIR), { recursive: true });
    const body = Y.encodeStateAsUpdate(src);
    const header = JSON.stringify({
      yjsVersion: CURRENT_YJS_VERSION,
      formatVariant: CURRENT_FORMAT_VARIANT,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      writtenAt: new Date().toISOString(),
      clientIdToWriter: { '42': 'principal-abc', '99': 'agent-x' },
    });
    const headerBytes = Buffer.from(header, 'utf-8');
    const prefix = Buffer.alloc(4);
    prefix.writeUInt32BE(headerBytes.byteLength, 0);
    writeFileSync(path, Buffer.concat([prefix, headerBytes, body]));

    const result = await readSidecar(contentDir, 'with-map');
    if (!result) throw new Error('expected result');
    expect(result.header.clientIdToWriter).toEqual({
      '42': 'principal-abc',
      '99': 'agent-x',
    });
  });
});

describe('byte-level format is stable', () => {
  test('header has 4-byte big-endian length prefix', async () => {
    await writeSidecar(contentDir, 'layout', docWithContent('layout check'));
    const bytes = readFileSync(join(contentDir, SIDECAR_DIR, 'layout.bin'));
    const headerLen = bytes.readUInt32BE(0);
    expect(headerLen).toBeGreaterThan(0);
    expect(headerLen).toBeLessThan(bytes.byteLength);
    // The header JSON at the prefixed length parses cleanly.
    const header = JSON.parse(bytes.subarray(4, 4 + headerLen).toString('utf-8'));
    expect(header.formatVariant).toBe('v1');
  });
});
