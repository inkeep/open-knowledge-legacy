# Project lifecycle edge cases

**Date:** 2026-04-14
**Scope:** Everything that can go wrong when a project is moved, renamed, cloned, synced, nested, or otherwise leaves the "stable absolute path" happy path. Audits current behavior against the code; proposes handling patterns.
**Companion to:** `multi-project-topology-and-quickstart`, `multi-project-switching-landscape`.

## The root cause of most edge cases: identity = absolute path

Today, a project is identified everywhere by its absolute filesystem path. `resolveContentDir()` returns `resolve(cwd, config.content.dir)` (`packages/cli/src/config/paths.ts:17`). `server.lock` keys by that path. The shadow repo is at a fixed location relative to that path. No UUID, no git-remote-derived ID, no content-based hash. Every edge case below is either:

- **Identity-shaped:** the path moved/changed, so the system can't correlate state across the change, OR
- **Lifecycle-shaped:** something mutated while the server was running without an observer.

The single highest-leverage fix for the identity class is introducing a project-id primitive (§3.1). Most lifecycle-class issues need per-case handling; none are blocker-severity.

## Catalogue

Severity rubric:
- **P0** — silent data loss or corruption possible
- **P1** — breaks core workflow, user-visible failure
- **P2** — degraded experience, workaround exists
- **P3** — edge-case; rare; acceptable to defer

### E1 — Repo moved, server stopped (P3, resolved in practice)

**Today's behavior.** Works. `.open-knowledge/config.yml` is path-independent; shadow repo moves with the repo (inside `.git/openknowledge/` for integrated mode); `server.lock` is rewritten on next `start`.

**Gap.** None for the running-server layer. But under the proposed `~/.open-knowledge/projects.json` registry, the path-keyed entry goes stale — the hub will show "missing" and `start` from the new path creates a duplicate entry. See E3 for the fix.

### E2 — Repo moved, server still running (P1)

**Today's behavior.** File handles held by the process keep working on Unix. But:
- `file-watcher.ts` has the old absolute path cached in its index.
- Persistence resolves `realpath(requestedPath)` on every write — the old canonical path is now invalid.
- `server.lock`'s `worktreeRoot` field is stale.
- No mechanism detects the move. No warning is emitted.

**Recommendation.** Periodic self-check (~60s) verifying `existsSync(contentDir)` AND `statSync(contentDir).ino` matches the inode captured at startup. On mismatch, emit a clear error (`"contentDir moved or inode changed — please stop and restart the server"`) and stop accepting writes. This is cheaper than trying to hot-rebase paths.

### E3 — Registry entry orphaned by move/rename (P1 under hub proposal)

**Today's behavior.** N/A — no registry yet.

**Under hub proposal.** Registry keys by path; move = orphan entry + duplicate history on next start.

**Recommendation.** **Introduce a project-id primitive.** Generate a UUID on `init` (or first `start` if init was never run) and write it to `.open-knowledge/project-id`. Registry keys by id, not path. Lookup flow on `start`:

```
read .open-knowledge/project-id → uuid
registry.find(p => p.id === uuid)
  hit at /old/path → update project.path = /new/path; preserve lastSeen, name, etc.
  miss             → insert new entry
```

Benefits beyond move-handling: enables multi-clone detection (§E4), cross-machine correlation of stats/telemetry (if we ever want that), and stable references from external tools (xbar, Raycast) to a project.

Cost: ~20 lines in `init` + `start` + registry schema. Do this once; it unlocks four other cases below.

### E4 — Repo copied (`cp -R`, duplicated worktree) (P2)

**Today's behavior.** Nothing detects it. Each copy has independent `.open-knowledge/`, independent `server.lock`. Both work in isolation. Shadow repo state in `.git/openknowledge/` is duplicated byte-for-byte at copy time.

**With project-id.** Both copies share the same `.open-knowledge/project-id`. First copy's `start` claims registry entry; second copy's `start` finds the id at a different path → conflict. Handling options:

1. **Error + prompt:** `"Another project at /old/path already has this id. Is this a copy or a move? [copy / move / cancel]"`. `copy` regenerates id here; `move` updates the path and marks the old one deleted; `cancel` exits.
2. **Auto-fork on mismatch inode:** if both paths exist and have different inodes, treat the new one as a copy and regenerate id silently; log a one-liner.

