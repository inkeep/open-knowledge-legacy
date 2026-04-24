---
name: SyncEngine is opt-in by default — no network side effects on startup
description: Proof that wiring SyncEngine into dev mode does not cause surprising network or mutation behavior when the developer has not explicitly enabled sync. Supports decision D2.
sources:
  - packages/server/src/sync-engine.ts
  - packages/server/src/standalone.ts
gathered: 2026-04-23
confidence: HIGH (code-traced)
---

# SyncEngine startup behavior

## Relevant code path

`packages/server/src/sync-engine.ts:231-269`:

```ts
async start(): Promise<void> {
  if (this.state !== 'dormant') return;

  this.loadState();  // may populate this.syncEnabled from disk

  let hasRemote = false;
  try {
    const handle = createGitInstance(this.projectDir, { credentialArgs: this.credentialArgs });
    const remoteOutput = await handle.git.raw('remote', '-v');
    hasRemote = remoteOutput.trim().length > 0;
    this.hasRemote = hasRemote;

    try {
      const b = (await handle.git.raw('rev-parse', '--abbrev-ref', 'HEAD')).trim();
      if (b && b !== 'HEAD') {
        this.currentBranch = b;
        this.conflictStore.setBranch(b);
      }
    } catch {
      // detached HEAD — will pause when push/pull fires
    }
  } catch (e) {
    log.warn({ err: e }, '[sync] remote detection failed');
  }

  // Disabled by default: sync only runs when the user has explicitly opted in.
  // Protects real git repos (production code) from being mutated automatically.
  if (this.syncEnabled !== true) {
    if (hasRemote) this.transitionTo('disabled');
    log.info(
      { hasRemote, syncEnabled: this.syncEnabled },
      '[sync] sync not enabled — staying inactive',
    );
    return;
  }

  if (!hasRemote) {
    log.info({}, '[sync] no remote detected — staying dormant');
    return;
  }

  // ... only past this point does SyncEngine do anything consequential
}
```

## What `start()` actually does when `syncEnabled !== true`

1. `this.loadState()` — reads persisted state from disk. `syncEnabled` defaults to `false` on fresh project.
2. `git remote -v` — one local subprocess call. No network. Returns empty for a fresh repo with no remote.
3. `git rev-parse --abbrev-ref HEAD` — one local subprocess call. No network. Returns the current branch name (or fails on detached HEAD — caught).
4. Early-return with `'[sync] sync not enabled — staying inactive'` log line.

**Total side effects when dev has not opted in:** two local `git` subprocess calls at startup. Zero network. Zero Y.Doc mutation. Zero filesystem mutation.

## What happens if the developer HAS opted in

If `syncEnabled === true` AND `hasRemote === true`, SyncEngine transitions to `'idle'` and runs the full reconciliation lifecycle — fetch, merge, conflict detection, etc. This is the intended behavior — a developer who explicitly opted into sync wants it in dev too.

## Implication for this spec

**D2 LOCKED: wire SyncEngine through to dev without gating.** The protective gating is already built into SyncEngine itself. No `createServer()` option needed. The two extra git subprocess calls at dev startup are acceptable cost; the `'sync not enabled — staying inactive'` log line is a useful dev signal.

## Test harness note

`createTestServer` passes `gitEnabled: false` to `createServer()`, but `gitEnabled` is only threaded into `PersistenceOptions` (`standalone.ts:225`) — the SyncEngine block at `standalone.ts:1408-1432` runs unconditionally. The test harness also calls `ensureProjectGit(contentDir)` to guarantee `.git/` exists. Net effect: SyncEngine runs `git remote -v` in the tmpdir (which has `.git/` but no remote), returns early. Benign in tests.

If we wanted to skip SyncEngine entirely when `gitEnabled: false`, that would be a separate small change to `standalone.ts` (gate the SyncEngine block). Not needed for this spec — current behavior is fine.
