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

| Counter | Meaning |
|---|---|
| `bridgeMergeContentLoss` | Observer A Path B post-condition violations since process start |
| `bridgeMergeCheckpointCreated` | Silent checkpoints written successfully via `saveInMemoryCheckpoint` |
| `serverObserverFiresA` / `serverObserverFiresB` | Drain-level dispatch count per direction |
| `serverObserverErrorsA` / `serverObserverErrorsB` | Caught failures inside the observer body (parse, serialize, baseline) per direction |

The counters are the load-bearing signal for SS-1 (single-CRDT collapse) urgency calibration over the post-launch observation window.

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

| Channel     | Emitted from                                                | Triggers                                                                                        | Canonical refetch             |
| ----------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------- |
| `files`     | `standalone.ts` DiskEvent dispatch (V0-2, shipped)          | Markdown `create \| delete \| rename` DiskEvents AND asset `asset-create \| asset-delete` events (editor-asset-embed-surface spec). `update` / `conflict` do not change the file list | `GET /api/documents` (and basename-index rebuild — see "Upload + asset-embed surface" below) |
| `backlinks` | `persistence.ts` backlink-index update path (V0-3, pending) | Content changes that invalidate the backlink index                                              | `GET /api/backlinks/:docName` |
| `graph`     | TBD (V0-11, pending)                                        | Graph-derived data changes                                                                      | TBD                           |

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

## Upload + asset-embed surface

Full product spec: [`specs/2026-04-16-editor-asset-and-embed-surface/SPEC.md`](../../specs/2026-04-16-editor-asset-and-embed-surface/SPEC.md). Operator-facing guide: [Assets and embeds](../../docs/content/guides/assets-and-embeds.mdx).

### Endpoints

| Method | Path          | Purpose |
| ------ | ------------- | ------- |
| POST   | `/api/upload` | Upload an asset (multipart, streamed to disk). Response: `{ok, src, path, deduped}` on success. Error envelope: `{ok:false, error:<reason>, message}` where `reason ∈ { 'malformed-upload' (400), 'storage-full' (507), 'storage-readonly' (500), 'collision-exhaustion' (500), 'storage-error' (500) }`. Dedup BEFORE filename synthesis so identical bytes return the existing path. |

### Accept-all (D-M LOCKED)

Every file drop is accepted. There is no MIME allowlist gate and, post-2026-04-22 streaming refactor, no user-facing byte cap either (uploads stream to disk via `HashingPassThrough` + `stream.pipeline`; memory footprint is O(1) regardless of file size). `file-type` magic-byte sniffing is consulted only to:

