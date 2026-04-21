/**
 * Nested CodeMirror sync math tests (NCM02-NCM04, M15).
 *
 * Tests the `computeChange` function that computes minimal string diffs
 * for PM→CM and CM→PM synchronization, and the `shouldEscapeNestedCM`
 * boundary predicate that drives arrow-key escape from nested CM to outer PM.
 */

import { describe, expect, test } from 'bun:test';
import { EditorState } from '@codemirror/state';
import type { EditorView as CMEditorView } from '@codemirror/view';
import { computeChange, shouldEscapeNestedCM } from './RawMdxFallbackCMView';

/**
 * Build a minimal CM EditorView stand-in that satisfies
 * `shouldEscapeNestedCM`'s surface: `.state.selection.main` +
 * `.state.doc.lineAt` + `.state.doc.length`. We use a real CM `EditorState`
 * so `doc.lineAt` returns the true CM `Line` shape — no mocking the shape.
 */
function makeCMView(doc: string, selPos: number | { anchor: number; head: number }): CMEditorView {
  const selection =
    typeof selPos === 'number'
      ? { anchor: selPos, head: selPos }
      : { anchor: selPos.anchor, head: selPos.head };
  const state = EditorState.create({ doc, selection });
  // We never mount the view — only `.state` is read by shouldEscapeNestedCM.
  return { state } as unknown as CMEditorView;
}

describe('computeChange', () => {
  test('returns null for identical strings', () => {
    expect(computeChange('hello', 'hello')).toBeNull();
  });

  test('returns null for empty identical strings', () => {
    expect(computeChange('', '')).toBeNull();
  });

  test('detects insert at end', () => {
    const change = computeChange('hello', 'hello world');
    expect(change).toEqual({ from: 5, to: 5, text: ' world' });
  });

  test('detects insert at beginning', () => {
    const change = computeChange('world', 'hello world');
    expect(change).toEqual({ from: 0, to: 0, text: 'hello ' });
  });

  test('detects insert in middle', () => {
    const change = computeChange('helloworld', 'hello world');
    expect(change).toEqual({ from: 5, to: 5, text: ' ' });
  });

  test('detects delete at end', () => {
    const change = computeChange('hello world', 'hello');
    expect(change).toEqual({ from: 5, to: 11, text: '' });
  });

  test('detects delete at beginning', () => {
    const change = computeChange('hello world', 'world');
    expect(change).toEqual({ from: 0, to: 6, text: '' });
  });

  test('detects delete in middle', () => {
    const change = computeChange('hello world', 'helloworld');
    expect(change).toEqual({ from: 5, to: 6, text: '' });
  });

  test('detects replacement', () => {
    const change = computeChange('hello world', 'hello there');
    expect(change).toEqual({ from: 6, to: 11, text: 'there' });
  });

  test('detects full replacement', () => {
    const change = computeChange('abc', 'xyz');
    expect(change).toEqual({ from: 0, to: 3, text: 'xyz' });
  });

  test('handles empty to non-empty', () => {
    const change = computeChange('', 'hello');
    expect(change).toEqual({ from: 0, to: 0, text: 'hello' });
  });

  test('handles non-empty to empty', () => {
    const change = computeChange('hello', '');
    expect(change).toEqual({ from: 0, to: 5, text: '' });
  });

  test('handles single character insert', () => {
    const change = computeChange('helo', 'hello');
    expect(change).toEqual({ from: 3, to: 3, text: 'l' });
  });

  test('handles single character delete', () => {
    const change = computeChange('hello', 'helo');
    expect(change).toEqual({ from: 3, to: 4, text: '' });
  });

  test('handles multiline content', () => {
    const old = '<Callout>\nfirst\n</Callout>';
    const neu = '<Callout>\nsecond\n</Callout>';
    const change = computeChange(old, neu);
    expect(change).toEqual({ from: 10, to: 15, text: 'second' });
  });

  // Loop prevention stress test (NCM04-inspired at unit level)
  test('1000 sequential computeChanges produce correct results', () => {
    let current = 'start';
    for (let i = 0; i < 1000; i++) {
      const next = `${current}${i}`;
      const change = computeChange(current, next);
      expect(change).not.toBeNull();
      // Apply the change to verify correctness
      const applied = current.slice(0, change?.from) + change?.text + current.slice(change?.to);
      expect(applied).toBe(next);
      current = next;
    }
  });
});

