import { describe, expect, test } from 'bun:test';
import { dropEmpties, mergeCascade, mergePatch } from './frontmatter-merge.ts';

describe('mergeCascade — read path (scalars replace, arrays union-and-dedup)', () => {
  test('scalars: leaf overrides root', () => {
    const merged = mergeCascade({ title: 'Root' }, { title: 'Leaf' });
    expect(merged.title).toBe('Leaf');
  });

  test('scalars: leaf without key inherits root value', () => {
    const merged = mergeCascade({ title: 'Root' }, { description: 'Leaf desc' });
    expect(merged.title).toBe('Root');
    expect(merged.description).toBe('Leaf desc');
  });

  test('arrays: union-and-dedup, first-occurrence preserved (D6 generalized)', () => {
    const merged = mergeCascade({ tags: ['spec', 'shared'] }, { tags: ['evidence', 'shared'] });
    expect(merged.tags).toEqual(['spec', 'shared', 'evidence']);
  });

  test('arrays: rule generalizes beyond `tags` to any list-valued key', () => {
    const merged = mergeCascade({ owners: ['alice', 'bob'] }, { owners: ['carol', 'alice'] });
    expect(merged.owners).toEqual(['alice', 'bob', 'carol']);
  });

  test('arrays: heterogeneous values dedup by JSON identity', () => {
    const merged = mergeCascade({ mixed: [1, 'one'] }, { mixed: ['one', 1, { v: 1 }, { v: 1 }] });
    expect(merged.mixed).toEqual([1, 'one', { v: 1 }]);
  });

  test('arbitrary keys flow through (status, team, review_cycle…)', () => {
    const merged = mergeCascade(
      { status: 'draft', team: 'eng', review_cycle: 30 },
      { status: 'review', new_field: true },
    );
    expect(merged.status).toBe('review');
    expect(merged.team).toBe('eng');
    expect(merged.review_cycle).toBe(30);
    expect(merged.new_field).toBe(true);
  });

  test('objects: replace last-wins (no deep merge)', () => {
    const merged = mergeCascade({ meta: { a: 1, b: 2 } }, { meta: { b: 3, c: 4 } });
    expect(merged.meta).toEqual({ b: 3, c: 4 });
  });

  test('undefined in overlay keeps base value', () => {
    const merged = mergeCascade({ title: 'keep' }, { title: undefined });
    expect(merged.title).toBe('keep');
  });

  test('three-level cascade composes correctly', () => {
    const root = mergeCascade({}, { title: 'Root', tags: ['shared'] });
    const mid = mergeCascade(root, { tags: ['mid'], status: 'draft' });
    const leaf = mergeCascade(mid, { title: 'Leaf', tags: ['leaf'] });
    expect(leaf.title).toBe('Leaf');
    expect(leaf.status).toBe('draft');
    expect(leaf.tags).toEqual(['shared', 'mid', 'leaf']);
  });
});

describe('mergePatch — write path (scalars + arrays REPLACE; empties drop)', () => {
  test('scalars in patch replace existing', () => {
    const merged = mergePatch({ title: 'Old' }, { title: 'New' });
    expect(merged.title).toBe('New');
  });

  test('arrays in patch REPLACE existing (no union)', () => {
    const merged = mergePatch({ tags: ['a', 'b'] }, { tags: ['c'] });
    expect(merged.tags).toEqual(['c']);
  });

  test('null clears the key', () => {
    const merged = mergePatch({ title: 'old' }, { title: null });
    expect('title' in merged).toBe(false);
  });

  test('empty string clears the key', () => {
    const merged = mergePatch({ title: 'old' }, { title: '' });
    expect('title' in merged).toBe(false);
  });

  test('empty array clears the key', () => {
    const merged = mergePatch({ tags: ['a'] }, { tags: [] });
    expect('tags' in merged).toBe(false);
  });

  test('undefined keeps existing key', () => {
    const merged = mergePatch({ title: 'keep' }, { title: undefined });
    expect(merged.title).toBe('keep');
  });

  test('mixed patch: replaces some, clears one, keeps another', () => {
    const merged = mergePatch(
      { title: 'old', description: 'keep me', tags: ['x'] },
      { title: 'new', tags: null },
    );
    expect(merged).toEqual({ title: 'new', description: 'keep me' });
  });

  test('arbitrary keys (status, team, owners) work the same', () => {
    const merged = mergePatch(
      { status: 'draft', team: 'eng' },
      { status: 'review', owners: ['alice'], team: '' },
    );
    expect(merged).toEqual({ status: 'review', owners: ['alice'] });
  });
});

describe('dropEmpties — submit-time normalization', () => {
  test('drops null / undefined / empty string / empty array', () => {
    const cleaned = dropEmpties({
      keep: 'value',
      a: null,
      b: undefined,
      c: '',
      d: [],
      e: 0,
      f: false,
      g: ['x'],
    });
    expect(cleaned).toEqual({ keep: 'value', e: 0, f: false, g: ['x'] });
  });

  test('preserves nested objects (treated as scalars)', () => {
    const cleaned = dropEmpties({ meta: { a: 1 }, empty: '' });
    expect(cleaned).toEqual({ meta: { a: 1 } });
  });

  test('returns a fresh object (does not mutate)', () => {
    const input = { a: 'x', b: '' };
    const cleaned = dropEmpties(input);
    expect(input).toEqual({ a: 'x', b: '' });
    expect(cleaned).not.toBe(input);
  });
});
