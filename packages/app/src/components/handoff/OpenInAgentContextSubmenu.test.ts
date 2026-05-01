
import { describe, expect, test } from 'bun:test';
import type { HandoffTarget, InstallState } from '@inkeep/open-knowledge-core';
import { KNOWN_TARGETS } from '@/lib/handoff/targets';
import { contextRowHint } from './OpenInAgentContextSubmenu';

function installStateOf(installed: boolean | null): InstallState {
  return { installed, lastChecked: installed === null ? undefined : 1 };
}

function targetById(id: HandoffTarget) {
  const entry = KNOWN_TARGETS.find((t) => t.id === id);
  if (!entry) throw new Error(`KNOWN_TARGETS missing id=${id}`);
  return entry;
}

describe('contextRowHint', () => {
  test('enabled row (installed + workspace known): returns null (no hint)', () => {
    const target = targetById('claude-cowork');
    expect(contextRowHint(target, installStateOf(true), true, false)).toBeNull();
  });

  test('pre-probe row (installed === null): returns "Detecting…"', () => {
    const target = targetById('codex');
    expect(contextRowHint(target, installStateOf(null), true, false)).toBe('Detecting…');
  });

  test('installed === false: returns "Not installed"', () => {
    const target = targetById('codex');
    expect(contextRowHint(target, installStateOf(false), true, false)).toBe('Not installed');
  });

  test('inputMissing (no workspace yet): returns "No workspace"', () => {
    const target = targetById('claude-code');
    expect(contextRowHint(target, installStateOf(true), true, true)).toBe('No workspace');
  });

  test('web-host Cursor: returns "Desktop only" regardless of probe result', () => {
    const cursor = targetById('cursor');
    expect(contextRowHint(cursor, installStateOf(true), false, false)).toBe('Desktop only');
    expect(contextRowHint(cursor, installStateOf(false), false, false)).toBe('Desktop only');
    expect(contextRowHint(cursor, installStateOf(null), false, false)).toBe('Desktop only');
  });

  test('Electron Cursor: follows the normal install-state branches', () => {
    const cursor = targetById('cursor');
    expect(contextRowHint(cursor, installStateOf(true), true, false)).toBeNull();
    expect(contextRowHint(cursor, installStateOf(false), true, false)).toBe('Not installed');
    expect(contextRowHint(cursor, installStateOf(null), true, false)).toBe('Detecting…');
  });

  test('precedence: web-host Cursor overrides the inputMissing branch', () => {
    const cursor = targetById('cursor');
    expect(contextRowHint(cursor, installStateOf(null), false, true)).toBe('Desktop only');
  });
});

describe('module surface', () => {
  test('exports OpenInAgentContextSubmenu + contextRowHint', async () => {
    const mod = await import('./OpenInAgentContextSubmenu');
    expect(typeof mod.OpenInAgentContextSubmenu).toBe('function');
    expect(typeof mod.contextRowHint).toBe('function');
  });

  test('re-uses computeRowState from OpenInAgentMenuItem (no drift)', async () => {
    const itemMod = await import('./OpenInAgentMenuItem');
    expect(typeof itemMod.computeRowState).toBe('function');

    const cursor = targetById('cursor');
    const rowState = itemMod.computeRowState({
      target: cursor,
      installState: installStateOf(true),
      isElectronHost: false,
    });
    expect(rowState.enabled).toBe(false);
    expect(contextRowHint(cursor, installStateOf(true), false, false)).toBe('Desktop only');
  });
});
