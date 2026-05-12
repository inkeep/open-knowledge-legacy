import { describe, expect, test } from 'bun:test';
import SRC from './use-enable-sync-with-confirm?raw';

describe('useEnableSyncWithConfirm module', () => {
  test('exports the hook + the project-local writer adapter', async () => {
    const mod = await import('./use-enable-sync-with-confirm');
    expect(typeof mod.useEnableSyncWithConfirm).toBe('function');
    expect(typeof mod.useSyncEnabledWriter).toBe('function');
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
    const onConfirmStart = SRC.indexOf('function onConfirm');
    expect(onConfirmStart).toBeGreaterThan(-1);
    const onConfirmBody = SRC.slice(onConfirmStart);
    expect(onConfirmBody).toMatch(/applyEnabled\(\s*true\s*\)/);

    const matches = SRC.match(/applyEnabled\(\s*true\s*\)/g);
    expect(matches).toHaveLength(1);
  });

  test('onConfirm applies the write BEFORE closing the dialog', () => {
    const onConfirmStart = SRC.indexOf('function onConfirm');
    expect(onConfirmStart).toBeGreaterThan(-1);
    const onConfirmBody = SRC.slice(onConfirmStart);
    const writeIdx = onConfirmBody.search(/applyEnabled\(\s*true\s*\)/);
    const closeIdx = onConfirmBody.search(/setConfirmOpen\(\s*false\s*\)/);
    expect(writeIdx).toBeGreaterThan(-1);
    expect(closeIdx).toBeGreaterThan(-1);
    expect(writeIdx).toBeLessThan(closeIdx);
  });

  test('onConfirm closes the dialog only on success', () => {
    const onConfirmStart = SRC.indexOf('function onConfirm');
    const onConfirmBody = SRC.slice(onConfirmStart);
    expect(onConfirmBody).toMatch(/const\s+\w+\s*=\s*applyEnabled\(\s*true\s*\)/);
    expect(onConfirmBody).toMatch(/if\s*\(\s*\w+\s*\)\s*setConfirmOpen\(\s*false\s*\)/);
    expect(SRC).toMatch(/applyEnabled\([^)]*\):\s*boolean/);
  });

  test('writes route through the project-local ConfigBinding, not the deleted HTTP path', () => {
    expect(SRC).not.toContain('postSyncEnabled');
    expect(SRC).not.toContain('/api/sync/set-enabled');
    expect(SRC).not.toContain("'@/lib/sync-api'");
  });
});

describe('useSyncEnabledWriter — binding adapter', () => {
  test('reads projectLocalBinding from useConfigContext', () => {
    expect(SRC).toContain('useConfigContext');
    expect(SRC).toMatch(/projectLocalBinding/);
  });

  test('returns null when the binding has not yet mounted (cold-start window)', () => {
    expect(SRC).toMatch(/if\s*\(\s*projectLocalBinding\s*===\s*null\s*\)\s*return null/);
  });

  test('patches { autoSync: { enabled } } on the project-local binding', () => {
    expect(SRC).toMatch(
      /projectLocalBinding\.patch\(\s*\{\s*autoSync:\s*\{\s*enabled\s*\}\s*\}\s*\)/,
    );
  });

  test('wraps Result.err via humanFormat so the toast renders a readable string', () => {
    expect(SRC).toContain('humanFormat');
    expect(SRC).toMatch(/error:\s*humanFormat\(result\.error\)/);
  });
});
