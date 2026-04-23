---
title: "Codebase surface map — what already exists"
description: "Inventory of existing code surfaces this spec will extend: IPC channel registry, bridge contract, shell allowlist, candidate component hosts for the Open in dropdown."
date: 2026-04-21
sources:
  - packages/desktop/src/shared/ipc-channels.ts
  - packages/desktop/src/shared/bridge-contract.ts
  - packages/desktop/src/main/shell-allowlist.ts
  - packages/core/src/desktop-bridge.ts
  - packages/app/src/components/
---

# Codebase surface map

Read-only inventory of what exists on `main` as of baseline commit `a1e74cb8` (Electron M1 just shipped). This file records WHAT is there; the spec's §Architecture section specifies WHAT to add.

---

## Electron IPC layer

**Hand-rolled typed discriminated union (D14).** No tRPC/tipc. Channels live in `packages/desktop/src/shared/ipc-channels.ts` as `RequestChannels`; preload exposes typed `invoke<K>()`.

### Existing `RequestChannels` at baseline

```ts
'ok:dialog:open-folder':   { args: []; result: string | null };
'ok:dialog:create-folder': { args: []; result: string | null };
'ok:shell:open-external':  { args: [url: string]; result: undefined };
'ok:clipboard:write-text': { args: [text: string]; result: undefined };
'ok:project:get-info':     { args: []; result: OkDesktopConfig };
'ok:project:list-recent':  { args: []; result: RecentProject[] };
'ok:project:open':         { args: [ProjectOpenRequest]; result: undefined };
'ok:project:close':        { args: []; result: undefined };
```

