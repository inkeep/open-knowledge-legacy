---
sources:
  - packages/app/components.json
  - packages/app/src/components/ui/dialog.tsx
  - packages/app/src/components/AuthModal.tsx
  - packages/app/src/components/CloneDialog.tsx
  - packages/app/src/components/NewItemDialog.tsx
  - packages/app/src/components/EditorHeader.tsx
  - packages/app/src/components/CommandPalette.tsx
  - packages/app/src/components/HelpPopover.tsx
  - packages/app/src/components/SystemDocSubscriber.tsx
  - packages/app/src/components/ThemeToggle.tsx
  - packages/cli/src/cli.ts
  - packages/cli/src/commands/init.ts
  - packages/cli/src/commands/preview.ts
  - packages/cli/src/commands/start.ts
  - packages/cli/src/content/init.ts
  - packages/cli/src/config/loader.ts
  - packages/cli/src/config/schema.ts
  - packages/cli/tsdown.config.ts
  - packages/cli/package.json
  - packages/cli/src/mcp/tools/index.ts
  - packages/cli/src/mcp/tools/edit-document.ts
  - packages/cli/src/mcp/tools/write-document.ts
  - packages/server/src/api-extension.ts
  - packages/server/src/cc1-broadcast.ts
  - packages/server/src/file-watcher.ts
  - packages/server/src/external-change.ts
  - packages/desktop/src/main/menu.ts
  - packages/desktop/src/main/index.ts
  - packages/desktop/src/main/navigator-window.ts
  - packages/desktop/src/main/window-manager.ts
  - packages/desktop/src/shared/ipc-events.ts
  - packages/app/tests/integration/attribution-sweep-coverage.test.ts
date: 2026-04-25
purpose: Catalog every existing OK code surface that the config-edit spec will integrate with. Source for the Proposed Solution + Decision Log sections.
---

# Evidence: Codebase integration points for config-edit-paths

## 1. shadcn Dialog substrate (READY)

shadcn UI is installed and the kit is full: `dialog.tsx`, `dropdown-menu.tsx`, `popover.tsx`, `sheet.tsx`, `command.tsx`, `switch.tsx`, `tooltip.tsx` — all at `packages/app/src/components/ui/`. `components.json:1-25` confirms `style: radix-nova`.

**Existing Dialog usages — patterns to mirror:**
- `AuthModal.tsx:516` — full sign-in modal
- `CloneDialog.tsx:418` — multi-step form modal (closest precedent for multi-section settings)
- `NewItemDialog.tsx:12,308` — small form using `<Dialog>`, `DialogHeader`, `DialogFooter`
- `DeleteConfirmationDialog.tsx:10` — confirmation pattern
- `ConflictResolver.tsx:128,153` — multi-pane resolver
- `ui/command.tsx:21,37,66` — `<CommandDialog>` composes shadcn Dialog with cmdk

**Implication:** No infrastructure work needed for the Modal substrate. Settings dialog can directly use `<Dialog>` + `<DialogContent>` + `<DialogHeader>` + `<DialogFooter>` from existing primitives.

## 2. Settings entry-point candidates (multiple available)

- **EditorHeader** (`EditorHeader.tsx:625-684`) right-side controls: GitFork, Save, History, OpenInAgentMenu, SyncStatusBadge, PresenceBar, **HelpPopover**, ThemeToggle. The HelpPopover (lines 1-60 of `HelpPopover.tsx`) is the closest "options menu" affordance — natural anchor for a "Settings…" submenu entry.
- **CommandPalette** (`CommandPalette.tsx:56-250`) — Electron-only (line 14: `window.okDesktop` undefined → never mounts). Adding a `<CommandGroup>` "Settings" with one `<CommandItem>` is one block of three lines. Hits Electron users naturally via Cmd-K.
- **Cmd-, shortcut: UNCONTESTED.** `grep -rn "metaKey.*comma|key === ','"` returned zero matches. Conventional Settings shortcut available without conflict.
- **Other global keydown listeners**: `App.tsx:88`, `ui/sidebar.tsx:97` only.

## 3. CLI structure (additive)

- Commander v14 root at `packages/cli/src/cli.ts:40-120`. Subcommands registered via `program.addCommand()` (lines 86-118).
- Pattern (`packages/cli/src/commands/preview.ts:1-44`): module exports `xxxCommand(getConfig: () => Config): Command` returning `new Command(...)`.
- A new `commands/config.ts` returning `new Command('config').addCommand(new Command('validate').action(...))` slots in directly.
- `--json` precedent at `status.ts:122`. Exit codes via `process.exitCode = 1` (preview.ts:34, init.ts:719).
- `loadConfig()` (`loader.ts:67`) throws on Zod parse failure with multi-line "Invalid configuration:\n  path: message\n..." format. A `validate` subcommand wants its own try/catch to format errors nicely instead of stack-tracing.

## 4. `ok init` scaffolding (READY for magic-comment add)

