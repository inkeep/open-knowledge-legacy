/**
 * Auto-bail unit tests — validates line-count ceiling, timing constants,
 * and threshold boundary behavior using EditorState.
 */

import { describe, expect, test } from 'bun:test';
import { EditorState } from '@codemirror/state';
import { FIRST_PAINT_CEILING_MS, LINE_CEILING } from './auto-bail';

describe('auto-bail constants', () => {
  test('LINE_CEILING is 5000', () => {
    expect(LINE_CEILING).toBe(5000);
  });

  test('FIRST_PAINT_CEILING_MS is 200', () => {
    expect(FIRST_PAINT_CEILING_MS).toBe(200);
  });
});

describe('auto-bail threshold boundary', () => {
  test('4999-line doc does NOT exceed LINE_CEILING', () => {
    const doc = `${'x\n'.repeat(4998)}x`; // 4999 lines
    const state = EditorState.create({ doc });
    expect(state.doc.lines).toBe(4999);
    expect(state.doc.lines > LINE_CEILING).toBe(false);
  });

  test('5000-line doc does NOT exceed LINE_CEILING (boundary: > not >=)', () => {
    const doc = `${'x\n'.repeat(4999)}x`; // 5000 lines
    const state = EditorState.create({ doc });
    expect(state.doc.lines).toBe(5000);
    expect(state.doc.lines > LINE_CEILING).toBe(false);
  });

  test('5001-line doc exceeds LINE_CEILING', () => {
    const doc = `${'x\n'.repeat(5000)}x`; // 5001 lines
    const state = EditorState.create({ doc });
    expect(state.doc.lines).toBe(5001);
    expect(state.doc.lines > LINE_CEILING).toBe(true);
  });

  test('doc growing past ceiling via transaction triggers bail condition', () => {
    // Start with a doc under the ceiling
    const smallDoc = `${'x\n'.repeat(4998)}x`; // 4999 lines
    const state = EditorState.create({ doc: smallDoc });
    expect(state.doc.lines > LINE_CEILING).toBe(false);

    // Simulate a paste that pushes past the ceiling
    const paste = '\n'.repeat(10); // adds 10 lines
    const tr = state.update({ changes: { from: state.doc.length, insert: paste } });
    expect(tr.state.doc.lines > LINE_CEILING).toBe(true);
  });
});

describe('auto-bail ViewPlugin behavior contract', () => {
  test('getFirstPaintMs returns a number', async () => {
    const { getFirstPaintMs } = await import('./view-plugin');
    const ms = getFirstPaintMs();
    // Either -1 (never instantiated) or >= 0 (already instantiated by another test)
    expect(typeof ms).toBe('number');
  });
});
