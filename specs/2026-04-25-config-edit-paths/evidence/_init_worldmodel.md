---
name: init_worldmodel_release_pivot
description: Worldmodel grounding for the 2026-04-28 release-pivot of config-edit-paths — focused investigation on Hocuspocus admission, bridge bypass, persistence hooks, cross-process fan-out, schema migration, CRDT semantics, and awareness suppression
type: meta
date: 2026-04-28
sources:
  - specs/2026-04-25-config-edit-paths/evidence/_user_outcomes.md
  - specs/2026-04-25-config-edit-paths/evidence/architectural-pivot-hocuspocus.md
  - specs/2026-04-25-config-edit-paths/evidence/api-shape-typescript-not-rest.md
  - specs/2026-04-25-config-edit-paths/evidence/codebase-integration-points.md
  - specs/2026-04-25-config-edit-paths/evidence/tim-precedents-from-main.md
  - specs/2026-04-25-config-edit-paths/SPEC.md (lines 1-700)
  - packages/server/src/content-filter.ts (full)
  - packages/server/src/cc1-broadcast.ts (full)
  - packages/server/src/server-observer-extension.ts (full)
  - packages/server/src/server-observers.ts:1-100
  - packages/server/src/persistence.ts:1-200, 600-900
  - packages/server/src/file-watcher.ts:1-200, 540-900
  - packages/server/src/agent-presence.ts:1-100
  - packages/server/src/agent-sessions.ts:420-520
  - packages/server/src/standalone.ts:260-400, 1230-1330
  - packages/server/src/external-change.ts:13, 62, 84
  - packages/cli/src/config/schema.ts (full)
  - packages/cli/src/config/loader.ts (full)
  - packages/core/package.json
  - packages/core/src/index.ts (full barrel)
  - packages/app/src/presence/use-presence.ts:1-100
  - https://tiptap.dev/docs/hocuspocus/server/hooks (Hocuspocus extension hooks reference, fetched 2026-04-28)
  - https://docs.yjs.dev/api/shared-types/y.text (Y.Text concurrent semantics, fetched 2026-04-28)
  - https://zod.dev/v4 + https://zod.dev/metadata (Zod v4 metadata API, fetched 2026-04-28)
---

# Worldmodel — release-pivot for `config-edit-paths`

This worldmodel is **delta-only** — focused on the seven new technical questions the architectural pivot creates. It does NOT re-cover ground already mapped in the existing `evidence/codebase-integration-points.md`, `evidence/config-architecture-framework.md`, `evidence/eval-group-{A,B,C,D}-*.md`, or `evidence/tim-precedents-from-main.md`. Where those files settle a question, the answer is referenced rather than re-derived.

The pivot reframes "config edit paths" from a backend-centric REST/MCP design (the existing SPEC.md §6 FR-1 through FR-28) to a Hocuspocus-Y.Text-as-transport architecture with a TypeScript-function-shaped API (`bindConfigDoc(provider)` → `ConfigBinding`; `writeConfigPatch(opts)` for headless callers). The seven investigation tracks below answer "is this transport viable, what does it cost, and where does it touch existing invariants?"

---

## 0. Pivot synopsis (anchoring)

Captured from `evidence/architectural-pivot-hocuspocus.md` and `evidence/api-shape-typescript-not-rest.md`:

- **Drop**: HTTP `POST /api/config/patch`, `GET /api/config`, ETag/If-Match flow, RFC 7396 wire dialect, two-validator pattern's HTTP boundary, `ApiError` envelope refactor of ~50 routes, CC1 `'config'` channel, dedicated config file watcher emitting CC1 broadcasts.
- **Keep**: yaml@2 Document layer (comment-preserving round-trip), Zod schema as single source of truth, schema cleanup + loose-mode + codemod (D29/D34/D37), source-located error messages (D36), Result<T,E> at function boundaries (D35), agent-settable allowlist (D26), MCP `set_config` / `get_config` / `set_folder_rule` tools.
- **New**: Y.Text-only doc admission for `<contentDir>/.open-knowledge/config.yml` (workspace) and synthetic `__user__/config.yml` (user-global); per-doc bridge bypass; persistence-time validation hook with rollback semantics; `ConfigSchema` migration to `@inkeep/open-knowledge-core`; scope-as-constraint Zod metadata (`scope: 'user' | 'workspace' | 'either'`); awareness suppression for config docs.
- **API surface**: `ConfigBinding` (frontend, browser-compatible, writes via Y.Text over collab WS), `writeConfigPatch` (headless, fs-direct for Node-only callers like MCP/CLI/seed), `ConfigSchema` (shared), `ConfigValidationError` (shared discriminated union).

---

## Track 1 — Hocuspocus doc admission for non-markdown / non-content paths

### Current state — how `ContentFilter` gates admission

`packages/server/src/content-filter.ts:188-212` implements the canonical exclude/include logic. `isExcluded(relativePath)` runs through a four-step ordered cascade:

1. **System-doc reservation** (line 191-192): `if (isSystemDoc(stripDocExtension(relativePath))) return true` — `__system__.md` and `__system__.mdx` are unconditionally excluded.
2. **gitignore + config exclude** (line 197): bootstrap ignore instance + nested `.gitignore` files + `content.exclude` patterns. `.git/` is hardcoded in `BUILTIN_SKIP_DIRS` (line 39-62) along with `node_modules`, build outputs, framework caches.
3. **`content.include` glob match** (line 200): user-controlled allowlist; defaults to `['**/*.md', '**/*.mdx']`.
4. **Sibling-asset rule** (line 204-208): non-markdown extensions in `ASSET_EXTENSIONS` are admitted only if the directory has at least one included `.md` file (refcount in `dirCount`).

**Crucially**, `ContentFilter` is invoked by `file-watcher.ts:classifyEvents` (line 180-183) and by the initial scan (`seedLastKnownHashes`). It is NOT invoked anywhere in the Hocuspocus connection / `onLoadDocument` admission path. **The actual gate that stops `.open-knowledge/config.yml` from being a Y.Doc today is `isSupportedDocFile` in `doc-extensions.ts`** (file-watcher line 174, 177, 271, 634) — the watcher only enqueues `.md` / `.mdx` paths.

Hocuspocus itself does NOT consult `ContentFilter`. If a client connects to `documentName = "foo"`, Hocuspocus auto-creates an in-memory Y.Doc, fires `onLoadDocument` extensions, and serves it. Admission is happening at three places in OK:

- `packages/server/src/api-extension.ts` `POST /api/create-page` rejects `isSystemDoc(docName)` with 400 (line 1416-1418), and rejects names that fail the path-traversal/reserved-name check.
- `agent-sessions.ts:431-433` `getSession()` throws if asked to open an agent session for `__system__`.
- `persistence.ts:631, 746` `onLoadDocument` and `onStoreDocument` early-return when `isSystemDoc(documentName)` is true (the system pseudo-doc has no on-disk file).

### How `__system__` is admitted (the precedent)

`standalone.ts:1246` is the canonical boot-time admission:

```ts
systemDocConnection = await hocuspocus.openDirectConnection(SYSTEM_DOC_NAME);
```

`openDirectConnection` is the server-side `Hocuspocus` API that materializes a Y.Doc by name, increments the connection count (so it doesn't unload), and returns a handle. The system doc's identity is pure convention: every subsystem that keys off `documentName` short-circuits via `isSystemDoc()` (catalog of sites: `external-change.ts:62`, `server-observer-extension.ts:50`, `live-derived-index.ts:67`, `file-watcher.ts:569`, `persistence.ts:631,746`, `agent-sessions.ts:431`, `cc1-broadcast.ts:36-38`, `content-filter.ts:194`).

Notably, `server-observer-extension.ts:5-7` says explicitly: **"Uses the Document reference from afterLoadDocument payload directly. This avoids openDirectConnection's connection-count increment which would prevent documents from unloading during server shutdown."** — this is the rationale for why the bridge extension uses `afterLoadDocument` rather than `openDirectConnection` for content docs, but `__system__` does need the connection-count increment because it must stay materialized.

### Cleanest mechanism for workspace config admission

For `<contentDir>/.open-knowledge/config.yml` to become a Y.Text-only doc, three things must happen:

1. **A synthetic doc name** (proposed: `__config__/workspace`). Like `__system__`, it carries underscores that distinguish it from user content paths.
2. **`isSystemDoc()`-style guard sites** must be extended (or a new predicate `isConfigDoc()` introduced) so persistence's existing markdown round-trip is bypassed AND `agent-sessions.ts:431` keeps `getSession()` from opening agent sessions on it AND the bridge skips it. This is the structural extension precedent #20 (system-doc admission gate) calls out.
3. **Boot-time `openDirectConnection`** at the same site as `__system__` (standalone.ts:1246), populating the Y.Text from disk via a new `loadConfigToYText()` helper.

The cleanest implementation in this codebase's idiom is a **new `isConfigDoc(documentName: string): boolean`** predicate and a `CONFIG_DOC_PREFIX = '__config__/'` constant exported from `@inkeep/open-knowledge-core/constants/config.ts` (sibling to `SYSTEM_DOC_NAME`). Every site that today does `if (isSystemDoc(name)) return` becomes `if (isSystemDoc(name) || isConfigDoc(name)) return` — but only for the sites that would corrupt config docs (persistence's markdown round-trip, agent sessions, bridge attach, ContentFilter inclusion, file watcher per-doc dispatch).

