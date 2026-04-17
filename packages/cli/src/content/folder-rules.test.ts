import { describe, expect, test } from 'bun:test';
import type { FolderRule } from '../config/schema.ts';
import { resolveFolderFrontmatter } from './folder-rules.ts';

describe('resolveFolderFrontmatter', () => {
  test('empty rules returns empty object', () => {
    const result = resolveFolderFrontmatter([], 'specs/foo.md');
    expect(result).toEqual({});
  });

  test('no matching rules returns empty object', () => {
    const rules: FolderRule[] = [{ match: 'specs/**', frontmatter: { title: 'Specs' } }];
    const result = resolveFolderFrontmatter(rules, 'reports/foo.md');
    expect(result).toEqual({});
  });

  test('single matching rule populates all fields', () => {
    const rules: FolderRule[] = [
      {
        match: 'specs/**',
        frontmatter: {
          title: 'Specs',
          description: 'Spec docs',
          tags: ['spec', 'doc'],
        },
      },
    ];
    const result = resolveFolderFrontmatter(rules, 'specs/foo.md');
    expect(result).toEqual({
      title: 'Specs',
      description: 'Spec docs',
      tags: ['spec', 'doc'],
    });
  });

  test('scalars: later matching rule overrides earlier (last-match positional)', () => {
    const rules: FolderRule[] = [
      { match: 'specs/**', frontmatter: { title: 'Specs' } },
      { match: 'specs/2026-*/**', frontmatter: { title: '2026 Specs' } },
    ];
    const result = resolveFolderFrontmatter(rules, 'specs/2026-04-16/foo.md');
    expect(result.title).toBe('2026 Specs');
  });

  test('scalars: earlier rule wins when later does not match', () => {
    const rules: FolderRule[] = [
      { match: 'specs/**', frontmatter: { title: 'Specs' } },
      { match: 'specs/2027-*/**', frontmatter: { title: '2027 Specs' } },
    ];
    const result = resolveFolderFrontmatter(rules, 'specs/2026-04-16/foo.md');
    expect(result.title).toBe('Specs');
  });

  test('scalars: later rule without a given field does not clear earlier value', () => {
    const rules: FolderRule[] = [
      {
        match: 'specs/**',
        frontmatter: { title: 'Specs', description: 'From earlier' },
      },
      { match: 'specs/2026-*/**', frontmatter: { title: '2026 Specs' } },
    ];
    const result = resolveFolderFrontmatter(rules, 'specs/2026-04-16/foo.md');
    expect(result.title).toBe('2026 Specs');
    expect(result.description).toBe('From earlier');
  });

  test('tags: concat across matching rules in declaration order', () => {
    const rules: FolderRule[] = [
      { match: 'specs/**', frontmatter: { tags: ['a', 'b'] } },
      { match: 'specs/2026-*/**', frontmatter: { tags: ['b', 'c'] } },
      { match: 'specs/2026-04-*/**', frontmatter: { tags: ['c', 'd'] } },
    ];
    const result = resolveFolderFrontmatter(rules, 'specs/2026-04-16/foo.md');
    expect(result.tags).toEqual(['a', 'b', 'c', 'd']);
  });

  test('tags: dedup preserves first occurrence', () => {
    const rules: FolderRule[] = [
      { match: 'specs/**', frontmatter: { tags: ['x', 'y', 'z'] } },
      { match: 'specs/2026-*/**', frontmatter: { tags: ['z', 'y', 'x'] } },
    ];
    const result = resolveFolderFrontmatter(rules, 'specs/2026-04-16/foo.md');
    expect(result.tags).toEqual(['x', 'y', 'z']);
  });

  test('tags: empty tags array is a no-op', () => {
    const rules: FolderRule[] = [{ match: 'specs/**', frontmatter: { title: 'Specs', tags: [] } }];
    const result = resolveFolderFrontmatter(rules, 'specs/foo.md');
    expect(result.title).toBe('Specs');
    expect(result.tags).toBeUndefined();
  });

  test('tags: empty tags array in second rule does not alter first rule tags', () => {
    const rules: FolderRule[] = [
      { match: 'specs/**', frontmatter: { tags: ['a', 'b'] } },
      { match: 'specs/2026-*/**', frontmatter: { tags: [] } },
    ];
    const result = resolveFolderFrontmatter(rules, 'specs/2026-04-16/foo.md');
    expect(result.tags).toEqual(['a', 'b']);
  });

  test('dot-files match (dot: true option)', () => {
    const rules: FolderRule[] = [{ match: '**/*.md', frontmatter: { title: 'Any md' } }];
    const result = resolveFolderFrontmatter(rules, '.hidden/foo.md');
    expect(result.title).toBe('Any md');
  });

  test('does not mutate the input rules array', () => {
    const rules: FolderRule[] = [{ match: 'specs/**', frontmatter: { tags: ['a', 'b'] } }];
    const snapshot = JSON.parse(JSON.stringify(rules));
    resolveFolderFrontmatter(rules, 'specs/foo.md');
    expect(rules).toEqual(snapshot);
  });

  test('matcher compilation is memoized per rules array reference', () => {
    const rules: FolderRule[] = [{ match: 'specs/**', frontmatter: { title: 'Specs' } }];
    // Track picomatch calls indirectly: the second call should still work
    // after the rules array is cached — verifies memoization does not break
    // correctness. Correctness across many calls is the observable contract;
    // recompilation avoidance is a perf invariant.
    const a = resolveFolderFrontmatter(rules, 'specs/foo.md');
    const b = resolveFolderFrontmatter(rules, 'specs/foo.md');
    expect(a).toEqual(b);

    // A different array instance with identical content produces the same
    // result but compiles a fresh matcher set (WeakMap key is by identity).
    const rulesCopy: FolderRule[] = [{ match: 'specs/**', frontmatter: { title: 'Specs' } }];
    const c = resolveFolderFrontmatter(rulesCopy, 'specs/foo.md');
    expect(c).toEqual(a);
  });

  test('result contains no undefined fields when no scalars matched', () => {
    const rules: FolderRule[] = [{ match: 'specs/**', frontmatter: { tags: ['x'] } }];
    const result = resolveFolderFrontmatter(rules, 'specs/foo.md');
    expect(result).toEqual({ tags: ['x'] });
    expect(Object.keys(result)).toEqual(['tags']);
  });

  test('result contains no tags field when no tags matched', () => {
    const rules: FolderRule[] = [{ match: 'specs/**', frontmatter: { title: 'Specs' } }];
    const result = resolveFolderFrontmatter(rules, 'specs/foo.md');
    expect(Object.keys(result)).toEqual(['title']);
  });
});
