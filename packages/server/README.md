# @inkeep/open-knowledge-server

Hocuspocus CRDT server library — persistence, file-watcher, agent sessions, history repo, HTTP API, and the process-lock / idle-shutdown primitives that back the `ok start` / `ok ui` lifecycle. Embedded in the Vite dev server (`packages/app`) and the published CLI (`packages/cli`).

See root `CLAUDE.md` → "Package: server" for the full component inventory. The agent-identity attribution model (per-session `LocalTransactionOrigin`, classified writer IDs, `ok-actor:` commit bodies, per-session `Y.UndoManager`) is specified in `specs/2026-04-18-agent-identity-attribution-foundation/SPEC.md` and summarized in AGENTS.md precedents #24 and #25.

---

## Process-lock factory (`process-lock.ts`)

Single shared primitive for every per-content-directory lockfile owned by this repo.

```ts
import { acquireProcessLock } from '@inkeep/open-knowledge-server';

const handle = acquireProcessLock({
  lockName: 'server',                 // or 'ui'
  lockDir: '<contentDir>/.open-knowledge',
  metadata: { worktreeRoot },         // merged into the JSON payload
});

handle.updatePort(realPort);          // post-listen port mutation (ownership-guarded)
handle.release();                     // idempotent — only removes the lock when pid matches
```

- **JSON shape:** `{pid, hostname, port, startedAt, worktreeRoot}`. `port: 0` is the "starting, not yet bound" sentinel — consumers must re-read after the owner calls `updateProcessLockPort`.
- **Collision behavior:** a live same-host PID → throws `ProcessLockCollisionError`. Dead-pid / corrupt JSON / foreign-host locks → replaced with a warning. `ServerLockCollisionError` and `UiLockCollisionError` extend this error so existing `instanceof` callers keep working.
- **Thin adapters:** `server-lock.ts` pins `lockName: 'server'`; `ui-lock.ts` pins `lockName: 'ui'`. Both re-export typed `acquire*Lock` / `update*LockPort` / `read*Lock` / `release*Lock` / `*LockCollisionError`.

Defined by `specs/2026-04-16-zero-ceremony-resume/SPEC.md` §9 (US-001). Used by `createServer()`, `startUiServer()`, MCP spawn verification, and every lifecycle command (`status` / `stop` / `clean`).

---

## Idle-shutdown primitive (`idle-shutdown.ts`)

Attaches a WebSocket-client counter to an `http.Server` and fires `onShutdown` after the configured threshold of zero clients. Used by `ok start` to SIGTERM its `ok ui` sibling and tear down the collab process after a configurable idle window.

```ts
import { attachIdleShutdown } from '@inkeep/open-knowledge-server';

const handle = attachIdleShutdown({
  httpServer,                         // hocuspocus listener
  thresholdMs: 30 * 60 * 1000,        // 30 min default in ok start
  onShutdown: async () => {           // fired when counter stays at 0 for thresholdMs
    await sigtermSibling();           // e.g. SIGTERM ui.lock.pid
    await serverInstance.destroy();   // releases server.lock as its final step
  },
  warnBeforeMs: 5 * 60 * 1000,        // WARN log 5 min before shutdown (optional)
  log,                                // PinoLogger
  scheduler,                          // Scheduler injection for tests (precedent #13b)
});

handle.detach();                      // call from destroy() to cancel timers
```

