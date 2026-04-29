import { describe, expect, test } from 'bun:test';
import {
  applyRenameMap,
  buildRenameMap,
  ManagedRenameCollisionError,
} from './apply-managed-rename.ts';

describe('buildRenameMap — collision detection', () => {
  test('builds a map for non-colliding entries', () => {
    const map = buildRenameMap([
      { from: 'a', to: 'b' },
      { from: 'c', to: 'd' },
    ]);
    expect(map.size).toBe(2);
    expect(map.get('a')).toBe('b');
    expect(map.get('c')).toBe('d');
  });

  test('handles a swap cycle without collision (different sources, different destinations)', () => {
    const map = buildRenameMap([
      { from: 'a', to: 'b' },
      { from: 'b', to: 'a' },
    ]);
    expect(map.size).toBe(2);
    expect(map.get('a')).toBe('b');
    expect(map.get('b')).toBe('a');
  });

  test('throws ManagedRenameCollisionError when two entries share a destination', () => {
    expect(() =>
      buildRenameMap([
        { from: 'a', to: 'shared' },
        { from: 'b', to: 'shared' },
      ]),
    ).toThrow(ManagedRenameCollisionError);
  });

  test('collision error carries the colliding paths', () => {
    let error: ManagedRenameCollisionError | undefined;
    try {
      buildRenameMap([
        { from: 'a', to: 'shared' },
        { from: 'b', to: 'shared' },
      ]);
    } catch (e) {
      if (e instanceof ManagedRenameCollisionError) error = e;
    }
    expect(error).toBeDefined();
    expect(error?.colliding).toEqual([{ a: 'a', b: 'b', to: 'shared' }]);
  });

  test('collision error message includes the colliding paths', () => {
    try {
      buildRenameMap([
        { from: 'articles/x', to: 'essays/x' },
        { from: 'notes/x', to: 'essays/x' },
      ]);
      throw new Error('expected ManagedRenameCollisionError');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      expect(msg).toContain('articles/x');
      expect(msg).toContain('notes/x');
      expect(msg).toContain('essays/x');
    }
  });

  test('multiple entries collide on different destinations — all reported', () => {
    let error: ManagedRenameCollisionError | undefined;
    try {
      buildRenameMap([
        { from: 'a', to: 'x' },
        { from: 'b', to: 'x' },
        { from: 'c', to: 'y' },
        { from: 'd', to: 'y' },
      ]);
    } catch (e) {
      if (e instanceof ManagedRenameCollisionError) error = e;
    }
    expect(error?.colliding).toHaveLength(2);
  });
});

describe('applyRenameMap — single-entry rewrites', () => {
  test('rewrites wiki-links for a single entry', () => {
    const result = applyRenameMap(
      'See [[old-page]] and [[other]].\n',
      'source',
      new Map([['old-page', 'new-page']]),
    );
    expect(result.markdown).toBe('See [[new-page]] and [[other]].\n');
    expect(result.rewrites).toBe(1);
  });

  test('rewrites does not touch unrelated content', () => {
    const result = applyRenameMap(
      '# Title\n\nNo links here.\n',
      'source',
      new Map([['old', 'new']]),
    );
    expect(result.markdown).toBe('# Title\n\nNo links here.\n');
    expect(result.rewrites).toBe(0);
  });

  test('skips identity entries (from === to)', () => {
    const result = applyRenameMap('See [[same]].\n', 'source', new Map([['same', 'same']]));
    expect(result.markdown).toBe('See [[same]].\n');
    expect(result.rewrites).toBe(0);
  });
});

describe('applyRenameMap — multi-entry rewrites', () => {
  test('rewrites all entries in a multi-entry map', () => {
    const result = applyRenameMap(
      'See [[A]] and [[B]] and [[C]].\n',
      'source',
      new Map([
        ['A', 'X'],
        ['B', 'Y'],
        ['C', 'Z'],
      ]),
    );
    expect(result.markdown).toBe('See [[X]] and [[Y]] and [[Z]].\n');
    expect(result.rewrites).toBe(3);
  });

  test('swap cycle ({A→B, B→A}) produces correct output via placeholder-substitute', () => {
    const result = applyRenameMap(
      'See [[A]] and [[B]].\n',
      'source',
      new Map([
        ['A', 'B'],
        ['B', 'A'],
      ]),
    );
    expect(result.markdown).toBe('See [[B]] and [[A]].\n');
    expect(result.rewrites).toBe(2);
  });

  test('swap cycle with multiple references each preserves both directions', () => {
    const result = applyRenameMap(
      'A1: [[A]]\nA2: [[A]]\nB1: [[B]]\nB2: [[B]]\n',
      'source',
      new Map([
        ['A', 'B'],
        ['B', 'A'],
      ]),
    );
    expect(result.markdown).toBe('A1: [[B]]\nA2: [[B]]\nB1: [[A]]\nB2: [[A]]\n');
    expect(result.rewrites).toBe(4);
  });

  test('three-way cycle ({A→B, B→C, C→A}) preserves correct mapping', () => {
    const result = applyRenameMap(
      '[[A]] [[B]] [[C]]\n',
      'source',
      new Map([
        ['A', 'B'],
        ['B', 'C'],
        ['C', 'A'],
      ]),
    );
    expect(result.markdown).toBe('[[B]] [[C]] [[A]]\n');
    expect(result.rewrites).toBe(3);
  });

  test('rewrites count is Phase 1 only — Phase 2 unwrap does not double-count', () => {
    const result = applyRenameMap(
      'See [[A]] [[A]] [[B]].\n',
      'source',
      new Map([
        ['A', 'X'],
        ['B', 'Y'],
      ]),
    );
    expect(result.markdown).toBe('See [[X]] [[X]] [[Y]].\n');
    expect(result.rewrites).toBe(3);
  });

  test('preserves frontmatter unchanged across rewrites', () => {
    const result = applyRenameMap(
      `---\ntitle: Doc\n---\n\nSee [[A]].\n`,
      'source',
      new Map([['A', 'X']]),
    );
    expect(result.markdown).toBe(`---\ntitle: Doc\n---\n\nSee [[X]].\n`);
    expect(result.rewrites).toBe(1);
  });
});