- `runInit()` at `packages/cli/src/commands/init.ts:385-487` orchestrates `ensureProjectGit` + `initContent` + per-editor MCP config + `.claude/launch.json` + `upsertRootInstructions`.
- `initContent(cwd)` (init.ts:400 → `packages/cli/src/content/init.ts:380`) scaffolds `.open-knowledge/` files including `config.yml`.
- **`config.yml` template lives at `packages/cli/src/content/init.ts` constant `CONFIG_YML_CONTENT`** starting near line 89, referenced at line 377. Magic comment line goes at the top of this constant.
- **`init` does NOT create `~/.open-knowledge/`** (init.ts:387-388). Only workspace `<cwd>/.open-knowledge/`. `auth/token-store.ts:85` does write to `~/.open-knowledge/auth.yml` ad-hoc but no general "ensure user dir" helper exists. **PARTIAL: a small `mkdirSync(homedir/.open-knowledge, recursive: true)` helper would be the first writer.**

## 5. `__system__` CC1 broadcaster (additive)

- `CC1Broadcaster` at `packages/server/src/cc1-broadcast.ts:25-96`. Single API: `broadcaster.signal(channel: string)` (line 36) — debounced 100ms (line 11).
- Channels in use: `'files'`, `'backlinks'`, `'graph'` (signaled in `standalone.ts:208` via `signalChannel` helper); `'sync-status'` (signaled by sync-engine.ts).
- Adding `'config'` is **purely additive** — string literal, no type registration; `CC1Signal.ch` is `string` (line 21).
- Client subscribe: `packages/app/src/components/SystemDocSubscriber.tsx:49-178` mounts a `HocuspocusProvider` for `__system__` and routes payloads through `parseCC1Signal`. **Adding `'config'` requires a parallel client branch** in the existing channel routing (lines 73-80 today handle `'files'`/`'backlinks'`/`'graph'`).

## 6. HTTP API extension (where to register `/api/config/patch`)

- `api-extension.ts` route registry at lines **4918-4967** in a single `routes: Record<string, handler>` literal. Dispatched through Hocuspocus `onRequest` extension (line 4976). Adding a new route is one entry.
- **Standard write-handler shape** (e.g. `handleAgentWrite` line 1320, `handleAgentPatch` line ~1900):
  1. `if (req.method !== 'POST') return 405`
  2. `await readBody(req)` → JSON parse → 400 on error
  3. body validation
  4. `extractAgentIdentity(body)` (`api-extension.ts:1146`) — **enforced by `tests/integration/attribution-sweep-coverage.test.ts:100-109`**. Any new mutating POST handler MUST call this.
  5. Response shape: `json(res, 200, {ok: true, ...})` or `json(res, 4xx, {ok: false, error: ...})`. **`{ok, errors[]}` (plural) is NEW — current 50+ routes use `{ok, error: string}` (singular).** Establishing a multi-error precedent is a deliberate design choice for the spec.
- **CORS** (lines 4980-5019): origin allowlist with curl/CLI (no Origin), Electron `file://` (`Origin: null`), and loopback origins permitted; anything else 403.
- **Loopback + Host-header gate** (`api-extension.ts:2877-2921` for `/api/metrics/agent-presence`, lines 2923-2956 for `/api/workspace`):
  ```ts
  if (!isLoopbackAddress(req.socket.remoteAddress)) → 403 'loopback-required'
  if (!isAllowedWorkspaceHostHeader(req.headers.host)) → 403 'host-header-not-allowed'
  ```
- **`/api/local-op/*` use a stricter `checkLocalOpSecurity(req, res, json)` helper** (`api-extension.ts:4894`) — heavier gate (DNS-rebinding + Host + loopback in one). **Right precedent for security-sensitive config edits.**

## 7. MCP tool registration (canonical thin-wrapper)

- Registry at `packages/cli/src/mcp/tools/index.ts:144-278`. Pattern: each tool exports `register(server, deps)` + `DESCRIPTION` constant.
- Canonical thin-HTTP-wrapper (`edit-document.ts:45-133`, `write-document.ts:43-126`):
  1. `server.tool('name', DESCRIPTION, {zod schema}, async (args) => { ... })`
  2. `await resolveProjectServerContext(deps.resolveCwd, deps.config, deps.serverUrl, args.cwd)` (line 70/54)
  3. If `!url` → `textResult(HOCUSPOCUS_NOT_RUNNING_ERROR, true)`
  4. Build payload, threading identity from `deps.identityRef.current`
  5. `await httpPost(url, '/api/agent-patch', payload)`
  6. Format result; optionally compute preview URL
- **`identityRef` threading**: `RegisterAllToolsOptions` (index.ts:129-142) carries `identityRef?: { current: AgentIdentity }`. Write tools take it; read tools don't. A new `set_config.ts` (mutates) takes it; `get_config.ts` (reads) doesn't.

## 8. Electron menu + Navigator (READY)

