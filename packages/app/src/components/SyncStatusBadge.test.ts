/**
 * Source-level guards for the SyncStatusBadge visibility rules.
 *
 * The badge hides only for `disabled` (the user opted out) and `dormant` with
 * no remote (no git remote configured). All other states — auth-error,
 * conflict, offline, fetching/pulling/pushing, idle — must remain visible
 * because they need attention. An accidental hide of an attention-worthy
 * state would silently hide sync errors from users.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const HERE = new URL('.', import.meta.url).pathname;
const SRC = readFileSync(join(HERE, 'SyncStatusBadge.tsx'), 'utf8');

describe('SyncStatusBadge module', () => {
  test('exports the SyncStatusBadge component', async () => {
    const mod = await import('./SyncStatusBadge');
    expect(typeof mod.SyncStatusBadge).toBe('function');
  });
});

describe('SyncStatusBadge source-level guards', () => {
  test('hides only when sync is explicitly disabled', () => {
    expect(SRC).toMatch(/status\.state\s*===\s*'disabled'\s*\)\s*return\s+null/);
  });

  test('does not hide on attention-worthy error states', () => {
    expect(SRC).not.toMatch(/status\.state\s*===\s*'auth-error'[^\n]*return\s+null/);
    expect(SRC).not.toMatch(/status\.state\s*===\s*'conflict'[^\n]*return\s+null/);
    expect(SRC).not.toMatch(/status\.state\s*===\s*'offline'[^\n]*return\s+null/);
  });

  test('hides dormant only when no remote is configured', () => {
    // The dormant hide must be conjunctive with !hasRemote — pure dormant
    // (remote present, sync off) is the "available" state and stays visible.
    expect(SRC).toMatch(
      /status\.state\s*===\s*'dormant'\s*&&\s*!status\.hasRemote[^\n]*return\s+null/,
    );
  });

  test('routes off → on through the shared confirmation hook', () => {
    expect(SRC).toContain("from '@/hooks/use-enable-sync-with-confirm'");
    expect(SRC).toContain('useEnableSyncWithConfirm');
    expect(SRC).toContain('EnableSyncConfirmDialog');
  });
});
