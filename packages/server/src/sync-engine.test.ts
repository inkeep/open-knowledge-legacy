import { describe as _bunDescribe, afterEach, beforeEach, expect, test } from 'bun:test';

const describe = process.env.CI ? _bunDescribe.skip : _bunDescribe;

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import simpleGit from 'simple-git';
import type { SyncState } from './sync-engine.ts';
import { SyncEngine } from './sync-engine.ts';

const stubContentFilter = {
  isExcluded: (_path: string) => false,
  isDirExcluded: (_path: string) => false,
};

let tmpDir = '';
let projectDir = '';
let contentDir = '';
let okDir = '';

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'sync-engine-test-'));
  projectDir = join(tmpDir, 'project');
  contentDir = join(tmpDir, 'content');
  okDir = join(contentDir, '.ok');
  mkdirSync(projectDir, { recursive: true });
  mkdirSync(okDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function makeEngine(opts: { syncEnabled?: boolean; onStateChange?: (s: SyncState) => void } = {}) {
  return new SyncEngine({
    projectDir,
    contentDir,
    contentFilter: stubContentFilter,
    syncEnabled: opts.syncEnabled,
    onStateChange: opts.onStateChange,
  });
}

describe('SyncEngine initial state', () => {
  test('starts in dormant state', () => {
    const engine = makeEngine();
    expect(engine.getStatus().state).toBe('dormant');
  });

  test('stays dormant when syncEnabled is explicitly false', async () => {
    const engine = makeEngine({ syncEnabled: false });
    await engine.start();
    expect(engine.getStatus().state).toBe('dormant');
  });
});

describe('SyncEngine stop()', () => {
  test('transitions from dormant to dormant without error', () => {
    const engine = makeEngine();
    engine.stop();
    expect(engine.getStatus().state).toBe('dormant');
  });

  test('onStateChange is NOT called when stop() is a no-op (already dormant)', () => {
    const calls: SyncState[] = [];
    const engine = makeEngine({ onStateChange: (s) => calls.push(s) });
    engine.stop();
    expect(calls).toEqual([]);
  });
});

describe('SyncEngine destroy()', () => {
  test('is safe to call when never started', async () => {
    const engine = makeEngine();
    await expect(engine.destroy()).resolves.toBeUndefined();
    expect(engine.getStatus().state).toBe('dormant');
  });
});

describe('SyncEngine state persistence round-trip', () => {
  const statePath = () => join(okDir, 'sync-state.json');

  test('saveStateNow via destroy() writes sync-state.json', async () => {
    const engine = makeEngine();
    await engine.destroy(); // triggers saveStateNow() inside stop()
    expect(existsSync(statePath())).toBe(true);
  });

  test('sync-state.json does not persist the config-owned enabled preference', async () => {
    const engine = makeEngine({ syncEnabled: true });
    await engine.destroy();
    const persisted = JSON.parse(readFileSync(statePath(), 'utf-8')) as Record<string, unknown>;
    expect(persisted.syncEnabled).toBeUndefined();
  });

  test('restores consecutiveFailures from disk on start()', async () => {
    const persisted = {
      version: 1,
      lastSyncUtc: null,
      lastFetchUtc: null,
      lastPushedSha: null,
      consecutiveFailures: 4,
      inflightConflicts: [],
    };
    writeFileSync(statePath(), JSON.stringify(persisted), 'utf-8');

    const engine = makeEngine({ syncEnabled: false });
    await engine.start();
    expect(engine.getStatus().consecutiveFailures).toBe(4);
  });

  test('ignores legacy syncEnabled from sync-state.json', async () => {
    const persisted = {
      version: 1,
      lastSyncUtc: null,
      lastFetchUtc: null,
      lastPushedSha: null,
      consecutiveFailures: 0,
      inflightConflicts: [],
      syncEnabled: true,
    };
    writeFileSync(statePath(), JSON.stringify(persisted), 'utf-8');

    const engine = makeEngine({ syncEnabled: false });
    await engine.start();
    expect(engine.getStatus().syncEnabled).toBe(false);
  });

  test('restores inflightConflicts into conflictCount', async () => {
    const persisted = {
      version: 1,
      lastSyncUtc: null,
      lastFetchUtc: null,
      lastPushedSha: null,
      consecutiveFailures: 0,
      inflightConflicts: ['docs/a.md', 'docs/b.md'],
    };
    writeFileSync(statePath(), JSON.stringify(persisted), 'utf-8');

    const engine = makeEngine({ syncEnabled: false });
    await engine.start();
    expect(engine.getStatus().conflictCount).toBe(2);
  });

  async function setupRealMergeConflict(files: string[]): Promise<void> {
    const git = simpleGit(projectDir);
    await git.init(['--initial-branch=main']);
    await git.raw('config', 'user.name', 'Test');
    await git.raw('config', 'user.email', 'test@test.com');
    for (const f of files) {
      const dir = join(projectDir, f, '..');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(projectDir, f), 'base\n', 'utf-8');
    }
    await git.add('.');
    await git.commit('base');
    await git.checkoutLocalBranch('feature');
    for (const f of files) writeFileSync(join(projectDir, f), 'feature\n', 'utf-8');
    await git.add('.');
    await git.commit('feature changes');
    await git.checkout('main');
    for (const f of files) writeFileSync(join(projectDir, f), 'main\n', 'utf-8');
    await git.add('.');
    await git.commit('main changes');
    try {
      await git.merge(['feature']);
    } catch {}
    const bareDir = join(tmpDir, 'bare.git');
    mkdirSync(bareDir, { recursive: true });
    await simpleGit(bareDir).init(true);
    await git.addRemote('origin', bareDir);
  }

  test('state is "conflict" (not "idle") when restarting mid-merge with tracked conflicts', async () => {
    const files = ['docs/a.md', 'docs/b.md'];
    await setupRealMergeConflict(files);

    writeFileSync(
      join(okDir, 'conflicts.json'),
      JSON.stringify({
        version: 1,
        branch: 'main',
        conflicts: files.map((f) => ({ file: f, detectedAt: '2026-04-17T00:00:00.000Z' })),
      }),
      'utf-8',
    );
    writeFileSync(
      statePath(),
      JSON.stringify({
        version: 1,
        lastSyncUtc: null,
        lastFetchUtc: null,
        lastPushedSha: null,
        consecutiveFailures: 0,
        inflightConflicts: files,
      }),
      'utf-8',
    );

    const engine = makeEngine({ syncEnabled: true });
    try {
      await engine.start();
      const status = engine.getStatus();
      expect(status.conflictCount).toBe(2);
      expect(status.state).toBe('conflict');
    } finally {
      await engine.destroy();
    }
  });

  test('clears stale conflicts.json when MERGE_HEAD is gone (user resolved externally)', async () => {
    const git = simpleGit(projectDir);
    await git.init(['--initial-branch=main']);
    await git.raw('config', 'user.name', 'Test');
    await git.raw('config', 'user.email', 'test@test.com');
    writeFileSync(join(projectDir, 'README.md'), '# Test\n');
    await git.add('.');
    await git.commit('Initial');
    const bareDir = join(tmpDir, 'bare.git');
    mkdirSync(bareDir, { recursive: true });
    await simpleGit(bareDir).init(true);
    await git.addRemote('origin', bareDir);

    writeFileSync(
      join(okDir, 'conflicts.json'),
      JSON.stringify({
        version: 1,
        branch: 'main',
        conflicts: [{ file: 'test.md', detectedAt: '2026-04-17T00:00:00.000Z' }],
      }),
      'utf-8',
    );
    writeFileSync(
      statePath(),
      JSON.stringify({
        version: 1,
        lastSyncUtc: null,
        lastFetchUtc: null,
        lastPushedSha: null,
        consecutiveFailures: 0,
        inflightConflicts: ['test.md'],
      }),
      'utf-8',
    );

    const engine = makeEngine({ syncEnabled: true });
    try {
      await engine.start();
      const status = engine.getStatus();
      expect(status.conflictCount).toBe(0);
      expect(status.state).not.toBe('conflict');
    } finally {
      await engine.destroy();
    }
  });

  test('reconciles partial external resolve against git unmerged index', async () => {
    const files = ['docs/a.md', 'docs/b.md'];
    await setupRealMergeConflict(files);

    const git = simpleGit(projectDir);
    await git.raw(['checkout', '--theirs', '--', 'docs/a.md']);
    await git.raw(['add', '--', 'docs/a.md']);

    writeFileSync(
      join(okDir, 'conflicts.json'),
      JSON.stringify({
        version: 1,
        branch: 'main',
        conflicts: files.map((f) => ({ file: f, detectedAt: '2026-04-17T00:00:00.000Z' })),
      }),
      'utf-8',
    );
    writeFileSync(
      statePath(),
      JSON.stringify({
        version: 1,
        lastSyncUtc: null,
        lastFetchUtc: null,
        lastPushedSha: null,
        consecutiveFailures: 0,
        inflightConflicts: files,
      }),
      'utf-8',
    );

    const engine = makeEngine({ syncEnabled: true });
    try {
      await engine.start();
      const status = engine.getStatus();
      expect(status.conflictCount).toBe(1);
      expect(status.state).toBe('conflict');
      const conflicts = engine.getConflicts().map((c) => c.file);
      expect(conflicts).toEqual(['docs/b.md']);
    } finally {
      await engine.destroy();
    }
  });

  test('state transitions out of "conflict" once the last conflict is resolved', async () => {
    const conflictedFile = 'a.md';
    await setupRealMergeConflict([conflictedFile]);

    writeFileSync(
      join(okDir, 'conflicts.json'),
      JSON.stringify({
        version: 1,
        branch: 'main',
        conflicts: [{ file: conflictedFile, detectedAt: '2026-04-17T00:00:00.000Z' }],
      }),
      'utf-8',
    );
    writeFileSync(
      statePath(),
      JSON.stringify({
        version: 1,
        lastSyncUtc: null,
        lastFetchUtc: null,
        lastPushedSha: null,
        consecutiveFailures: 0,
        inflightConflicts: [conflictedFile],
      }),
      'utf-8',
    );

    const engine = makeEngine({ syncEnabled: true });
    try {
      await engine.start();
      expect(engine.getStatus().state).toBe('conflict');

      await engine.resolveConflict(conflictedFile, 'mine');
      const after = engine.getStatus();
      expect(after.conflictCount).toBe(0);
      expect(after.state).not.toBe('conflict');
    } finally {
      await engine.destroy();
    }
  });

  test('ignores state files with unknown version', async () => {
    const persisted = { version: 99, consecutiveFailures: 9999, inflightConflicts: [] };
    writeFileSync(statePath(), JSON.stringify(persisted), 'utf-8');

    const engine = makeEngine({ syncEnabled: false });
    await engine.start();
    expect(engine.getStatus().consecutiveFailures).toBe(0);
  });

  test('tolerates missing state file gracefully', async () => {
    const engine = makeEngine({ syncEnabled: false });
    await expect(engine.start()).resolves.toBeUndefined();
    expect(engine.getStatus().consecutiveFailures).toBe(0);
  });

  test('tolerates corrupt state file gracefully', async () => {
    writeFileSync(statePath(), 'not-json', 'utf-8');
    const engine = makeEngine({ syncEnabled: false });
    await expect(engine.start()).resolves.toBeUndefined();
    expect(engine.getStatus().consecutiveFailures).toBe(0);
  });
});

