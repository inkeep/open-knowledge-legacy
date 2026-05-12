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

describe('SyncStatusBadge PopoverBody Switch — bound to local CRDT preference (not server status)', () => {
  const popoverBodyStart = SRC.indexOf('function PopoverBody(');
  const publicComponentStart = SRC.indexOf('export function SyncStatusBadge(');
  const popoverBodySrc = SRC.slice(popoverBodyStart, publicComponentStart);

  test('PopoverBody isolation slice is non-empty (sanity)', () => {
    expect(popoverBodyStart).toBeGreaterThan(-1);
    expect(publicComponentStart).toBeGreaterThan(popoverBodyStart);
    expect(popoverBodySrc.length).toBeGreaterThan(200);
  });

  test('Switch.checked derives from the local CRDT preference, not status.syncEnabled', () => {
    expect(popoverBodySrc).toMatch(/useConfigContext|projectLocalConfig/);
    expect(popoverBodySrc).not.toMatch(/const enabled\s*=\s*.*status/);
  });

  test('write path is unchanged — projectLocalBinding.patch() via useSyncEnabledWriter', () => {
    expect(popoverBodySrc).toContain('useSyncEnabledWriter');
    expect(popoverBodySrc).toContain('useEnableSyncWithConfirm');
    expect(popoverBodySrc).toContain('onToggleRequest');
  });

  test('useGitSyncStatusDetailed still drives badge state/label/visibility', () => {
    expect(SRC).toContain('useGitSyncStatusDetailed');
    expect(SRC).toMatch(/<BadgeIcon\s+status=\{status\}/);
  });

  test('Switch disabled prop gates against the cold-start window', () => {
    expect(popoverBodySrc).toMatch(/projectLocalSynced/);
    expect(popoverBodySrc).toMatch(/disabled=\{!projectLocalSynced\}/);
  });
});
