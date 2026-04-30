---
name: cluster_a_foundational_investigations
description: Investigation of NQ1 (Provider), NQ2 (auth), NQ4 (schema migration), NQ8 (first-write), NQ11 (file-watcher), NQ18 (OTel) — six foundational P0 questions for the config-edit-paths release pivot
type: evidence
date: 2026-04-28
sources:
  - packages/app/src/editor/provider-pool.ts (full, 1303 lines)
  - packages/app/src/components/SystemDocSubscriber.tsx (full, 146 lines)
  - packages/server/src/boot.ts (full, 619 lines)
  - packages/server/src/standalone.ts:300-600, 1280-1330 (auth + system-doc admission)
  - packages/server/src/auth-token-schema.ts (full, 129 lines)
  - packages/server/src/local-op-security.ts:1-160 (HTTP gate, NOT WS)
  - packages/server/src/file-watcher.ts (full, 944 lines)
  - packages/server/src/persistence.ts:600-900 (onLoadDocument + onStoreDocument)
  - packages/server/src/telemetry.ts (full, 211 lines)
  - packages/server/src/fs-traced.ts (full, 145 lines)
  - packages/server/src/doc-extensions.ts:1-100
  - packages/cli/src/auth/token-store.ts:80-134 (FileBackend write pattern)
  - packages/cli/src/config/schema.ts (full, 130 lines — pure Zod)
  - packages/cli/src/config/loader.ts (full, 183 lines — node:fs/os/path)
  - packages/cli/src/commands/init.ts:1-160 (runInit / scaffolding flow)
  - packages/cli/src/content/init.ts:1-160 (CONFIG_YML_CONTENT template)
  - packages/cli/src/index.ts:23-25 (re-export of ConfigSchema/loadConfig)
  - packages/core/package.json (Zod v4.3.6 already a direct dep)
  - packages/core/src/index.ts (barrel; no schema section yet)
  - https://www.npmjs.com/package/@parcel/watcher (subscribe API)
  - https://github.com/paulmillr/chokidar (watch + add() for single files)
  - evidence/_init_worldmodel.md (Tracks 1-7 of pivot)
  - evidence/architectural-pivot-hocuspocus.md (D39-D44 proposed)
  - evidence/api-shape-typescript-not-rest.md (ConfigBinding / writeConfigPatch shapes)
  - evidence/server-side-validation-pattern.md (D45 three-layer defense)
---

# Cluster A — foundational investigations (NQ1, NQ2, NQ4, NQ8, NQ11, NQ18)

Six P0 questions that gate the architecture before any spec text can lock. Each investigation pulls only what's needed; verification paths cite line numbers so a reviewer can re-derive on demand.

---

## NQ1 — Modal Hocuspocus Provider acquisition

### What the Modal needs

Per `evidence/api-shape-typescript-not-rest.md`, the Modal Settings UI binds to two Y.Docs over the existing collab WS:
- `__config__/workspace` — workspace `<contentDir>/.open-knowledge/config.yml`
- `__user__/config.yml` — user-global `~/.open-knowledge/config.yml`

It needs a `HocuspocusProvider` per doc (or one provider with two doc subscriptions) so that `ConfigBinding.patch()` can mutate the bound `Y.Text('source')` and have the change broadcast over the WS.

### Existing acquisition pattern — `ProviderPool` (the editor's path)

`packages/app/src/editor/provider-pool.ts` is the canonical surface. Key facts read directly from the source:

1. **One provider per doc.** The pool is keyed on `docName` (`open(docName)` at line 641). Each entry constructs `new HocuspocusProvider({ url, name: docName, ... })` (line 662-670). There is no shape in the pool for "one connection, multiple docs" — Hocuspocus's `HocuspocusProvider` constructor takes a single `name` string.

2. **One WebSocket per provider.** Each `HocuspocusProvider` opens its own WebSocket to the same `wsUrl` (line 279, "frozen at construction"). Multiplexing across docs is not supported by `@hocuspocus/provider` directly — each provider is one socket per doc. (Hocuspocus servers DO multiplex incoming WS connections per-doc by `documentName`, but the client side opens a connection per doc.)