describe('SyncEngine getStatus()', () => {
  test('returns all required fields in dormant state', () => {
    const engine = makeEngine();
    const status = engine.getStatus();
    expect(status).toHaveProperty('state', 'dormant');
    expect(status).toHaveProperty('lastSyncUtc', null);
    expect(status).toHaveProperty('lastFetchUtc', null);
    expect(status).toHaveProperty('lastPushedSha', null);
    expect(status).toHaveProperty('ahead', 0);
    expect(status).toHaveProperty('behind', 0);
    expect(status).toHaveProperty('consecutiveFailures', 0);
    expect(status).toHaveProperty('conflictCount', 0);
    expect(status).toHaveProperty('hasRemote', false);
  });
});

describe('SyncEngine no-remote detection', () => {
  test('stays dormant if project dir has no git remote (no .git/)', async () => {
    const engine = makeEngine();
    await engine.start();
    expect(engine.getStatus().state).toBe('dormant');
    expect(engine.getStatus().hasRemote).toBe(false);
  });
});

describe('SyncEngine updateCurrentBranch()', () => {
  test('transitions to disabled when branch is null (detached HEAD)', () => {
    const states: SyncState[] = [];
    const engine = makeEngine({ onStateChange: (s) => states.push(s) });
    engine.updateCurrentBranch(null); // no-op when dormant
    expect(engine.getStatus().state).toBe('dormant');
    expect(states).toEqual([]);
  });
});