8 channels total. Scale-match trigger (FU-3 in that file's docstring): at >20 channels, migrate to `@electron-toolkit/typed-ipc`. This spec adds **2 channels** (see §Spec-additions below — updated 2026-04-21 post-audit L9), bringing the total to 10 — well within the hand-rolled budget.

### Spec-additions to IPC channels

- `ok:shell:detect-protocol` — new. Args: `[scheme: string]`. Result: `{ installed: boolean; displayName?: string }`. Wraps Electron's `app.getApplicationInfoForProtocol(scheme)` with a timeout.

No changes needed to `ok:shell:open-external` — the allowlist extension is internal to the main-process handler (see `shell-allowlist.ts` below).

### Possibly needed (Cursor two-step dispatch)

Option A: introduce `ok:shell:spawn-allowlisted` channel with a per-command allowlist (e.g. `cursor`, `code`, `codex`) — very narrow. Spec decides.
Option B: add to existing `ok:shell:open-external` a way to express "launch target app with a path argument" (e.g. `app://<bundle-id>?path=<abs>`). Non-standard; rejected preliminarily.

---

## Bridge contract (renderer-facing)

### Current shape (`packages/desktop/src/shared/bridge-contract.ts`)

```ts
interface OkDesktopBridge {
  readonly config: OkDesktopConfig;
  onProjectSwitched(cb): OkUnsubscribe;
  onMenuAction(cb): OkUnsubscribe;
  dialog: { openFolder(), createFolder() };
  shell:  { openExternal(url): Promise<void> };       // <-- the outbound dispatch primitive
  clipboard: { writeText(text): Promise<void> };
  project: { listRecent(), open(req), close() };
  readonly platform: 'darwin' | 'win32' | 'linux';
  readonly appVersion: string;
}
```

### Duplication note (important)

The same interface is duplicated at `packages/core/src/desktop-bridge.ts` because moving types to core's export map pulls core's full compilation tree (markdown, CRDT bridge) into desktop's TS program via `moduleResolution: bundler`. A contract-equality test at `packages/desktop/tests/integration/bridge-contract.test.ts` (from US-010) keeps them aligned.

**Implication for this spec:** any new bridge surface (e.g. `shell.detectProtocol`) must be added to BOTH files. The contract-equality test catches drift.

### Spec-additions to bridge

```ts
shell: {
  openExternal(url: string): Promise<void>;       // existing
  detectProtocol(scheme: string): Promise<{ installed: boolean; displayName?: string }>;  // NEW
}
```

No new top-level namespace needed — `shell.*` is the existing home for external-app dispatch primitives.

---

## Shell allowlist

`packages/desktop/src/main/shell-allowlist.ts` (D47 defense-in-depth against Shabarkin 2022 "1-click RCE" class). Current surface:

```ts
const ALLOWED_SCHEMES: ReadonlySet<string> = new Set([
  'https:', 'http:', 'mailto:', 'openknowledge:',
]);
```

`checkOutboundUrl(url)` returns `{ ok: boolean; reason?: string }`. Reasons: `'invalid-url'`, `'scheme-not-allowed: <scheme>'`.

### Spec-additions to allowlist

```ts
// After extension:
const ALLOWED_SCHEMES: ReadonlySet<string> = new Set([
  'https:', 'http:', 'mailto:', 'openknowledge:',
  'claude:',      // NEW — Claude Desktop deep-link (cowork/new, code/new, claude.ai/*)
  'codex:',       // NEW — OpenAI Codex Desktop deep-link (new, threads)
  'cursor:',      // NEW — Cursor IDE deep-link (anysphere.cursor-deeplink/*)
]);
```

Each NEW entry gets a JSDoc comment per TQ6 (exact shape spec'd in SPEC.md §6.6).

### Test assertion shape

Existing test (hypothesized; verify at Iterate phase) is subset-based. Spec requires **exact-set match**:

```ts
expect([...ALLOWED_SCHEMES].sort()).toEqual(
  ['claude:', 'codex:', 'cursor:', 'http:', 'https:', 'mailto:', 'openknowledge:']
);
```

This prevents silent scope creep when future specs add schemes without going through the spec-review gate.

---

## Candidate component hosts for "Open in…" dropdown

Files at `packages/app/src/components/` that would host the affordance:

- **`EditorHeader.tsx`** — top-of-doc header. Primary candidate per story PQ1.
- **`DocPanel.tsx`** — doc body wrapper. Could host a hover-over-header action.
- **`CommandPalette.tsx`** — command palette entries. Story PQ1 lean includes this as a secondary surface.
- **`FileTree.tsx` / `FileSidebar.tsx`** — left-sidebar context menu. Story PQ1 has this as "optional."

Reference for existing header actions: look at how "Save Version" and "Share" are surfaced (TBD — verify during Iterate phase).

### New components this spec adds

- `packages/app/src/components/handoff/OpenInAgentMenu.tsx` — the dropdown itself. Uses `ui/dropdown-menu.tsx` (shadcn).
- `packages/app/src/components/handoff/OpenInAgentMenuItem.tsx` — individual row; handles disabled state + tooltip.
- `packages/app/src/lib/handoff/dispatch.ts` — the single outbound-dispatch module (I6 / AC9 asserts zero other dispatch sites).

---

## Web-host server endpoints

`packages/server/src/api-extension.ts` is the existing HTTP API factory for the Hocuspocus server. Current endpoints (partial list from project CLAUDE.md):

- `GET /api/document?docName=...`
- `POST /api/agent-write`
- `POST /api/agent-write-md`
- `POST /api/save-version`
- `GET /api/link-graph`
- etc.

### Spec-additions to API

- `GET /api/installed-agents` — returns `{ claude: bool, codex: bool, cursor: bool }`. Backed by per-OS shell probes (osascript / reg query / xdg-mime query). Caching: boot-time + on-demand refresh.
- `POST /api/handoff/open-folder` — narrow Cursor two-step endpoint. Body: `{ target: 'cursor', path: string }`. Validates `target` against a 1-entry allowlist; validates `path` is inside the OK content dir (or flagged allowed); spawns `cursor <path>`. Returns `{ ok: true }` or `{ ok: false, reason }`. 2s timeout.

---

## Changeset (future D47 extension log)

After this spec ships, append to `specs/2026-04-11-electron-desktop-app/meta/_changelog.md`:

```md
## 2026-04-XX — D47 allowlist extension (from open-in-agent-desktop spec)

Extended `shell-allowlist.ts` ALLOWED_SCHEMES from
{https:, http:, mailto:, openknowledge:}
to
{https:, http:, mailto:, openknowledge:, claude:, codex:, cursor:}.

Rationale: AI-desktop-app deep-link handoff (Claude / Codex / Cursor).
Each scheme's outbound payload is built by OK's per-target URL-builder
(`packages/core/src/handoff/{claude,codex,cursor}-url.ts`), not
user-supplied. D47's "narrow attack surface + deliberate allowlist"
posture preserved.

See: specs/2026-04-21-open-in-agent-desktop/SPEC.md §6.6 (allowlist diff),
§13 (tests), §9 (decision log).
```

Matches XQ4 ASSUMED — format confirmed here; exact date stamps at ship time.

---

## What I did NOT find at baseline

- No existing `handoff/` directory anywhere (neither `packages/core/src/handoff/` nor `packages/app/src/lib/handoff/`). This spec creates them from scratch.
- No existing URL-builder pattern to mirror. Prior art is external (Mintlify switch-case, Linear `AIActions.js`).
- No existing install-detection helper on web-host side. `/api/installed-agents` is a new endpoint class.
- No existing `CFBundleDocumentTypes` / `folder=` path resolution pattern in OK's codebase. The "what's this doc's folder?" question is spec-to-decide (SQ4 in the /spec outline message).

---

## Post-audit notes (2026-04-21)

- **Channel count (audit L9):** spec now adds 2 channels (not 1), total 10.
- **installUrl values (audit L10):** `https://claude.com/download`, `https://openai.com/codex`, `https://cursor.com/` used in `BUILT_IN_TARGETS` are not pinned in upstream research evidence. Spot-check via `curl -I` at implementation time before ship. OQ-B tracks the longer-term decision between vendor-page links vs OK-hosted install-hint docs.