Option 1 is safer. The `cp -R` case is rare enough that a prompt doesn't hurt; the cost of getting it wrong (collapsing two intentional copies into one registry entry) is higher than a prompt on first start.

### E5 — Cross-host lock files (P2 if using Dropbox/iCloud/network home)

**Today's behavior.** `acquireServerLock()` at `packages/server/src/server-lock.ts:78-89` checks hostname and PID: if hostname is different, the code falls through; if PID is dead or on another host, replaces the lock. But `readServerLock()` at line 158 returns `null` for different-host locks — meaning discovery callers see no running server, even if one is running on the OTHER host against a synced filesystem.

**Gap.** On a Dropbox-synced home directory, two machines both think "no server running" and both try to start, both succeed (each sees its own lock after the write), but they both write to the same content files simultaneously. Potential data loss.

**Recommendation.** Treat a live-looking cross-host lock as a collision, not an absence:

```
readServerLock:
  if hostname !== thisHost:
    return { status: 'foreign-host', host, port, pid }  // not null
```

`acquireServerLock` should refuse when a foreign-host lock is present and the lock's `startedAt` is recent (< 24h). Print a clear error: `"Lock held by another machine ({hostname}). If that machine is offline, delete {lockPath} to force start."` Explicit manual steal is safer than automatic one over network filesystems where clock skew and sync lag can make "live" ambiguous.

### E6 — Network mount / sync service clobbers a write (P1 on heavily-synced dirs)

**Today's behavior.** Persistence writes are atomic via `rename(tmp, canonical)` (`persistence.ts:477`). But the window between the atomic rename and the file-watcher event is not protected — if a sync service (Syncthing, Dropbox, iCloud) writes to the same file between those events, the writeTracker's hash check fails and the change is treated as external. Depending on reconciliation result, the sync-service write can win.

Worse: persistence reads from disk via `readFileSync` on load. If the sync service hasn't finished syncing before the load, we see stale content and the user's other-machine edits are silently lost on the next write.

**Recommendation.** Two layers:

1. **Detect-and-warn:** on startup, if `contentDir` is inside a well-known sync root (`~/Dropbox`, `~/OneDrive`, `~/Library/Mobile Documents/`, `~/Library/CloudStorage/`, or a mounted SMB/NFS per `statfs` type), emit a banner warning: `"contentDir is inside {service}. Open Knowledge's CRDT sync is incompatible with external file sync — expect data loss on concurrent edits."` Let the user proceed.
2. **Refuse-on-explicit-flag:** add `ok.allowSyncedContentDir: false` to config schema. Default true (don't block users); power users can set false to turn the warning into an error.

Do NOT try to build conflict detection against external sync services — the problem space is too big (eventual consistency, delete-during-sync, incremental sync, atomicity differences per service). Flag and disclaim.

### E7 — Nested projects (inner `.open-knowledge/` inside outer's content dir) (P2)

**Today's behavior.** No special handling. `ContentFilter` unions `.gitignore` + config excludes but doesn't hardcode `.open-knowledge/`. If a user has nested projects and `.gitignore` doesn't mention `.open-knowledge/`, the outer project will index the inner's `AGENTS.md`, try to watch its server.lock, etc.

Cross-contamination paths:
- Outer indexes `inner/.open-knowledge/AGENTS.md`
- Outer's file watcher emits events for inner's `server.lock` mutations (noisy but harmless)
- If outer's content filter `include` matches inner project files, outer attempts to manage them

**Recommendation.** Hardcode `.open-knowledge/**` into the default exclude list in the Zod config schema. This is the same fix category as F3 in the onboarding audit (hardcode `node_modules/**` into defaults). Cheap, no downside — `.open-knowledge/` is never user content.

Additionally: on `init`, scan ancestor directories for `.open-knowledge/config.yml`. If found, warn: `"This project is inside {outer}'s Open Knowledge project. You probably want to configure content scope in the outer project instead."`

### E8 — Clone of a repo with `.open-knowledge/` committed (P2)

**Today's behavior.** `initShadowRepo()` at `shadow-repo.ts:66` is idempotent — if `.open-knowledge/HEAD` exists, init is skipped. But a cloned `.open-knowledge/` contains the committer's stale WIP refs and checkpoints. The `reconciledBase` map is rebuilt from disk on load — the old one is discarded. Result: cloned shadow repo exists but its refs are orphaned and get GC'd after 24h; no warning.

Commit-ability of `.open-knowledge/` itself depends on user setup. `init` writes a `.gitignore` inside `.open-knowledge/cache/` but doesn't add `.open-knowledge/` to the repo's top-level `.gitignore`. So `AGENTS.md` and `config.yml` are checked in by design; only cache is ignored. This is probably correct — but the shadow refs (if anyone accidentally `git add .` inside `.open-knowledge/`) would be committed too.

**Recommendation.** Two fixes:

1. **On `init`, append to project's `.gitignore`:**
   ```
   # Open Knowledge — never commit these
   .open-knowledge/cache/
   .open-knowledge/server.lock
   .open-knowledge/**/HEAD
   .open-knowledge/**/objects/
   .open-knowledge/**/refs/
   ```
   (Keep `config.yml` and `AGENTS.md` committable.)
2. **On `start` when shadow repo exists but has no reconciledBase entries for any current file,** log: `"Shadow repo appears to be from a different working copy. Previous version history may not be accessible; current state on disk is authoritative."` One-time; disappears once normal reconciliation populates the base.

### E9 — `rm -rf .open-knowledge/` while running (P2)

**Today's behavior.** No watcher on `.open-knowledge/`. Server keeps running; no detection. `updateServerLockPort()` silently no-ops when the lock file is missing (`server-lock.ts:111`). Shadow commits fail; after 3 retries, `persistence.ts` logs CRITICAL but continues.

**Recommendation.** Add `.open-knowledge/` to the file watcher's own watch set (not for indexing, for liveness). On self-directory delete: emit a clear error, stop accepting new writes, keep in-memory state so user can at least recover content via `/api/rescue`. Exit cleanly on user confirmation.

### E10 — `rm -rf .git/` or `.git/openknowledge/` while running (P2)

**Today's behavior.** Shadow operations fail; persistence logs retries; server continues degraded. HEAD watcher is on `.git/HEAD` — its deletion likely breaks the watcher silently.

**Recommendation.** Same as E9 but for the shadow root. Add a self-liveness watch; on disappearance, log clearly and stop committing to the shadow. Keep serving reads.

### E11 — User edits `config.yml` while server running (P2)

**Today's behavior.** No reload. Pattern changes are ignored until restart. User sees no effect; assumes bug.

**Recommendation.** Either:
- **Watch + reload:** watch `.open-knowledge/config.yml`; on change, rebuild `ContentFilter`, re-walk the content dir, diff against current index, emit appropriate DiskEvents. Moderately invasive.
- **Watch + warn:** easier; watch the config, on change emit `"config.yml changed — restart required to apply"`. Then user can choose.

Recommend the latter unless live config-reload becomes a hot request.

### E12 — `content.dir` changed mid-run (P2)

**Today's behavior.** See E11 — config isn't reloaded, so the server keeps watching the old path. Even if config WERE reloaded, `contentDir` is passed to `createServer()` once; the whole watcher/persistence stack is wired to that path.

**Recommendation.** Treat `content.dir` changes as restart-required. Config reload can skip this field (opt-out list in the reload logic).

### E13 — Cross-device atomic rename fails (P2)

**Today's behavior.** `rename(tmp, canonical)` at `persistence.ts:477` throws `EXDEV` if tmp and canonical are on different filesystems. Persistence re-throws; store op fails; user's write is lost.

When does this happen? When `contentDir` is a mount point AND the tmp file ends up on a different filesystem. Our tmp file is sibling of canonical (`${canonicalPath}.tmp.${uuid}`), so they're on the same FS by construction — **unless** the canonical path is a symlink crossing a FS boundary. Rare but real (external drive symlinks).

**Recommendation.** On `EXDEV` catch in persistence, fall back to `copyFile(tmp, canonical) + unlink(tmp)`. Atomicity is weakened (brief window where reader sees partial content), but graceful. Log at WARN once per file so the user knows.

### E14 — Symlink target changes while running (P3)

**Today's behavior.** `realpath` is called once per write operation (`persistence.ts:433`) — so symlink retargeting between writes IS picked up on next write. But the file-watcher's index keys by canonical paths captured at startup walk — retargeted symlinks will watch the old target.

**Recommendation.** Accept as a known limitation. Symlink retargeting mid-run is pathological. Document in CLAUDE.md's symlink section. Require user to restart after symlink changes.

### E15 — Broken symlink as contentDir (P3)

**Today's behavior.** `realpathSync(contentDir)` throws; code falls back to raw path (`persistence.ts:139`). Subsequent filesystem ops fail with ENOENT. Error is logged; server continues but can't write.

**Recommendation.** Refuse to start with a clear error: `"contentDir resolves to a broken symlink: {target} does not exist"`. Don't boot a half-alive server.

### E16 — Clock skew causes shadow commits with future/past timestamps (P3)

**Today's behavior.** No check. Shadow commits use system time. On a badly-skewed system (VM with clock drift, NTP not running), commits can go out of order. `shadow-branch-gc` uses `lastSeen` for 24h grace — a badly-skewed clock could GC refs prematurely.

**Recommendation.** Acceptable. Document. Users with clock issues have bigger problems than our shadow GC.

### E17 — Multiple CLI versions on PATH (P3)

**Today's behavior.** Whichever `open-knowledge` the shell resolves first. If the user has `@inkeep/open-knowledge@0.0.1` globally and `@0.0.2` in a local `node_modules/.bin`, `npx @inkeep/open-knowledge` in `.mcp.json` resolves to local preference — can cause version mismatch between the running `start` server and the MCP subprocess.

**Recommendation.** On MCP connect, exchange version strings; warn if mismatch. Later: add a protocol-version field to the MCP server instructions and refuse to connect on major-version skew.

---

## Prioritization

| ID | Severity | Effort | Notes |
|---|---|---|---|
| E3 | P1 | S | **Project-id primitive** — unlocks E4, enables clean registry. Do this first. |
| E2 | P1 | S | Runtime `existsSync(contentDir)` + inode check with error on mismatch. |
| E6 | P1 | S | Sync-service detection + banner warning. |
| E5 | P2 | S | Foreign-host lock detection. |
| E7 | P2 | XS | Add `.open-knowledge/**` to default excludes. |
| E8 | P2 | XS | `.gitignore` append on init; shadow-repo-from-clone warning. |
| E9, E10 | P2 | M | Self-liveness watches. Defer unless users hit it. |
| E11, E12 | P2 | M | Config-reload-warn-or-rebuild. Start with warn. |
| E13 | P2 | XS | EXDEV copy-unlink fallback. |
| E4 | P2 | S | Copy-detection with prompt (depends on E3). |
| E14–E17 | P3 | — | Document or defer. |

**The one unifying fix.** E3 (project-id) is the single change that pays for itself across E3, E4, and any future cross-project correlation. Do it before anything else in this list.

**Patterns to extract.**
- **"Inode-based aliveness."** We use it for stale-lock detection (`isProcessAlive` + hostname). Extend to detect contentDir moves (`statSync(contentDir).ino`).
- **"Detect, don't fix."** For sync services, nested projects, clone inheritance — detection + clear message is usually sufficient. Don't try to reconcile user intent from ambiguous filesystem state.
- **"Fail loud on ambiguous mid-run state."** E2, E9, E10 all share the pattern: something the server depended on disappeared/changed. Current behavior is "log + continue degraded." Better: stop accepting writes, hold in-memory state for rescue, exit on user command. Users prefer explicit failure over silent half-running.

---

## Followups not covered in this report

- **Reflog loss in shadow repo.** Git reflog has its own GC semantics; our shadow-branch-gc doesn't intersect. Separate report if shadow-repo stability becomes a concern.
- **Submodule-style Open Knowledge.** What if a project wants to embed another project's knowledge read-only? Out of scope; revisit if multi-project federation (Option 5 in the landscape report) gets built.
- **Windows-specific edge cases.** All of the above is Unix-biased. Windows filesystem semantics (case-insensitive, reserved names, short paths, path length limits, ADS, Developer Mode for symlinks) need a separate pass. Not urgent — current users are on macOS/Linux.