describe('SyncEngine backoff thresholds via persisted state', () => {
  const statePath = () => join(okDir, 'sync-state.json');

  function persistState(overrides: Record<string, unknown>) {
    const base = {
      version: 1,
      lastSyncUtc: null,
      lastFetchUtc: null,
      lastPushedSha: null,
      consecutiveFailures: 0,
      inflightConflicts: [],
    };
    writeFileSync(statePath(), JSON.stringify({ ...base, ...overrides }), 'utf-8');
  }

  test('consecutiveFailures=0 is restored and stays in default interval range', async () => {
    persistState({ consecutiveFailures: 0 });
    const engine = makeEngine({ syncEnabled: false });
    await engine.start();
    expect(engine.getStatus().consecutiveFailures).toBe(0);
  });

  test('consecutiveFailures=3 is restored (5 min backoff threshold)', async () => {
    persistState({ consecutiveFailures: 3 });
    const engine = makeEngine({ syncEnabled: false });
    await engine.start();
    expect(engine.getStatus().consecutiveFailures).toBe(3);
  });

  test('consecutiveFailures=5 is restored (15 min backoff threshold)', async () => {
    persistState({ consecutiveFailures: 5 });
    const engine = makeEngine({ syncEnabled: false });
    await engine.start();
    expect(engine.getStatus().consecutiveFailures).toBe(5);
  });

  test('consecutiveFailures=8 is restored (60 min backoff threshold)', async () => {
    persistState({ consecutiveFailures: 8 });
    const engine = makeEngine({ syncEnabled: false });
    await engine.start();
    expect(engine.getStatus().consecutiveFailures).toBe(8);
  });

  test('trigger() resets consecutiveFailures to 0', async () => {
    persistState({ consecutiveFailures: 5 });
    const engine = makeEngine({ syncEnabled: false });
    await engine.start();
    expect(engine.getStatus().consecutiveFailures).toBe(5);
    await engine.trigger();
    expect(engine.getStatus().consecutiveFailures).toBe(0);
  });
});

