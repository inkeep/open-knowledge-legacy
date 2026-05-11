import { describe, expect, mock, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  addRecentProject,
  annotateMissing,
  emptyState,
  getProjectSessionState,
  parseAppState,
  removeRecentProject,
  type SaveAppStateFs,
  saveAppStateToDir,
  setLastUsedProjectParent,
  setProjectSessionState,
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
    expect(s.recentProjects[0]?.path).toBe('/tmp/p24');
    expect(s.recentProjects.find((p) => p.path === '/tmp/p0')).toBeUndefined();
  });

  test('removeRecentProject drops the entry', () => {
    let s = addRecentProject(emptyState(), '/tmp/a', 'a');
    s = addRecentProject(s, '/tmp/b', 'b');
    const next = removeRecentProject(s, '/tmp/a');
    expect(next.recentProjects.map((p) => p.path)).toEqual(['/tmp/b']);
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

  test('project session state persists by project path', () => {
    const state = setProjectSessionState(emptyState(), '/tmp/a', {
      openTabs: ['README', 'docs/guide'],
      activeDocName: 'docs/guide',
      activeTabId: 'docs/guide',
      updatedAt: '2026-05-06T00:00:00Z',
    });
    expect(getProjectSessionState(state, '/tmp/a')).toEqual({
      openTabs: ['README', 'docs/guide'],
      activeDocName: 'docs/guide',
      activeTabId: 'docs/guide',
      updatedAt: '2026-05-06T00:00:00Z',
    });
    expect(getProjectSessionState(state, '/tmp/b')).toEqual({
      openTabs: [],
      activeDocName: null,
      activeTabId: null,
      updatedAt: null,
    });
  });

  test('project session state preserves active folder tabs', () => {
    const folderTabId = '\u0000folder:docs';
    const state = setProjectSessionState(emptyState(), '/tmp/a', {
      openTabs: ['README', folderTabId],
      activeDocName: null,
      activeTabId: folderTabId,
      updatedAt: '2026-05-06T00:00:00Z',
    });
    expect(getProjectSessionState(state, '/tmp/a')).toEqual({
      openTabs: ['README', folderTabId],
      activeDocName: null,
      activeTabId: folderTabId,
      updatedAt: '2026-05-06T00:00:00Z',
    });
  });

  test('removeRecentProject drops matching session state', () => {
    const withSession = setProjectSessionState(emptyState(), '/tmp/a', {
      openTabs: ['README'],
      activeDocName: 'README',
      activeTabId: 'README',
      updatedAt: '2026-05-06T00:00:00Z',
    });
    const next = removeRecentProject(withSession, '/tmp/a');
    expect(getProjectSessionState(next, '/tmp/a')).toEqual({
      openTabs: [],
      activeDocName: null,
      activeTabId: null,
      updatedAt: null,
    });
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
      projectSessions: {
        '/tmp/a': {
          openTabs: ['README', 'README', '', 'docs/guide'],
          activeDocName: 'docs/guide',
          activeTabId: 'docs/guide',
          updatedAt: '2026-05-06T00:00:00Z',
        },
      },
    };
    const parsed = parseAppState(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.recentProjects.length).toBe(1);
    expect(parsed?.lastOpenedProject).toBe('/tmp/a');
    expect(parsed?.projectSessions['/tmp/a']).toEqual({
      openTabs: ['README', 'docs/guide'],
      activeDocName: 'docs/guide',
      activeTabId: 'docs/guide',
      updatedAt: '2026-05-06T00:00:00Z',
    });
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

describe('saveAppStateToDir (atomic write via tmp + rename)', () => {
  test('writes tmp first, then renames to canonical — real fs round-trip', () => {
    const userDataDir = mkdtempSync(join(tmpdir(), 'ok-state-atomic-'));
    try {
      const state = addRecentProject(emptyState(), '/tmp/example', 'example');
      saveAppStateToDir(userDataDir, state);
      const statePath = join(userDataDir, 'state.json');
      expect(existsSync(statePath)).toBe(true);
      const parsed = JSON.parse(readFileSync(statePath, 'utf-8'));
      expect(parsed.recentProjects[0].path).toBe('/tmp/example');
      expect(parsed.lastOpenedProject).toBe('/tmp/example');
    } finally {
      rmSync(userDataDir, { recursive: true, force: true });
    }
  });

  test('fs call order is write-tmp → rename-tmp-to-canonical (atomicity invariant)', () => {
    const calls: Array<{ op: string; path: string }> = [];
    const fs: SaveAppStateFs = {
      existsSync: mock(() => true),
      mkdirSync: mock(() => undefined),
      writeFileSync: mock((p: string) => {
        calls.push({ op: 'write', path: p });
      }) as unknown as SaveAppStateFs['writeFileSync'],
      renameSync: mock((from: string, to: string) => {
        calls.push({ op: 'rename', path: `${from}->${to}` });
      }) as unknown as SaveAppStateFs['renameSync'],
      unlinkSync: mock(() => undefined) as unknown as SaveAppStateFs['unlinkSync'],
    };
    saveAppStateToDir('/fake/userdata', emptyState(), fs, {
      error: () => {},
    });
    expect(calls.length).toBe(2);
    expect(calls[0]?.op).toBe('write');
    expect(calls[0]?.path).toContain('state.json.tmp-');
    expect(calls[1]?.op).toBe('rename');
    expect(calls[1]?.path).toMatch(/state\.json\.tmp-.*->.*state\.json$/);
  });

  test('renameSync failure → cleanup attempt + error log (does NOT throw)', () => {
    const errorLog = mock(() => {});
    const unlinkSpy = mock(() => {});
    const fs: SaveAppStateFs = {
      existsSync: mock(() => true),
      mkdirSync: mock(() => undefined),
      writeFileSync: mock(() => {}) as unknown as SaveAppStateFs['writeFileSync'],
      renameSync: mock(() => {
        throw new Error('EACCES: permission denied');
      }) as unknown as SaveAppStateFs['renameSync'],
      unlinkSync: unlinkSpy as unknown as SaveAppStateFs['unlinkSync'],
    };
    expect(() =>
      saveAppStateToDir('/fake/userdata', emptyState(), fs, { error: errorLog }),
    ).not.toThrow();
    expect(errorLog).toHaveBeenCalled();
    expect(unlinkSpy).toHaveBeenCalled();
  });

  test('mkdirSync failure → outer catch logs "userData setup failed"', () => {
    const errorMessages: string[] = [];
    const fs: SaveAppStateFs = {
      existsSync: mock(() => false),
      mkdirSync: mock(() => {
        throw new Error('EROFS: read-only fs');
      }),
      writeFileSync: mock(() => {}) as unknown as SaveAppStateFs['writeFileSync'],
      renameSync: mock(() => {}) as unknown as SaveAppStateFs['renameSync'],
      unlinkSync: mock(() => {}) as unknown as SaveAppStateFs['unlinkSync'],
    };
    saveAppStateToDir('/fake/userdata', emptyState(), fs, {
      error: (msg: string) => {
        errorMessages.push(msg);
      },
    });
    expect(errorMessages.some((m) => m.includes('userData setup failed'))).toBe(true);
  });

  test('creates userDataDir when absent', () => {
    const mkdirSpy = mock(() => undefined);
    const fs: SaveAppStateFs = {
      existsSync: mock(() => false),
      mkdirSync: mkdirSpy,
      writeFileSync: mock(() => {}) as unknown as SaveAppStateFs['writeFileSync'],
      renameSync: mock(() => {}) as unknown as SaveAppStateFs['renameSync'],
      unlinkSync: mock(() => {}) as unknown as SaveAppStateFs['unlinkSync'],
    };
    saveAppStateToDir('/fake/userdata', emptyState(), fs, { error: () => {} });
    expect(mkdirSpy).toHaveBeenCalledWith('/fake/userdata', { recursive: true });
  });

  test('returns true on successful persist', () => {
    const fs: SaveAppStateFs = {
      existsSync: mock(() => true),
      mkdirSync: mock(() => undefined),
      writeFileSync: mock(() => {}) as unknown as SaveAppStateFs['writeFileSync'],
      renameSync: mock(() => {}) as unknown as SaveAppStateFs['renameSync'],
      unlinkSync: mock(() => {}) as unknown as SaveAppStateFs['unlinkSync'],
    };
    const result = saveAppStateToDir('/fake/userdata', emptyState(), fs, { error: () => {} });
    expect(result).toBe(true);
  });

  test('returns false when renameSync throws', () => {
    const fs: SaveAppStateFs = {
      existsSync: mock(() => true),
      mkdirSync: mock(() => undefined),
      writeFileSync: mock(() => {}) as unknown as SaveAppStateFs['writeFileSync'],
      renameSync: mock(() => {
        throw new Error('EACCES');
      }) as unknown as SaveAppStateFs['renameSync'],
      unlinkSync: mock(() => undefined) as unknown as SaveAppStateFs['unlinkSync'],
    };
    const result = saveAppStateToDir('/fake/userdata', emptyState(), fs, { error: () => {} });
    expect(result).toBe(false);
  });

  test('lastUsedProjectParent: defaults to null on a fresh state', () => {
    expect(emptyState().lastUsedProjectParent).toBeNull();
  });

  test('lastUsedProjectParent: setter immutably updates state', () => {
    const next = setLastUsedProjectParent(emptyState(), '/Users/alice/Notes');
    expect(next.lastUsedProjectParent).toBe('/Users/alice/Notes');
    expect(next.recentProjects).toEqual([]);
    expect(next.updateChannel).toBe('latest');
  });

  test('lastUsedProjectParent: parseAppState round-trips a valid string', () => {
    const payload = { ...emptyState(), lastUsedProjectParent: '/Users/alice/Notes' };
    const parsed = parseAppState(JSON.parse(JSON.stringify(payload)));
    expect(parsed?.lastUsedProjectParent).toBe('/Users/alice/Notes');
  });

  test('lastUsedProjectParent: parseAppState coerces non-string to null', () => {
    const corrupted = { ...emptyState(), lastUsedProjectParent: 42 };
    const parsed = parseAppState(JSON.parse(JSON.stringify(corrupted)));
    expect(parsed?.lastUsedProjectParent).toBeNull();
  });

  test('lastUsedProjectParent: parseAppState coerces empty string to null', () => {
    const payload = { ...emptyState(), lastUsedProjectParent: '' };
    const parsed = parseAppState(JSON.parse(JSON.stringify(payload)));
    expect(parsed?.lastUsedProjectParent).toBeNull();
  });

  test('returns false when userData mkdir throws', () => {
    const fs: SaveAppStateFs = {
      existsSync: mock(() => false),
      mkdirSync: mock(() => {
        throw new Error('EROFS');
      }),
      writeFileSync: mock(() => {}) as unknown as SaveAppStateFs['writeFileSync'],
      renameSync: mock(() => {}) as unknown as SaveAppStateFs['renameSync'],
      unlinkSync: mock(() => {}) as unknown as SaveAppStateFs['unlinkSync'],
    };
    const result = saveAppStateToDir('/fake/userdata', emptyState(), fs, { error: () => {} });
    expect(result).toBe(false);
  });
});
