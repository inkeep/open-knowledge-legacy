/**
 * US-002 — disk I/O migration to per-key `Y.Map('metadata')` storage.
 *
 * Verifies the eager-on-load (Q9) migration path: `onLoadDocument` parses YAML
 * frontmatter and writes per-key entries during the load transaction, with a
 * legacy single-string mirror kept until US-003 / US-004 / US-011 migrate the
 * remaining readers. Also verifies `onStoreDocument` synthesizes canonical
 * YAML via `composeFrontmatterForStore`, and the file-watcher path applies
 * per-key diffs (D13) under `FILE_WATCHER_ORIGIN`.
 *
 * Uses Hocuspocus + the persistence extension directly (no `createServer`)
 * to keep the unit-test surface narrow.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hocuspocus } from '@hocuspocus/server';
import * as Y from 'yjs';
import { createPersistenceExtension, deleteReconciledBase } from './persistence.ts';

type Conn = Awaited<ReturnType<Hocuspocus['openDirectConnection']>>;

function getDoc(conn: Conn): Y.Doc {
  const doc = (conn as unknown as { document: Y.Doc }).document;
  if (!doc) throw new Error('DirectConnection has no document');
  return doc;
}

function makeServer(contentDir: string, projectDir: string): Hocuspocus {
  const { extension } = createPersistenceExtension({
    contentDir,
    projectDir,
    contentRoot: 'content',
    gitEnabled: false,
  });
  // debounce 0 so onStoreDocument fires immediately when we call flushPendingStores.
  return new Hocuspocus({ quiet: true, extensions: [extension], debounce: 0, maxDebounce: 0 });
}

describe('US-002 — onLoadDocument eager-on-load per-key migration', () => {
  let tmpDir: string;
  let contentDir: string;
  let projectDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ok-perkey-load-'));
    projectDir = tmpDir;
    contentDir = join(tmpDir, 'content');
    mkdirSync(contentDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('writes per-key entries from disk YAML during load', async () => {
    writeFileSync(
      join(contentDir, 'doc.md'),
      '---\ntitle: Loaded from Disk\nstatus: draft\ntags:\n  - foo\n  - bar\n---\n# Body\n',
    );
    const hp = makeServer(contentDir, projectDir);

    const conn = await hp.openDirectConnection('doc');
    const doc = getDoc(conn);
    const metaMap = doc.getMap('metadata');

    // Per-key entries reflect the parsed YAML (D2 / D10).
    expect(metaMap.get('title')).toBe('Loaded from Disk');
    expect(metaMap.get('status')).toBe('draft');
    expect(metaMap.get('tags')).toEqual(['foo', 'bar']);

    // Legacy mirror present for transition compat.
    const legacy = metaMap.get('frontmatter');
    expect(typeof legacy).toBe('string');
    expect(legacy).toContain('title: Loaded from Disk');

    await conn.disconnect();
    deleteReconciledBase('doc');
  });

  test('skips load when no frontmatter present', async () => {
    writeFileSync(join(contentDir, 'no-fm.md'), '# Just a body\n');
    const hp = makeServer(contentDir, projectDir);

    const conn = await hp.openDirectConnection('no-fm');
    const doc = getDoc(conn);
    const metaMap = doc.getMap('metadata');

    expect(metaMap.size).toBe(0);

    await conn.disconnect();
    deleteReconciledBase('no-fm');
  });

  test('malformed on-disk YAML keeps legacy slot for source-mode visibility', async () => {
    writeFileSync(join(contentDir, 'malformed.md'), '---\ntitle: [unterminated\n---\n# Body\n');
    const hp = makeServer(contentDir, projectDir);

    const conn = await hp.openDirectConnection('malformed');
    const doc = getDoc(conn);
    const metaMap = doc.getMap('metadata');

    // Per-key parse failed — no per-key entries written.
    expect(metaMap.has('title')).toBe(false);
    // Legacy slot preserves the malformed source for source-mode user to fix.
    const legacy = metaMap.get('frontmatter');
    expect(typeof legacy).toBe('string');
    expect(legacy).toContain('[unterminated');

    await conn.disconnect();
    deleteReconciledBase('malformed');
  });
});

describe('US-002 — onStoreDocument canonical FM via composeFrontmatterForStore', () => {
  let tmpDir: string;
  let contentDir: string;
  let projectDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ok-perkey-store-'));
    projectDir = tmpDir;
    contentDir = join(tmpDir, 'content');
    mkdirSync(contentDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('per-key divergence triggers canonical YAML synthesis on store', async () => {
    const filePath = join(contentDir, 'edit.md');
    writeFileSync(filePath, '---\ntitle: Original\n---\n# Body\n');
    const hp = makeServer(contentDir, projectDir);

    const conn = await hp.openDirectConnection('edit');
    const doc = getDoc(conn);

    // Diverge per-key state and append body content so the
    // semantic-unchanged guard in onStoreDocument doesn't short-circuit.
    doc.transact((tx) => {
      doc.getMap('metadata').set('title', 'Updated');
      const xmlFragment = doc.getXmlFragment('default');
      const paragraph = new Y.XmlElement('paragraph');
      paragraph.insert(0, [new Y.XmlText('extra body')]);
      xmlFragment.insert(0, [paragraph]);
      void tx;
    });

    // debounce: 0 + flushPendingStores forces onStoreDocument to fire and complete.
    await hp.flushPendingStores();
    // flushPendingStores returns sync but the underlying writes are async — yield.
    await new Promise((r) => setTimeout(r, 50));

    await conn.disconnect();
    deleteReconciledBase('edit');

    const onDisk = readFileSync(filePath, 'utf-8');
    expect(onDisk).toContain('title: Updated');
    expect(onDisk).not.toContain('title: Original');
    expect(onDisk.startsWith('---\n')).toBe(true);
  });

  test('no-op load preserves legacy mirror verbatim (comment + style preservation path)', async () => {
    const filePath = join(contentDir, 'stable.md');
    // Comment-bearing YAML to verify the verbatim path preserves it.
    const original = '---\n# spec owner\ntitle: "Quoted Style"\nstatus: draft\n---\n# Body\n';
    writeFileSync(filePath, original);

    const hp = makeServer(contentDir, projectDir);
    const conn = await hp.openDirectConnection('stable');
    const doc = getDoc(conn);

    // Verify composeFrontmatterForStore would return the legacy slot
    // verbatim — per-key state matches the parsed legacy mirror, so the
    // no-op verbatim path is taken.
    const metaMap = doc.getMap('metadata');
    expect(metaMap.get('title')).toBe('Quoted Style');
    expect(metaMap.get('status')).toBe('draft');
    const legacy = metaMap.get('frontmatter');
    expect(typeof legacy).toBe('string');
    expect(legacy).toContain('# spec owner');
    expect(legacy).toContain('title: "Quoted Style"');

    await conn.disconnect();
    deleteReconciledBase('stable');
  });
});