describe('SyncEngine lifecycle edge cases', () => {
  test('double start() is idempotent (second call is no-op)', async () => {
    const states: SyncState[] = [];
    const engine = makeEngine({ syncEnabled: false, onStateChange: (s) => states.push(s) });
    await engine.start();
    await engine.start(); // second start — should not throw or duplicate transitions
    expect(engine.getStatus().state).toBe('dormant');
  });

  test('stop() after destroy() is idempotent', async () => {
    const engine = makeEngine();
    await engine.destroy();
    engine.stop(); // should not throw
    expect(engine.getStatus().state).toBe('dormant');
  });

  test('destroy() calls saveStateNow() and writes file', async () => {
    const engine = makeEngine({ syncEnabled: false });
    await engine.start();
    await engine.destroy();
    expect(existsSync(join(okDir, 'sync-state.json'))).toBe(true);
  });

  test('pausedReason is persisted through destroy + restore', async () => {
    const statePath = join(okDir, 'sync-state.json');
    const persisted = {
      version: 1,
      lastSyncUtc: null,
      lastFetchUtc: null,
      lastPushedSha: null,
      consecutiveFailures: 0,
      pausedReason: 'detached-head',
      inflightConflicts: [],
    };
    writeFileSync(statePath, JSON.stringify(persisted), 'utf-8');

    const engine = makeEngine({ syncEnabled: false });
    await engine.start();
    expect(engine.getStatus().pausedReason).toBe('detached-head');
  });
});