3. **Pool size and eviction.** `MAX_POOL = 10` (line 197). Active doc is never evicted; LRU otherwise. Coupled to `ACTIVITY_MOUNT_LIMIT = 3` (precedent #15(c)).

4. **`__system__` is a separate provider, not via the pool.** `ProviderPool.open()` rejects `isSystemDoc(docName)` outright (line 642 — "the `__system__` pseudo-doc carries CC1 signals and is never user-editable — see SPEC.md §10 DX7"). The SystemDocSubscriber component (`packages/app/src/components/SystemDocSubscriber.tsx`) directly constructs `new HocuspocusProvider({ url, name: SYSTEM_DOC_NAME, document: doc, onStateless })` (line 46-48) — same `wsUrl` from `useDocumentContext()`, separate WebSocket.

### So what should the Modal do?

**Two viable shapes:**

**(A) Reuse ProviderPool — `pool.open('__config__/workspace')` and `pool.open('__user__/config.yml')`.** Conflicts with line 642's reservation gate (which today only rejects `__system__`). To use the pool, the gate must accept config docs. Pros: shared LRU, shared `tabIdentity` + `wsUrl`, automatic recycle on `server-instance-mismatch` / `branch-mismatch`. Cons: bridge-setup runs on every active entry (line 741-760, `setupObservers`), which would fire for config docs and corrupt YAML through markdown round-trip — would need `bridgeSetupFailed: true` short-circuit OR `isConfigDoc()` early-return inside `onSynced`.

**(B) Separate config providers — mirror SystemDocSubscriber pattern.** Construct `new HocuspocusProvider({ url: collabUrl, name: '__config__/workspace', document: yDoc, onStateless: ... })` directly inside a new `ConfigDocSubscriber` (or inside `bindConfigDoc`). Pros: zero pool surgery; bridge-setup never wired (no editor mount → no `setupObservers`); mirrors a precedent that's already been audited; lifecycle decoupled from editor activity. Cons: opens 2 additional WebSockets per browser tab (one per scope) — going from 1-N (active editor) + 1 (`__system__`) to 1-N + 1 + 2.

### Recommendation — Shape (B), separate providers

Mirror SystemDocSubscriber. `bindConfigDoc(provider, scope)` per `api-shape-typescript-not-rest.md` constructs its own provider; the Modal owns its lifecycle.

Reasons:
1. **Bridge bypass is automatic by construction.** Pool entries always run `setupObservers` at line 741-760. Config docs MUST NOT (NQ-pivot Track 2). Re-using the pool means adding a per-doc gate inside `onSynced` — extra branch on a hot path, easy to drift on. Separate providers never wire `setupObservers` because that's a pool-internal call.
2. **Different lifecycle.** Editor providers recycle on `server-instance-mismatch` and `branch-mismatch` (recycle clears IDB → re-syncs). Config docs don't have IDB persistence today (the pool's `createClientPersistence` is editor-specific). Modal's lifecycle is "open while Modal is mounted," not "while editor LRU keeps it warm."
3. **CC1 patterns precedent.** `__system__` is already a separate-provider doc that uses the same `collabUrl`. Going to 3 separate WS connections (editor + system + 2 config) is well within Hocuspocus's expected per-tab footprint — Hocuspocus benchmarks routinely show dozens of concurrent docs per tab.
4. **Lower coupling.** The Modal can ship + iterate without touching pool's MAX_POOL, LRU, eviction, recycle. A future "share underlying socket" optimization is a separate work item if WS count becomes a metric.

The separate-provider count cost: 2 extra WebSockets per browser tab. Hocuspocus is designed for this — `__system__` has been doing it since CC1 shipped.

### Confidence: HIGH

Source-grounded in `provider-pool.ts:641-670` + `SystemDocSubscriber.tsx:43-83`. The pattern is already proven for `__system__`.

### Risks

- **R1.** If the user opens 10+ tabs, that's 10×4 = 40 simultaneous WebSockets to one server. Hocuspocus's per-process limits should hold (Node default ~32k FDs), but document this in the spec's NFR section.
- **R2.** The provider's `onAuthenticate` and `onStateless` per-doc behavior must NOT corrupt config doc behavior — see NQ2.

---

## NQ2 — Auth/handshake for config docs over collab WS

### Existing handshake — token-based, gated on `documentName` only inside extensions, not at WS layer

Read directly:

1. **WS upgrade in `boot.ts:317-458` is `documentName`-agnostic.** The HTTP `upgrade` handler routes `/collab/keepalive` (MCP heartbeat) and `/collab` (editor) (line 319 + line 432). The latter unconditionally calls `hocuspocus.handleConnection(ws, req)` — no per-doc gate at upgrade time. Hocuspocus parses the binding `documentName` from the first protocol frame; admission decisions happen inside extensions.

2. **Auth token shape is in `auth-token-schema.ts`.** `HocuspocusAuthTokenSchema` (line 51-63) is `z.loose()` with four optional string fields: `principalId`, `tabSessionId`, `expectedServerInstanceId`, `expectedBranch`. All are optional — legacy untokened clients still authenticate.

3. **Client side: `provider-pool.ts:209-230` `buildAuthToken`.** Constructs `claim` from `tabIdentity` + `cachedServerInstanceId` + `lastObservedBranch`. Returned as a JSON-stringified `token` field on the `HocuspocusProvider` constructor (line 668-669 — `token` only included when defined). `__system__` uses no token at all (`SystemDocSubscriber.tsx:46-48` does NOT pass `token`).

4. **Server side: `standalone.ts:366-453` `principalAuthExtension`.** The `onAuthenticate` hook:
   - Parses token via `parseHocuspocusAuthToken` (line 378).
   - Cross-checks `expectedServerInstanceId` against `serverInstanceId` (line 389-395). Mismatch throws `HocuspocusAuthRejection('server-instance-mismatch')`.
   - Cross-checks `expectedBranch` against `getActiveBranch()` (line 407-418). Mismatch throws `HocuspocusAuthRejection('branch-mismatch')`.
   - Sets `ctx.principalId = parsed.principalId` IF it matches `loadedPrincipal.id` (line 422-446). Otherwise warns + omits.
   - Sets `ctx.tabSessionId`, `ctx.kind = 'human'`.