- **`packages/desktop/src/main/menu.ts:69-196`** `buildMenuTemplate(deps)` — pure function; rebuilt on recents change (index.ts:365).
- **macOS Settings…** lands in app menu submenu (lines 96-108, between `'about'` and first `'separator'`). Currently no Preferences/Settings item.
- **Windows/Linux**: typically File menu or dedicated position. **PARTIAL** — both placements need `deps.openSettings()` callback added.
- **`navigator-window.ts:30-53`** confirms Navigator has NO utility process attached. Empty `--ok-collab-url=` (line 39). **Project-scoped settings should NOT render in Navigator.**
- **`ok:menu-action` channel is fully wired but unused.** Defined in `packages/desktop/src/shared/ipc-events.ts:25-26`; preload listens at `packages/desktop/src/preload/index.ts:72-73`; main-side dispatch via `sendToRenderer(webContents, 'ok:menu-action', payload)` (`shared/ipc-send.ts:29`). A "Settings…" menu item would be the first user.

## 9. File watcher (NOT watching config)

- `file-watcher.ts:725-746` `parcel.subscribe(contentDir, ...)` — **watches `contentDir` only — does NOT watch `.open-knowledge/`**.
- `classifyEvents` (line 163) skips files via `isSupportedDocFile` (line 174) — `.md`/`.mdx` only.
- **`external-change.ts:57+`** `applyExternalChange(hocuspocus, docName, content)` — strictly for CRDT documents, NOT applicable to YAML config.
- **Config external-edit detection: NONE today.** A NEW watcher (or a poll-on-read shim) would be needed to detect external edits to config.yml.

## 10. Build pipeline (additive: `dist/config-schema.json`)

- CLI build at `packages/cli/tsdown.config.ts`: `entry: { cli, index }`, format esm, dts true. Outputs `dist/cli.mjs`, `dist/index.mjs`.
- `dist/public/` shipped via `"build:assets": "cp -r ../app/dist dist/public"` (`packages/cli/package.json:34`). Combined `build`: `bun run build:cli && bun run build:assets`.
- Full `dist/` published via `"files": ["dist", "!dist/**/*.map"]` (package.json:24-26).
- **Cleanest insertion for Tier 1 schema export**: extend `build` script — `"build": "bun run build:cli && bun run build:assets && bun run build:schema"` with a `build:schema` script that imports `ConfigSchema` and writes `JSON.stringify(z.toJSONSchema(ConfigSchema, { target: 'draft-07' }))` to `dist/config-schema.json`.
- Zod schema already exported (`schema.ts:23-127`).
- **Zod v4 `z.toJSONSchema` API is unused in OK today** — verify behavior matches expectations before specifying (already covered by the empirical test at `reports/config-edit-paths/evidence/d2-empirical-zod-tojsonschema.md`).

## 11. localStorage prefs vs config.yml (storage-class split)

Renderer-side localStorage keys (NOT in config.yml):
- `'ok-theme-v1'` → `next-themes` (`main.tsx:88`)
- `'ok-editor-mode-v1'` → editor visual/source toggle (`use-editor-mode.ts:26`)
- `'ok-pin-v1'` → pinned-doc state (`DocumentContext.tsx:132`)
- Likely `'ok-graph-*'` → graph panel state

These are pure user-prefs (per-tab, browser-local), distinct from `config.yml` (per-project, on-disk, server-loaded). UX-wise the Settings dialog could surface both but they're storage-class-different — separate write paths, separate semantics.

## Cross-cutting observations

1. **Pattern divergence: write-handler response shape.** Existing routes return `{ok, error?: string}` (singular). The spec's intended `{ok, errors[]}` (plural array) shape is **new** — establishes a precedent for richer Zod-style errors.
2. **Identity threading is enforced.** Attribution sweep test at `tests/integration/attribution-sweep-coverage.test.ts:100-109` will fail if a new mutating POST handler skips `extractAgentIdentity`. Spec must thread agent identity through `applyConfigPatch` even though the file isn't a CRDT doc.
3. **CC1 channel `string` is loose.** No type registry; typos compile. Adding `'config'` requires updating the SystemDocSubscriber routing OR centralizing the channel set as a discriminated union in `cc1-broadcast.ts`.
4. **Config loader has no proactive change detection.** 1s TTL cache via `createProjectConfigResolver` (loader.ts:144-182) means MCP sessions pick up changes on next read — but no notification reaches the running server, the editor UI, or other MCP clients. Spec needs a cache invalidation/reload story.
5. **Project- vs user-global config asymmetry.** `loadConfig` reads BOTH; `init` only scaffolds workspace. No code today writes `~/.open-knowledge/config.yml`. A user-global Settings UI would be the first writer.
6. **Cmd-, is uncontested** — clean shortcut for "open Settings."
7. **`ok:menu-action` channel is wired and unused** — Settings would be the first user; no IPC plumbing work needed.
8. **MCP `set_config` is the first mutating tool that touches workspace metadata** (not CRDT documents). Either invents a new HTTP endpoint that bypasses the agent-write rails, or routes through them with a config-shaped subtype.