- **"Idle"** = WebSocket upgrades at paths starting with `/collab`. `DirectConnection`-based writers (CC1 broadcaster, AgentSessionManager) are invisible to the counter **by design** (D-017 in the SPEC). Counter increments on upgrade, decrements on `socket close`.
- **Scheduler injection** — production passes the default `setTimeout`/`clearTimeout`; tests pass a `ManualScheduler` for deterministic control (see PRECEDENTS.md precedent #13b). This DI lives in the `idle-shutdown` scope only — the server observer bridge is settlement-based per precedent #13(b) and has no `Scheduler` surface.
- **Clean-up guarantees** — `detach()` is idempotent and must run inside the owner's `destroy()` so stale timers don't fire mid-shutdown.

Defined by SPEC §9 (US-002).

---

## Server-authoritative bridge (Y.XmlFragment ↔ Y.Text)

Cross-CRDT sync between `Y.XmlFragment('default')` (TipTap) and `Y.Text('source')` (CodeMirror) is performed exclusively on the server (precedent #14). Client observers are baseline-tracking shells with no write paths. The mechanism, contracts, and STOP rules are governed by `specs/2026-04-16-bridge-correctness/SPEC.md`.

### Settlement dispatch (precedent #13(b))

`setupServerObservers` in `src/server-observers.ts` subscribes to `doc.on('afterAllTransactions', ...)`. Observer A (XmlFragment → Y.Text) and Observer B (Y.Text → XmlFragment) callbacks only flag dirty state — the settlement handler runs the actual sync work synchronously after each outermost `doc.transact()` drain, A before B so any Y.Text write from A is visible to B's read. One transaction = one drain = one settlement fire. There is no wall-clock `setTimeout`, no injected `Scheduler`, and no debounce window in either bridge observer file. The `bridge-no-wallclock.test.ts` grep gate fails CI on any reintroduction.

### Paired-write origin marker

Origins that atomically mutate BOTH `Y.XmlFragment` and `Y.Text` inside a single `doc.transact(..., ORIGIN)` block declare `context.paired: true` in their literal definition. `isPairedWriteOrigin(transaction.origin)` matches structurally (`origin.context.paired === true`) — no hardcoded registry. Observer A AND Observer B both detect the marker, refresh their shared baseline synchronously inside the observer callback, and decline to flag dirty state — the settlement handler then has nothing to dispatch for the drain. The four paired origins today: `AGENT_WRITE_ORIGIN`, `FILE_WATCHER_ORIGIN`, `ROLLBACK_ORIGIN`, `MANAGED_RENAME_ORIGIN`.

### Content-preservation post-condition + silent recovery (Notion-style)

Observer A's Path B (used when local Y.Text has diverged from the last-synced XmlFragment baseline) wraps `mergeThreeWay` (`@inkeep/open-knowledge-core/bridge`) with `assertContentPreservation` — a maximal-unique-line-substring + relative-order side-check that throws `BridgeMergeContentLossError` when the merge drops content from either side.

The error is caught only at the Observer A Path B call site (`server-observers.ts`). In production, the bridge:

1. Emits a structured `bridge-merge-content-loss` JSON log via `console.warn` and increments `bridgeMergeContentLoss` in `src/metrics.ts`.
2. Queues a silent named version-history checkpoint via `saveInMemoryCheckpoint` (`src/shadow-repo.ts`) at `refs/checkpoints/<branch>/<sha>`, with `kind: 'bridge-merge-loss'` metadata containing the lost substrings. `bridgeMergeCheckpointCreated` increments on success.
3. Applies the merge result as-computed via `applyFastDiff` so the editor stays responsive — no toast, no modal, no user-visible interruption (Notion-style).

`TimelinePanel` renders these checkpoints with kind-aware copy so users can `Restore` them through the existing UI. In dev/test the catch re-throws so `bun run check` and integration tests fail loudly.

**STOP.** Do not catch `BridgeMergeContentLossError` at any other site — Mutation H in the spec validates this is load-bearing for telemetry observability.

### Silent in-memory checkpoint primitive

`saveInMemoryCheckpoint(history, contentRoot, params)` in `src/shadow-repo.ts` is the generic write-side primitive shared by Observer A's bridge-merge recovery and external-change rescue (`reconciliation.ts` and `branch-switch.ts`). The discriminated-union `params` carries `{ kind: 'bridge-merge-loss' | 'external-change-rescue', docName, contents, label, branch, metadata }`; `parseCheckpoint` (`@inkeep/open-knowledge-core/shadow-repo-layout`) reads them back kind-aware from the commit body. Refs land at `refs/checkpoints/<branch>/<sha>` and never touch `refs/wip/*`. Concurrent same-process invocations stay safe via per-call `randomUUID` tmp-index files.

### `GET /api/rescue` reads both surfaces

The rescue reader at `src/api-extension.ts` merges flat-file rescue buffers (legacy + shutdown-flush path) with timeline-ref checkpoints (`saveInMemoryCheckpoint` write path). Callers see one unified list; channel-of-record migration is hidden behind the API.

---

## Agent-write HTTP surface (identity-foundation)

Every mutating POST handler calls `extractAgentIdentity(body)` at entry — this is the canonical identity boundary (precedent #24, D42). The request body carries `{agentId, agentName, colorSeed, clientName}`; `AgentSessionManager.getSession(docName, agentId, identity)` returns the `SessionRecord` whose `origin` is a frozen per-session `LocalTransactionOrigin` (precedent #1, D2). All Y.Doc mutations from that session pass through `session.dc.document.transact(fn, session.origin)` — never `session.dc.transact(fn)` (STOP rule in AGENTS.md §Known Pitfalls).

| Endpoint | Session binding | Notes |
|---|---|---|
| `POST /api/agent-write-md` | fires under `session.origin` via `applyAgentMarkdownWrite` (precedent #10) | XmlFragment-authoritative composition; mirrors Y.Text via `applyFastDiff` |
| `POST /api/agent-write` | fires under `session.origin` | raw Y.XmlElement append (V3 validation surface) |
| `POST /api/agent-patch` | fires under `session.origin` | targeted find/replace on live Y.Text |
| `POST /api/agent-undo` | fires under per-session `session.undoOrigin` (distinct from `session.origin`) via `applyAgentUndo(session, scope)` — V0-14 landed surface | body: `{ connectionId, scope: 'last' \| 'session' }`. `session.um.undo()` runs inside the outer `doc.transact(..., session.undoOrigin)` so Observer A/B short-circuit; post-undo composes via `updateYFragment` + `applyFastDiff` |

`POST /api/save-version` uses `Author: <principal_display_name>` + `Co-Authored-By: <agent>` trailers (FR-9, D12) on the project-git commit; gracefully skips when the project dir is absent / not a git repo (D45). The history checkpoint always lands regardless of project-git state.

Classified writer IDs for non-attributable writes: `file-system` (disk reconciliation), `git-upstream` (HEAD-move import), `openknowledge-service` (park snapshots, fallback). See `packages/core/src/shadow-repo-layout.ts` for `parseWriterId` / `WRITER_ID_RE` / `parseOkActor` / `formatOkActor` and AGENTS.md → "History repo & branch runtime" for the full taxonomy table.

### Session lifecycle + cleanup

`closeAllForAgent(connectionId)` is the teardown primitive called from the keepalive-WebSocket close handler (`src/boot.ts`). A 30-second grace timer (D28) prevents false-positive cleanup on transient network drops; subprocess reconnect within the grace reuses the same session, after the grace fires the cleanup runs `closeAllForAgent` + `agentFocusBroadcaster.clearFocus(connectionId)`. Subprocess reconnects past the grace always create a fresh session (D29 — no resume-by-label). The 30-minute idle-shutdown is the fallback for process-crash / network-partition scenarios.

### Structured telemetry

`src/metrics.ts` exposes the bridge counters via `GET /api/metrics/reconciliation`:

| Counter                                           | Meaning                                                                             |
| ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `bridgeMergeContentLoss`                          | Observer A Path B post-condition violations since process start                     |
| `bridgeMergeCheckpointCreated`                    | Silent checkpoints written successfully via `saveInMemoryCheckpoint`                |
| `serverObserverFiresA` / `serverObserverFiresB`   | Drain-level dispatch count per direction                                            |
| `serverObserverErrorsA` / `serverObserverErrorsB` | Caught failures inside the observer body (parse, serialize, baseline) per direction |

The counters are the load-bearing signal for SS-1 (single-CRDT collapse) urgency calibration over the post-launch observation window.

### OpenTelemetry instrumentation

Optional OTel traces + metrics via `src/telemetry.ts` — off by default (`OTEL_SDK_DISABLED=true`). When enabled, every HTTP request, Hocuspocus hook, agent write, persistence debounce, shadow-repo commit, and fs write emits a span; pino log records carry `trace_id` / `span_id` / `trace_flags` for trace↔log correlation in Grafana.

Canonical call sites:
- `src/telemetry.ts` — `initTelemetry` / `shutdownTelemetry` / `withSpan` / `withSpanSync` / `setActiveSpanAttributes` / `getTracer` / `getMeter`. SDK 2.x (`BasicTracerProvider` + `AsyncLocalStorageContextManager`) — Bun-compatible.
- `src/fs-traced.ts` — ONLY sanctioned path for instrumenting `writeFile` / `rename` / `mkdir` / `unlink` (async + `*Sync` variants). `@opentelemetry/instrumentation-fs` does NOT work under Bun (oven-sh/bun#6546) — use these wrappers.
- `src/logger.ts` — pino `otelMixin` injects trace context into every log record. No manual plumbing needed.

**To turn it on + see traces in Grafana:** full recipe is in [`docker/otel-dev/README.md`](../../docker/otel-dev/README.md) (Grafana + Tempo + Loki + Prometheus + OTel Collector via docker-compose). Three commands, zero third-party subscriptions.

Full PRD: [`specs/2026-04-09-otel-instrumentation/SPEC.md`](../../specs/2026-04-09-otel-instrumentation/SPEC.md).

---

## CC1 push-over-awareness — contract v1

CC1 is the shared push primitive for derived-view invalidation (file list, backlinks, future graph panels). Rather than each client polling its own REST endpoint, the server emits a **pure signal** when the underlying data changes; clients respond by re-fetching the channel's canonical endpoint.

Contract authored in `specs/2026-04-13-v0-2-sidebar-push/SPEC.md` §9. V0-3 (BacklinksPanel) and V0-11 (graph panels) inherit this contract without revision.

### Payload shape

```ts
type CC1Signal = {
	v: 1;         // contract version; unknown v → skip + log at WARN
	ch: string;   // flat kebab-case channel name ('files', 'backlinks', 'graph', ...)
	seq: number;  // per-channel monotonic, starts at 1 per server process lifetime
};
```

No event kind, no path, no docName. Every signal says only "channel `ch` changed; re-fetch." `seq` is for dedup + observability, not for gating refetch.

### Transport

- Dedicated `__system__` Y.Doc, pre-materialized at server startup via `hocuspocus.openDirectConnection('__system__')` before the file watcher starts.
- Every client opens `__system__` on app mount via `ProviderPool` (pinned — does not count toward pool `maxSize`; skipped by LRU eviction).
- Server-side emission: `document.broadcastStateless(JSON.stringify(payload))` on the `__system__` Document.
- Client-side receive: `HocuspocusProvider({name: '__system__', onStateless: ({payload}) => ...})`.

### Channel ownership

Each channel's semantics are owned by its emitter. Adding a new `ch` value counts as a contract change (D2 signoff).

| Channel            | Emitted from                                                                                              | Triggers                                                                                        | Canonical refetch                                                                                              |
| ------------------ | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `files`            | `standalone.ts` DiskEvent dispatch (V0-2, shipped)                                                        | `create \| delete \| rename` DiskEvents only. `update` / `conflict` do not change the file list | `GET /api/documents`                                                                                           |
| `backlinks`        | `persistence.ts` backlink-index update path (V0-3, pending)                                               | Content changes that invalidate the backlink index                                              | `GET /api/backlinks/:docName`                                                                                  |
| `graph`            | TBD (V0-11, pending)                                                                                      | Graph-derived data changes                                                                      | TBD                                                                                                            |
| `session-activity` | `persistence.ts` L2 drain, after any successful `commitWipFromTree` whose `writerId.startsWith('agent-')` | Any agent-origin write that produced a shadow-repo commit                                       | `GET /api/agent-activity?agentId=<connId>` — open Activity Panels re-fetch with a 500 ms hook-level debounce   |

### Coalescing

Server-side **100 ms trailing-edge debounce per channel** (`CC1Broadcaster.signal(channel)` in `src/cc1-broadcast.ts`). Every incoming event restarts the timer; when the timer fires (no events for 100 ms) exactly one signal is broadcast. A `git checkout` touching 200 files collapses to one signal.

### Emitting (server-side)

```ts
import { CC1Broadcaster } from '@inkeep/open-knowledge-server';

const cc1Broadcaster = new CC1Broadcaster(hocuspocus);

// On any event that changes the 'files' channel:
cc1Broadcaster.signal('files');
```

Tear down on server shutdown with `cc1Broadcaster.destroy()` to clear pending debounce timers.

### Subscribing (client-side contract)

```ts
import { HocuspocusProvider } from '@hocuspocus/provider';
import { type CC1Signal, SYSTEM_DOC_NAME } from '@inkeep/open-knowledge-server';

const provider = new HocuspocusProvider({
	url: 'ws://localhost:5173/collab',
	name: SYSTEM_DOC_NAME, // '__system__'
	document: new Y.Doc(),
	onStateless: ({ payload }) => {
		let signal: CC1Signal;
		try {
			signal = JSON.parse(payload) as CC1Signal;
		} catch {
			return; // malformed — skip, never disconnect
		}
		if (signal.v !== 1) return; // unknown version — skip
		if (signal.ch === 'files') {
			// re-fetch GET /api/documents (at-most-one in flight per channel)
		}
	},
});
```

**Refetch discipline.** At most one refetch in flight per channel; coalesce redundant signals until the pending fetch returns. On WebSocket reconnect, refetch once unconditionally (recovers from missed signals during disconnect).

### Error handling (both sides)

| Condition                        | Behavior                                                                          |
| -------------------------------- | --------------------------------------------------------------------------------- |
| Unknown `v` field                | Log at WARN; skip. Never disconnect.                                              |
| Unparseable JSON                 | Log at WARN; skip. Never disconnect.                                              |
| Unknown `ch` value               | Log at WARN; skip.                                                                |
| `__system__` doc missing on emit | Log once; drop the signal (startup race before `openDirectConnection` completes). |
| `seq` dedup                      | Client-side concern; server always increments.                                    |

### Cross-cutting skip surface (`isSystemDoc`)

`__system__` is not a content doc. Any subsystem that keys off `documentName` MUST call `isSystemDoc(documentName)` (exported from `cc1-broadcast.ts`) at its entry point. Audited subsystems that already do so:

- `persistence.ts` — `onLoadDocument`, `onStoreDocument` return early
- `file-watcher.ts` — `__system__` never appears in the in-memory file index
- `content-filter.ts` — reserved-name tripwire; rejects user-created `__system__.md`
- `reconciliation.ts` — no `reconciledBase` entry
- `backlink-index.ts` — no index entries
- `agent-sessions.ts` — no agent session state
- `external-change.ts` — skipped at dispatch
- Frontmatter cache (inside `persistence.ts`) — no cache entry

Reserved-name policy: `ContentFilter` rejects `__system__.md` at admit time; `POST /api/create-page` returns 400 on that name.

**If a new subsystem forgets this check,** the L1 integration test (`packages/app/tests/integration/cc1-broadcast.test.ts`) will fail its zero-state assertion after 10 broadcasts.

### Observability

`src/metrics.ts` exposes three CC1 counters, returned by `GET /api/metrics/reconciliation`:

| Counter              | Meaning                                                         |
| -------------------- | --------------------------------------------------------------- |
| `cc1BroadcastCount`  | Total signals broadcast across all channels since process start |
| `cc1SubscriberCount` | Current `__system__` Document connection count                  |
| `cc1LastSeq`         | `Record<channel, number>` of the most recent `seq` per channel  |

### Reserved names

- `__system__` — CC1 broadcast target (v1).
- Future `cc1:*` names — reserved for additional CC1 internal channels. Treat as 1-way-door; lock before any consumer adopts.

---

## `GET /api/installed-agents` — web-host install detection

Web-host parity for the Electron `ok:shell:detect-protocol` IPC in `packages/desktop/src/main/ipc-handlers.ts`. The browser can't enumerate the OS's scheme handlers directly, so the [[Open in Agent Desktop|Open-in-Agent dropdown]] in the `open-knowledge start` web build asks the server to probe on its behalf.

Governing spec: [[specs/2026-04-21-open-in-agent-desktop/SPEC|Open in Agent Desktop SPEC]] §6.4.

### Response shape

```json
{ "claude": true, "codex": false, "cursor": true }
```

One boolean per scheme — Cowork and Code share `claude:` so they flatten to one field. The client UI always renders the Cursor row disabled on web hosts regardless of the boolean returned (E4 DIRECTED — local-use-case posture; the probe stays in place to keep the response shape stable).

### Per-OS probes

Each probe is install-registration (does the scheme have a handler?), NOT a running-process check. Implemented in `src/handoff-api.ts`.

| Platform | Command                                             | Signal               |
| -------- | --------------------------------------------------- | -------------------- |
| macOS    | `osascript -e 'id of app "<AppName>"'`              | stdout has bundle id |
| Windows  | `reg query "HKCU\\Software\\Classes\\<scheme>" /ve` | exit code 0          |
| Linux    | `xdg-mime query default x-scheme-handler/<scheme>`  | non-empty stdout     |

2-second per-probe timeout; any timeout, non-zero exit, or shell error resolves to `installed: false` so the row renders disabled-with-tooltip instead of crashing.

### Caching

Per-scheme 60-second TTL with in-flight dedup — a burst of three client requests within the window triggers exactly one OS probe per scheme. The cache lives for the lifetime of the server process (cleared on restart). Clients additionally throttle dropdown-open refreshes to ≤1 per 10 seconds per target.

### Test injection

`createApiExtension({ installedAgentsProbe })` accepts a probe override so unit tests and integration tests don't shell out. The default uses `createOsProbe(process.platform)` from `handoff-api.ts`.