5. **Per-doc admission gate at WS layer? NO.** `boot.ts:317-458` makes no per-`documentName` decision. The only WS-layer guards are:
   - `systemDocBroadcastGuard` (`standalone.ts:474-488`) — rejects inbound `BroadcastStateless` ON `__system__` only. This is anti-CC1-forgery for the system doc; NOT a per-doc-admission gate.
   - `checkLocalOpSecurity` (line 112 of `local-op-security.ts`) is HTTP-only. **It is NOT in the WS path.** It runs only inside HTTP handlers (`api-extension.ts:4371, 4637, 4704, ...` — 9 sites, all HTTP).

6. **DNS-rebind / loopback? Not at WS.** `local-op-security.ts:75-104` checks `req.socket.remoteAddress` and `Origin` header for HTTP. The WS upgrade handler in `boot.ts:317-458` does NOT call `checkLocalOpSecurity`. Loopback enforcement at the WS layer is a gap — but it's the existing gap; this spec does not need to close it.

### What about config docs?

The same `principalAuthExtension` runs `onAuthenticate` for every connection regardless of `documentName`. For config docs:
- `expectedServerInstanceId` and `expectedBranch` checks fire identically. **This is correct** — the user-global config Y.Doc lives only on this server instance; if the client claimed a stale instance ID, we want to recycle just like editor providers.
- `ctx.principalId` / `ctx.tabSessionId` / `ctx.kind` are set on the connection context, but the persistence-time validation hook (D45 L3) doesn't currently consume them. Future work could attribute config edits to the principal, but D23 (revised) said agent identity is NOT carried into config writes.

### Recommendation — config docs need NO additional gating beyond what content docs get

