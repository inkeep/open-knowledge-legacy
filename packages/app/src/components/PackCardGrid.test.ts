import { describe, expect, test } from 'bun:test';
import { formatEntryCounts } from './PackCardGrid';
import SRC from './PackCardGrid?raw';

describe('PackCardGrid module', () => {
  test('exports PackCardGrid component', async () => {
    const mod = await import('./PackCardGrid');
    expect(typeof mod.PackCardGrid).toBe('function');
  });
});

describe('PackCardGrid source-level guards', () => {
  test('routes pack listing through the shared seedClient transport', () => {
    expect(SRC).toContain("from '@/lib/seed-client'");
    expect(SRC).toContain('seedClient().listPacks()');
  });

  test('hardcodes a lucide icon for every registered PackId', () => {
    for (const id of [
      "'knowledge-base'",
      "'software-lifecycle'",
      "'plain-notes'",
      'worldbuilding',
      "'writing-pipeline'",
      'gbrain',
    ]) {
      expect(SRC).toContain(id);
    }
  });

  test('renders each card as a button for keyboard a11y', () => {
    expect(SRC).toContain('<button');
    expect(SRC).toContain('type="button"');
  });

  test('exposes a loading skeleton instead of nothing while packs are unknown', () => {
    expect(SRC).toContain('PackCardSkeleton');
    expect(SRC).toContain('aria-busy="true"');
  });

  test('surfaces fetch failures with role="alert"', () => {
    expect(SRC).toContain('role="alert"');
  });

  test('renders an empty-state instead of a blank gap when packs[] is []', () => {
    expect(SRC).toContain('No starter packs available.');
  });

  test('skips its internal fetch when the caller supplies packs', () => {
    expect(SRC).toContain('externalPacks === undefined');
  });
});

describe('formatEntryCounts() — card subtitle formatting', () => {
  test('renders "N files · N folders" for mixed packs', () => {
    expect(formatEntryCounts({ files: 4, folders: 3 })).toBe('4 files · 3 folders');
  });

  test('elides the file segment for folder-only packs', () => {
    expect(formatEntryCounts({ files: 0, folders: 2 })).toBe('2 folders');
  });

  test('singularizes when count is 1', () => {
    expect(formatEntryCounts({ files: 1, folders: 1 })).toBe('1 file · 1 folder');
  });
});