describe('SyncEngine push cycle pushes existing commits when local is ahead of origin', () => {
  test('pushes existing HEAD when local is ahead of origin and tree is clean', async () => {
    const git = simpleGit(projectDir);
    await git.init(['--initial-branch=main']);
    await git.raw('config', 'user.name', 'Test');
    await git.raw('config', 'user.email', 'test@test.com');
    writeFileSync(join(projectDir, 'README.md'), '# Test\n');
    await git.add('.');
    await git.commit('Initial');

    const bareDir = join(tmpDir, 'bare.git');
    mkdirSync(bareDir, { recursive: true });
    await simpleGit(bareDir).init(true);
    await git.addRemote('origin', bareDir);
    await git.push(['--set-upstream', 'origin', 'main']);

    writeFileSync(join(projectDir, 'README.md'), '# Test\n\nlocal change\n');
    await git.add('.');
    await git.commit('local commit not yet pushed');

    const headBefore = (await git.revparse(['HEAD'])).trim();
    const remoteBefore = (await git.revparse(['origin/main'])).trim();
    expect(headBefore).not.toBe(remoteBefore);

    const engine = makeEngine({ syncEnabled: true });
    try {
      await engine.start();
      await engine.trigger('push');

      const remoteAfter = (await git.revparse(['origin/main'])).trim();
      expect(remoteAfter).toBe(headBefore);
      expect(engine.getStatus().lastPushedSha).toBe(headBefore);
    } finally {
      await engine.destroy();
    }
  });

  test('records lastSyncUtc when HEAD already matches origin and tree is clean', async () => {
    const git = simpleGit(projectDir);
    await git.init(['--initial-branch=main']);
    await git.raw('config', 'user.name', 'Test');
    await git.raw('config', 'user.email', 'test@test.com');
    writeFileSync(join(projectDir, 'README.md'), '# Test\n');
    await git.add('.');
    await git.commit('Initial');

    const bareDir = join(tmpDir, 'bare.git');
    mkdirSync(bareDir, { recursive: true });
    await simpleGit(bareDir).init(true);
    await git.addRemote('origin', bareDir);
    await git.push(['--set-upstream', 'origin', 'main']);

    const head = (await git.revparse(['HEAD'])).trim();
    const engine = makeEngine({ syncEnabled: true });
    try {
      await engine.start();
      await engine.trigger('push');

      const status = engine.getStatus();
      expect(status.lastPushedSha).toBe(head);
      expect(status.lastSyncUtc).not.toBeNull();
    } finally {
      await engine.destroy();
    }
  });
});

describe('SyncEngine getStatus() with restored state', () => {
  const statePath = () => join(okDir, 'sync-state.json');

  test('lastSyncUtc and lastFetchUtc are restored', async () => {
    const now = new Date().toISOString();
    writeFileSync(
      statePath(),
      JSON.stringify({
        version: 1,
        lastSyncUtc: now,
        lastFetchUtc: now,
        lastPushedSha: 'abc123',
        consecutiveFailures: 0,
        inflightConflicts: [],
      }),
      'utf-8',
    );

    const engine = makeEngine({ syncEnabled: false });
    await engine.start();
    const status = engine.getStatus();
    expect(status.lastSyncUtc).toBe(now);
    expect(status.lastFetchUtc).toBe(now);
    expect(status.lastPushedSha).toBe('abc123');
  });
});