1. Preserve SVG `<img>`-only routing (NFR-3 — text-based SVG can't be detected by `file-type`; the handler has a `<svg` text-sniff fallback that tags `image/svg+xml`).
2. Recover an extension when the client filename is a generic clipboard name (`"image.png"`, `"Clipboard 2024-04-21"`).

Non-sniffable bytes are accepted under the client-supplied filename. The only rejection axes are transport / disk failures (`malformed-upload`, `storage-full`, `storage-readonly`, `collision-exhaustion`, `storage-error`) — see `src/upload-errors.ts` for the typed union.

**STOP.** Do not re-add a MIME allowlist gate — see root `AGENTS.md` §"Known Pitfalls" for the full STOP rules set. Do not re-add `upload.maxBytes` or any buffer-to-memory upload pattern either — both were removed under the streaming refactor, see `reports/streaming-upload-refactor/REPORT.md` §D8.

### sanitizeFilename

`sanitizeFilename` in `src/api-extension.ts` is unicode-preserving:

1. Strip-on-sight first: path separators (`/`, `\`), C0 controls, DEL. Applied before the whitelist so replacements can't dodge the strip.
2. Whitelist via Unicode category classes (letters, numbers, marks, punctuation, emoji pictographs). Anything outside becomes `_`.
3. Collapse runs of `_`, trim leading dots, strip trailing dots.

`linkTempToFinalWithCollisionRetry` (in `src/upload-streaming.ts`) preserves extension when adding a `-N` collision suffix. Path-escape guards (`..`, absolute, NUL bytes) run separately at request time.

### Same-directory sha256 dedup

`findDuplicateAsset(destDir, sha)` bounded-scans `destDir` for asset-extension siblings (per `ASSET_EXTENSIONS` from `@inkeep/open-knowledge-core`), hashing each and returning the first match. Runs BEFORE filename synthesis so a duplicate clipboard paste preserves the existing name instead of producing a fresh `pasted-<ts>.png` stub. Scope is same-directory only (FR-2 / NG1). Behavior is always on per `DEFAULT_DEDUP_MODE = 'same-dir'` — there is no user-facing knob post-2026-04-24 amendment.

Response carries `deduped: boolean`. Client shows a toast (`"Already at <path> — reusing."`) on dedup match, per `DEFAULT_DEDUP_UI = 'toast'`.

### File watcher DiskEvent union

```ts
export type MarkdownDiskEvent =
  | { kind: 'create'; docName: string; content: string }
  | { kind: 'update'; docName: string; content: string }
  | { kind: 'delete'; docName: string }
  | { kind: 'rename'; oldDocName: string; newDocName: string; content: string }
  | { kind: 'conflict'; ... };

export type AssetDiskEvent =
  | { kind: 'asset-create'; path: string; relativePath: string }
  | { kind: 'asset-delete'; path: string; relativePath: string };

export type DiskEvent = MarkdownDiskEvent | AssetDiskEvent;
```

`classifyEvents` narrows to `MarkdownDiskEvent[]` so TypeScript refuses `event.content` access on asset variants. Markdown events flow through the reconciliation loop; asset events skip content reading and dispatch straight to:

1. `basenameIndex.add(relativePath)` / `basenameIndex.remove(relativePath)`
2. `cc1Broadcaster.signal('files')` — piggybacks on the existing debounced channel

Finder-style renames arrive as `asset-delete` + `asset-create` pairs. The basename-index add/remove is idempotent, so the end state is correct without a hash-based rename probe.

### Basename index runtime

Constructed in `standalone.ts` via `createBasenameIndex()` (from `@inkeep/open-knowledge-core/path-resolve` — browser+Node compatible, no `node:fs` imports). Seeded at boot via `seedBasenameIndex` (`src/asset-walk.ts`) which walks `contentDir` after `startWatcher` primes the `ContentFilter`'s dir-count (so assets only index if a markdown sibling admits the subtree). `visitedInodes` set prevents symlink cycles.

The single `resolveEmbed(basename, sourcePath)` closure is threaded through:

- `createApiExtension` → `handlers.wikiLinkEmbed` (during inbound mdast→PM rendering for `/api/*` read paths)
- `createServerObserverExtension` → `setupServerObservers` → Observer B's `mdManager.parse(...)` (Y.Text → XmlFragment cross-CRDT sync)
- `createPersistenceExtension` → load-path parse
- `applyExternalChange` → disk→CRDT bridge (markdown reload)
- `applyAgentMarkdownWrite` → agent write composition

The Vite dev plugin (`packages/app/src/server/hocuspocus-plugin.ts`) does NOT call `createServer()` — it manually wires Hocuspocus + persistence + API extension + observer extension + basename index + `resolveEmbed` closure so dev mode achieves feature parity for asset-embed resolution. Unifying dev plugin + `createServer()` is tracked as architectural debt; until that lands, any change to `standalone.ts`'s extension wiring must be mirrored in `hocuspocus-plugin.ts`.

### Managed-rename behavior for refs (FR-7)

`src/managed-rename-rewrite.ts` rewrites image refs when a markdown doc moves:

- **Plain markdown image ref `![alt](relative-src)`:** `readImageRef` regex parses the ref; `recomputeRelativeImageHref` resolves the old dirname + ref to a content-relative asset path, then emits the new relative form from the new doc's dirname. Returns `null` when old+new dirname match (no rewrite needed for same-dir sibling renames).
- **Absolute path ref `![alt](/docs/photo.png)`:** detected and **left unchanged** (SPEC FR-7 test matrix; STOP rule). Preserves byte-identity for refs that pre-date FR-1a and for hand-authored absolutes.
- **URL refs `http(s):`, `data:`:** detected and left unchanged.
- **Wiki-embed ref `![[file.ext]]`:** **no rewrite** (D-K LOCKED refs-only). The basename index resolves these dynamically from the new doc's dirname. `readImageRef`'s regex naturally excludes the `![[...]]` shape because it requires a `(` after the `]`.

The `MANAGED_RENAME_ORIGIN` is a paired-write origin (`context.paired: true`) so Observer A + Observer B both short-circuit symmetrically for the atomic `Y.XmlFragment` + `Y.Text` mutation.

### Upload-surface constants (2026-04-24 amendment)

There is no user-facing `upload.*` config. Every value is a module-level constant in `packages/core/src/constants/upload.ts`:

```
DEFAULT_ATTACHMENT_FOLDER_PATH = './'          // co-located with the referencing doc
DEFAULT_EMIT_FORMAT            = 'wikiembed'   // ![[file.ext]] for supported extensions
DEFAULT_DEDUP_MODE             = 'same-dir'    // always on, same-directory scope
DEFAULT_DEDUP_UI               = 'toast'       // "Already at <path> — reusing."
WIKI_EMBED_EXTENSIONS          = ReadonlySet   // images + pdf + mp4/webm/mov + mp3/wav/ogg/m4a
```

Consumers import these directly:

- `POST /api/upload` handler — reads `DEFAULT_ATTACHMENT_FOLDER_PATH` (where to write) + `DEFAULT_DEDUP_MODE` (whether to run the dedup scan).
- Client `pickInsertShape` (`packages/app/src/editor/image-upload/index.ts`) — reads `WIKI_EMBED_EXTENSIONS` (is this an embed?) + `DEFAULT_EMIT_FORMAT` (what PM node to insert) + `DEFAULT_DEDUP_UI` (toast on dedup).
- Server mdast→PM dispatch (`packages/core/src/markdown/index.ts`) — reads `WIKI_EMBED_EXTENSIONS` to partition image vs. non-image renderable extensions.

Legacy configs carrying `upload.*` keys parse cleanly — `ConfigSchema` is not `.strict()`, so unknown sections are silently stripped. Obsidian-refugee onboarding is deferred to a future one-shot `ok migrate --from-obsidian-vault` CLI (separate spec).

See the `## Post-finalization amendment (2026-04-24)` section at the bottom of [`SPEC.md`](../../specs/2026-04-16-editor-asset-and-embed-surface/SPEC.md) for the full rationale; root `AGENTS.md` carries the STOP rule that keeps the surface from regressing.

### Observability

Upload handler emits one structured JSON log per request:

```json
{
  "event": "upload",
  "endpoint": "/api/upload",
  "dedup": true,
  "mime": "image/png",
  "size": 123456,
  "destPath": "docs/photo.png",
  "httpStatus": 200
}
```

Plus the Obsidian vault-detect structured events noted above.
