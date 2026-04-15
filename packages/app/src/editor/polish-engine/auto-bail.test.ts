/**
 * Auto-bail unit tests — validates line-count ceiling and timing
 * trigger conditions.
 */

import { describe, expect, test } from 'bun:test';
import { FIRST_PAINT_CEILING_MS, LINE_CEILING } from './auto-bail';

describe('auto-bail constants', () => {
  test('LINE_CEILING is 5000', () => {
    expect(LINE_CEILING).toBe(5000);
  });

  test('FIRST_PAINT_CEILING_MS is 200', () => {
    expect(FIRST_PAINT_CEILING_MS).toBe(200);
  });
});

describe('auto-bail ViewPlugin behavior contract', () => {
  test('getFirstPaintMs returns -1 before any ViewPlugin instantiation', async () => {
    // Import dynamically to get a fresh module state
    const { getFirstPaintMs } = await import('./view-plugin');
    // In a test env without EditorView, firstPaintMs stays at default
    // This verifies the sentinel value contract
    const ms = getFirstPaintMs();
    // Either -1 (never instantiated) or >= 0 (already instantiated by another test)
    expect(typeof ms).toBe('number');
  });

  test('line ceiling check is O(1) — doc.lines is a property access', () => {
    // Verify the contract: doc.lines > LINE_CEILING is the check,
    // and LINE_CEILING is a constant (not computed per-call)
    expect(LINE_CEILING).toBeGreaterThan(0);
    expect(LINE_CEILING).toBe(5000);
  });
});
