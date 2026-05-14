import { describe, expect, test } from 'bun:test';
import SRC from './EmptyStateHeader?raw';

describe('EmptyStateHeader module', () => {
  test('exports EmptyStateHeader component', async () => {
    const mod = await import('./EmptyStateHeader');
    expect(typeof mod.EmptyStateHeader).toBe('function');
  });
});

describe('EmptyStateHeader source-level guards', () => {
  test('accepts title, optional subtitle, and celebrateSignal props', () => {
    expect(SRC).toContain('title: string');
    expect(SRC).toContain('subtitle?: string');
    expect(SRC).toContain('celebrateSignal: number');
  });

  test('renders subtitle only when provided', () => {
    expect(SRC).toMatch(/subtitle\s*\?\s*<p/);
  });

  test('forwards celebrateSignal to OkBlob', () => {
    expect(SRC).toContain('celebrateSignal={celebrateSignal}');
  });

  test('uses block-level layout (not inline-flex with text)', () => {
    expect(SRC).toContain('flex items-center gap-4');
  });
});
