import { describe, expect, test } from 'bun:test';
import SRC from './SyncStatusBadge?raw';

describe('SyncStatusBadge module', () => {
  test('exports the SyncStatusBadge component', async () => {
    const mod = await import('./SyncStatusBadge');
    expect(typeof mod.SyncStatusBadge).toBe('function');
  });
});

describe('SyncStatusBadge source-level guards', () => {
  test('hides only when explicitly disabled AND no pausedReason', () => {
    expect(SRC).toMatch(
      /status\.state\s*===\s*'disabled'\s*&&\s*!status\.pausedReason[^\n]*return\s+null/,
    );
  });

  test('does not hide on attention-worthy error states', () => {
    expect(SRC).not.toMatch(/status\.state\s*===\s*'auth-error'[^\n]*return\s+null/);
    expect(SRC).not.toMatch(/status\.state\s*===\s*'conflict'[^\n]*return\s+null/);
    expect(SRC).not.toMatch(/status\.state\s*===\s*'offline'[^\n]*return\s+null/);
  });

  test('hides dormant only when no remote is configured', () => {
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
