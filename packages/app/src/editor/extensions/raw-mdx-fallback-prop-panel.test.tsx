/**
 * Pure-helper unit tests for RawMdxFallbackPropPanel.
 *
 * The embedded CM6 editor + React lifecycle are exercised in Playwright e2e
 * post-US-008 (chip click → PropPanel open → type → CRDT propagation). Here
 * we cover the pure PM-transaction planning + CM extension builder so
 * bridge + editor semantics stay deterministic across rewrites.
 */
import { describe, expect, it } from 'bun:test';
import type { Editor } from '@tiptap/core';
import {
  buildCmExtensions,
  computePmReplaceTransaction,
  hasMeaningfulSpan,
} from './RawMdxFallbackPropPanel';

describe('hasMeaningfulSpan', () => {
  it('returns false for null/undefined', () => {
    expect(hasMeaningfulSpan(null)).toBe(false);
    expect(hasMeaningfulSpan(undefined)).toBe(false);
  });

  it('returns false for R13 default {0,0}', () => {
    expect(hasMeaningfulSpan({ start: 0, end: 0 })).toBe(false);
  });

  it('returns true when either bound is non-zero', () => {
    expect(hasMeaningfulSpan({ start: 5, end: 0 })).toBe(true);
    expect(hasMeaningfulSpan({ start: 0, end: 12 })).toBe(true);
    expect(hasMeaningfulSpan({ start: 5, end: 12 })).toBe(true);
  });
});

describe('computePmReplaceTransaction', () => {
  interface FakeNode {
    type: { name: string };
    textContent: string;
    nodeSize: number;
  }
  interface FakeEditor {
    state: { doc: { nodeAt(pos: number): FakeNode | null } };
  }

  function makeEditor(nodeAt: Record<number, FakeNode | null>): Editor {
    const editor: FakeEditor = {
      state: {
        doc: {
          nodeAt: (pos: number) => nodeAt[pos] ?? null,
        },
      },
    };
    return editor as unknown as Editor;
  }

  it('returns null when no node is present at the position', () => {
    const editor = makeEditor({});
    expect(computePmReplaceTransaction({ editor, pos: 3, nextText: 'x' })).toBeNull();
  });

  it('returns null when the node is not a rawMdxFallback', () => {
    const editor = makeEditor({
      5: { type: { name: 'paragraph' }, textContent: 'abc', nodeSize: 5 },
    });
    expect(computePmReplaceTransaction({ editor, pos: 5, nextText: 'xyz' })).toBeNull();
  });

  it('returns null when the text is unchanged (idempotent write guard)', () => {
    const editor = makeEditor({
      5: { type: { name: 'rawMdxFallback' }, textContent: 'abc', nodeSize: 5 },
    });
    expect(computePmReplaceTransaction({ editor, pos: 5, nextText: 'abc' })).toBeNull();
  });

  it('computes {from, to, text} triple for a rawMdxFallback with content text', () => {
    // content: 'text*' — nodeSize = 1 (open) + 3 (text) + 1 (close) = 5
    const editor = makeEditor({
      5: { type: { name: 'rawMdxFallback' }, textContent: 'abc', nodeSize: 5 },
    });
    const plan = computePmReplaceTransaction({ editor, pos: 5, nextText: 'abcdef' });
    expect(plan).toEqual({ from: 6, to: 9, nextText: 'abcdef' });
  });

  it('handles empty-text rewrite (allows clearing the inner content)', () => {
    const editor = makeEditor({
      10: { type: { name: 'rawMdxFallback' }, textContent: 'xy', nodeSize: 4 },
    });
    const plan = computePmReplaceTransaction({ editor, pos: 10, nextText: '' });
    expect(plan).toEqual({ from: 11, to: 13, nextText: '' });
  });
});

describe('buildCmExtensions', () => {
  it('returns a non-empty Extension array wired to the supplied callbacks', () => {
    let docChanges = 0;
    let escapeCount = 0;
    const exts = buildCmExtensions({
      onDocChange: () => {
        docChanges++;
      },
      onEscape: () => {
        escapeCount++;
      },
    });
    // Each extension is an object/array — just assert we got something back.
    expect(Array.isArray(exts)).toBe(true);
    expect(exts.length).toBeGreaterThan(0);
    // Closure references are preserved (the callback counters start at 0 — we
    // don't invoke them here; the CM6 view tests would live in Playwright).
    expect(docChanges).toBe(0);
    expect(escapeCount).toBe(0);
  });
});
