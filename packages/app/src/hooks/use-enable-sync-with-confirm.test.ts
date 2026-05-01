import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const HERE = new URL('.', import.meta.url).pathname;
const SRC = readFileSync(join(HERE, 'use-enable-sync-with-confirm.ts'), 'utf8');
const SYNC_API_SRC = readFileSync(join(HERE, '..', 'lib', 'sync-api.ts'), 'utf8');

describe('useEnableSyncWithConfirm module', () => {
  test('exports the hook', async () => {
    const mod = await import('./use-enable-sync-with-confirm');
    expect(typeof mod.useEnableSyncWithConfirm).toBe('function');
  });
});

describe('useEnableSyncWithConfirm source-level guards', () => {
  test('off → on opens the confirmation dialog (does NOT call applyEnabled directly)', () => {
    const start = SRC.indexOf('function onToggleRequest');
    expect(start).toBeGreaterThan(-1);
    const tail = SRC.slice(start);
    const end = tail.indexOf('\n  }\n');
    const body = tail.slice(0, end);

    expect(body).toMatch(/if\s*\(\s*next\s*\)\s*\{[\s\S]*?setConfirmOpen\(true\)/);
    expect(body).not.toMatch(/if\s*\(\s*next\s*\)[\s\S]*?applyEnabled\(true\)/);
  });

  test('on → off commits immediately via applyEnabled(false)', () => {
    expect(SRC).toMatch(/applyEnabled\(\s*false\s*\)/);
  });

  test('only the confirm callback applies the enable-direction write', () => {
    const onConfirmStart = SRC.indexOf('async function onConfirm');
    expect(onConfirmStart).toBeGreaterThan(-1);
    const onConfirmBody = SRC.slice(onConfirmStart);
    expect(onConfirmBody).toMatch(/applyEnabled\(\s*true\s*\)/);

    const matches = SRC.match(/applyEnabled\(\s*true\s*\)/g);
    expect(matches).toHaveLength(1);
  });

  test('onConfirm awaits the write BEFORE closing the dialog', () => {
    const onConfirmStart = SRC.indexOf('async function onConfirm');
    expect(onConfirmStart).toBeGreaterThan(-1);
    const onConfirmBody = SRC.slice(onConfirmStart);
    const awaitIdx = onConfirmBody.search(/await\s+applyEnabled\(\s*true\s*\)/);
    const closeIdx = onConfirmBody.search(/setConfirmOpen\(\s*false\s*\)/);
    expect(awaitIdx).toBeGreaterThan(-1);
    expect(closeIdx).toBeGreaterThan(-1);
    expect(awaitIdx).toBeLessThan(closeIdx);
  });

  test('onConfirm closes the dialog only on success', () => {
    const onConfirmStart = SRC.indexOf('async function onConfirm');
    const onConfirmBody = SRC.slice(onConfirmStart);
    expect(onConfirmBody).toMatch(/const\s+\w+\s*=\s*await\s+applyEnabled\(\s*true\s*\)/);
    expect(onConfirmBody).toMatch(/if\s*\(\s*\w+\s*\)\s*setConfirmOpen\(\s*false\s*\)/);
    expect(SRC).toMatch(/applyEnabled\([^)]*\):\s*Promise<boolean>/);
  });

  test('write goes through POST /api/sync/set-enabled (shared helper)', () => {
    expect(SRC).toContain("from '@/lib/sync-api'");
    expect(SYNC_API_SRC).toContain("'/api/sync/set-enabled'");
    expect(SYNC_API_SRC).toContain("method: 'POST'");
  });
});
