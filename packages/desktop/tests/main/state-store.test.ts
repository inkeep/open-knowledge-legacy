import { describe, expect, test } from 'bun:test';
import {
  addRecentProject,
  annotateMissing,
  emptyState,
  parseAppState,
  removeRecentProject,
} from '../../src/main/state-store.ts';

describe('state-store (recent projects + LRU)', () => {
  test('addRecentProject prepends to empty list', () => {
    const next = addRecentProject(emptyState(), '/tmp/p1', 'p1');
    expect(next.recentProjects.length).toBe(1);
    expect(next.recentProjects[0]?.path).toBe('/tmp/p1');
    expect(next.recentProjects[0]?.name).toBe('p1');
    expect(next.lastOpenedProject).toBe('/tmp/p1');
  });

  test('addRecentProject moves existing entry to front', () => {
    let s = addRecentProject(emptyState(), '/tmp/a', 'a');
    s = addRecentProject(s, '/tmp/b', 'b');
    s = addRecentProject(s, '/tmp/a', 'a'); // re-open a
    expect(s.recentProjects.map((p) => p.path)).toEqual(['/tmp/a', '/tmp/b']);
    expect(s.lastOpenedProject).toBe('/tmp/a');
  });

  test('LRU caps at 20 entries', () => {
    let s = emptyState();
    for (let i = 0; i < 25; i++) {
      s = addRecentProject(s, `/tmp/p${i}`, `p${i}`);
    }
    expect(s.recentProjects.length).toBe(20);
    // Newest first — p24 should be at the front
    expect(s.recentProjects[0]?.path).toBe('/tmp/p24');
    // Oldest 5 dropped
    expect(s.recentProjects.find((p) => p.path === '/tmp/p0')).toBeUndefined();
  });

  test('removeRecentProject drops the entry', () => {
    let s = addRecentProject(emptyState(), '/tmp/a', 'a');
    s = addRecentProject(s, '/tmp/b', 'b');
    const next = removeRecentProject(s, '/tmp/a');
    expect(next.recentProjects.map((p) => p.path)).toEqual(['/tmp/b']);
    // /tmp/b was the most-recent open, so removing /tmp/a leaves /tmp/b intact
    expect(next.lastOpenedProject).toBe('/tmp/b');
  });

  test('removeRecentProject clears lastOpenedProject when it matches', () => {
    let s = addRecentProject(emptyState(), '/tmp/a', 'a');
    s = addRecentProject(s, '/tmp/b', 'b');
    s = addRecentProject(s, '/tmp/a', 'a'); // /tmp/a is now last-opened
    const next = removeRecentProject(s, '/tmp/a');
    expect(next.recentProjects.map((p) => p.path)).toEqual(['/tmp/b']);
    expect(next.lastOpenedProject).toBe(null);
  });

  test('annotateMissing flips missing for non-existent paths', () => {
    let s = addRecentProject(emptyState(), '/tmp/exists', 'exists');
    s = addRecentProject(s, '/tmp/missing', 'missing');
    const annotated = annotateMissing(s, (p) => p === '/tmp/exists');
    expect(annotated.find((p) => p.path === '/tmp/exists')?.missing).toBe(false);
    expect(annotated.find((p) => p.path === '/tmp/missing')?.missing).toBe(true);
  });

  test('parseAppState accepts well-formed state', () => {
    const raw = {
      recentProjects: [{ path: '/tmp/a', name: 'a', lastOpenedAt: '2026-04-20T00:00:00Z' }],
      lastOpenedProject: '/tmp/a',
    };
    const parsed = parseAppState(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.recentProjects.length).toBe(1);
    expect(parsed?.lastOpenedProject).toBe('/tmp/a');
  });

  test('parseAppState filters malformed entries silently', () => {
    const raw = {
      recentProjects: [
        { path: '/tmp/good', name: 'good', lastOpenedAt: '2026-04-20T00:00:00Z' },
        { path: 123, name: 'bad', lastOpenedAt: 'now' }, // path not string
        { name: 'no-path', lastOpenedAt: 'now' }, // missing path
        'not-an-object',
      ],
      lastOpenedProject: '/tmp/good',
    };
    const parsed = parseAppState(raw);
    expect(parsed?.recentProjects.length).toBe(1);
    expect(parsed?.recentProjects[0]?.path).toBe('/tmp/good');
  });

  test('parseAppState returns null for non-object input', () => {
    expect(parseAppState('not state')).toBeNull();
    expect(parseAppState(null)).toBeNull();
    expect(parseAppState(42)).toBeNull();
  });
});