The existing auth extension is sufficient. The pivot's threat model:
- Same-origin browser = trusted (the loopback assumption holds for v0).
- Token claim is unsigned, so a malicious tab could open a config doc connection — but that tab can already do the same to any markdown doc (it's the same WS endpoint with the same auth surface). No incremental attack surface for config.

What **does** need attention but at a different layer:
- The `isConfigDoc()` predicate must short-circuit `agent-sessions.ts:431-433` so `getSession()` doesn't try to open an agent session on a config doc (mirrors the existing `__system__` short-circuit).
- The `principalAuthExtension`'s context-mutation (line 421-450) is benign for config docs — the persistence hook for config (NQ18 / D45 L3) will ignore `ctx.principalId`.

### Confidence: HIGH

Triangulated through `boot.ts:317-458` (no WS-layer gates) + `standalone.ts:366-488` (extension-level `onAuthenticate` is documentName-agnostic) + `local-op-security.ts:1-160` (HTTP-only, no WS callsite).

### Risks

- **R1.** Client-side `buildAuthToken` assumes one `expectedServerInstanceId` and one `expectedBranch` per provider. The Modal's two config providers will both carry the same (cached) values — fine; they'll get rejected/recycled in lockstep with editor providers when the server restarts or branch switches. **Verification path**: confirm `DocumentContext` exposes `cachedServerInstanceId` to non-pool consumers; if it doesn't, the Modal's `bindConfigDoc` will need a hook into `useDocumentContext()` to read the same cached values.
- **R2 (gap, not blocker).** WS layer has no DNS-rebind defense today. If we ever bind to non-loopback (`server.host: '0.0.0.0'`), config docs are as exposed as editor docs. Out of scope for this spec; existing precedent.

---

## NQ4 — `ConfigSchema` migration to `@inkeep/open-knowledge-core`

### Verification — schema is pure Zod, no Node deps

`packages/cli/src/config/schema.ts` (lines 1-130) imports ONLY `import { z } from 'zod'`. Every field uses Zod primitives: `.string()`, `.number().int().min().max()`, `.boolean()`, `.array()`, `.optional()`, `.default()`, `.url()`, `.regex()`. Zero `node:fs`, `node:os`, `node:path`. Browser-bundle compatible as-is.

`packages/core/package.json:58` confirms `"zod": "^4.3.6"` is already a direct dependency. **No new dep needed for the move.**

### Importer audit — split by type-only vs runtime

**Runtime importers** (3 sites in `packages/cli/src/`):
- `cli/src/config/loader.ts:19` — `import { type Config, ConfigSchema } from './schema.ts'` — runtime use of `ConfigSchema.safeParse` at line 89
- `cli/src/index.ts:24` — `export { type Config, ConfigSchema } from './config/schema.ts'` — re-export from the cli package barrel (consumed by `packages/desktop/src/main/index.ts`?)
- (None in `packages/server/`, `packages/app/`, `packages/desktop/` directly)

**Type-only importers** (12 sites in `packages/cli/src/`):
- `cli/src/mcp/server-discovery.ts:13` — `import type { Config }`
- `cli/src/mcp/server.ts:23` — `import type { Config }`
- `cli/src/mcp/tools/preview-url.ts:31` — `import type { Config }`
- `cli/src/mcp/tools/shared.ts:11` — `import type { Config }`
- `cli/src/github/app-config.ts:1` — `import type { Config }`
- `cli/src/commands/{status,mcp,start,stop,ui,clean,preview}.ts` — all `import type { Config }`
- `cli/src/content/folder-rules.ts:20` — `import type { FolderFrontmatter, FolderRule }`
- `cli/src/content/enrichment.ts:20` — `import type { FolderRule }`

`cli/src/config/schema.test.ts:2` — `import { ConfigSchema } from './schema'` — runtime in tests.

**Net: 17 callsites, only 1-2 with runtime semantics that change beyond moving an import path** (loader's `safeParse` is the load-bearing one). Type-only erases at compile, so a re-export bridge in `cli/src/config/schema.ts` keeps every existing `import type { Config } from '../config/schema.ts'` working.

### Server-side post-pivot use

The server doesn't import config schema today. **Post-pivot it WILL** — Layer 3 of D45 (persistence-time validation hook) needs `ConfigSchema.safeParse(merged)` at the persistence boundary. This is exactly what the migration to core unblocks: server packages can't import from cli (cli depends on server, not the reverse), but both can import from core.

### App-side post-pivot use

Currently zero. Post-pivot the Modal's Zod walker needs `ConfigSchema` from a browser-compatible source. Importing from `@inkeep/open-knowledge-server` would drag the entire server bundle into the browser via tree-shake leaks (the existing comment in `provider-pool.ts:817-819` says: "a runtime import pulls the entire server bundle into the browser via tree-shake leaks"). Core is the only viable home.

### Recommendation — gradual move with re-export bridge

**Two-PR rollout** is safer than big-bang for a 17-importer surface:

**PR 1**: Move source from `packages/cli/src/config/schema.ts` to `packages/core/src/config/schema.ts`. Add to `packages/core/src/index.ts` (barrel pattern, mirroring lines 83-103 for CC1 schemas):

```ts
export {
  ConfigSchema,
  FolderFrontmatterSchema,
  FolderRuleSchema,
  type Config,
  type FolderFrontmatter,
  type FolderRule,
} from './config/schema.ts';
```

Replace `packages/cli/src/config/schema.ts` with a re-export bridge:

```ts
export {
  ConfigSchema,
  FolderFrontmatterSchema,
  FolderRuleSchema,
  type Config,
  type FolderFrontmatter,
  type FolderRule,
} from '@inkeep/open-knowledge-core';
```

This preserves every `'../config/schema.ts'` import without code changes.

**PR 2 (optional, post-spec)**: Codemod the 17 cli importers to point directly at `@inkeep/open-knowledge-core`. Remove the bridge file. Cleanup-only PR; no semantic change.

A big-bang move is also viable (the importer count is low and they're all import-only). But the gradual path is lower-risk and lets the Modal + persistence-hook work proceed in parallel without coordinating on the codemod.

### Confidence: HIGH

Schema is provably pure Zod. `core` already depends on Zod v4. Importer count is well-bounded. The `cli/src/index.ts:24` re-export of `ConfigSchema` is the only public boundary that callers (e.g. `packages/desktop`) might consume — preserving it via the bridge is mechanical.

### Risks

- **R1.** Two test files (`cli/src/config/schema.test.ts`, `cli/src/content/folder-rules.test.ts`) have direct relative imports — re-export bridge keeps them working. After PR 2, they move alongside the schema (or stay as re-export consumers).
- **R2.** `cli/src/index.ts:24` is a public re-export. Desktop's `main/index.ts:34` imports from `@inkeep/open-knowledge-server`, NOT from `@inkeep/open-knowledge` (cli). Confirm via `grep -r "from '@inkeep/open-knowledge'"` in packages/desktop — if no consumers of the cli barrel exist for `ConfigSchema`, PR 2's cleanup is fully safe.

---

## NQ8 — First-write of `~/.open-knowledge/config.yml`

### Existing precedent — `cli/src/auth/token-store.ts:80-134` `FileBackend`

Read directly:

```ts
private write(data: Record<string, TokenEntry>): void {
  const dir = dirname(this.authFile);
  // 0o700 keeps the directory unreadable by other local users — matches the
  // 0o600 file mode below and prevents listing "you have Open Knowledge
  // credentials" from a shared-host account.
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(this.authFile, yamlStringify(data), { mode: 0o600 });
}
```

Three load-bearing properties:
1. **Idempotent mkdir.** `existsSync` + `mkdirSync({ recursive: true, mode: 0o700 })` — won't fail if dir exists.
2. **Restrictive permissions.** Dir 0o700, file 0o600. **Auth file uses these because tokens are secrets.** Config is NOT a secret; the user might `chmod` and `cat` it from another tool. **The mode for config should be the system default (0o644 on most Unixes — `writeFileSync` without a mode argument).**
3. **Synchronous + non-atomic.** No tmp+rename. For a single-writer setting this is fine; for multi-writer (cross-process) we need atomic.

### What `writeConfigPatch` needs

Per `evidence/api-shape-typescript-not-rest.md`, headless writers (MCP, CLI, seed) call `writeConfigPatch({ cwd, scope, patch })`. The function:

1. Resolves the target path:
   - `scope: 'workspace'` → `<cwd>/.open-knowledge/config.yml`
   - `scope: 'user'` → `<homedir()>/.open-knowledge/config.yml`
2. Parses existing file (or empty doc if first-write).
3. Applies the patch via yaml@2 setIn.
4. `ConfigSchema.safeParse(merged)` — reject on failure.
5. Atomic write.

For first-write (file doesn't exist):
- Mkdir `dirname(targetPath)` recursively (idempotent — same as token-store).
- Mode for the dir: **0o755 (default)** is fine for config (NOT 0o700 — config isn't secret).
- Atomic write: tmp+rename pattern (mirrors `persistence.ts:881-884`):

```ts
const tmpPath = `${targetPath}.tmp.${crypto.randomUUID()}`;
await tracedWriteFile(tmpPath, yamlString, 'utf-8');
await tracedRename(tmpPath, targetPath);
```

This is the pattern the persistence layer already uses for content `.md` writes. Reusing it gives:
- Atomicity against partial-write crashes.
- Clean fan-out to `@parcel/watcher` (atomic rename → single `'create'` event, not `unlink + add`).
- Free OTel via `tracedWriteFile` / `tracedRename` (NQ18 alignment).

### Should `ok init` write user-global config?

**No.** Read `cli/src/commands/init.ts` (full, 1095 lines). `runInit` (line 630-788) does:
1. `ensureProjectGit(cwd)` — ensure `.git/` exists in workspace.
2. `initContent(cwd)` — scaffold `<cwd>/.open-knowledge/` (config.yml, etc.).
3. Write per-editor MCP config files.
4. Optional `.claude/launch.json`.
5. `installUserSkill` — write user-global skill bundle.

`initContent(cwd)` writes the WORKSPACE `<cwd>/.open-knowledge/config.yml` from the `CONFIG_YML_CONTENT` template (`cli/src/content/init.ts:5-117`). It does NOT touch `~/.open-knowledge/config.yml`.

**Reasons to keep `~/.open-knowledge/config.yml` lazy-create:**
1. **First-write happens on first user-scope edit.** If the user toggles theme = dark, the Modal's `bindConfigDoc('user').patch({ appearance: { theme: 'dark' } })` triggers the persistence hook, which writes user-config to disk for the first time. Lazy creation matches user intent — no file unless something is set.
2. **Loader handles missing user-config gracefully.** `cli/src/config/loader.ts:74` — `if (userConfig) { merged = deepMerge(merged, userConfig) }`. Missing file → no error, no source.
3. **`ok init` is project-scoped.** It runs in a workspace, not a global "set up Open Knowledge on this machine" command. Conflating per-machine setup with per-project setup is the failure mode the existing init flow already avoids (per `init.ts:539-570` `writeUserMcpConfigs`'s warning about project-scope writes setting `'/'` as cwd).
4. **The user config DOES get installed at MCP-skill time** (`installUserSkill` writes a global skill bundle but not config.yml), preserving the per-machine boundary at the right place.

If a user wants user-global config to exist before they edit it, they can run a future `ok config init --scope user` command (post-v0). For v0, lazy is correct.

### FR-17 magic-comment header on first-write?

The spec's FR-17 (existing) says new-file writes should embed `# yaml-language-server: $schema=https://...` so SchemaStore can pick up validation in IDEs. **Yes, include this on first-write.**

The `CONFIG_YML_CONTENT` template (`init.ts:5-117`) is the canonical workspace-config seed. For lazy first-write of either scope, `writeConfigPatch` should:
1. Detect first-write (file doesn't exist).
2. Prepend the magic-comment header before the YAML body.
3. (Workspace only?) Optionally include the commented-out `# content:` etc. defaults — though per FR-17 it might be cleaner to keep the user-global file minimal (no commented defaults; just the magic comment + the user's keys).

**Recommendation**: First-write for both scopes prepends the magic-comment line. Workspace first-write via `ok init` keeps using the verbose `CONFIG_YML_CONTENT` template. User-global first-write uses a minimal preamble:

```yaml
# yaml-language-server: $schema=https://schemastore.org/open-knowledge.json
# Open Knowledge — user-global configuration (per-machine, this user)
appearance:
  theme: dark
```

### Confidence: HIGH

Pattern is mechanical — token-store gives the directory-create idiom; persistence.ts gives the atomic-write idiom; init.ts gives the verbose workspace-template precedent. Combining them is < 50 LoC.

### Risks

- **R1.** Cross-process race when two `ok start` instances write user-config at the same time (NQ-pivot Track 4 lost-update window). Per evidence, pivot accepts this as "vanishingly rare."
- **R2.** Dir mode 0o755 leaks "user has Open Knowledge installed" to other local users. **This is a feature — config isn't secret.** Auth tokens stay 0o700/0o600 in the existing auth.yml.

---

## NQ11 — File-watcher subscription extension

### Current API surface — directory-rooted, `contentDir`-scoped

`packages/server/src/file-watcher.ts:871-916` `startWatcher(contentDirRaw, onDiskEvent, contentFilter)` is the canonical entry point:

```ts
export async function startWatcher(
  contentDirRaw: string,
  onDiskEvent: (event: DiskEvent) => Promise<void>,
  contentFilter?: ContentFilter,
): Promise<WatcherHandle>
```

Hard constraints:
1. **Single root path.** `contentDir = realpathSync(contentDirRaw)` (line 878), then `seedLastKnownHashes(contentDir, ...)` (line 886) walks ONLY paths under that root.
2. **`@parcel/watcher` directory-only.** Confirmed by web search and by code: `parcel.subscribe(contentDir, callback, subscribeOpts)` (line 762) takes a directory root.
3. **`chokidar` fallback can watch single files** but the existing `startChokidarWatcher` (line 794) passes `watch(contentDir, { ignoreInitial: true, ignored: ... })` — also directory-rooted.
4. **Filter pipeline.** `classifyEvents` (line 166) drops events failing `isSupportedDocFile(event.path)` (line 177) → `.md` / `.mdx` only. **Config files would be dropped here even if the watcher saw them.**
5. **Dispatch via `onDiskEvent`.** Single callback receives typed `DiskEvent` (create/update/delete/rename/conflict).

### What's needed for config docs

Two additional file paths must be watched:
- `<contentDir>/.open-knowledge/config.yml` — INSIDE `contentDir` but EXCLUDED today (gitignore + `BUILTIN_SKIP_DIRS` would skip `.open-knowledge/`).
- `~/.open-knowledge/config.yml` — OUTSIDE `contentDir`. Cannot reuse the existing watcher's root.

### `@parcel/watcher` and outside-`contentDir` paths

Web search (sources below) confirms:
- `@parcel/watcher.subscribe()` is **directory-recursive** by design. Passing a file path is not the documented API.
- `@parcel/watcher` does NOT have an artificial constraint about parent-vs-child of CWD. The Parcel-bundler issue [parcel-bundler/parcel#7673] is about Parcel.js (the bundler) limitations on *what it serves*, not about `@parcel/watcher`'s capacity to watch arbitrary directories.
- For a single file in `$HOME`, the canonical pattern is: subscribe to `~/.open-knowledge/` (a directory) and filter callback events to the file of interest.

### `chokidar` and single-file watches

Web search (sources below) confirms chokidar accepts absolute paths, including single files:
```js
chokidar.watch('/Users/alice/.open-knowledge/config.yml')
```
and supports `watcher.add(absolutePath)` to grow an existing watcher's set.

### Recommendation — additive `startConfigFileWatcher` helper

Smallest change, no surgery to the existing `startWatcher`:

**New file**: `packages/server/src/config-file-watcher.ts`

```ts
export interface ConfigWatcherHandle {
  unsubscribe: () => Promise<void>;
}

/**
 * Watch a single config.yml file for changes. Uses chokidar (single-file
 * support is mature; @parcel/watcher requires directory-rooting). Atomic
 * tmp+rename writes are coalesced via { awaitWriteFinish } to avoid
 * spurious unlink+add events.
 */
export async function startConfigFileWatcher(
  absPath: string,
  onChange: (content: string | null) => Promise<void>,
): Promise<ConfigWatcherHandle> {
  const { watch } = await import('chokidar');
  const watcher = watch(absPath, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 25 },
  });
  watcher.on('add', async () => {
    const content = await readFile(absPath, 'utf-8').catch(() => null);
    await onChange(content);
  });
  watcher.on('change', async () => {
    const content = await readFile(absPath, 'utf-8').catch(() => null);
    await onChange(content);
  });
  watcher.on('unlink', async () => {
    await onChange(null);
  });
  watcher.on('error', (err) => console.warn('[config-watcher] error:', err));
  return { unsubscribe: () => watcher.close() };
}
```

**Boot wiring** in `boot.ts` / `standalone.ts`:

After `startWatcher(contentDir, ...)` line 1335:

```ts
// Workspace config (inside contentDir but excluded — own watcher)
const workspaceConfigPath = resolve(contentDir, '.open-knowledge', 'config.yml');
const workspaceConfigWatcher = await startConfigFileWatcher(workspaceConfigPath, async (content) => {
  // 1. Check writeTracker for self-write detection
  if (content !== null) {
    const hash = contentHash(content);
    if (isSelfWrite(workspaceConfigPath, hash)) return;
  }
  // 2. Apply to __config__/workspace Y.Text via doc.transact(..., FILE_WATCHER_ORIGIN)
  const doc = hocuspocus.documents.get('__config__/workspace');
  if (!doc) return;
  doc.transact(() => {
    const ytext = doc.getText('source');
    ytext.delete(0, ytext.length);
    if (content !== null) ytext.insert(0, content);
  }, FILE_WATCHER_ORIGIN);
});

// User config (outside contentDir — separate watcher)
const userConfigPath = resolve(homedir(), '.open-knowledge', 'config.yml');
const userConfigWatcher = await startConfigFileWatcher(userConfigPath, async (content) => {
  /* mirror workspace flow with __user__/config.yml */
});
```

Both handles get added to the destroy() chain.

### Why chokidar (not parcel) for config?

1. **Single-file watching is mature in chokidar.** Documented + battle-tested.
2. **`awaitWriteFinish` is the canonical fix for atomic-rename `unlink + add` events.** The existing `startChokidarWatcher` does NOT enable this (it relies on a 50ms manual batch window for rename detection, which is a different problem). Config-watcher needs the option.
3. **`@parcel/watcher` would require subscribing to the parent dir.** That works but adds noise (we'd see events for sibling files like `auth.yml`, `principal.json`, lockfiles). Filtering by path inside the callback is fine but no gain over chokidar's direct single-file API.
4. **Existing chokidar import already in deps.** No new package.

### Cross-process fan-out

The user-global watcher gives I2 visibility into I1's writes (and vice versa). The `writeTracker` (file-watcher.ts:85) is per-process — I1's tracker has the hash from I1's own write, I2's tracker doesn't, so I2 correctly treats I1's write as external. **This is the whole bridge for cross-process config sync** (per `evidence/_init_worldmodel.md` Track 4).

### Confidence: HIGH on shape; MEDIUM on the lost-update edge

- HIGH: The single-file chokidar pattern is unambiguous; the boot wiring follows the existing `startWatcher` precedent.
- MEDIUM: Lost-update across processes (I1 writes A, I2 writes B simultaneously, B's atomic rename lands last and clobbers A) is the unresolved edge from `_init_worldmodel.md` Track 4. Pivot direction is "accept rare race"; this watcher implementation doesn't resolve it. Future hardening: per-host config write lock via `proper-lockfile`.

### Risks

- **R1.** Symlinks at `~/.open-knowledge/config.yml`. Chokidar follows them by default; `awaitWriteFinish` should coalesce target-rewrite events. Verification: test with `ln -s elsewhere ~/.open-knowledge/config.yml` and confirm no duplicate events.
- **R2.** `~/.open-knowledge/` doesn't exist on first run. Chokidar's `add` mode against a non-existent path waits for creation — fine, but verify that's the v3.x default (not the older "throws ENOENT" behavior).

---

## NQ18 — OTel span coverage for config layer

### Existing OTel pattern

Read directly:

1. **`telemetry.ts:152-176` `withSpan(name, options, fn)`.** The canonical wrapper. Returns a Promise; auto-records exceptions; sets span status. Used \~50 sites across the server (e.g. `persistence.ts:637, 753`, `file-watcher.ts:713`).

2. **`fs-traced.ts:73-145` traced fs wrappers.** `tracedWriteFile`, `tracedRename`, `tracedMkdir` (and `*Sync` variants). All emit `fs.<operation>` spans with `fs.path`, `fs.path.role`, `fs.bytes`. **Required for ANY production disk write** (CLAUDE.md STOP rule).

3. **Cardinality discipline.** `fs-traced.ts:32-53`:
   - `normalizeFsPath(p)` reduces full paths to last-two-segments. Bounded.
   - `classifyFsPath(p)` returns one of `~10 enum strings`: `shadow-repo` / `git` / `lock` / `principal` / `conflict` / `content-md` / `ok-internal` / `other`. Bounded.
   - **STOP rule**: don't emit unbounded-cardinality span attributes (raw paths, content, free-form strings).

4. **Namespace conventions.**
   - File-system ops: `fs.<operation>` per OTel semconv; attrs `fs.*`.
   - Repo-specific: `ok.<area>.<op>` (e.g. `ok.persistence.load.duration` histogram).
   - Sub-areas: `agent.*` / `shadow.*` / `persistence.*` / `doc.*` (CLAUDE.md).

### Proposed span set for config layer

| Span | Attributes (bounded) | Emitted at | Notes |
|---|---|---|---|
| **`config.bind`** | `config.scope` (enum: `workspace` \| `user`), `doc.name` (pre-validated synthetic) | `bindConfigDoc(provider, scope)` entry | One per Modal mount. Cheap. |
| **`config.patch`** (UI) | `config.scope`, `doc.name`, `config.patch.size` (bytes), `config.patch.path_count` (number of leaf paths in deep-partial), `config.outcome` (enum: `accepted` \| `rejected_l1`) | `ConfigBinding.patch(patch)` | `appliedPaths` go in span event, NOT attribute (cardinality risk). |
| **`config.patch`** (headless) | `config.scope`, `config.patch.size`, `config.patch.path_count`, `config.outcome` (enum: `accepted` \| `rejected_l2` \| `write_error`) | `writeConfigPatch(opts)` | Same span name, distinguished by `config.transport: 'fs'` vs `'ws'` attribute. |
| **`config.validate`** | `config.scope`, `config.validation.layer` (enum: `l1` \| `l2` \| `l3`), `config.validation.outcome` (enum: `valid` \| `yaml_parse` \| `schema_invalid` \| `scope_violation`), `config.issue_count` (number) | Each Zod `safeParse` call | `path-prefix` is risky — Zod issue paths can be unbounded (deeply-nested schema paths). Better: emit `issue_count` only; full issues go in span event. |
| **`config.persist`** | `config.scope`, `doc.name`, `config.outcome` (enum: `success` \| `validation_rejected` \| `disk_error`), `fs.bytes` | `onStoreDocument` config-doc branch (D45 L3) | Wraps the `tracedWriteFile` + `tracedRename` (those emit their own `fs.*` child spans). |
| **`config.revert`** | `config.scope`, `doc.name`, `config.revert.bytes` (LKG size) | When L3 validation fails and Y.Text is reverted via server-origin transaction | Should be rare; useful for alerting. |

### Cardinality-bounded attributes

**Safe (bounded)**:
- `config.scope` — 2 values (`workspace` | `user`)
- `config.validation.layer` — 3 values (`l1` | `l2` | `l3`)
- `config.outcome` — 4-5 values per span
- `config.transport` — 2 values (`fs` | `ws`)
- `doc.name` — 2 well-known synthetic values (`__config__/workspace`, `__user__/config.yml`)
- `fs.bytes` / `config.patch.size` — numeric, naturally bounded

**Risky → keep out of attributes; use span events instead**:
- Per-issue Zod `path` arrays — could be `appearance.theme` or `folders[12].frontmatter.tags[3]`. Path-prefix to first segment (`appearance`, `folders`, etc.) is bounded (~15 top-level keys) but couples the metric to schema shape. **Recommendation**: emit only `config.issue_count` as attribute; drop the per-issue paths into a span event payload (`span.addEvent('validation_failed', { issues: stringifiedJSON })`).
- Raw YAML content — never an attribute, never an event payload.

### Bounded attribute discipline — additional suggestions

- **`config.patch.path_count`**: use `Object.keys(deepFlatten(patch)).length`. Bounded by schema depth × breadth (roughly ≤ 50 for the current ConfigSchema).
- **`config.transport`**: distinguishes UI (`ws`) from headless (`fs`) call sites for the SAME `config.patch` span name. Lets a Tempo query filter "show me all UI config patches that got rejected at L1" without span-name proliferation.

### Recommendation

Adopt the 6-span set above. Wire each in the obvious site:
- `config.bind` — top of `bindConfigDoc`.
- `config.patch` — top of `ConfigBinding.patch` AND top of `writeConfigPatch`.
- `config.validate` — `withSpan('config.validate', { attributes: { layer, scope }}, () => ConfigSchema.safeParse(merged))` at three sites (Modal walker, headless write, persistence hook).
- `config.persist` — top of the persistence hook's config-doc branch (the new `handleConfigStore` helper from `evidence/server-side-validation-pattern.md`). It will internally call `tracedWriteFile`+`tracedRename` (which emit `fs.*` child spans).
- `config.revert` — wrapping the server-origin transaction inside the L3 rollback path.

All disk writes go through `tracedWriteFile` / `tracedRename` (CLAUDE.md STOP rule).

### Confidence: HIGH

The pattern is well-established. The proposed set follows the existing convention exactly (lazy histogram init, enum-only attrs, span events for unbounded data). Wiring is mechanical.

### Risks

- **R1.** If MCP tools are themselves spawning a separate process (and they often are: `cli/src/mcp/server-discovery.ts` detach-spawns `ok start`), trace context propagation across the spawn boundary requires `OTEL_TRACEPARENT` env-var carry. Out of scope for config spec; existing OTel pattern.
- **R2.** Zod `safeParse` itself is sync; wrapping in `withSpan` is fine — the existing `withSpanSync` variant exists for this case (`telemetry.ts:181-202`).

---

## Sources (web)

- [@parcel/watcher (npm)](https://www.npmjs.com/package/@parcel/watcher) — directory-recursive subscribe API
- [parcel-bundler/watcher (GitHub)](https://github.com/parcel-bundler/watcher) — confirms directory-rooting, no project-root constraint
- [paulmillr/chokidar (GitHub)](https://github.com/paulmillr/chokidar) — `watch(absolutePath)` for single files; `watcher.add()` for grow-set; `awaitWriteFinish` for atomic-rename coalescing
- [Files in parent directories are not watched (parcel#7673)](https://github.com/parcel-bundler/parcel/issues/7673) — Parcel.js bundler limitation, NOT `@parcel/watcher` library limitation

---

## Cross-NQ summary

| NQ | Recommendation | Confidence | Blocker |
|---|---|---|---|
| NQ1 | Separate `HocuspocusProvider` per config doc; mirror SystemDocSubscriber pattern. NOT pool. | HIGH | None |
| NQ2 | Reuse existing auth extension; no per-doc gating beyond what content docs get. Add `isConfigDoc()` short-circuits in agent-sessions / persistence. | HIGH | None |
| NQ4 | Move `ConfigSchema` to `@inkeep/open-knowledge-core`. Two-PR rollout with re-export bridge. | HIGH | None |
| NQ8 | Lazy first-write of `~/.open-knowledge/config.yml` via `writeConfigPatch`. NOT in `ok init`. Include FR-17 magic comment. Use atomic tmp+rename. | HIGH | None |
| NQ11 | New `startConfigFileWatcher(absPath, onChange)` helper using chokidar with `awaitWriteFinish`. Two callsites in boot.ts (workspace + user). | HIGH (shape) / MEDIUM (lost-update edge) | None for v0; lost-update is accepted |
| NQ18 | 6-span set: `config.bind` / `config.patch` / `config.validate` / `config.persist` / `config.revert`. Bounded enums only; per-issue Zod paths in span events not attrs. | HIGH | None |

No blockers across the cluster. All six are implementable using established codebase patterns (system-doc precedent, atomic-write precedent, OTel pattern, chokidar fallback). The migration is mechanical; the new code is well-scoped.