CONFIDENCE: HIGH. Triangulated across `__system__` precedent (codebase ground truth) + Hocuspocus extension hooks doc + `isSystemDoc()` audit table.

### User-global config admission — `__user__/config.yml`

For `~/.open-knowledge/config.yml`, the admission shape is the same but the data source is OUTSIDE `contentDir`. Two implications:

- **Persistence MUST short-circuit**: the existing `persistence.ts:safeContentPath` (line 642) computes `contentDir + docName.md` — this would land at `<contentDir>/__user__/config.yml.md`, which is not where the file lives. The persistence bypass (covered in Track 3) handles this by routing config docs through a different write helper.
- **One server instance per user-global file**: each `ok start` instance opens its own `__user__/config.yml` synthetic doc. Cross-instance fan-out is via the file watcher, NOT via the CRDT (covered in Track 4).

UNCERTAIN: whether the synthetic name should encode the absolute path of the user-global file. If the user has two home directories on the same machine (rare; macOS multi-user shared OK), a name like `__user__/config.yml` is ambiguous. Verification path: check whether `homedir()` is process-stable across `ok start` instances — for a single OS user, yes. For the v0 release, single-OS-user is the assumption (see existing spec §4 P1 "Electron desktop user" — per-machine, per-user).

### Bypassing ContentFilter

`ContentFilter.isExcluded()` is the right gate for files in `contentDir`, but config docs are SYNTHETIC — they don't live under `contentDir` in the file watcher's view. The cleanest move is **don't change `ContentFilter`**; just ensure the synthetic doc names never enter the file watcher's pipeline. The file watcher only enqueues paths under `contentDirRaw` (file-watcher.ts:871-882, after `realpathSync(contentDirRaw)`), so config-yml files outside that root are never visited. The new config watcher (Track 4) is independent.

---

## Track 2 — Bridge bypass per-doc

### Current state — bridge attach is per-doc, gated only on `__system__`

`packages/server/src/server-observer-extension.ts:48-104` shows the canonical attach pattern:

```ts
async afterLoadDocument({ documentName, document }) {
  if (isSystemDoc(documentName)) return;
  if (cleanups.has(documentName)) return;
  // ... call setupServerObservers(...) which wires Observer A + Observer B
}
```

So the bridge runs on **every Y.Doc that isn't `__system__`**. Today, that's fine — every other doc is markdown content with a Y.XmlFragment binding. Y.Text-only docs (config) would still trigger `setupServerObservers`, which would:

