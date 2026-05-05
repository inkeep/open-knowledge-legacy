import { describe, expect, test } from 'bun:test';
import type { FlowChildren, FlowParents, State } from 'mdast-util-to-markdown';
import { positionAwareBlankLineJoin } from './position-aware-join.ts';

const parent = { type: 'root', children: [] } as unknown as FlowParents;
const state = {} as State;

function paragraph(startLine: number, endLine: number): FlowChildren {
  return {
    type: 'paragraph',
    children: [],
    position: {
      start: { line: startLine, column: 1, offset: 0 },
      end: { line: endLine, column: 1, offset: 0 },
    },
  } as unknown as FlowChildren;
}

function paragraphNoPosition(): FlowChildren {
  return { type: 'paragraph', children: [] } as unknown as FlowChildren;
}

describe('positionAwareBlankLineJoin', () => {
  describe('with positions present', () => {
    test('returns 1 for one blank line between siblings (start.line - end.line - 1 = 1)', () => {
      const result = positionAwareBlankLineJoin(paragraph(1, 1), paragraph(3, 3), parent, state);
      expect(result).toBe(1);
    });

    test('returns 2 for two blank lines (start.line - end.line - 1 = 2)', () => {
      const result = positionAwareBlankLineJoin(paragraph(1, 1), paragraph(4, 4), parent, state);
      expect(result).toBe(2);
    });

    test('returns 4 for four blank lines (start.line - end.line - 1 = 4)', () => {
      const result = positionAwareBlankLineJoin(paragraph(1, 1), paragraph(6, 6), parent, state);
      expect(result).toBe(4);
    });

    test('returns 10 for ten blank lines', () => {
      const result = positionAwareBlankLineJoin(paragraph(1, 1), paragraph(12, 12), parent, state);
      expect(result).toBe(10);
    });

    test('handles multi-line left node (paragraph spanning lines 1-3)', () => {
      const result = positionAwareBlankLineJoin(paragraph(1, 3), paragraph(5, 5), parent, state);
      expect(result).toBe(1);
    });
  });

  describe('returns undefined to fall through to default', () => {
    test('left node missing position', () => {
      const result = positionAwareBlankLineJoin(
        paragraphNoPosition(),
        paragraph(5, 5),
        parent,
        state,
      );
      expect(result).toBeUndefined();
    });

    test('right node missing position', () => {
      const result = positionAwareBlankLineJoin(
        paragraph(1, 1),
        paragraphNoPosition(),
        parent,
        state,
      );
      expect(result).toBeUndefined();
    });

    test('both nodes missing position', () => {
      const result = positionAwareBlankLineJoin(
        paragraphNoPosition(),
        paragraphNoPosition(),
        parent,
        state,
      );
      expect(result).toBeUndefined();
    });

    test('clamps zero-gap (adjacent on same line) to undefined — not 0', () => {
      const result = positionAwareBlankLineJoin(paragraph(1, 1), paragraph(2, 2), parent, state);
      expect(result).toBeUndefined();
    });

    test('clamps negative gap (out-of-order positions) to undefined', () => {
      const result = positionAwareBlankLineJoin(paragraph(5, 5), paragraph(2, 2), parent, state);
      expect(result).toBeUndefined();
    });

    test('clamps zero-gap from multi-line left node', () => {
      const result = positionAwareBlankLineJoin(paragraph(1, 3), paragraph(4, 4), parent, state);
      expect(result).toBeUndefined();
    });
  });
});