describe('shouldEscapeNestedCM', () => {
  // char × Left (dir=-1): escape only when cursor is at offset 0
  test('char/Left: cursor at start → escape', () => {
    const view = makeCMView('hello', 0);
    expect(shouldEscapeNestedCM(view, 'char', -1)).toBe(true);
  });
  test('char/Left: cursor mid-doc → no escape', () => {
    const view = makeCMView('hello', 3);
    expect(shouldEscapeNestedCM(view, 'char', -1)).toBe(false);
  });
  test('char/Left: cursor at end → no escape (wrong direction)', () => {
    const view = makeCMView('hello', 5);
    expect(shouldEscapeNestedCM(view, 'char', -1)).toBe(false);
  });

  // char × Right (dir=+1): escape only when cursor is at doc end
  test('char/Right: cursor at end → escape', () => {
    const view = makeCMView('hello', 5);
    expect(shouldEscapeNestedCM(view, 'char', 1)).toBe(true);
  });
  test('char/Right: cursor mid-doc → no escape', () => {
    const view = makeCMView('hello', 3);
    expect(shouldEscapeNestedCM(view, 'char', 1)).toBe(false);
  });
  test('char/Right: cursor at start → no escape (wrong direction)', () => {
    const view = makeCMView('hello', 0);
    expect(shouldEscapeNestedCM(view, 'char', 1)).toBe(false);
  });

  // line × Up (dir=-1): escape only when cursor is on the first line
  test('line/Up: cursor on first line (col 3) → escape', () => {
    const view = makeCMView('hello\nworld\n!', 3);
    expect(shouldEscapeNestedCM(view, 'line', -1)).toBe(true);
  });
  test('line/Up: cursor on second line → no escape', () => {
    const view = makeCMView('hello\nworld\n!', 8);
    expect(shouldEscapeNestedCM(view, 'line', -1)).toBe(false);
  });

  // line × Down (dir=+1): escape only when cursor is on the last line
  test('line/Down: cursor on last line → escape', () => {
    const view = makeCMView('hello\nworld\n!', 13);
    expect(shouldEscapeNestedCM(view, 'line', 1)).toBe(true);
  });
  test('line/Down: cursor on middle line → no escape', () => {
    const view = makeCMView('hello\nworld\n!', 8);
    expect(shouldEscapeNestedCM(view, 'line', 1)).toBe(false);
  });

  // Non-empty selection never escapes — prevents accidentally blowing
  // away a shift-arrow range expansion that crosses the boundary
  test('non-empty selection at start → no escape (protect range expansion)', () => {
    const view = makeCMView('hello', { anchor: 0, head: 3 });
    expect(shouldEscapeNestedCM(view, 'char', -1)).toBe(false);
  });
  test('non-empty selection at end → no escape', () => {
    const view = makeCMView('hello', { anchor: 3, head: 5 });
    expect(shouldEscapeNestedCM(view, 'char', 1)).toBe(false);
  });

  // Empty document: cursor is simultaneously at start AND end — escapes
  // in whichever direction is requested. This matches the canonical
  // pattern: an empty fallback block should not trap the caret.
  test('empty doc: char/Left → escape', () => {
    const view = makeCMView('', 0);
    expect(shouldEscapeNestedCM(view, 'char', -1)).toBe(true);
  });
  test('empty doc: char/Right → escape', () => {
    const view = makeCMView('', 0);
    expect(shouldEscapeNestedCM(view, 'char', 1)).toBe(true);
  });
  test('empty doc: line/Up → escape', () => {
    const view = makeCMView('', 0);
    expect(shouldEscapeNestedCM(view, 'line', -1)).toBe(true);
  });
  test('empty doc: line/Down → escape', () => {
    const view = makeCMView('', 0);
    expect(shouldEscapeNestedCM(view, 'line', 1)).toBe(true);
  });

  // Single-line doc: Up/Down both escape because first line == last line
  test('single line: line/Up (col 2) → escape', () => {
    const view = makeCMView('hello', 2);
    expect(shouldEscapeNestedCM(view, 'line', -1)).toBe(true);
  });
  test('single line: line/Down (col 2) → escape', () => {
    const view = makeCMView('hello', 2);
    expect(shouldEscapeNestedCM(view, 'line', 1)).toBe(true);
  });
});
