---
name: Subsystem divergence inventory (standalone.ts vs hocuspocus-plugin.ts)
description: Enumerated list of server-side subsystems wired in packages/server/src/standalone.ts but absent from packages/app/src/server/hocuspocus-plugin.ts. Proves the divergence claim with grep counts.
sources:
  - packages/server/src/standalone.ts
  - packages/app/src/server/hocuspocus-plugin.ts
  - packages/server/src/boot.ts
  - packages/server/src/external-change.ts
gathered: 2026-04-22
confidence: HIGH (grep-verified symbol counts)
---

# Subsystem divergence inventory

Source of truth: `packages/server/src/standalone.ts:createServer()` (1452 LOC).
Target of comparison: `packages/app/src/server/hocuspocus-plugin.ts` (594 LOC).

## Server-side subsystems missing from the Vite plugin

Established via grep count of identifier occurrences, where `standalone` > 0 and `plugin` = 0:

| Symbol | standalone.ts count | hocuspocus-plugin.ts count | Consequence in dev mode |
|---|---:|---:|---|
| `startHeadWatcher` | 2 | 0 | Branch switches don't trigger `BatchBegin/BatchEnd` lifecycle; no park/restore of Y.Doc state on HEAD change |
| `recoverPendingManagedRename` | 2 | 0 | Crash-mid-rename state not recovered on next dev start |
| `principalAuthExtension` | 2 | 0 | Browser-tab principal-ID token never pinned to loaded principal; all browser writes fall through to `SERVICE_WRITER` fallback |
| `SyncEngine` | 7 | 0 | Remote-hosted sync engine never starts in dev (even in "stay inactive" mode); opt-in detection absent |
| `saveInMemoryCheckpoint` | 3 | 0 | External-change delete on dirty doc does NOT create a rescue buffer on the shadow timeline |
| `incrementRescueBuffer` | 4 | 0 | Metric counter for rescue-buffer saves never fires in dev |
| `PARK_SNAPSHOT_ORIGIN` | 4 | 0 | Park-snapshot atomic `doc.transact(fn, PARK_SNAPSHOT_ORIGIN)` wrapping absent |
| `parkBranch` | 3 | 0 | No branch parking on HEAD change |
| `readParkedState` | 2 | 0 | No restore of previously-parked state on return to a branch |

Grep commands (re-runnable):

```bash
for term in startHeadWatcher recoverPendingManagedRename principalAuthExtension \
            SyncEngine saveInMemoryCheckpoint incrementRescueBuffer \
            PARK_SNAPSHOT_ORIGIN parkBranch readParkedState; do
  s=$(grep -c "$term" packages/server/src/standalone.ts)
  p=$(grep -c "$term" packages/app/src/server/hocuspocus-plugin.ts)
  printf "%-35s  standalone=%2d  plugin=%2d\n" "$term" "$s" "$p"
done
```

## HTTP-layer primitives missing from the Vite plugin

From `packages/server/src/boot.ts` (the shared HTTP-wrapping layer that `bootServer()` provides):

| Symbol | boot.ts count | hocuspocus-plugin.ts count | Consequence in dev mode |
|---|---:|---:|---|
| `keepaliveGraceMs` | 2 | 0 | No grace period on MCP keepalive close — session cleanup is immediate rather than deferred 10s |
| `keepaliveGraceTimers` | 7 | 0 | No timer map; reconnect during grace window cannot cancel a pending cleanup |
| `bumpPresenceTs` | 2 | 0 | Agent presence badges may disappear between tool calls in dev mode (LLM "thinking" time > 5s TTL filter) |
| `parseKeepaliveConnectionId` | 2 | 0 | `connectionId` query-param not validated against `AGENT_ID_RE`; CR/LF bytes could reach structured log fields |
| `ensureProjectGit` | 5 | 1 (comment only) | Dev plugin uses softer `runDevShadowInit` instead of the fail-fast shared primitive |
| `closeAllForAgent` | 5 | 0 | No session cleanup on keepalive close in dev; session state leaks on MCP process exit |

## Functional divergence on external-change path

Plugin:

```ts
// packages/app/src/server/hocuspocus-plugin.ts:517
const handleExternalChange = createExternalChangeHandler(hocuspocus);
```

`createExternalChangeHandler` (`packages/server/src/external-change.ts:105-110`) is a simple error-swallowing wrapper around `applyExternalChange(hocuspocus, docName, content)` — it performs a direct apply with no three-way merge and no rescue buffer.

Standalone:

```ts
// packages/server/src/standalone.ts:382+
async function handleDiskEvent(event: DiskEvent): Promise<void> {
  // For update events:
  //   - reads reconciledBase per-doc
  //   - calls reconcile({ docName, base, ours, theirs }) — three-way merge
  //   - dispatches on result.kind: 'noop' | 'clean' | 'merged' | 'conflicts' | 'refused'
  //   - updates backlink index, lifecycle map, metrics counters per path
  // For delete events on dirty docs:
  //   - saves in-memory checkpoint via saveInMemoryCheckpoint (rescue buffer on shadow timeline)
}
```

**This is a behavioral gap, not cosmetic.** A developer running `bun run dev` who edits a file externally while the browser editor has unsaved local changes gets a silent overwrite — the same scenario under `ok start` runs three-way merge and creates a rescue buffer.

## Plugin's manual extension wiring

`packages/app/src/server/hocuspocus-plugin.ts:212-277` — direct instantiation of:

- `new Hocuspocus({ quiet: true, debounce: 2000, maxDebounce: 10000, extensions: [persistence.extension] })`
- `createPersistenceExtension(...)` (line 201)
- `new AgentSessionManager(hocuspocus)` (219)
- `new CC1Broadcaster(hocuspocus)` (220)
- `new AgentFocusBroadcaster(hocuspocus)` (226)
- `new AgentPresenceBroadcaster(hocuspocus)` (227)
- `createLiveDerivedIndexExtension(...)` (228) — pushed at 232
- `createApiExtension(...)` (235) — pushed at 234
- `createServerObserverExtension(...)` (270) — pushed at 269

Compare: `createServer()` at `packages/server/src/standalone.ts:211-344` does all of the above PLUS:

- `principalAuthExtension` (line 270-311) — MISSING in plugin
- The whole `initAsync()` block at line 973-1432 — includes shadow repo init, loadPrincipal, managed-rename recovery, HEAD watcher, file watcher with `handleDiskEvent` (not `createExternalChangeHandler`), SyncEngine.

## Numerics (net LOC)

- `packages/server/src/standalone.ts`: 1452 LOC
- `packages/server/src/boot.ts`: 514 LOC
- `packages/app/src/server/hocuspocus-plugin.ts`: 594 LOC
- Expected delete from plugin: 300–400 LOC (remaining: Vite-specific wiring + thin call to `createServer()`).