- Read `xmlFragment = doc.getXmlFragment('default')` (line 54 of server-observer-extension.ts) — for a fresh config doc, this lazily creates an empty XmlFragment.
- Read `ytext = doc.getText('source')` (line 55) — populated with YAML.
- Wire Observer A (XmlFragment → Y.Text) and Observer B (Y.Text → Y.XmlFragment via TipTap's `updateYFragment`).

The first time a config-doc Y.Text changes, Observer B would fire. The downstream call `yXmlFragmentToProseMirrorRootNode` + `mdManager.parse()` would be invoked on YAML text **as if it were markdown**, producing either an empty XmlFragment (likely — YAML's `key: value` syntax is not valid markdown) or a corrupted parse. Even if benign, the round-trip would normalize the YAML through markdown serialization — collapsing comments, reordering keys, inserting `\n\n` between blocks.

This is content-corrupting. The bridge MUST be skipped for config docs.

### Cleanest opt-out

Two viable shapes:

**(a) Same-file gate extension** — change `server-observer-extension.ts:50` from `if (isSystemDoc(documentName)) return` to `if (isSystemDoc(documentName) || isConfigDoc(documentName)) return`. Mechanically minimal; one line.

**(b) Allowlist by doc-extension** — only attach the bridge for docs admitted by `ContentFilter` (which currently means doc names whose source path matches `**/*.md` or `**/*.mdx` after stripDocExtension). This is more principled (the bridge IS markdown-specific; phrasing the gate as "is this a markdown doc?" matches the bridge's actual purpose) but requires plumbing a "doc admit-by-extension" registry into the extension that doesn't exist today. The `doc-extensions.ts` registry tracks per-doc extension after the file watcher first sees the file, but a freshly-opened doc that hasn't been written to disk yet may not be registered.

CONFIDENCE: HIGH on (a) — it's the precedent the codebase already uses for `__system__`. The `isConfigDoc()` predicate (Track 1) plugs in cleanly. (b) is more architecturally pure but costs more wiring; (a) gives the same outcome.

### Cleanups + safety net

`server-observer-extension.ts:107-118` `afterUnloadDocument` correctly handles cleanup-by-name; if `afterLoadDocument` skipped attach, `afterUnloadDocument` is a no-op (the `cleanups` map never had the entry). Safe by construction.

The retry on transient failure (line 95-104) is also no-op for skipped docs — `cleanups.has(documentName)` short-circuits the retry path.

---

## Track 3 — Persistence-time validation hook

### Current persistence flow

`persistence.ts:629-727` `onLoadDocument` (read from disk into Y.XmlFragment via TipTap's `updateYFragment` + `yXmlFragmentToProseMirrorRootNode`). Markdown is the source of truth (line 676-680). Skips `__system__` (line 631).

`persistence.ts:740-900` `onStoreDocument` is the canonical write path:

1. Skip `__system__` (line 746).
2. Skip if `isBatchInProgress()` (line 747) — branch-switch park.
3. `captureDocSnapshotForPersistence(document)` co-captures `{sv, json}` synchronously (line 759 — STOP comment at line 729-739 forbids re-capturing later).
4. `mdManager.serialize(json)` produces markdown body.
5. Compare against `currentBase` (line 786-792) using `normalizeBridge` semantics — if semantically unchanged, skip the disk write (no-op short-circuit avoiding empty-paragraph init churn).
6. `tracedMkdir` + `tracedWriteFile` to a tmp file + `tracedRename` for atomic disk update (line 833-881).
7. `onDiskFlush?.(documentName, stateVectorAtRead)` callback fires post-rename (line 891), which is wired to `cc1Broadcaster.emitDiskAck` in standalone.ts:268.

### Hocuspocus's contract on rejection

Per the upstream Hocuspocus extension docs (fetched 2026-04-28): **"if `onStoreDocument` throws, the document stays in memory and is retried to avoid data loss."** The hook does NOT revert Y.Doc state — it just declines to persist this round. The Y.Doc continues to hold the rejected mutation and the next debounced store cycle re-attempts.

This is the load-bearing constraint for config persistence-time validation. The pivot's spec wants:

> pre-write, parse Y.Text as YAML, validate against ConfigSchema, on failure REJECT persistence and revert Y.Text to last-known-good (fire a CC1 'config-validation-rejected' for UI feedback)

**Hocuspocus does not give us "atomic rollback of Y.Doc state on hook failure."** Throwing from `onStoreDocument` only blocks the disk write; the Y.Text mutation is already in the doc, broadcast to all connected clients, and persisted in their IndexedDB.

### Resolutions

Three patterns the codebase could use:

**(a) Throw + UI-driven revert.** Throw from a per-doc validation hook in `onStoreDocument` (gated on `isConfigDoc(documentName)`). The Y.Text retains the bad value until the next mutation overwrites it. Emit a CC1 `'config-validation-rejected'` channel signal to all clients. The Modal Settings UI renders the validation error inline and offers "Revert to last-known-good." This makes the "revert" a UI responsibility, not a server invariant.

**(b) Server-side last-known-good cache + corrective overwrite.** Server-side, maintain `lastKnownGoodConfigYaml: string` (in-memory, populated at boot from disk + after each successful validation). On validation failure in `onStoreDocument`: write the LKG back to Y.Text using a `CONFIG_REVERT_ORIGIN` (skipStoreHooks: true to avoid recursive validation). All clients see the revert as an external update. Throw to skip the disk write.

**(c) Pre-mutation validation gate.** Reject INVALID Y.Text mutations at the WS message layer, before they ever land in the Y.Doc. Hocuspocus's `beforeHandleMessage` hook receives the update buffer and can throw to close the connection (per upstream docs). However: parsing a Y.js update buffer to extract "what does this update set Y.Text to?" is not trivial — Yjs deltas don't carry "the new full string" but a sequence of insert/delete ops. Reconstructing the post-update state requires applying the delta to a snapshot, which negates the "atomic" property and is more invasive than (a) or (b).

CONFIDENCE: HIGH that (a) is the simplest viable shape. (b) is more robust (server-authoritative revert) but doubles complexity. (c) appears infeasible without significant Yjs internals work.

The pivot's design intent — "persistence-time validation as defense-in-depth, with the API-shape file's spec saying client-side validation is authoritative" — is consistent with (a). The Modal blocks invalid commits via `safeParse`; if a buggy client somehow bypasses, server rejects at persistence and the Modal sees the rejection signal.

### Persistence hook routing

The existing `persistence.ts:onStoreDocument` is the single entry point. For config docs, the cleanest dispatch is:

- Top of `onStoreDocument`: if `isConfigDoc(documentName)`: dispatch to `storeConfigDoc(documentName, document)` and return; else fall through to existing markdown logic.
- `storeConfigDoc` is a new helper in a new file (`packages/server/src/config-persistence.ts`?) that:
  1. Reads `doc.getText('source').toString()` for the YAML body.
  2. `yaml.parseDocument(body)` → JS object.
  3. `ConfigSchema.safeParse(merged)` → on failure, fire CC1 `'config-validation-rejected'` and throw (or apply pattern (b) — overwrite Y.Text with LKG and continue).
  4. On success, atomic write via `tracedWriteFile` + `tracedRename` to the canonical path (workspace = `<contentDir>/.open-knowledge/config.yml`; user = `~/.open-knowledge/config.yml`).

This routing pattern is consistent with the precedent in `external-change.ts:62` (early-return for system docs) and avoids tangling the existing markdown round-trip path.

UNCERTAIN: where the canonical path mapping lives (synthetic doc name → on-disk path). Cleanest: a small `configDocPathFor(documentName: string, contentDir: string): string` helper in the same new file.

### The CC1 pattern for validation feedback

`cc1-broadcast.ts:82` `signal(channel)` requires the channel to be a member of `DerivedViewChannel` (the type is in `@inkeep/open-knowledge-core/schemas/cc1`). Adding `'config-validation-rejected'` requires extending that schema. The pivot says it does NOT need a CC1 `'config'` channel because Y.Text observation is the channel — but a validation rejection feedback signal is different; the Y.Text observer can't tell the client "your write was rejected by the server" via Yjs.

UNCERTAIN: whether validation rejection needs a CC1 channel or a different feedback path. An alternative is `Awareness` ephemeral state on the config doc — set a `validation_error_code` field with a TTL. UI consumes via `awareness.on('change', ...)`. This is cheaper to wire (no schema migration, no broadcaster code) but less canonical for OK's "CC1 = pure-signal push" pattern. Verification path: read existing CC1 channel definitions in `packages/core/src/schemas/cc1.ts` for the precedent.

---

## Track 4 — Cross-process fan-out for user-global config

### The scenario

Two `ok start` instances (call them I1 and I2) on the same machine. I1 opens project A; I2 opens project B. Both bind `~/.open-knowledge/config.yml` as `__user__/config.yml`. The user changes the theme in project A's UI:

1. I1's Modal calls `binding.patch({ appearance: { theme: 'dark' } })` → Y.Text mutates → Hocuspocus persists → I1's atomic disk write to `~/.open-knowledge/config.yml` lands.
2. I2 must observe the disk change → update its `__user__/config.yml` Y.Text → broadcast to project B's Modal → B's Modal re-renders.

The CRDT does not span processes (each `Hocuspocus` instance has its own in-memory Y.Doc). The bridge across processes is the FILE.

### The existing file watcher

`packages/server/src/file-watcher.ts:871-916` `startWatcher(contentDir, ...)` is **scoped to `contentDir`**. It calls `realpathSync(contentDirRaw)` (line 878), uses that as the watch root for both `@parcel/watcher` (line 762) and `chokidar` fallback (line 804). The user-global path `~/.open-knowledge/config.yml` is NOT under `contentDir`. **The existing watcher cannot watch it.**

There is no API surface in `file-watcher.ts` today for "subscribe to a single file outside contentDir." Adding one is mechanical:

- A new `startConfigFileWatcher(absPath: string, onChange: () => void): WatcherHandle` helper.
- Uses chokidar directly (chokidar handles single files cleanly; `@parcel/watcher` is directory-only).
- Atomic-write detection: chokidar fires `unlink` + `add` for `tmp+rename` writes. The persistence layer's atomic writes (Track 3) trigger this same pattern. Detection requires either:
  - Listening for both events and treating them as a single "change" if separated by < 50ms (matches the existing chokidar batch window in file-watcher.ts:822), OR
  - Using chokidar's `awaitWriteFinish` option with a small `stabilityThreshold` (the canonical chokidar fix for atomic writes; see chokidar README).

CONFIDENCE: HIGH that the existing watcher needs additive single-file support; MEDIUM on whether chokidar's atomic-write fan-out is a problem (chokidar's `awaitWriteFinish` is the documented fix, and the existing `startChokidarWatcher` doesn't enable it — this would be a new code path).

### The cross-process flow

Step-by-step, with the new components in place:

```
I1: Modal → Y.Text mutation → Hocuspocus → onStoreDocument → validate → atomic write to ~/.open-knowledge/config.yml
                                                                                          │
                                                                                          ↓
I1's writeTracker registers the new content hash (mirrors the existing pattern at file-watcher.ts:88-93).
                                                                                          │
                                                                                          ↓
I1's config file watcher fires "change" → checks writeTracker → matches → SKIP (self-write).
                                                                                          │
                                                                                          ↓
I2's config file watcher fires "change" → checks I2's writeTracker → NO match (different process) → onChange fires.
                                                                                          │
                                                                                          ↓
I2's onChange handler reads disk → updates I2's __user__/config.yml Y.Text via doc.transact(..., FILE_WATCHER_ORIGIN) → all I2 clients observe → re-render.
```

The writeTracker self-write detection (file-watcher.ts:88-105) is **per-process** (it's a module-scoped `Map`). Cross-process self-write detection works automatically: I1's writeTracker doesn't know about I2's writes (and vice versa), so each process correctly sees the OTHER process's writes as external. This is the correct behavior.

### The atomic-write edge case

`unlink + add` events from `tmp+rename` would, in the naive implementation, trigger:

1. `unlink` → I2 sees the file as gone → clears Y.Text? (bad)
2. `add` → I2 sees the file as new → loads YAML into Y.Text (good)

The correct response is to debounce/coalesce within a small window (50–200ms), matching the persistence atomic-write timing. The pivot's spec text in `architectural-pivot-hocuspocus.md` says:

> Atomic tmp+rename + chokidar should suffice; verify no edge cases around watch-during-rename.

**Verified edge case exists, fix is `awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 25 }` on chokidar OR a manual unlink+add coalesce window.** Either is mechanical (~10 LoC).

CONFIDENCE: HIGH on the edge case existing (chokidar README documents it); MEDIUM on which fix is canonical for OK (the existing watcher doesn't use `awaitWriteFinish`, so introducing it would be a localized new pattern).

### Multi-instance lock-vs-no-lock

UNCERTAIN: should there be a per-machine "primary writer" for `~/.open-knowledge/config.yml`? Two processes could both write at roughly the same time:

- I1 writes theme=dark at t=0.
- I2 writes editorMode=source at t=0.001.
- I1's atomic rename lands at t=0.002.
- I2's atomic rename lands at t=0.003 (with stale-base — I2 read the file before I1's write landed).
- I2's disk content reflects only its change (the dark theme is lost from disk).
- I1's file watcher fires → re-reads → updates Y.Text in I1 to lose the dark theme too.

This is the lost-update class the existing SPEC.md §9.6.3 (D33) addressed via ETag/If-Match for HTTP. The pivot drops ETag/If-Match. Does CRDT recovery save us?

- **Within a single process**, two clients editing the same Y.Text concurrently: Yjs CRDT merges (track 6).
- **Across processes**: NO. Each process's Y.Doc is independent. The disk file is the only shared state. Lost-update is real.

**Mitigation options:**

- (i) Accept the lost-update window. Per-machine config; user editing two windows simultaneously is rare; the existing SPEC.md acknowledged "per-machine context makes lost-update vanishingly rare" (line 580). The pivot doubles down on this.
- (ii) Server-side lock around the atomic write. `cli/src/utils/lock-file.ts` (existence not yet verified; pattern similar to `server-lock.ts`'s exists-check) or just `proper-lockfile` — read-modify-write under a lock. Adds a few ms per write.
- (iii) Read-modify-merge in the persistence handler. Before atomic write: re-read disk, deep-merge over what we're about to write at the YAML AST level (yaml@2 setIn is patch-shaped, not whole-doc replace), then write. Effectively a process-level mini-CRDT for sparse-key updates.

Option (i) is the implied pivot direction. Option (ii) is cheap defense if testing surfaces real races.

CONFIDENCE: HIGH that lost-update is a real but rare scenario for v0; MEDIUM that the pivot's "vanishingly rare" assumption holds — the multi-window theme-sync scenario (named in user_outcomes.md as the canonical case) is the exact race-prone shape.

---

## Track 5 — `ConfigSchema` migration to `@inkeep/open-knowledge-core`

### Audit of `packages/cli/src/config/schema.ts` for Node-only deps

Read the full file (130 lines). Imports:

```ts
import { z } from 'zod';
```

That's the entire import section. The file defines `FolderFrontmatterSchema`, `FolderRuleSchema`, `ConfigSchema` — all pure Zod object schemas with `.default(...)`, `.string()`, `.number()`, `.boolean()`, `.array(...)`, `.optional()`. **Zero Node-only dependencies. Browser-bundle compatible as-is.**

The `Config` type and the schemas can move to `@inkeep/open-knowledge-core` with one move + a re-export line in cli to preserve the existing import path during transition.

### Audit of `packages/cli/src/config/loader.ts`

Read full (183 lines). Imports:

```ts
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { CONFIG_FILENAME, OK_DIR } from '../constants.ts';
import { isObject } from '../utils/is-object.ts';
import { normalizeCwd } from '../utils/normalize-cwd.ts';
import { type Config, ConfigSchema } from './schema.ts';
```

`node:fs`, `node:os`, `node:path` are Node-only. The loader **stays in cli**. The schema moves, the loader does not.

### Audit of `@inkeep/open-knowledge-core/package.json`

Confirmed `zod: ^4.3.6` is already a direct dependency. No new dep needed for the move.

The barrel `packages/core/src/index.ts` currently has no schema-section conventionally; the cleanest add is:

```ts
// Config schema (browser-compatible; loader stays in cli)
export {
  ConfigSchema,
  FolderFrontmatterSchema,
  FolderRuleSchema,
  type Config,
  type FolderFrontmatter,
  type FolderRule,
} from './config/schema.ts';
```

Mirroring the existing pattern at line 83-98 (CC1 schemas).

### Importer audit — what touches `cli/src/config/schema.ts` today

From the grep at investigation time (excluding tests), 17 sites in `packages/cli/src/`:
- `cli/src/config/loader.ts:19`
- `cli/src/content/folder-rules.ts:20`
- `cli/src/content/enrichment.ts:20`
- `cli/src/mcp/server-discovery.ts:11`
- `cli/src/mcp/server.ts:23`
- `cli/src/mcp/tools/preview-url.ts:31`
- `cli/src/mcp/tools/shared.ts:11`
- `cli/src/github/app-config.ts:1`
- `cli/src/commands/{start,status,stop,preview,clean,ui,sync,mcp}.ts`

All importers use `import type { Config }` or `import type { FolderRule }`. **Type-only imports are erased at compile time** — moving the source file does not require touching these import sites at all if we preserve the export from `cli/src/config/schema.ts` as a re-export from `@inkeep/open-knowledge-core`. Two-step rollout:

1. Move source to core. Add `export { ConfigSchema, FolderRuleSchema, ... } from '@inkeep/open-knowledge-core';` to `cli/src/config/schema.ts`.
2. Codemod cli imports to point at `@inkeep/open-knowledge-core` directly. Remove the re-export.

CONFIDENCE: HIGH. The schema is pure Zod; the move is mechanical; the importer audit is clean.

### Server-side importers

Did NOT see direct `import { ConfigSchema }` from `packages/server/`. The server doesn't validate config — it's loaded by CLI before the server starts (see `commands/start.ts:loadConfig` precedent). For config persistence-time validation (Track 3), the server WILL need to import `ConfigSchema` from core for `safeParse(merged)` calls. This is the new dependency the pivot creates; the migration to core is exactly what unblocks it.

### App-side importers

Currently zero. The app does NOT import any config schema today. Post-pivot, the Modal (Track 6 client validation + Zod walker) will import `ConfigSchema` from `@inkeep/open-knowledge-core`. Browser-bundle compat is satisfied (Zod ships browser-compatible).

---

## Track 6 — CRDT merge semantics for Y.Text-as-YAML

### What Yjs guarantees for concurrent Y.Text edits

From the Yjs docs (fetched 2026-04-28 via `https://docs.yjs.dev/api/shared-types/y.text.md`):

> When two clients concurrently replace entire text with different values, both edits are incorporated rather than resulting in a last-write-wins outcome. As stated, "concurrent full-text 'replace' operations are merged, not handled as a last-write-wins overwrite."
>
> The result is deterministic — Yjs updates possess commutative, associative, and idempotent properties. All clients eventually sync to the same state.
>
> The documentation doesn't explicitly detail whether characters from both inserts can interleave. Since replacements are treated as separate `delete()` + `insert()` operations rather than atomic primitives, **interleaving is theoretically possible** depending on how the CRDT resolves concurrent insertion positions.

In plain terms: if I1 calls `ytext.delete(0, ytext.length); ytext.insert(0, "foo: bar\nbaz: qux\n")` and I2 concurrently calls `ytext.delete(0, ytext.length); ytext.insert(0, "alpha: beta\n")`, the merged result will deterministically converge across all replicas — but it may be `foofalpoo: ...` (interleaved). YAML almost certainly will be malformed.

### The realistic threat model

The pivot operates entirely WITHIN a single Hocuspocus process. Cross-process is via the file watcher (Track 4), not via CRDT. So the question reduces to: **how often do two clients inside one process concurrently mutate the SAME Y.Text on the SAME field?**

- **Single user, single Modal Settings tab**: zero. Auto-save commits one field at a time (D8); the user edits one field at a time.
- **Single user, two browser tabs of the same project**: theoretically possible — user opens Settings in tab A and tab B, types in the same field in tab A while tab B has stale state. In practice this is a contrived workflow ("multi-window theme sync" from user_outcomes.md is about syncing changes across tabs, not concurrent typing in two tabs).
- **Single user, theme toggle button + Modal at the same time**: very unlikely — clicking the toggle is one keystroke; opening the Modal requires intent.
- **Multi-user scenario**: NG2 explicitly out of scope — config is per-machine, not collaborative.

The pivot's claim is "concurrent same-field writes are vanishingly rare; persistence-time validation is the safety net." Y.Text interleaving CAN produce invalid YAML, but persistence-time validation rejects it before it lands on disk.

### The validation safety net

Persistence-time `yaml.parseDocument(ytext.toString())` followed by `ConfigSchema.safeParse(merged)`:

- **Yaml parse failure (interleaved garbage like `foofalpoo: bar`)**: parseDocument throws or returns a Document with errors; safeParse never runs; reject + revert to LKG (Track 3 pattern (b)).
- **Yaml parses but schema rejects (e.g., `theme: 'oops'` for an enum)**: safeParse fails; reject + revert.

The UX impact when this fires: "Save failed — config reverted. Try again." The Modal observes the rejection (CC1 channel from Track 3) and re-binds to the last-known-good Y.Text state.

### Field-level patch alternative

A more conservative shape that avoids whole-Y.Text-replace altogether is a **delta-flavored patch model** — instead of `ytext.delete(0, len); ytext.insert(0, newYaml)`, do `yaml.parseDocument(currentText) → setIn(path, newValue) → toString() → minimal-diff patch via diff-match-patch`. The mutation surface is then character-additions in the middle of the YAML, not whole-doc replace. Yjs CRDT handles concurrent character-level edits at well-separated paths cleanly; the failure mode "two clients edit `appearance.theme` line at exactly the same time" reduces to "the LATER write wins at the leaf."

CONFIDENCE: HIGH that the whole-replace pattern works for v0 (validation safety net catches all garbage). MEDIUM that field-level patching is preferable long-term (lower interleaving probability, comment preservation through more situations) but is a "later optimization" not a v0 requirement.

UNCERTAIN: whether yaml@2's `setIn` produces minimal-diff output. Verification path: write a small experiment (parse, setIn, toString) on the existing `seed/apply.ts:88-104` pattern and measure diff size against direct character-position replace.

---

## Track 7 — Awareness suppression for config docs

### How awareness is wired today

`packages/app/src/components/SystemDocSubscriber.tsx:131-133` (per the codebase-integration-points evidence and the grep output) lifts the `__system__` provider's awareness into `DocumentContext` so consumers can read it without re-materializing a second provider.

`packages/app/src/presence/use-presence.ts:1-100` is the canonical consumer hook. It has TWO sources (line 99-onwards):
- Per-doc HocuspocusProvider's `awareness` for human cursors / mode (per-doc awareness, one clientID per doc).
- `__system__`'s `awareness.agentPresence` map for agent peers (publisher: `agent-presence.ts:67`).

Render site: `EditorHeader.tsx:584` mounts `<PresenceBar />` unconditionally.

### Hocuspocus's awareness contract

Every `HocuspocusProvider` instance ALWAYS materializes an `Awareness` instance. This is upstream behavior; not OK-controlled. The Awareness itself is just a Map<clientID, state>; if no client writes state, it's empty but exists. **There is no "create a provider without awareness" option.**

### What Settings UI needs

The Modal binds a HocuspocusProvider for `__config__/workspace` (and/or `__user__/config.yml`). Awareness will exist for those providers. The Modal must:

(a) Not call `awareness.setLocalState(...)` for these providers (no opt-in publishing).
(b) Not render presence pills derived from these providers.

(a) is automatic — `use-presence.ts` doesn't write to per-doc awareness for non-editor docs; the writer is `@tiptap/extension-collaboration-cursor` mounted on the TipTap editor (which Settings doesn't use). So the Modal naturally won't publish.

(b) requires gating `<PresenceBar />` rendering. Options:

- **Per-screen mount gate**: `EditorHeader.tsx` is the editor's header; the Modal's header is separate. `PresenceBar` already only renders when a doc is open in editor mode. The Modal Dialog's header doesn't include PresenceBar today. So unless Modal explicitly imports PresenceBar (it shouldn't), nothing renders.
- **Per-binding suppression in `use-presence`**: the hook at line 99+ takes a `provider` argument; if the binding scope is `'config'`, the hook can short-circuit and return `[]`. But this is only relevant if the Modal mounts a presence-aware UI element — which it should not.

CONFIDENCE: HIGH that **awareness suppression is structurally automatic** in this codebase: PresenceBar is editor-bound, Settings Modal is dialog-bound, the two never share the same component subtree. The "suppression" is a no-op — the Modal doesn't render presence to begin with.

### What about a future "config-doc presence"?

The pivot's evidence file `architectural-pivot-hocuspocus.md` says NG2-revised:

> NEVER engage the markdown observer bridge for config docs; NEVER render awareness/presence in the Settings UI.

For v0, this is automatic. For future, if someone adds presence to the Settings UI, the gate should live where the Modal renders, not at the awareness publisher level.

### The agent-presence map gate

`agent-presence.ts:67` sets keys in `__system__.awareness.agentPresence`. This is keyed by `agentId`, not by `documentName`, and is unrelated to config docs. **No change needed for agent presence.**

The per-doc-Awareness concern in `agent-sessions.ts:494-499` already deliberately avoids per-doc awareness writes (precedent #3). For config docs, the same precedent applies: no writer should publish per-config-doc agent presence.

---

## Topology synthesis

### Surfaces (product + internal) the pivot creates or touches

| Surface | Status | Touches |
|---|---|---|
| `ConfigBinding` interface | NEW (frontend lib export) | Modal Settings UI, theme toggle, future in-app settings controls |
| `writeConfigPatch` function | NEW (Node-only export from core) | MCP `set_config` tool, CLI `ok config migrate`, `seed/apply.ts` |
| `__config__/workspace` synthetic Y.Doc | NEW (server-admitted Hocuspocus doc) | persistence (config persistence path), bridge bypass, Modal binding |
| `__user__/config.yml` synthetic Y.Doc | NEW (server-admitted Hocuspocus doc) | persistence (user-global path), file watcher (cross-process fan-out), Modal binding |
| `isConfigDoc()` predicate | NEW | persistence, bridge ext, agent-sessions.getSession, content-filter, file-watcher |
| Config persistence helper (`storeConfigDoc`) | NEW | `onStoreDocument` dispatch |
| User-global file watcher (`startConfigFileWatcher`) | NEW | Track 4 cross-process fan-out |
| `ConfigSchema` (Zod) | RELOCATED | cli/config/schema.ts → core/config/schema.ts; ~17 importers stay via type-only or re-export |
| Modal Settings UI | NEW (existing spec FR-1 unchanged) | shadcn Dialog substrate, Cmd-, shortcut, HelpPopover entry, CommandPalette entry, Electron menu |
| MCP tools `set_config` / `get_config` / `set_folder_rule` | NEW (existing spec FR-6/6b/6c — RESHAPED to fs-direct) | `writeConfigPatch` (no HTTP wrapper), `ConfigSchema` allowlist, atomic file write |
| CLI `ok config validate` / `ok config migrate` | NEW (existing spec FR-16/26 unchanged) | Loader + ConfigSchema |
| `# yaml-language-server: $schema=...` magic comment | NEW (existing spec FR-17 unchanged) | `init.ts` template |
| `dist/config-schema.json` build step | NEW (existing spec FR-18 unchanged) | `build:schema` npm script |
| SchemaStore PR | NEW (existing spec FR-19 unchanged) | One-time external work |
| HTTP `POST /api/config/patch`, `GET /api/config` | DROPPED | Existing spec FR-12, FR-13 |
| ETag/If-Match flow | DROPPED | Existing spec D33 |
| `applyConfigPatch` server primitive | DROPPED (becomes `writeConfigPatch` in core) | Existing spec FR-9 |
| RFC 7396 PATCH dialect | DROPPED | Existing spec D31, §9.6.1 |
| Two-validator pattern | SHRINKS | Single safeParse on merged doc |
| `ApiError` envelope refactor of ~50 routes | DROPPED | Existing spec FR-28, D30 |
| CC1 `'config'` channel | DROPPED | Y.Text observer is the channel; existing spec FR-14 |
| `'config-validation-rejected'` CC1 channel | NEW (or alternative via Awareness) | Track 3 feedback path |
| Per-machine secrets path (`auth.yml`, OS keychain) | UNCHANGED | Out of scope |

### Connections & dependencies graph

```
ConfigSchema (core, Zod, browser-compatible)
   ├─→ ConfigBinding.patch (frontend, Modal + theme toggle + future controls)
   │       └─→ Y.Text mutation (collab WS)
   │              └─→ Hocuspocus onStoreDocument (server)
   │                     └─→ storeConfigDoc helper
   │                            ├─→ yaml.parseDocument(ytext) → ConfigSchema.safeParse(merged)
   │                            │      ├─ success → tracedWriteFile + tracedRename to disk
   │                            │      │      └─→ writeTracker.register(path, hash) → file watcher self-skip
   │                            │      └─ failure → CC1 'config-validation-rejected' + revert Y.Text to LKG
   │                            └─→ disk
   ├─→ writeConfigPatch (core, Node-only, used by MCP/CLI/seed)
   │       ├─→ yaml.parseDocument(disk) → setIn(path, value) → ConfigSchema.safeParse(merged)
   │       └─→ tracedWriteFile + tracedRename
   │              └─→ this process's writeTracker (same skip-self pattern)
   └─→ Server-side validation (persistence hook, defense-in-depth)

File watcher (per-instance, scoped to contentDir)         File watcher (per-instance, NEW: ~/.open-knowledge/config.yml)
   └─→ unchanged for content                                 └─→ disk change → reload Y.Text in __user__/config.yml
                                                                    └─→ Hocuspocus broadcast → all I-clients re-render

Server-observer-extension afterLoadDocument
   └─→ if (isSystemDoc(name) || isConfigDoc(name)) return     ← THE BRIDGE BYPASS

Agent-sessions.getSession(docName)
   └─→ if (isSystemDoc(docName) || isConfigDoc(docName)) throw ← AGENT SESSIONS REJECT CONFIG DOCS

Cross-process fan-out:
   I1 writes ~/.open-knowledge/config.yml → I2's chokidar watcher fires → I2 reloads YAML → I2's Y.Text updates → I2's clients re-render
```

### Entities & terminology

- **Y.Text-only doc**: A Hocuspocus-admitted Y.Doc whose ONLY shared type is `Y.Text('source')`. No `Y.XmlFragment('default')`. Bridge cannot run. New for config docs.
- **Synthetic doc name**: A `documentName` that doesn't map to any on-disk path under `contentDir`. Currently only `__system__`. Adding `__config__/workspace` and `__user__/config.yml`.
- **System doc**: `__system__` — pure-signal CC1 + agent-presence broadcasts. Pre-materialized at boot via `openDirectConnection`.
- **Content doc**: A markdown doc admitted by ContentFilter; has `Y.XmlFragment` + `Y.Text` + bridge attached.
- **Config doc**: NEW class — synthetic, Y.Text-only, scope-mapped (`__config__/workspace` ↔ `<contentDir>/.open-knowledge/config.yml`; `__user__/config.yml` ↔ `~/.open-knowledge/config.yml`).
- **Persistence hook**: Hocuspocus extension `onStoreDocument`. Throwing aborts the write but does NOT revert Y.Doc state.
- **Last-known-good (LKG)**: Server-side cache of the most recently successfully-validated YAML body for each config doc. Used as the revert source on validation failure.
- **Scope-as-constraint**: Per-field Zod `.meta({ scope: 'user' | 'workspace' | 'either' })` declaring legal scope. Walker enforces in Modal; loader rejects misplaced fields with source-located error.
- **`ConfigBinding`**: Frontend TypeScript interface — `current()`, `patch(deepPartial)`, `subscribe(listener)`. Browser-compatible.
- **`writeConfigPatch`**: Headless TypeScript function — Node-only; fs-direct atomic write; used by MCP/CLI/seed.
- **`isConfigDoc()`**: NEW predicate; same shape as `isSystemDoc()`.
- **`__system__` admission precedent**: `await hocuspocus.openDirectConnection(SYSTEM_DOC_NAME)` at boot in standalone.ts:1246; every documentName-keyed subsystem short-circuits on `isSystemDoc()`. Identified in `cli-broadcast.ts:36` STOP rule (AGENTS.md).
- **Awareness**: Per-Y.Doc `awareness.Awareness` instance (Hocuspocus auto-creates). Carries human cursors, modes, agent presence. Settings Modal does NOT consume.

### Patterns observed

- **System-doc admission precedent**: One canonical admission (`openDirectConnection`), one reservation guard (`isSystemDoc`), eight-plus subsystem short-circuit sites. The pivot extends this pattern to two additional synthetic docs.
- **`isSystemDoc()` audit rule (AGENTS.md STOP)**: Any subsystem keying off `documentName` MUST call `isSystemDoc()` at entry. The pivot extends to `isConfigDoc()`. The L1 test at `packages/app/tests/integration/cc1-broadcast.test.ts` asserts zero system-state leakage; an analogous test for config docs would assert zero markdown-state leakage (no Y.XmlFragment writes, no bridge attachment, no agent sessions).
- **`writeTracker` self-write detection**: The persistence layer registers writes by content hash; the file watcher skips matching events. Per-process. Cross-process self-write detection is NOT a problem — each process correctly sees the OTHER's writes as external. This pattern carries directly into the cross-process config fan-out.
- **Atomic tmp+rename**: Used everywhere in OK persistence. Same pattern works for config writes; the only new concern is chokidar's `unlink+add` event split, addressable via `awaitWriteFinish`.
- **Result<T, E> at function boundaries (D35)**: existing precedent. `ConfigBinding.patch` and `writeConfigPatch` both return `Result<{...}, ConfigValidationError>`. The TypeScript-API-design discipline applies.
- **Single-source-of-truth schema with multiple consumer renderings**: existing spec D14 / D30 (one `ApiError` envelope, multiple wire formats). Pivot extends: one `ConfigSchema`, multiple consumers (Modal walker, server validator, MCP tool input, JSON Schema for IDE).
- **Origin guards (`OBSERVER_SYNC_ORIGIN`, `FILE_WATCHER_ORIGIN`, `skipStoreHooks`)**: Existing pattern in `external-change.ts` and `server-observers.ts`. The pivot needs a new `CONFIG_REVERT_ORIGIN` if pattern (b) of Track 3 is chosen — mark it `skipStoreHooks: true` to prevent recursive validation on revert.
- **Comment-preserving yaml@2 round-trip**: `seed/apply.ts:88-104` is the in-repo proof-of-pattern. Both `storeConfigDoc` (server-side persistence) and `writeConfigPatch` (headless) use it. Existing spec FR-10 unchanged.

### Divergences (cross-source contradictions)

- **Yjs docs vs pivot evidence on character interleaving**: The pivot's `architectural-pivot-hocuspocus.md` line 35-39 says "implicit CRDT merge on Y.Text writes — acceptable for per-machine config where concurrent same-field writes are vanishingly rare." Yjs upstream docs confirm interleaving IS theoretically possible. The pivot's safety net is persistence-time validation. **Both sources agree on the threat model and the mitigation; no actual contradiction, just different framings.**
- **Hocuspocus persistence semantics vs pivot evidence on rollback**: The pivot says "on failure REJECT persistence and revert Y.Text to last-known-good." Hocuspocus upstream says throwing from `onStoreDocument` retries the write without reverting Y.Doc state. **Real divergence**: the pivot's intended atomic-rollback is NOT a built-in Hocuspocus capability. The implementation must do the revert itself (Track 3 pattern (b)).
- **Existing SPEC.md §6.3 ETag concurrency vs pivot drop**: Existing spec asserts ETag/If-Match is necessary for "the lost-update class of bug" (line 580 reference). Pivot drops it under "per-machine context makes lost-update vanishingly rare." **Real divergence**: the pivot accepts a class of bug the existing spec deemed unacceptable. Track 4's cross-process scenario is the most race-prone shape; verification of the "vanishingly rare" claim requires either testing (theme-toggle race in two windows) or a defensive lock pattern (Track 4 mitigation (ii)).

### Unresolved / adjacent items (with trail)

- **UNRESOLVED — chokidar `awaitWriteFinish` vs OK's existing chokidar config.** `file-watcher.ts:804-814` wires chokidar without `awaitWriteFinish`. The persistence path's atomic tmp+rename works because the watcher does its OWN coalesce via `BATCH_WINDOW_MS = 50` (line 822). For the new single-file config watcher, either pattern works; choosing one is a design call, not a discovery question. Trail: read the existing chokidar wiring; chokidar README documents both patterns. Verification: write a quick test of `awaitWriteFinish: { stabilityThreshold: 100 }` against a single-file watcher with a tmp+rename simulation.
- **UNRESOLVED — feedback signal channel for validation rejection.** Track 3 produced two options (CC1 `'config-validation-rejected'` channel vs Awareness ephemeral state). Both work; the choice is a design call about which existing pattern to extend. Trail: scanned `cc1-broadcast.ts` (3 named channels: server-info, branch-switched, disk-ack, plus derived-view set); scanned awareness publishers (agent-presence, agent-focus, per-doc cursor). CC1 is the established "pure signal push" pattern; awareness is the "ephemeral state with TTL" pattern. CC1 better matches "one-shot rejection event"; awareness better matches "current validation state." MEDIUM confidence either is correct.
- **UNRESOLVED — Zod `.meta()` propagation through `.default()` wrappers.** The Zod v4 docs are explicit that metadata does NOT propagate through wrappers. Every `ConfigSchema` field at line 23-127 of schema.ts is wrapped in `.default(...)`. **This breaks the proposed scope-as-constraint pattern as drafted.** Trail: fetched zod.dev/v4 + zod.dev/metadata docs (2026-04-28); confirmed via Zod docs source on GitHub. Resolution paths:
  - (i) Attach `.meta({ scope: ... })` AFTER `.default(...)` — metadata attaches to the `.default()` wrapper. Walker reads metadata from the wrapper, not the inner schema. Works but means walker introspection has to handle Zod `.default()` shape.
  - (ii) Use a registry-based metadata system (`z.registry<{scope: ...}>()` + `.register(registry, {...})`) — registry lookup IS by schema instance reference, but again the `.default()` wrapper creates a new instance.
  - (iii) Remove the `.default(...)` wrappers and apply defaults via a separate object passed to `safeParse({...userInput, defaults})`. Diverges from the existing schema shape.
  - (iv) Wrap with helper: `scoped('user', z.boolean())` returns `z.boolean().meta({ scope: 'user' })` — call this BEFORE `.default(...)`. The walker recursively descends through `.default()` to find the `.meta()` on the inner schema. Requires custom walker logic but keeps the schema readable.
  - **Recommended (with HIGH confidence)**: option (iv) with a small `withScope(schema, 'user')` helper that attaches `.meta({ scope: 'user' })` and returns the SAME schema instance type (no wrap). The walker descends `_zod.def` (Zod v4 introspection per `evidence/d2-empirical-zod-tojsonschema.md`) and on each leaf checks for `.meta()` first, then walks `.def.innerType` if it's a `ZodDefault` / `ZodOptional`.
- **ADJACENT — schema build step (`dist/config-schema.json`)**. Existing spec FR-18 + the empirical test in `reports/config-edit-paths/evidence/d2-empirical-zod-tojsonschema.md`. Migrating ConfigSchema to core means this build step relocates from cli to core (or stays in cli but imports from core). Mechanical. CONFIDENCE: HIGH the move is fine; the build chain at `cli/tsdown.config.ts` was reviewed in evidence/codebase-integration-points.md §10.
- **ADJACENT — agent-settable allowlist surface.** Existing spec D26: `.meta({ agentSettable: true })` per field. SAME Zod metadata API; same propagation concern through `.default(...)` wrappers as scope-as-constraint. The same `withScope` / `withMeta` helper pattern resolves both.
- **INACCESSIBLE — Hocuspocus internals beyond the upstream docs.** Verifying claims about exact `onStoreDocument` retry behavior and Y.Doc state on hook throw requires reading Hocuspocus source or running a test. The upstream docs (fetched 2026-04-28) are the strongest accessible source. Trail: WebFetch on `https://tiptap.dev/docs/hocuspocus/server/hooks` returned the rejection-retry semantics; deeper questions (does the retry happen with a fresh Y.Doc snapshot? what's the retry interval? is there a max-retry?) would need source-reading or experimentation.

---

## Current state vs pivot delta

### What exists today (before pivot lands)

- ContentFilter excludes `.open-knowledge/` automatically (gitignore-rooted; OK ships `.gitignore` with `.open-knowledge/` in workspace projects). ConfigSchema and loader are in cli; no consumer outside cli today. No config file watcher. No Modal Settings UI. No `set_config` MCP tool. No `ok config` CLI subcommand. No `dist/config-schema.json`. No SchemaStore registration.
- `__system__` is the only synthetic Y.Doc; ten-plus subsystems short-circuit on `isSystemDoc()`. `openDirectConnection` is the boot-time admission API.
- Hocuspocus persistence is markdown-specific (TipTap+yjs+remark pipeline). All docs run the bridge unconditionally except `__system__`.
- Atomic tmp+rename pattern proven in production for content writes (`persistence.ts:880-887`) and seed apply (`seed/apply.ts:88-104`).
- File watcher is contentDir-scoped (parcel + chokidar fallback); per-process writeTracker for self-write skip.
- Hocuspocus's `onStoreDocument` is the canonical persistence hook; throwing blocks the disk write but does NOT revert Y.Doc state.
- Awareness is per-doc; PresenceBar consumes from EditorHeader only; Settings Modal would not render presence by structural default.
- Zod v4.3.6 in core's deps already; `.meta()` API exists but does NOT propagate through `.default()` / `.optional()` / `.nullable()` wrappers.

### What the pivot adds

- `isConfigDoc()` predicate + `__config__/workspace` and `__user__/config.yml` synthetic docs.
- `ConfigSchema` migrated to core; ~17 cli importers transition (type-only imports unchanged at compile time).
- `ConfigBinding` interface (frontend); `writeConfigPatch` function (Node-only headless).
- `storeConfigDoc` server-side persistence helper with validation + atomic write + LKG revert.
- `startConfigFileWatcher` for user-global file watching across processes.
- `withScope(schema, 'user' | 'workspace' | 'either')` Zod metadata helper that survives `.default(...)` wrappers via inner-schema attachment + recursive walker descent.
- Modal Settings UI (existing spec FR-1 unchanged) bound to Hocuspocus providers for config docs.
- MCP `set_config` / `get_config` / `set_folder_rule` tools rebuilt around `writeConfigPatch` (no HTTP wrapper).
- CC1 `'config-validation-rejected'` channel OR Awareness state for validation feedback (UNRESOLVED).

### What the pivot drops

- HTTP `POST /api/config/patch`, `GET /api/config`, `checkLocalOpSecurity` gate.
- ETag/If-Match concurrency control.
- `applyConfigPatch` server primitive.
- RFC 7396 PATCH dialect.
- Two-validator pattern's HTTP boundary (the patch validator + merged-document validator collapses to one merged-document validator).
- `ApiError` envelope refactor of ~50 routes (out of scope; existing `{ok, error: string}` shape stays).
- CC1 `'config'` channel (Y.Text observer is the channel).
- Dedicated config file watcher emitting CC1 broadcasts.

---

## Personas & audiences (delta from existing spec §4)

The pivot's user_outcomes.md confirms the personas P1–P5 are mostly preserved with two shifts:

- **P2 (Web/`ok ui` user)**: Settings UI reaches them via Hocuspocus over the same WS that hosts the editor. **No HTTP-specific code path.** Functional parity with Electron P1.
- **P4 (AI agent / MCP client)**: writes config via fs directly with imported schema validation (no HTTP round-trip). The MCP tool wraps `writeConfigPatch`. Live UIs refresh via the new file watcher → Y.Text update.

P1 (Electron desktop user), P3 (IDE-savvy developer), P5 (CI / automation) are unchanged in shape; their interaction surfaces all reduce to "schema is the contract."

---

## 3P landscape

### Hocuspocus (transport)

- Extension model: stack of middlewares. Hooks registered in array; rejection in any hook short-circuits chain.
- `onLoadDocument`: can populate Y.Doc state from a backing store. Rejection terminates document creation.
- `onStoreDocument`: rejection blocks disk write, retains in-memory state, retries.
- `openDirectConnection(name, context?)`: server-side programmatic admission. Increments connection count (prevents unload). Used for `__system__` today.
- `onAuthenticate`: receives token, can throw with `HocuspocusAuthRejection`. Used for principal pinning + serverInstanceId mismatch in OK.
- No documented `beforeOpenDocument` filter; doc names are accepted by default.
- Ref: tiptap.dev/docs/hocuspocus/server/hooks.

### Yjs (CRDT)

- Y.Text concurrent-replace semantics: deterministic merge, theoretically can interleave characters at concurrent insertion points. `Y.encodeStateVector`, `applyUpdate`, sync protocol unchanged.
- For per-machine single-user config, concurrent-same-field-write probability is low; persistence-time validation catches resulting invalid YAML.
- Ref: docs.yjs.dev/api/shared-types/y.text.

### Zod v4

- `.meta({...})` attaches metadata to a SCHEMA INSTANCE. Does NOT propagate through wrappers.
- `z.globalRegistry` is the default registry; can be augmented via TypeScript declaration merging to add custom keys (e.g., `scope: 'user' | 'workspace' | 'either'`).
- Custom registries via `z.registry<{...}>()`; `.register(reg, {...})` attaches.
- `z.toJSONSchema(schema, {target: 'draft-07'})` preserves `.meta()` fields in the generated JSON Schema (relevant for FR-18 IDE intellisense path).
- The pivot's scope-as-constraint pattern requires careful schema authoring (place `.meta()` on the inner pre-`.default()` schema OR walk into `.default()` wrappers). The repo's existing schema (cli/src/config/schema.ts) places `.default()` on object scopes, not on leaf scalars; for `appearance.theme`, the schema would be `appearance: z.object({ theme: withScope(z.enum([...]), 'user').default('system') })` if scope lives on the enum, or `appearance: z.object({ theme: z.enum([...]).default('system') }).meta({ scope: 'user' })` if scope lives on the wrapping object.
- Ref: zod.dev/v4 + zod.dev/metadata.

### Chokidar (file watcher fallback)

- Single-file watching: supported.
- Atomic tmp+rename detection: `awaitWriteFinish: { stabilityThreshold, pollInterval }` is the canonical fix.
- OK currently uses chokidar without `awaitWriteFinish` and instead does a `BATCH_WINDOW_MS = 50` coalesce. Either pattern works for the new config watcher.

### yaml (yaml@2)

- `parseDocument(string)` returns a Document AST with source-position info.
- `setIn(path, value)` / `getIn(path)` for mutation/read.
- `toString()` re-emits with comments + blank lines + anchors preserved.
- In-repo proof-of-pattern: `seed/apply.ts:88-104`.

---

## Prior research — what existing evidence files settle

The pivot does not invalidate the bulk of the existing evidence. Re-using rather than re-deriving:

- **`evidence/codebase-integration-points.md`**: shadcn Dialog substrate (READY); Settings entry candidates (Cmd-, uncontested, HelpPopover anchor, CommandPalette adds three lines, Electron menu); CLI structure additive; `ok init` scaffold (`CONFIG_YML_CONTENT` constant location); `__system__` CC1 broadcaster pattern; HTTP API extension shape (now mostly unused — pivot drops the routes); MCP tool registration canonical thin-wrapper (now reshaped to fs-direct via `writeConfigPatch`); file watcher (does NOT watch `.open-knowledge/` — confirmed and extended in Track 4); build pipeline `dist/config-schema.json` insertion; localStorage prefs vs config.yml.
- **`evidence/config-architecture-framework.md`**: P1–P33 storage architecture, decision-tree for "deserves to be configurable" + "where it lives," per-scope tolerance taxonomy, cross-scope merge semantics (`folders[]` concat+dedup; arrays-replace; scalars-replace). Unchanged by the pivot.
- **`evidence/eval-group-{A,B,C,D}-*.md`**: per-field /explore traces for content/folders, server/preview, mcp, appearance fields. Inputs to per-field `scope` metadata.
- **`evidence/electron-cmdk-omnisearch-3p.md`**: Cmd-K omnisearch patterns. Likely tangential to the pivot; touches Settings entry-point only.
- **`evidence/validation-cli-patterns-3p.md`**: Mintlify / Fumadocs / Astro / Renovate / actionlint validation CLI patterns. Inputs to `ok config validate` subcommand. Unchanged by the pivot.
- **`evidence/tim-precedents-from-main.md`**: shared-dialog-from-multiple-entry-points pattern (PR #318); per-feature IPC files (PR #319); additive write-handler response shape (PR #315); folders feature (PR #297). Patterns 1, 4, 5 still apply; pattern 2 (per-feature IPC files) doesn't apply to Settings (renderer-only); pattern 3 was the precedent for additive-error-shape that the pivot drops along with the HTTP layer.

---

## What the pivot's spec rewrite must cover (input to Step 3)

These are the framing questions Step 3 (spec reframe) needs answers to. Track-by-track:

**Track 1**: Define `isConfigDoc()` + `__config__/` prefix in core. Document the boot-time `openDirectConnection` calls in standalone.ts and the rationale. Add to `isSystemDoc()`-style audit table the new sites where `isConfigDoc()` must short-circuit.

**Track 2**: Single-line gate extension at `server-observer-extension.ts:50`. Test asserts no Y.XmlFragment writes to config docs.

**Track 3**: Choose between throw-and-UI-revert vs server-side LKG-revert pattern. Wire CC1 channel OR Awareness ephemeral state for validation feedback. Document the new persistence helper file location.

**Track 4**: Define `startConfigFileWatcher(absPath, onChange)` API. Decide chokidar `awaitWriteFinish` vs manual coalesce. Test the cross-process fan-out scenario (two `ok start` instances, one writes, the other observes). Acknowledge or mitigate the lost-update window for cross-process simultaneous writes.

**Track 5**: Move `ConfigSchema` to core; preserve cli imports via re-export during transition. Update core's barrel to export. Confirm browser-bundle test (the schema and Zod itself are pure-JS).

**Track 6**: Document the validation-as-safety-net pattern for Y.Text-as-YAML. Test the contrived concurrent-edit scenario (two browser tabs editing same field) to confirm the rejection path works. Optionally specify field-level patching as a future optimization (NG / NOT NOW item).

**Track 7**: Document that awareness suppression is structurally automatic (Settings Modal doesn't render PresenceBar). No changes to `agent-presence.ts` or PresenceBar. Add a forward-compat note: if future Settings UI ever wants per-config-doc presence, gate at the consumer, not the publisher.

---

## Top architectural risks the pivot creates

(For final-summary use; consolidated from the seven tracks.)

1. **Hocuspocus `onStoreDocument` does NOT atomically revert Y.Doc state on hook rejection.** The pivot's "validate, on failure REJECT and revert Y.Text to last-known-good" is NOT a built-in capability. The implementation must do the revert itself, either via UI-driven Modal handling (cheap, less robust) or server-side LKG-overwrite (more robust, more code). Either works; the spec needs to lock the choice.

2. **Zod v4 `.meta()` does NOT propagate through `.default()` / `.optional()` / `.nullable()` wrappers.** The proposed scope-as-constraint pattern as written would silently lose metadata on every defaulted field — which is every field in the existing schema. Mitigation: `withScope(schema, 'user')` helper that attaches `.meta()` to the inner schema BEFORE wrapping with `.default()`; walker recursively descends through `.default()`. Mechanical fix; spec must call out the constraint or the implementation will hit it during walker development.

3. **Cross-process simultaneous-write lost-update window for user-global config.** Two `ok start` instances editing the same field at the same time can lose one write. The pivot accepts this under "vanishingly rare," but multi-window theme-sync (the canonical user_outcomes.md scenario) is the exact race-prone shape. Mitigation options: accept the race (v0 default, document limitation), per-machine lock around atomic writes (proper-lockfile or similar), read-modify-merge in persistence handler (process-level mini-CRDT). Decision pending observation; recommend documenting the window as a known limitation and revisiting if testing surfaces it.

(Honorable mentions, not in top 3:
- **Y.Text concurrent character interleaving** producing invalid YAML — caught by validation safety net, no real risk.
- **Bridge bypass extension test coverage** — needs an integration test asserting "config docs never see Y.XmlFragment writes." Mechanical addition.
- **Awareness suppression** — automatic by structure; no risk unless someone adds presence to Settings UI later.)

---

## Confidence summary

- Track 1 (admission): HIGH — `__system__` precedent + `isSystemDoc()` audit table + Hocuspocus `openDirectConnection` doc.
- Track 2 (bridge bypass): HIGH — single-line gate extension; existing precedent at line 50.
- Track 3 (persistence-time validation): MEDIUM — Hocuspocus rollback semantics are confirmed (no atomic revert), but the choice between UI-revert and server-side-revert is undecided.
- Track 4 (cross-process fan-out): MEDIUM — chokidar single-file watching + `awaitWriteFinish` is a known pattern, but the lost-update window for cross-process simultaneous writes is an UNCERTAIN that the pivot accepts as "vanishingly rare." Verification path: testing the multi-window theme-sync scenario.
- Track 5 (schema migration): HIGH — schema is pure Zod; importers are mostly type-only; mechanical move.
- Track 6 (CRDT semantics): HIGH on the safety net working; MEDIUM on whether whole-replace is the long-term right shape (field-level patching is an optional future optimization).
- Track 7 (awareness suppression): HIGH — structurally automatic; no code changes needed unless someone adds presence to Settings later.
