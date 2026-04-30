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

The browser-side form-write origin (`origin: 'form-write'`, mirrored by the binding at `packages/core/src/bridge/bind-frontmatter-doc.ts`) is intentionally **not** paired. Form writes touch only `Y.Map('metadata')` — Observer A's metaMap deep-observer must fire normally to recompose `prependFrontmatter(getFrontmatter(doc), body)` and propagate the new YAML to `Y.Text`. Adding the paired marker would short-circuit Observer A and leave `Y.Text` stale. Frontmatter edits flow over the WebSocket via the binding, not through an HTTP endpoint.

### Per-key frontmatter storage

`Y.Map('metadata')` holds one entry per frontmatter property (`Y.Text` for editable strings, `Y.Array<Y.Text>` for lists, primitives for atomics) — see `packages/core/src/bridge/README.md` § "Frontmatter storage shape". Five server-side surfaces participate:

- **`onLoadDocument`** (`persistence.ts`) — eager-on-load migration: parses YAML and materializes per-key entries during the load transaction, so the doc is never observable in mixed shape.
- **`applyExternalChange`** (`external-change.ts`) — file-watcher path. Uses per-key diff via `setFrontmatterFromYaml` so undoing a single property reverts only that property.
- **Observer B reconciliation** (`server-observers.ts`) — per-key diff when source-mode YAML edits land. Same-key concurrent edits resolve LWW per key; different-key edits merge cleanly.
- **`bindFrontmatterDoc`** (`@inkeep/open-knowledge-core/bridge/bind-frontmatter-doc.ts`) — browser-side binding for the property panel. Validates the `FrontmatterPatch` against the shared schema BEFORE any Y.Map mutation; on success writes per-key entries inside `doc.transact(fn, FORM_WRITE_ORIGIN)`. No HTTP round-trip — the patch reaches the server via the same WebSocket the editor uses.
- **L3 validation hook** (`frontmatter-l3.ts`, called from `persistence.ts`'s `onStoreDocument`) — defense-in-depth gate that catches invalid-shape values that bypass the binding. Reverts bad keys via `FRONTMATTER_VALIDATION_REVERT_ORIGIN` and broadcasts `cc1:frontmatter-validation-rejected` so the originating PropertyPanel can toast.
- **`applyAgentMarkdownWrite` / `applyAgentUndo`** (`agent-sessions.ts`) — body-write path now writes the FM via per-key helpers as well, but the call signature and contract are unchanged.

`onStoreDocument` calls `composeFrontmatterForStore` to round-trip cleanly: when the per-key map matches the legacy mirror's parse, the original byte string is written verbatim (preserving comments + blank lines + scalar styles); otherwise canonical synthesis from the per-key map.

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
| `POST /api/agent-patch` | fires under `session.origin` | targeted find/replace on live Y.Text. Frontmatter-intersecting patches return HTTP 400 with `error: "Frontmatter edits are not supported via edit_document; edit frontmatter directly via the property panel binding"` |
| `POST /api/agent-undo` | fires under per-session `session.undoOrigin` (distinct from `session.origin`) via `applyAgentUndo(session, scope)` — V0-14 landed surface | body: `{ connectionId, scope: 'last' \| 'session' }`. `session.um.undo()` runs inside the outer `doc.transact(..., session.undoOrigin)` so Observer A/B short-circuit; post-undo composes via `updateYFragment` + `applyFastDiff` |

Frontmatter edits from the browser property panel do **not** appear in this table — they bypass HTTP entirely via `bindFrontmatterDoc` (in `@inkeep/open-knowledge-core/bridge`), reaching `Y.Map('metadata')` directly through the WebSocket. Attribution flows from the connection's `ctx.principalId` (resolved by `resolveWriterFromOrigin` in `persistence.ts`). The L3 validation hook in `frontmatter-l3.ts` is the server-side defense-in-depth gate; on reject it broadcasts `cc1:frontmatter-validation-rejected` and the panel surfaces the toast.

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

Canonical surface: `dispatchCC1Stateless` from `packages/app/src/lib/cc1.ts` parses the payload through the per-channel Zod schemas in `@inkeep/open-knowledge-core` (`CC1ServerInfoPayloadSchema`, `CC1BranchSwitchedPayloadSchema`, `CC1DiskAckPayloadSchema`, `CC1DerivedViewPayloadSchema`) and routes to typed handlers — adding a new channel is a one-place edit there.

```ts
import { HocuspocusProvider } from '@hocuspocus/provider';
import { SYSTEM_DOC_NAME } from '@inkeep/open-knowledge-server';
import { dispatchCC1Stateless } from '@/lib/cc1';

const provider = new HocuspocusProvider({
	url: 'ws://localhost:5173/collab',
	name: SYSTEM_DOC_NAME, // '__system__'
	document: new Y.Doc(),
	onStateless: ({ payload }) => {
		dispatchCC1Stateless(payload, {
			onServerInfo: (p) => { /* p.serverInstanceId, p.currentBranch? */ },
			onBranchSwitched: (p) => { /* p.branch */ },
			onDiskAck: (p) => { /* p.docName, p.sv (Uint8Array) */ },
			onDerivedView: (p) => { /* p.ch === 'files' | 'backlinks' | 'graph' */ },
			onUnknown: (raw) => { /* schema mismatch — log + skip, never disconnect */ },
		});
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

### Synthetic config-doc admission

Two well-known synthetic docs back the in-app Settings pane and live-refresh of external edits:

- `__config__/workspace` ↔ `<contentDir>/.open-knowledge/config.yml`
- `__user__/config.yml` ↔ `~/.open-knowledge/config.yml`

Both are admitted at boot via `hocuspocus.openDirectConnection()` and are **Y.Text-only** — there is no Y.XmlFragment, no markdown bridge, no TipTap binding. The Settings pane wires its `HocuspocusProvider` directly at the Y.Text and renders a Zod-walker form on top.

A new predicate `isConfigDoc(documentName: string): boolean` is the sibling of `isSystemDoc` and MUST be called at every documentName-keyed callsite that already checks `isSystemDoc`. The two predicates compose: most callsites short-circuit on `isSystemDoc(name) || isConfigDoc(name)`. The single load-bearing site is the markdown observer bridge in `server-observer-extension.ts`: gating it with both predicates is what keeps the bridge out of the config-doc data path.

Live-refresh + persistence loop:

1. **External edit** → `config-file-watcher.ts` (chokidar, single-file watch with `awaitWriteFinish: { stabilityThreshold: 100 }`) detects the change, reads the file, replaces the Y.Text content under `CONFIG_FILE_WATCHER_ORIGIN`. An LKG-equality short-circuit prevents the persistence-hook self-write feedback loop (a write we just did to disk shouldn't ripple back through the watcher).
2. **In-app edit** → Settings pane patches Y.Text via `ConfigBinding.patch` (yaml@2 `Document` round-trip preserves comments + structure). Yjs delta propagates to all connected clients including any other open Settings panes.
3. **Persistence hook** (`onStoreDocument` config-doc branch) parses Y.Text → YAML → `ConfigSchema.safeParse`. On success: atomic tmp+rename via `tracedRename` / `tracedWriteFile`, update LKG cache, no broadcast. On failure: revert Y.Text via a server-origin transaction marked with `CONFIG_VALIDATION_REVERT_ORIGIN` (frozen object literal — `skipStoreHooks: true` + an entry-gate guard at the hook top, belt-and-suspenders), emit a CC1 `'config-validation-rejected'` broadcast carrying `{ error: ConfigValidationError, docName }` so open Settings panes can toast the user and flash the offending field.

`ConfigValidationError` is the discriminated union shared with the `set_config` MCP tool and `ok config validate`: `YAML_PARSE | SCHEMA_INVALID | SCOPE_VIOLATION | NOT_AGENT_SETTABLE | MIXED_SCOPE | WRITE_ERROR | UNKNOWN`. One source of truth in `@inkeep/open-knowledge-core`; one render-per-consumer helper (`humanFormat` for CLI/MCP; the pane has its own toast renderer).

Cold-start recovery (`readConfigSafely`): if a config file fails to parse on boot, the server attempts to rename it aside as `config.yml.invalid-<ISO>`, falls back to schema defaults + the magic-comment header, and queues a `'config-validation-rejected'` broadcast that fires when the first Settings pane connects.

`ContentFilter` and `POST /api/create-page` reject the `__config__/` and `__user__/` prefixes at admit time with the same 400 path that `__system__` uses — these are reserved.

Spec: [`specs/2026-04-25-config-edit-paths/SPEC.md`](../../specs/2026-04-25-config-edit-paths/SPEC.md) §6 FR-29 through FR-40.

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

## CRDT server-restart recovery — instance ID + client-side persistence

Design research: [`reports/yjs-client-persistence-alternatives/REPORT.md`](../../reports/yjs-client-persistence-alternatives/REPORT.md); landed architecture: [`specs/2026-04-24-client-persistence-replaces-sidecar/SPEC.md`](../../specs/2026-04-24-client-persistence-replaces-sidecar/SPEC.md). Prior sidecar report (superseded): [`reports/crdt-server-restart-recovery/REPORT.md`](../../reports/crdt-server-restart-recovery/REPORT.md).

### The bug class

A browser tab holds its Y.Doc in memory. The Open Knowledge server restarts. Yjs identifies items by `(clientID, clock)` — content equality is NOT checked; merge is additive union. On reconnect within the ProviderPool's recycle debounce window, the client's pre-restart items (under the original clientID) merge with the server's fresh items (under a new clientID generated by `persistence.onLoadDocument`'s `updateYFragment`). Every content marker appears twice on disk after the next L1 flush.

### Topology

**Markdown stays canonical (precedent #1).** `onLoadDocument` reconstructs Y.Doc state from disk; `onStoreDocument` flushes the Y.Doc back to markdown on L1 debounce. Neither reads nor writes a server-side CRDT cache.

**Server instance ID is the authority signal.** `serverInstanceId: string` (readonly on `ServerInstance`), generated once per `createServer()` via `randomUUID()`, advertised via `GET /api/server-info` and the `__system__` CC1 `server-info` channel. On connect, clients present `expectedServerInstanceId` in the Hocuspocus auth token (Zod-typed + `.loose()` via `parseHocuspocusAuthToken`). `onAuthenticate` throws `{ reason: 'server-instance-mismatch' }` when the claim is non-empty and doesn't match this process — before any Y.Doc sync runs.

**Client-side `y-indexeddb` is the recovery cache.** Each browser tab's `ProviderPool` attaches a `ClientPersistenceProvider` (wrapper around upstream `y-indexeddb`, patched — see `patches/y-indexeddb@9.0.12.patch`) per open doc at `ok-ydoc:${branch}:${docName}`. The `${branch}` prefix isolates per-branch state so a checkout doesn't surface stale-branch IDB into the post-switch session. Hydration is synchronous-ish IDB (ms scale); Cmd-R renders the prior state before the server round-trip completes.

**Buffer-and-replay preserves unsynced edits across mismatch-recycle.** On every `synced` event, `ProviderPool` captures `entry.lastServerSyncedSV = captureStateVector(doc)`. On `authenticationFailed({reason: 'server-instance-mismatch'})` the pool:

1. For each entry with `lastServerSyncedSV !== null`, computes `computeUnsyncedUpdate(doc, lastServerSyncedSV)` and stores the bytes under `docName` in `bufferedUpdates`. Entries with null SV (auth-fail arrived before any successful sync — typical for populated IDB on first connect against a mismatched server) are **skipped**: their state has no acked baseline, so it's by definition stale.
2. `await persistence.clearData()` per entry — wipes IDB (the patched wrapper awaits `indexedDB.deleteDatabase` directly to avoid upstream's race against subsequent opens).
3. `recycleAllEntries()` destroys the pool and rebuilds a fresh `HocuspocusProvider` + fresh persistence per doc.
4. When a fresh provider's first `synced` fires and a buffered update exists, `Y.applyUpdate(freshDoc, buffered, TAB_REPLAY_ORIGIN)` — the unsynced delta rejoins under the new server-clientID and propagates on the next sync.

**CC1 `branch-switched` coordinates cross-branch invalidation.** `CC1Broadcaster.emitBranchSwitched(branch)` fires synchronously at the END of the cross-branch path in `standalone.ts#onBatchEnd` — AFTER Y.Doc reset from disk, backlink rebuild, WIP restore, detached cleanup. Clients parse via `parseCC1BranchSwitched` in `packages/app/src/lib/cc1.ts`, dispatch through `SystemDocSubscriber.onBranchSwitched` → `handleBranchSwitched(pool, branch)`: clears every entry's IDB then `recycleAllEntries`. Unlike the mismatch path, branch-switched does **not** buffer-and-replay — unsynced edits authored against branch A are semantically invalid against branch B and must be discarded, not replayed.

### Composition with existing primitives

- **reconciledBase** (the three-way merge base) is unchanged — it tracks markdown, not the CRDT cache.
- **parkBranch / restoreBranchWIP** are unchanged — WIP preservation lives in the shadow repo, not the client's IDB.
- **server-info / branch-switched / disk-ack / derived-view** share the `__system__` carrier doc; every CC1 channel emits via `Document.broadcastStateless` from the server's own DirectConnection. Server-lock is the on-disk file at `<contentDir>/.open-knowledge/server.lock`, not a CC1 channel.

### Test coverage

- Client-persistence unit: `packages/app/src/editor/client-persistence.test.ts` — 8 tests (round-trip, self-origin filter, clearData, state-vector helpers).
- Client-persistence integration: `packages/app/tests/integration/provider-pool-buffer-replay.test.ts` (T12), `cold-start-empty-idb.test.ts` (T13), `populated-idb-stale-server.test.ts` (T14).
- Branch invalidation: `packages/app/src/editor/branch-invalidation.test.ts` + `packages/app/src/lib/cc1.test.ts` + T5 (`branch-switch-live-client.test.ts`).
- Server-side auth: `packages/server/src/standalone.test.ts::onAuthenticate rejects 'server-instance-mismatch'` (5 tests).
- CC1 emit: `packages/server/src/cc1-broadcast.test.ts` — `server-info` + `branch-switched` + derived-view debounce.
- Client-side pool: `packages/app/src/editor/provider-pool.test.ts::ProviderPool authenticationFailed handling` + `ProviderPool buffer-and-replay` + `ProviderPool client-persistence attachment`.
- End-to-end bug-class suite (`packages/app/tests/integration/`): T1-T14 cover fast restart, multi-client restart, slow restart, unsynced local edits, branch switch, agent write during restart, rollback, managed rename, external disk edit, Y.Text source-mode, mid-drain restart, buffer-and-replay mechanism, cold-start, populated-IDB stale-server.

### Disk-ack and late-join recovery

CC1 `disk-ack` fires per-doc when the persistence layer flushes a write to disk (`emitDiskAck(docName, sv)` from `cc1-broadcast.ts`); the client's `ProviderPool` records it as `entry.lastDiskAckedSV`. The `server-instance-mismatch` recycle then prefers `lastDiskAckedSV` over `lastServerSyncedSV` for baseline-selection — content the server has durably persisted is not in the recycle buffer (the post-restart server's markdown rebuild already includes it, so replaying would duplicate).

`GET /api/server-info` includes `currentDiskAckSVs` so a client booting late or reconnecting after the broadcast missed it can recover the watermark per-doc without waiting for the next emit.

### Out of scope

- Durable buffer-and-replay across tab crash (localStorage persistence of the unsynced delta). Accepted trade-off: a crash inside the 50-500ms recycle window loses unsynced edits. The disk-ack channel narrows the loss boundary further: edits the server has durably persisted are recovered from the post-restart markdown rebuild, so the actual loss window is "in-memory edits the server hasn't yet flushed" (sub-second under typical L1 debounce).
- Pre-fix attribution cleanup — doubled-content commits under `refs/wip/<branch>/openknowledge-service` from past bug occurrences. Separate one-shot migration task.
