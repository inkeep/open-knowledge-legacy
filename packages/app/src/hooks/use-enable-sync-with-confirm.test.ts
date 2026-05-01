/**
 * Source-level guards for the enable-sync confirmation gate.
 *
 * The hook protects a destructive operation (off → on triggers push to remote
 * and pull-may-overwrite-local). An accidental inversion of the direction
 * gate would let users enable sync without warning. These guards lock the
 * direction asymmetry into the source so the regression class can't recur
 * silently.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const HERE = new URL('.', import.meta.url).pathname;
const SRC = readFileSync(join(HERE, 'use-enable-sync-with-confirm.ts'), 'utf8');

describe('useEnableSyncWithConfirm module', () => {
  test('exports the hook', async () => {
    const mod = await import('./use-enable-sync-with-confirm');
    expect(typeof mod.useEnableSyncWithConfirm).toBe('function');
  });
});

describe('useEnableSyncWithConfirm source-level guards', () => {
  test('off → on opens the confirmation dialog (does NOT call applyEnabled directly)', () => {
    // Isolate the onToggleRequest body so assertions are scoped.
    const start = SRC.indexOf('function onToggleRequest');
    expect(start).toBeGreaterThan(-1);
    const tail = SRC.slice(start);
    const end = tail.indexOf('\n  }\n');
    const body = tail.slice(0, end);

    // Enable-direction branch must gate behind the dialog.
    expect(body).toMatch(/if\s*\(\s*next\s*\)\s*\{[\s\S]*?setConfirmOpen\(true\)/);
    // The enable branch must NOT call applyEnabled(true) before user confirms.
    expect(body).not.toMatch(/if\s*\(\s*next\s*\)[\s\S]*?applyEnabled\(true\)/);
  });

  test('on → off commits immediately via applyEnabled(false)', () => {
    expect(SRC).toMatch(/applyEnabled\(\s*false\s*\)/);
  });

  test('only the confirm callback applies the enable-direction write', () => {
    // The on-confirm path is the single sanctioned call site for applyEnabled(true).
    const onConfirmStart = SRC.indexOf('async function onConfirm');
    expect(onConfirmStart).toBeGreaterThan(-1);
    const onConfirmBody = SRC.slice(onConfirmStart);
    expect(onConfirmBody).toMatch(/applyEnabled\(\s*true\s*\)/);
  });

  test('write goes through POST /api/sync/set-enabled', () => {
    expect(SRC).toContain("'/api/sync/set-enabled'");
    expect(SRC).toContain("method: 'POST'");
  });
});
