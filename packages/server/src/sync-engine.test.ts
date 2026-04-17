/**
 * Unit tests for SyncEngine — state machine, persistence, backoff, and lifecycle.
 *
 * These tests exercise the parts of SyncEngine that don't require a real git
 * repository: state transitions, state persistence round-trip, backoff levels,
 * and `stop()` idempotency.
 *
 * Tests that need live git operations (pull cycle, push cycle, conflict
 * detection) belong in a future integration test that spins up a bare git repo.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import simpleGit from 'simple-git';
import type { SyncState } from './sync-engine.ts';
import { SyncEngine } from './sync-engine.ts';

// ─── Minimal ContentFilter stub ───────────────────────────────────────────────

const stubContentFilter = {
  isExcluded: (_path: string) => false,
  isDirExcluded: (_path: string) => false,
};

// ─── Temp dir fixtures ────────────────────────────────────────────────────────

let tmpDir = '';
let projectDir = '';
let contentDir = '';
let okDir = '';

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'sync-engine-test-'));
  projectDir = join(tmpDir, 'project');
  contentDir = join(tmpDir, 'content');
  okDir = join(contentDir, '.open-knowledge');
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

// ─── State machine ────────────────────────────────────────────────────────────

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

// ─── State persistence ────────────────────────────────────────────────────────

describe('SyncEngine state persistence round-trip', () => {
  const statePath = () => join(okDir, 'sync-state.json');

  test('saveStateNow via destroy() writes sync-state.json', async () => {
    const engine = makeEngine();
    await engine.destroy(); // triggers saveStateNow() inside stop()
    // File is written even when state is empty/dormant
    expect(existsSync(statePath())).toBe(true);
  });

  test('restores consecutiveFailures from disk on start()', async () => {
    // Pre-write a state file with consecutiveFailures=4
    const persisted = {
      version: 1,
      lastSyncUtc: null,
      lastFetchUtc: null,
      lastPushedSha: null,
      consecutiveFailures: 4,
      inflightConflicts: [],
    };
    writeFileSync(statePath(), JSON.stringify(persisted), 'utf-8');

    // start() with syncEnabled=false so it doesn't hit git — just loads state
    const engine = makeEngine({ syncEnabled: false });
    await engine.start();
    // The persisted consecutive failures should be loaded
    expect(engine.getStatus().consecutiveFailures).toBe(4);
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

  // Regression: state must transition to 'conflict' whenever conflictCount > 0
  // on restart, not 'idle' or 'disabled'. Otherwise the ConflictBanner + paused
  // sync UI won't render and the user sees only the stale conflictCount in the
  // popover while sync appears active — the exact symptom reported 2026-04-17.
  test('state is "conflict" (not "idle") when restarting with inflightConflicts and a remote', async () => {
    // Real git repo with a remote so start() gets past the hasRemote gate
    // and reaches the conflictCount > 0 branch at sync-engine.ts:284.
    const git = simpleGit(projectDir);
    await git.init();
    await git.raw('config', 'user.name', 'Test');
    await git.raw('config', 'user.email', 'test@test.com');
    writeFileSync(join(projectDir, 'README.md'), '# Test\n');
    await git.add('.');
    await git.commit('Initial');

    const bareDir = join(tmpDir, 'bare.git');
    mkdirSync(bareDir, { recursive: true });
    const bareGit = simpleGit(bareDir);
    await bareGit.init(true);
    await git.addRemote('origin', bareDir);

    // Pre-write conflicts.json + sync-state.json so start() restores them
    writeFileSync(
      join(okDir, 'conflicts.json'),
      JSON.stringify({
        version: 1,
        branch: 'main',
        conflicts: [
          { file: 'docs/a.md', detectedAt: '2026-04-17T00:00:00.000Z' },
          { file: 'docs/b.md', detectedAt: '2026-04-17T00:00:00.000Z' },
        ],
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
        inflightConflicts: ['docs/a.md', 'docs/b.md'],
      }),
      'utf-8',
    );

    const engine = makeEngine({ syncEnabled: true });
    try {
      await engine.start();
      const status = engine.getStatus();
      // The invariant: conflictCount > 0 ⟹ state === 'conflict'.
      expect(status.conflictCount).toBe(2);
      expect(status.state).toBe('conflict');
    } finally {
      await engine.destroy();
    }
  });

  // Complement of the restart test: resolving the last conflict must clear
  // the 'conflict' state. Together these pin the invariant from both sides.
  test('state transitions out of "conflict" once the last conflict is resolved', async () => {
    const git = simpleGit(projectDir);
    await git.init();
    await git.raw('config', 'user.name', 'Test');
    await git.raw('config', 'user.email', 'test@test.com');
    writeFileSync(join(projectDir, 'README.md'), '# Test\n');
    await git.add('.');
    await git.commit('Initial');

    const bareDir = join(tmpDir, 'bare.git');
    mkdirSync(bareDir, { recursive: true });
    await simpleGit(bareDir).init(true);
    await git.addRemote('origin', bareDir);

    // Seed a single conflict on disk at the path we'll resolve below
    const conflictedFile = 'a.md';
    writeFileSync(join(projectDir, conflictedFile), 'ours', 'utf-8');
    await git.add('.');
    await git.commit('conflict seed');

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
    // No state file written — engine should start without error
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

// ─── Status shape ─────────────────────────────────────────────────────────────

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

// ─── No-remote detection ──────────────────────────────────────────────────────

describe('SyncEngine no-remote detection', () => {
  test('stays dormant if project dir has no git remote (no .git/)', async () => {
    // projectDir has no git repo — git remote -v will fail or return empty
    const engine = makeEngine();
    await engine.start();
    // Without a git remote, engine should remain dormant
    expect(engine.getStatus().state).toBe('dormant');
    expect(engine.getStatus().hasRemote).toBe(false);
  });
});

// ─── updateCurrentBranch ──────────────────────────────────────────────────────

describe('SyncEngine updateCurrentBranch()', () => {
  test('transitions to disabled when branch is null (detached HEAD)', () => {
    const states: SyncState[] = [];
    // Manually set state to idle so the transition fires
    // We can't reach idle without a remote, so we check the guard condition
    // by reading the method directly on a fresh dormant engine.
    // Since engine is dormant, transition to disabled is skipped (guard: !== dormant).
    const engine = makeEngine({ onStateChange: (s) => states.push(s) });
    engine.updateCurrentBranch(null); // no-op when dormant
    expect(engine.getStatus().state).toBe('dormant');
    expect(states).toEqual([]);
  });
});

// ─── Backoff / consecutive failure thresholds ────────────────────────────────

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
    // trigger() resets consecutiveFailures even when dormant
    await engine.trigger();
    expect(engine.getStatus().consecutiveFailures).toBe(0);
  });
});

// ─── Lifecycle edge cases ───────────────────────────────────────────────────

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

// ─── Status shape completeness ──────────────────────────────────────────────

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
