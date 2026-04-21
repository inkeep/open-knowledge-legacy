---
title: "Open in Agent Desktop — one-click handoff from OK to Claude / Codex / Cursor"
description: "Technical spec for the Open in ⌄ dropdown action that hands off an OK wiki page to Claude Cowork, Claude Code (Epitaxy), OpenAI Codex Desktop, or Cursor via atomic URL schemes (single-call for Claude + Codex; two-step-with-modal for Cursor). Minimal prompt + open-knowledge MCP hint; disabled-with-tooltip when target not installed; dual-host parity (Electron + web)."
status: "DRAFTING — §5-§13 populated, awaiting audit"
baselineCommit: "a1e74cb8"
createdAt: 2026-04-21
updatedAt: 2026-04-21
story: "../../stories/open-in-agent-desktop/STORY.md"
upstreamResearch: "../../reports/deep-linking-ai-desktop-apps-2026/REPORT.md"
---

# SPEC: Open in Agent Desktop

**Baseline commit:** `a1e74cb8`.

---

## 1. Problem (pointer)

See [`../../stories/open-in-agent-desktop/STORY.md`](../../stories/open-in-agent-desktop/STORY.md) for SCR framing, 5-probe stress test, and value/goals. One-line: **every OK user runs a six-step manual loop to hand an OK page off to Claude / Codex / Cursor today; this ships a one-click dropdown that does it atomically via URL scheme + install-detection + graceful degradation.**

Upstream research (authoritative on all URL shapes, encoding, bundle inspection): [`../../reports/deep-linking-ai-desktop-apps-2026/REPORT.md`](../../reports/deep-linking-ai-desktop-apps-2026/REPORT.md).

---

## 2. Goals and Non-Goals

**Goals.**

- One-click handoff for Claude Cowork, Claude Code (Epitaxy), Codex, Cursor — all four rows in v0 parallel ship (PQ3 LOCKED).
- OK auto-composes a **minimal** prompt (path + open-knowledge MCP hint) — no user prompt-input field (PQ5 LOCKED + SQ1 DIRECTED).
- Dual-host parity: Electron + `open-knowledge start` web build (I7).
- Disabled-button-with-tooltip when target not installed (PQ6 LOCKED). Claude rows expose "Open in claude.ai →" secondary affordance inside the tooltip.
- Security: extend `shell.openExternal` allowlist to `{claude:, codex:, cursor:}` with per-scheme rationale (I6, TQ6 DIRECTED).

**Non-Goals (v0).**

- User-typed prompt field (PQ5).
- Frontmatter / excerpt / body included in composed prompt (SQ1 DIRECTED — agent uses native attachment + MCP tools).
- URL-length-cap UX (PQ7 — trivially satisfied by minimal composer).
- Telemetry / phone-home (XQ3).
- Embedding-aware UI (XQ5 parked P2).
- Zed / Windsurf / VS Code handoff (NOT NOW).
- MCP-install-via-URL handoff (NOT NOW — separate story).
- User-added handoff targets / handoff registry (NOT NOW).
- Auto-execute URL params (NEVER — I5).
- OK-MCP configuration prerequisite enforcement (DIRECTED — v0 assumes MCP is set up on dogfood machines; if not, agent falls back to native file-read tools on `file=`/`path=`; not blocked).

---

## 3. Invariants (carried from story)

I1–I7 as written in [story §Invariants](../../stories/open-in-agent-desktop/STORY.md#invariants). Three adjust based on SQ1 DIRECTED (minimal composer):

- **I3 (encoding correctness):** narrowed — the only free-form input the composer emits is the doc's relative path; only `%`/em-dash/unicode path edge cases matter. Still enforced; test corpus in §13.
- **I8 (implied from PQ7):** trivially satisfied. Minimal composer output is <500 chars; Cursor's 8K `text=` cap has 15× headroom.
- **All other invariants unchanged.**

---

## 4. Acceptance Criteria (carried from story, adjusted)

AC1–AC11 as written in [story §Acceptance criteria](../../stories/open-in-agent-desktop/STORY.md#acceptance-criteria), with two adjustments from SQ1 DIRECTED:

- **AC7 (encoding correctness):** test corpus is **paths only** (`%`, em-dashes, spaces, unicode). No structured-prompt-content test corpus needed.
- **AC10 (composer budget):** test asserts composer output stays under a **fixed 1 KB character budget** (not per-target variable). Every page in the corpus fits by construction.

---

## 5. Architecture

### 5.1 Module layout

```
packages/core/src/handoff/                      (new; shared, no React, no Node APIs)
  types.ts                — HandoffTarget, HandoffPayload, HandoffOutcome,
                            InstallState, HandoffTargetDescriptor
  prompt-composer.ts      — composePrompt(docContext) → string
  registry.ts             — BUILT_IN_TARGETS: ReadonlyArray<HandoffTargetDescriptor>
                            — the source of truth for "what agents ship in v0"
  claude-url.ts           — buildClaudeUrl({mode:'cowork'|'code'}, payload) → string
  codex-url.ts            — buildCodexUrl(payload) → string
  cursor-url.ts           — buildCursorUrl(payload) → string
  web-fallback-url.ts     — buildClaudeAiWebUrl(prompt) → string (for PQ6 "Open in claude.ai →")
  index.ts                — barrel

packages/desktop/src/main/
  shell-allowlist.ts      — EXTENDED: +claude: +codex: +cursor: with JSDoc per §6.6
  ipc-handlers.ts         — NEW handler: ok:shell:detect-protocol

packages/desktop/src/shared/
  ipc-channels.ts         — NEW channel: ok:shell:detect-protocol
  bridge-contract.ts      — EXTENDED: shell.detectProtocol(scheme)

packages/core/src/desktop-bridge.ts              (DUPLICATE — kept in sync via contract-equality test)
  bridge-contract.ts mirror: shell.detectProtocol added

packages/server/src/api-extension.ts             (new endpoints)
  GET  /api/installed-agents     → { claude: bool, codex: bool, cursor: bool }
  POST /api/handoff/open-folder  → { ok: bool, reason?: string }  [target: 'cursor' ONLY in v0]

packages/app/src/lib/handoff/                    (new)
  dispatch.ts             — ONE outbound-dispatch entry point (AC9 asserts no other sites)
  install-detect.ts       — unified Electron + web install-detection with cache policy
  cursor-two-step.ts      — Cursor two-step FSM (spawn folder → settle via workspace= safety-net → fire prompt URL)

packages/app/src/components/handoff/             (new)
  OpenInAgentMenu.tsx     — dropdown component (shadcn/ui dropdown-menu)
  OpenInAgentMenuItem.tsx — per-target row with disabled/tooltip states
  useInstalledAgents.ts   — React hook — boot-time + on-open + async-refresh per SQ5 DIRECTED

packages/app/src/components/{EditorHeader, CommandPalette, FileTree}.tsx
  EXTENDED: all three surface hosts mount OpenInAgentMenu (SQ6 DIRECTED)
```

### 5.2 System context (Electron host)

```
 ┌──────────────────────────────────────────────────────────────────┐
 │  User clicks "Open in Claude Cowork" in EditorHeader dropdown    │
 └────────────────────────────┬─────────────────────────────────────┘
                              ▼
           ┌──────────────────────────────────┐
           │  packages/app/src/lib/handoff/   │
           │  dispatch.ts                     │
           │  (ONE outbound entry point —     │
           │   AC9 asserts no other sites)    │
           └────┬───────────────────────┬─────┘
                │                       │
                │ buildClaudeUrl()      │ buildCursorUrl()
                │ (from core/handoff)   │ two-step: spawn + settle + fire
                ▼                       ▼
       ┌────────────────┐      ┌──────────────────────┐
       │ shell.         │      │ ok:shell:            │
       │ openExternal   │◄─────│ spawn-allowlisted?   │
       │ (existing IPC) │      │ (SQ4 / TQ4 → §6.5)   │
       └────────┬───────┘      └──────────┬───────────┘
                │                         │
                ▼                         ▼
        checkOutboundUrl()       server-side /api/handoff/open-folder
        (D47 allowlist, §6.6)    (WEB only — not Electron host)
                │                         │
                ▼                         ▼
         OS default handler        spawn("cursor", [path])
         (Claude.app, etc.)
```

### 5.3 System context (web host — `open-knowledge start`)

```
 ┌──────────────────────────────────────────────────────────────────┐
 │  User clicks "Open in Cursor" in EditorHeader dropdown (browser) │
 └────────────────────────────┬─────────────────────────────────────┘
                              ▼
           ┌──────────────────────────────────┐
           │  packages/app/src/lib/handoff/   │
           │  dispatch.ts                     │
           └────┬───────────────────────┬─────┘
                │                       │
                │                       │ two-step step 1:
                │                       │ POST /api/handoff/open-folder
                │                       ▼
                │       ┌────────────────────────────────┐
                │       │ packages/server/api-extension  │
                │       │ validates target='cursor',     │
                │       │ path ∈ OK content dir          │
                │       └──────────────┬─────────────────┘
                │                      │
                │                      ▼
                │             spawn("cursor", [path])  (2s timeout)
                │                      │
                ▼                      ▼ (settle via workspace= safety-net)
       anchor-click <a href=           anchor-click prompt URL
       "claude://cowork/new?...">      "cursor://anysphere.cursor-deeplink/prompt?text=..."
       .click()
       (TQ7 LOCKED — most reliable non-http scheme dispatch in browsers)
                │                      │
                ▼                      ▼
         OS routes to target app
```

### 5.4 Sequence diagrams

**Claude Cowork (Electron):**

```
App        dispatch     coreHandoff     desktopBridge    Electron main       Claude.app
 │ click      │              │                │                │                 │
 │───────────►│              │                │                │                 │
 │            │ compose      │                │                │                 │
 │            │─────────────►│                │                │                 │
 │            │  prompt      │                │                │                 │
 │            │◄─────────────│                │                │                 │
 │            │ buildClaudeUrl({mode:'cowork'},│                │                 │
 │            │  {projectDir, docPath, prompt})                │                 │
 │            │─────────────►│                │                │                 │
 │            │  url         │                │                │                 │
 │            │◄─────────────│                │                │                 │
 │            │ shell.openExternal(url)       │                │                 │
 │            │─────────────────────────────►│                │                 │
 │            │                                │ checkOutboundUrl (D47 ext)     │
 │            │                                │──────────────────────────────► │
 │            │                                │                │ OS dispatch   │
 │            │                                │                │ via LaunchSvcs│
 │            │                                │                │─────────────► │
 │            │                                │                │               ▼
 │            │                                │                │       Cowork tab foregrounds
 │            │                                │                │       prompt pre-filled
 │            │                                │                │       no modal
 │            │◄─── resolve Promise<void> ──── │                │
```

**Cursor two-step (web host):**

```
Browser        dispatch      server/api        shell (server)   OS
  │ click          │              │                  │           │
  │───────────────►│              │                  │           │
  │                │ step 1: POST /api/handoff/open-folder        │
  │                │─────────────►│                  │           │
  │                │              │ validate target & path       │
  │                │              │──────────────────►│          │
  │                │              │                  │ spawn("cursor", [path])
  │                │              │                  │──────────►│
  │                │              │                  │           │ Cursor workspace opens
  │                │              │ {ok:true}        │           │
  │                │◄─────────────│                  │           │
  │                │ step 2 (via useInstalledAgents hook's        │
  │                │  on-open-refresh; ~100ms settle):            │
  │                │ anchor-click "cursor://...prompt?            │
  │                │   text=...&workspace=<basename>&mode=agent" │
  │                │                                              │
  │                │ OS routes to Cursor (workspace= safety-net   │
  │                │  pins to the just-opened window)             │
  │                │                                              ▼
  │                │                         CursorJack modal appears
  │                │                         prompt clean-text, mode=agent
```

---

## 6. Core Contracts

### 6.1 Types

`packages/core/src/handoff/types.ts`:

```typescript
/**
 * Supported handoff targets. Four in v0 (PQ2 + PQ3 LOCKED).
 * See STORY §Invariants NOT NOW for out-of-v0 targets (Zed, Windsurf, VS Code).
 */
export type HandoffTarget =
  | 'claude-cowork'   // Claude Desktop → Cowork tab via claude://cowork/new
  | 'claude-code'     // Claude Desktop → Code (Epitaxy) tab via claude://code/new
  | 'codex'           // OpenAI Codex Desktop via codex://new
  | 'cursor';         // Cursor IDE via cursor:// two-step

/**
 * Data carried from the UI to the URL builder.
 * Minimal-by-construction per SQ1 DIRECTED:
 *   - `projectDir` and `docPath` are absolute paths (OS-native separator).
 *   - `prompt` is the OK-composed template (see prompt-composer.ts).
 * No title, frontmatter, or excerpt — agent reads context via file=/path=/MCP.
 */
export interface HandoffPayload {
  target: HandoffTarget;
  projectDir: string;   // e.g. /Users/andrew/Documents/code/open-knowledge
  docPath: string;      // e.g. /Users/andrew/.../open-knowledge/specs/foo/SPEC.md
  prompt: string;       // OK-composed; <1 KB
}

/**
 * Outcome of a dispatch attempt. ok:true does NOT guarantee the target app
 * actually launched — `shell.openExternal` resolves on handoff success, not
 * on target-app-visible-to-user. This matches Promise semantics of the
 * underlying Electron API.
 */
export type HandoffOutcome =
  | { ok: true; degradedFeatures?: ReadonlyArray<'prompt' | 'folder' | 'file'> }
  | { ok: false; reason: HandoffFailureReason; detail?: string };

export type HandoffFailureReason =
  | 'not-installed'
  | 'scheme-blocked'             // allowlist rejected (shouldn't happen post-extension; defensive)
  | 'web-endpoint-error'         // /api/handoff/open-folder failed (Cursor web two-step)
  | 'invalid-payload'            // non-absolute path, empty prompt, etc.
  | 'dispatch-error';            // openExternal rejected / unexpected

/**
 * Install-detection result. `installed: null` means we haven't checked yet
 * (initial state before first probe completes). Consumers render as disabled
 * while null.
 */
export interface InstallState {
  installed: boolean | null;
  displayName?: string;        // populated on Electron when available
  lastChecked?: number;        // ms since epoch (for cache policy per SQ5)
}

/**
 * Context passed to prompt-composer. Deliberately minimal — see SQ1 DIRECTED.
 */
export interface DocContext {
  /** Path relative to the OK content dir, forward-slash normalized.
   *  e.g. "specs/2026-04-21-open-in-agent-desktop/SPEC.md" */
  relativePath: string;
}

/**
 * Registry descriptor — one entry per handoff target.
 *
 * Source of truth for "what agents ship in v0" and the extensibility
 * foundation for the forward Future Work item "third-party handoff plugin API."
 *
 * Per SQ9 DIRECTED (2026-04-21 Andrew): all hardcoded per-target logic in
 * v0 collapses into descriptor entries. The dropdown renders from the
 * registry; install detection enumerates the registry's schemes; shell
 * allowlist has a registry-coverage test; unit tests iterate the registry
 * for encoding edge cases. Adding a 5th target (Zed, Windsurf, ...) is
 * "add a descriptor + write a URL builder + add to allowlist exact-set"
 * — no changes to UI, dispatch, or install-detection code.
 */
export interface HandoffTargetDescriptor {
  /** Stable ID — used as dropdown key, test matrix key, analytics label
   *  (if ever — XQ3 LOCKED no phone-home in v0). Kebab-case. */
  readonly id: string;

  /** User-facing display name — fills the "Open in <displayName>" string. */
  readonly displayName: string;

  /** URL scheme(s) to probe for install detection.
   *  'claude-cowork' and 'claude-code' both list ['claude:'] because the
   *  Claude Desktop app is a single binary. Cursor lists ['cursor:']. */
  readonly schemes: ReadonlyArray<string>;

  /** Dispatch strategy. Two variants in v0; third-party plugins can add more. */
  readonly dispatch:
    | {
        readonly kind: 'url-scheme';
        /** Pure fn — no I/O. Produces the outbound URL. */
        readonly build: (p: HandoffPayload) => string;
      }
    | {
        readonly kind: 'two-step';
        /** Step 1 — host-specific folder-spawn (Cursor's case).
         *  Returns an outcome; step 2 fires only on ok:true. */
        readonly spawnFolder: (p: HandoffPayload) => Promise<HandoffOutcome>;
        /** Step 2 — the prompt URL. */
        readonly build: (p: HandoffPayload) => string;
      };

  /** Web fallback, if any. Shown inside the disabled-row tooltip
   *  (PQ6 LOCKED — Claude-only "Open in claude.ai →" affordance). */
  readonly webFallback?: {
    readonly displayName: string;
    readonly build: (p: HandoffPayload) => string;
  };

  /** Lucide / shadcn icon slug. */
  readonly icon: string;

  /** Download / install page URL — shown in the disabled tooltip. */
  readonly installUrl: string;
}
```

### 6.1.5 Built-in registry (SQ9 DIRECTED)

`packages/core/src/handoff/registry.ts`:

```typescript
import { buildClaudeUrl, buildClaudeAiWebUrl } from './claude-url.ts';
import { buildCodexUrl } from './codex-url.ts';
import { buildCursorUrl } from './cursor-url.ts';
import { spawnCursorFolder } from '../../app/src/lib/handoff/cursor-two-step.ts'; // app-layer hook
// (import path pragmatics: registry data lives in core; the Cursor spawn is
//  host-dependent — see §6.5 for the indirection. In implementation, the
//  descriptor's spawnFolder is wired at the dispatch-module boundary, not
//  imported circularly. Shown here conceptually.)

export const BUILT_IN_TARGETS: ReadonlyArray<HandoffTargetDescriptor> = [
  {
    id: 'claude-cowork',
    displayName: 'Claude Cowork',
    schemes: ['claude:'],
    dispatch: {
      kind: 'url-scheme',
      build: (p) => buildClaudeUrl({ mode: 'cowork' }, p),
    },
    webFallback: {
      displayName: 'Open in claude.ai',
      build: (p) => buildClaudeAiWebUrl(p.prompt),
    },
    icon: 'Sparkles',
    installUrl: 'https://claude.com/download',
  },
  {
    id: 'claude-code',
    displayName: 'Claude Code',
    schemes: ['claude:'],
    dispatch: {
      kind: 'url-scheme',
      build: (p) => buildClaudeUrl({ mode: 'code' }, p),
    },
    webFallback: {
      displayName: 'Open in claude.ai',
      build: (p) => buildClaudeAiWebUrl(p.prompt),
    },
    icon: 'Terminal',
    installUrl: 'https://claude.com/download',
  },
  {
    id: 'codex',
    displayName: 'Codex',
    schemes: ['codex:'],
    dispatch: {
      kind: 'url-scheme',
      build: (p) => buildCodexUrl(p),
    },
    icon: 'Bot',
    installUrl: 'https://openai.com/codex',
  },
  {
    id: 'cursor',
    displayName: 'Cursor',
    schemes: ['cursor:'],
    dispatch: {
      kind: 'two-step',
      spawnFolder: (p) => spawnCursorFolder(p),
      build: (p) => buildCursorUrl(p),
    },
    icon: 'Code2',
    installUrl: 'https://cursor.com/',
  },
] as const;
```

**Implications.**

- **Dropdown renders from the registry.** `OpenInAgentMenu.tsx` is `BUILT_IN_TARGETS.map(target => <OpenInAgentMenuItem …/>)` — no hardcoded order-of-rows, no hardcoded display names in JSX.
- **Install detection enumerates the registry.** The `useInstalledAgents` hook probes each unique scheme in `new Set(BUILT_IN_TARGETS.flatMap(t => t.schemes))` — one detection per scheme, not one per target (Cowork + Code share `claude:`).
- **Shell allowlist has a registry-coverage test** (see §6.6) — catches drift if a future spec adds a target without updating `ALLOWED_SCHEMES`.
- **Tests iterate the registry.** URL-builder encoding corpus runs per-descriptor; E2E happy-path tests generate one case per `BUILT_IN_TARGETS` entry (plus the two-step branch case).
- **Dispatch is registry-driven.** `dispatch.ts` is a single switch on `descriptor.dispatch.kind` — Andrew's "easy to add/remove agents" ask is satisfied: adding a 5th agent is one descriptor entry + one new URL builder file + one allowlist row. Removing is the reverse — one entry out, the dropdown, detection, and dispatch all adjust.

**Third-party extensibility posture (Future Work, not v0).** The descriptor shape is designed to hold up to third-party contributions, but v0 does NOT expose a registration API. A future story can add `registerHandoffTarget(desc)` that validates the descriptor (including that its schemes pass the main-process allowlist) and appends to a user-plugin array that dispatch merges with `BUILT_IN_TARGETS`. Until then, the v0 surface is "fork + add descriptor" — which is what Linear and Mintlify's early versions shipped with. See §14.

---

### 6.2 URL builders

All builders are **pure** (no I/O, no DOM, no Node APIs). Input: `HandoffPayload`. Output: `string` (the URL).

**Encoding discipline (I3, from `evidence/cursor-encoding-empirics.md`):**
- Claude + Codex: single `encodeURIComponent` per param value.
- Cursor: **double** `encodeURIComponent` on `text=` ONLY. `workspace=` single-encoded (basename-only; should never contain `%` in practice). `mode=` is a literal enum value — not encoded.

**`buildClaudeUrl` (`packages/core/src/handoff/claude-url.ts`):**

```typescript
export function buildClaudeUrl(
  opts: { mode: 'cowork' | 'code' },
  payload: HandoffPayload,
): string {
  const q      = encodeURIComponent(payload.prompt);
  const folder = encodeURIComponent(payload.projectDir);
  const file   = encodeURIComponent(payload.docPath);
  const host   = opts.mode; // 'cowork' | 'code'
  return `claude://${host}/new?q=${q}&folder=${folder}&file=${file}`;
}
```

Invariant: `payload.target` must match `opts.mode` ('claude-cowork' → 'cowork'; 'claude-code' → 'code'). Enforced at dispatch site.

**`buildCodexUrl` (`packages/core/src/handoff/codex-url.ts`):**

```typescript
export function buildCodexUrl(payload: HandoffPayload): string {
  const prompt = encodeURIComponent(payload.prompt);
  const path   = encodeURIComponent(payload.projectDir);
  return `codex://new?prompt=${prompt}&path=${path}`;
}
```

Note: `docPath` is NOT threaded to Codex (no atomic file param). Agent resolves the file via its own tools once workspace is loaded. `originUrl=<git>` not emitted in v0 — future work.

**`buildCursorUrl` (`packages/core/src/handoff/cursor-url.ts`):**

```typescript
/** Returns the prompt URL for step 2 of Cursor's two-step dispatch.
 *  Step 1 (`cursor <projectDir>`) is handled by cursor-two-step.ts in the app layer. */
export function buildCursorUrl(payload: HandoffPayload): string {
  // DOUBLE-encode text= — see evidence/cursor-encoding-empirics.md
  const text      = encodeURIComponent(encodeURIComponent(payload.prompt));
  const workspace = encodeURIComponent(basename(payload.projectDir));
  return (
    `cursor://anysphere.cursor-deeplink/prompt` +
    `?text=${text}` +
    `&workspace=${workspace}` +
    `&mode=agent`
  );
}
```

**`buildClaudeAiWebUrl` (fallback, PQ6 "Open in claude.ai →"):**

```typescript
export function buildClaudeAiWebUrl(prompt: string): string {
  const q = encodeURIComponent(prompt);
  return `https://claude.ai/new?q=${q}`;
}
```

**Unit test corpus (AC7):** `/Users/who/My %Project — docs/café-notes.md` with default composer output. Assert that:

- Claude URL: `%` → `%25`, `—` → `%E2%80%94` (single encode of UTF-8 bytes), space → `%20`, `é` → `%C3%A9`.
- Codex URL: same as Claude.
- Cursor URL: `%` → `%2525` (double-encoded), `—` → `%2525E2%252580%252594`, etc. Verified against the two-pass-decode behavior in `evidence/cursor-encoding-empirics.md`.

### 6.3 Prompt composer

`packages/core/src/handoff/prompt-composer.ts`:

```typescript
export function composePrompt(ctx: DocContext): string {
  return `Open Knowledge doc: ${ctx.relativePath}. Use the open-knowledge MCP tool for backlinks and related context.`;
}
```

**Determinism:** output is pure string interpolation of the relative path. Same input → same output (AC10 trivially satisfied).

**Budget:** 1024-character hard cap. Unit test feeds pathologically-long paths (200+ char filenames) and asserts `composePrompt` output stays under 1 KB.

**Bounding strategy (SQ2 retired):** with frontmatter/excerpt cut, the composer cannot overflow for any realistic path. The unit test pins the invariant for forward-proofing — if a future spec re-adds richer context, the budget check fires.

**MCP hint pragmatism (new SQ1 context):** the phrase "open-knowledge MCP tool" works whether or not MCP is registered on the user's target agent. If MCP is present, the agent picks up backlinks and related docs. If not, the agent falls back to the native `file=`/`path=`/`workspace=` attachment and reads the doc directly — v0 doesn't block on MCP setup.

### 6.4 Install detection

**Electron path (`ok:shell:detect-protocol` IPC):**

Main-process handler:

```typescript
// packages/desktop/src/main/ipc-handlers.ts (new handler)
createHandler('ok:shell:detect-protocol', async (_event, scheme: string) => {
  try {
    const info = await Promise.race([
      app.getApplicationInfoForProtocol(`${scheme}://`),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
    ]);
    return { installed: true, displayName: info.name };
  } catch {
    return { installed: false };
  }
});
```

**Web path (`/api/installed-agents` endpoint):**

`packages/server/src/api-extension.ts` handler:

- macOS: `osascript -e 'tell application "System Events" to exists application process "Claude"'` PER scheme; OR bundle-id lookup via `osascript -e 'id of app "Claude"'`. Fall back to LaunchServices query.
- Windows: `reg query "HKCU\\Software\\Classes\\claude" /ve` — exit 0 means registered.
- Linux: `xdg-mime query default x-scheme-handler/claude` — non-empty stdout means registered.
- Per-OS shell invocation with 2s timeout; results cached server-side for 60s.

Response shape:
```json
{ "claude": true, "codex": false, "cursor": true }
```

(Note: `claude-cowork` and `claude-code` both map to the single `claude:` scheme; the endpoint flattens to one boolean per scheme.)

**Cache policy (SQ5 DIRECTED — option (c)):**

- Boot-time probe fills initial state.
- On-dropdown-open: render cached state immediately, fire async refresh in parallel.
- If refresh result differs from cache, update React state (dropdown stays open; disabled state flips live).
- Refresh throttled to at most 1× per 10 seconds per target (prevents probe-spam on rapid open/close).

**Fallback UX (I4):** disabled row + tooltip. Claude-only secondary affordance: "Open in claude.ai →" (linking to `buildClaudeAiWebUrl(prompt)`).

### 6.5 Cursor two-step dispatcher (SQ4 DIRECTED — option (b) + 500ms buffer)

`packages/app/src/lib/handoff/cursor-two-step.ts`:

```typescript
export async function dispatchCursor(payload: HandoffPayload): Promise<HandoffOutcome> {
  // Step 1: spawn `cursor <projectDir>` via host-specific primitive.
  const step1 = await spawnCursorFolder(payload.projectDir);
  if (!step1.ok) return { ok: false, reason: step1.reason };

  // Step 2: settle buffer (500ms), then fire prompt URL.
  // The &workspace=<basename> safety-net pins to the right window even if
  // Cursor's cold-start exceeded 500ms (per evidence/cursor-encoding-empirics.md Finding 5).
  await wait(500);

  const promptUrl = buildCursorUrl(payload);
  return openExternal(promptUrl);
}

async function spawnCursorFolder(projectDir: string): Promise<HandoffOutcome> {
  if (window.okDesktop) {
    // Electron host: TBD — either extend ok:shell:open-external to recognize
    // `cursor-folder:<path>` sentinel, OR add narrow `ok:shell:spawn-cursor`
    // IPC channel (see TQ4 resolution below).
    return window.okDesktop.shell.spawnCursor?.(projectDir) ?? dispatchError();
  } else {
    // Web host: POST /api/handoff/open-folder (server validates + spawns).
    const res = await fetch('/api/handoff/open-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: 'cursor', path: projectDir }),
    });
    const data = await res.json();
    return data.ok ? { ok: true } : { ok: false, reason: 'web-endpoint-error', detail: data.reason };
  }
}
```

**TQ4 resolution (Cursor Electron-host folder-spawn):** add a new narrow IPC channel `ok:shell:spawn-cursor` that takes exactly `{ path: string }`, validates the path is not empty and is absolute, spawns `cursor <path>` with a 2s timeout. Does NOT take the command name — hardcoded to `cursor`. The `spawnAllowlist` mirrors the `ALLOWED_SCHEMES` shape: exact-set match, not per-command args.

Design note: I considered overloading `ok:shell:open-external` with a `cursor-folder:<path>` URI, but that muddies the URL semantic and would require special-casing the scheme in `checkOutboundUrl`. Dedicated channel is cleaner and lower blast radius.

### 6.6 Shell allowlist extension (TQ6 DIRECTED)

Diff:

```typescript
// packages/desktop/src/main/shell-allowlist.ts

const ALLOWED_SCHEMES: ReadonlySet<string> = new Set([
  'https:',
  'http:',
  'mailto:',
  'openknowledge:',

  // Added 2026-04-XX by specs/2026-04-21-open-in-agent-desktop/ for the
  // "Open in Agent Desktop" handoff dropdown. D47 rationale preserved:
  // each scheme's outbound payload is constructed by a per-target URL-builder
  // in packages/core/src/handoff/ — never by user-supplied raw URL. The
  // Shabarkin 2022 attack class (ms-msdt:, ms-officecmd:, etc.) is defended
  // against by the same exact-set allowlist that excludes those schemes.
  // See specs/2026-04-21-open-in-agent-desktop/SPEC.md §6.6 for the full
  // rationale + test assertion; STORY §Context for product framing.

  /** Claude Desktop unified app (Chat + Cowork + Code).
   *  OK emits exactly:
   *    claude://cowork/new?q=<enc>&folder=<enc>&file=<enc>
   *    claude://code/new?q=<enc>&folder=<enc>&file=<enc>
   *  No other paths. Single-encoded. */
  'claude:',

  /** OpenAI Codex Desktop.
   *  OK emits exactly:
   *    codex://new?prompt=<enc>&path=<enc>
   *  No other paths. Single-encoded. */
  'codex:',

  /** Cursor IDE.
   *  OK emits exactly:
   *    cursor://anysphere.cursor-deeplink/prompt?text=<double-enc>&workspace=<enc>&mode=agent
   *  No other paths. text= is double-encoded per the two-pass-decode
   *  behavior documented in evidence/cursor-encoding-empirics.md. */
  'cursor:',
]);
```

Tests (`packages/desktop/src/main/shell-allowlist.test.ts`):

```typescript
import { BUILT_IN_TARGETS } from '@inkeep/open-knowledge-core/handoff/registry';

test('exact-set allowlist membership', () => {
  expect([...ALLOWED_SCHEMES].sort()).toEqual([
    'claude:', 'codex:', 'cursor:', 'http:', 'https:', 'mailto:', 'openknowledge:',
  ]);
});

test('registry schemes are covered by allowlist (drift detector)', () => {
  // SQ9 DIRECTED: if a future spec adds a target to BUILT_IN_TARGETS without
  // adding its scheme to ALLOWED_SCHEMES, this test catches it before ship.
  const registrySchemes = new Set(
    BUILT_IN_TARGETS.flatMap((t) => t.schemes),
  );
  for (const scheme of registrySchemes) {
    expect(ALLOWED_SCHEMES.has(scheme)).toBe(true);
  }
});

test.each([
  ['claude://cowork/new?q=x&folder=y&file=z', true],
  ['claude://code/new?q=x&folder=y&file=z',   true],
  ['codex://new?prompt=x&path=y',             true],
  ['cursor://anysphere.cursor-deeplink/prompt?text=x&workspace=y&mode=agent', true],
  ['file:///etc/passwd',                      false],
  ['ms-msdt:/id/PCWDiagnostic',               false],
  ['javascript:alert(1)',                     false],
])('checkOutboundUrl(%s) allowed=%s', (url, expected) => {
  expect(checkOutboundUrl(url).ok).toBe(expected);
});
```

**D47 changelog entry (XQ4 DIRECTED):** append to `specs/2026-04-11-electron-desktop-app/meta/_changelog.md` at ship time. Exact format drafted in `evidence/codebase-surface-map.md`.

---

## 7. UI Contract

### 7.1 Surface placement (PQ1 → SQ6 DIRECTED — all three)

Three host surfaces, one shared component, **registry-driven rows** (SQ9 DIRECTED — `OpenInAgentMenu` iterates `BUILT_IN_TARGETS`):

- **`EditorHeader.tsx`**: dropdown button in the header's action strip. Primary surface. Opens on click; trigger is a `MoreHorizontal` icon with "Open in…" aria-label. Rows rendered from registry.
- **`CommandPalette.tsx`**: entries derived from registry (one per descriptor: "Open in Claude Cowork", etc.). Keyboard-first path. Disabled entries still appear (with "not installed" hint) — matches the dropdown's disabled-row pattern.
- **`FileTree.tsx`** right-click context menu: submenu "Open in…" with rows from the same registry. Triggered on any `.md` file in the sidebar, not just the active doc — resolves `docPath` from the right-clicked file.

All three paths route through the single dispatch module (`packages/app/src/lib/handoff/dispatch.ts`) — AC9 asserts zero other dispatch sites. Dispatch switches on `descriptor.dispatch.kind` (`'url-scheme'` | `'two-step'`) — no per-target if-cascades in UI or dispatch code.

**Adding a 5th target** (e.g. Zed, Windsurf — see §14 Future Work) is a single-file change pattern: add a `zed-url.ts` builder, append a descriptor to `BUILT_IN_TARGETS`, add `zed:` to the shell allowlist. No UI changes, no dispatch changes, no install-detection changes — the registry-coverage test in §6.6 catches the allowlist forget.

### 7.2 Dropdown copy (PQ4 DIRECTED)

Four rows, in order:

1. **Open in Claude Cowork**
2. **Open in Claude Code**
3. **Open in Codex**
4. **Open in Cursor**

Rationale for "Open in" prefix: matches Linear's 19-tool registry convention (per `reports/.../evidence/linear-ai-deeplinks-extraction.md`); matches Mintlify's contextual menu; reduces ambiguity in the command palette where entries don't share a header.

Product-copy review before ship — pre-PR reviewers can flip to "Claude Cowork" / "Claude Code" / "Codex" / "Cursor" (no "Open in") if the dropdown is explicitly labeled.

### 7.3 Disabled state + tooltip (PQ6 LOCKED)

Per-row shape:

```
┌─────────────────────────────────────────┐
│  ✓  Open in Claude Cowork              │  ← enabled (installed)
│ [○] Open in Codex                       │  ← disabled (not installed)
│                                         │
│     Tooltip (hover, disabled only):    │
│     ┌───────────────────────────────┐  │
│     │ Requires Codex Desktop.       │  │
│     │ [Install Codex Desktop →]     │  │
│     └───────────────────────────────┘  │
└─────────────────────────────────────────┘
```

Claude rows' disabled-state tooltips include a **second** action:

```
│     ┌───────────────────────────────┐  │
│     │ Requires Claude Desktop.      │  │
│     │ [Install Claude Desktop →]    │  │
│     │ [Open in claude.ai →]         │  │  ← secondary, Claude-only
│     └───────────────────────────────┘  │
```

The "Open in claude.ai →" action fires `buildClaudeAiWebUrl(prompt)` via `shell.openExternal` (Electron) or `window.open(..., '_blank')` (web). The user explicitly opts in — no auto-fallback on primary click. This carries PQ6 LOCKED forward verbatim.

### 7.4 Electron/web parity (I7)

Both hosts render the same three surfaces, same dropdown, same disabled states. Underlying dispatch differs (IPC vs anchor-click) but the user-observable outcomes are identical for the same install-state configuration. Playwright coverage samples representative cells per host (see §13).

---

## 8. Host-Specific Details

### 8.1 Electron host

- Outbound URL dispatch via `window.okDesktop.shell.openExternal(url)` → `ok:shell:open-external` IPC → `checkOutboundUrl` → `shell.openExternal`.
- Cursor folder-spawn via `window.okDesktop.shell.spawnCursor(path)` → `ok:shell:spawn-cursor` IPC → validated spawn.
- Install detection via `window.okDesktop.shell.detectProtocol(scheme)` → `ok:shell:detect-protocol` IPC → `app.getApplicationInfoForProtocol` with timeout.

### 8.2 Web host (`open-knowledge start`)

- Outbound URL dispatch via anchor-click (TQ7 LOCKED): `const a = document.createElement('a'); a.href = url; a.click();`. Avoids browser-level "Allow this site to open X?" dialogs that `window.location.href` triggers.
- Cursor folder-spawn via `POST /api/handoff/open-folder` server endpoint (narrow allowlist: target='cursor' only; path must be inside OK content dir).
- Install detection via `GET /api/installed-agents` server endpoint (per-OS shell probe, 60s server-side cache + per-client 10s React-layer throttle).

---

## 9. Decision Log

Resolution status key: **LOCKED** (1-way door, confirmed), **DIRECTED** (direction set; details flexible in implementation), **DELEGATED** (implementer's call within stated constraints).

### Carried from STORY (9 LOCKED + already-resolved TQ/XQ)

| ID | Title | Status | Source |
|---|---|---|---|
| PQ2 | Cowork + Code as separate dropdown rows | LOCKED | STORY 2026-04-21 Nick |
| PQ3 | Ship all 4 targets in parallel | LOCKED | STORY 2026-04-21 Nick |
| PQ5 | OK auto-composes the prompt | LOCKED | STORY 2026-04-21 Nick |
| PQ6 | Disabled button + tooltip (no auto-fallback) | LOCKED | STORY 2026-04-21 Nick |
| PQ7 | No user-visible URL-length-cap UX | LOCKED | STORY 2026-04-21 Nick |
| TQ1 | `ok:shell:open-external` IPC channel (existing) | LOCKED | STORY 2026-04-21 |
| TQ7 | Web dispatch via anchor-click | LOCKED | STORY 2026-04-21 |
| TQ8 | Plain-text composer (no rich editor) | LOCKED | STORY 2026-04-21 |
| XQ3 | No phone-home / no analytics SDK | LOCKED | STORY 2026-04-21 Nick |

### New in spec (2026-04-21 Andrew batch)

| ID | Title | Status | Decision |
|---|---|---|---|
| SQ1 | Prompt composer content | DIRECTED | Minimal — path + one-line "use the open-knowledge MCP" hint. No frontmatter, no title, no excerpt. Agent uses native attachment (`file=`/`path=`/`workspace=`) + MCP tools for context. |
| SQ2 | Composer budget/bounding | DIRECTED | Retired. 1 KB hard cap in unit test; minimal composer can't overflow for any realistic path. |
| SQ3 | `folder=` / `dir` semantics | DIRECTED | `projectDir` = OK project root (always absolute). `docPath` = the current doc (always absolute). Claude takes both atomically; Codex takes `projectDir` only; Cursor takes `projectDir` for step 1 spawn. Per Andrew: "dir/folder is the full path to the project directory or a file within the project directory" — our `HandoffPayload` splits these into two distinct fields so each target gets what its URL scheme accepts. |
| SQ4 | Cursor two-step settle delay | DIRECTED | 500ms buffer + `&workspace=<basename>` safety-net (per evidence/cursor-encoding-empirics.md Finding 5). Poll-for-ready is unnecessary overhead — the safety-net pins the URL to the right window even if it fires early. |
| SQ5 | Install-detection cache invalidation | DIRECTED | Show cached state immediately + async refresh on dropdown open (throttled to ≤1 check/10s per target). If refresh differs, update React state live. |
| SQ6 | Surface placement | DIRECTED | All three: EditorHeader + CommandPalette + FileTree right-click context. Shared `OpenInAgentMenu` component. |
| SQ7 | Same-PR vs split PR | LOCKED | Same PR (#254). 5th commit to branch `worktree-open-with-agent-research`. |
| SQ8 | Allowlist extension is hard prerequisite | LOCKED | Confirmed. No implementation proceeds without `claude:`, `codex:`, `cursor:` added to `ALLOWED_SCHEMES` + exact-set test passing. |

### New in spec (2026-04-21 agent-inferred, awaiting user batch 2)

| ID | Title | Status | Recommendation |
|---|---|---|---|
| PQ4 | Dropdown copy (exact text) | DIRECTED | "Open in Claude Cowork" / "Open in Claude Code" / "Open in Codex" / "Open in Cursor". Matches Linear + Mintlify consensus; pre-ship copy review can simplify if dropdown gets its own header. |
| TQ4-revised | Cursor Electron folder-spawn | DIRECTED | New narrow IPC channel `ok:shell:spawn-cursor` (not overloading `ok:shell:open-external`). Exact-set validated; 2s timeout. Mirrors allowlist shape. |
| XQ1-refined | E2E test matrix sampling | DIRECTED | Full 18-cell matrix at unit + integration tiers; E2E samples 6 cells: per-host {Claude Cowork happy path, Cursor two-step happy path, install-state flip (not-installed → installed async refresh)}. Details in §13. |
| XQ2 | Dogfood rollout | DELEGATED | Ship to Nick + immediate team first. Gather 1 week of dogfood on prompt-template effectiveness. Spec doesn't gate on this; implementation proceeds in parallel. |
| XQ4 | D47 changelog entry format | DIRECTED | Exact format in `evidence/codebase-surface-map.md`. Appended at ship commit time. |
| SQ9 | Registry-driven target definitions | DIRECTED | **New 2026-04-21 Andrew batch 2.** All per-target data + dispatch + install-detection + UI-row generation flows from `BUILT_IN_TARGETS: ReadonlyArray<HandoffTargetDescriptor>` in `packages/core/src/handoff/registry.ts`. Dropdown renders from registry; install-detect enumerates registry schemes; shell allowlist has a registry-coverage drift-detector test; URL-builder encoding tests iterate the registry. Adding/removing a target in v0 is a one-commit change (descriptor + URL builder + allowlist row). Third-party plugin API is explicit Future Work, designed-for but not shipped. |
| TQ4b | Cursor step-1 folder-spawn is required | LOCKED | **2026-04-21 Andrew batch 2.** Confirmed load-bearing: Cursor's `cursor://` has no folder-open route of any kind (research-verified). Without step 1 the prompt URL fires into the wrong window or fails silently. New `ok:shell:spawn-cursor` IPC channel (not overloading `ok:shell:open-external`) because the threat model differs — scheme allowlist vs command allowlist. |
| OQ-C | Cursor `mode=agent` pinned in v0 | DIRECTED | Not configurable per-call in v0. Future work if users request `ask`/`debug`/`plan` handoffs. |
| OQ-Codex-originUrl | Codex `originUrl=<git>` omitted in v0 | DIRECTED | No cross-machine repo resolution in v0. v0 uses `path=` only. |

---

## 10. Open Questions

**All P0 OQ are resolved.** Residual items (awaiting Andrew batch 2 for anything DIRECTED → LOCKED where 1-way-door risk matters):

- **OQ-A (P2, DELEGATED):** Whether to ship an `originUrl=<git>` param on Codex (enables repo-resolution via Codex's known-local-clones matcher). NOT NOW — v0 uses `path=` only; future Codex-specific enhancement if users request cross-machine portability. (Deferred to `linkmultimachine` follow-up story.)
- **OQ-B (P2, DELEGATED):** Whether the disabled-row tooltip's "Install …" link targets the vendor's download page (stable) or an OK-hosted install-hint doc (canonical). Default: vendor page in v0. Revisit if tooltip links rot.
- **OQ-C (P0, DIRECTED):** `buildCursorUrl` omits `mode=agent` override per-call. Pinned to `agent` always in v0. Revisit when users request `ask`/`debug`/`plan` mode handoffs.

---

## 11. Assumptions

| ID | Assumption | Confidence | Verification plan | Expiry |
|---|---|---|---|---|
| A1 | `app.getApplicationInfoForProtocol(scheme)` is available in Electron 41.2.1 (OK's shipped version) | HIGH | Electron 25+ API; spec checks at implementation start | Before ship |
| A2 | Per-OS install-detection shell probes (`osascript`/`reg query`/`xdg-mime`) do not exceed 2s in normal conditions | MEDIUM | Add timeout + fallback to "unknown → show as disabled" on timeout | Integration test |
| A3 | Cursor's 500ms settle buffer is sufficient on cold-launch for 95% of dogfood machines | MEDIUM | E2E test; dogfood feedback; `&workspace=` safety-net covers the 5% | Week 1 dogfood |
| A4 | `anchor-click` dispatches custom schemes reliably in Chrome, Safari, Firefox (web host) | HIGH | Playwright coverage per-browser per-scheme | E2E green gate |
| A5 | `claude://cowork/new?q=&folder=&file=` and `claude://code/new?...` remain stable across Claude.app 1.2581.0+ | MEDIUM | Upstream research is 2026-04-21 live-tested; pinned in evidence | Re-probe on Claude major version jumps |
| A6 | `codex://new?prompt=&path=` remains stable across Codex 26.415+ | MEDIUM | Probe confirms stable 26.406 → 26.415; OpenAI "superapp" consolidation announced 2026-03-19 may change this | Re-probe quarterly |
| A7 | Cursor's double-decode behavior is stable across Cursor 3.1.15+ | HIGH | Live-tested 2026-04-21; mechanism is deliberate per linear-ai-deeplinks-extraction evidence | Stable unless Cursor changes their URL parser |

---

## 12. Risks / Unknowns

- **R1 — Claude Desktop URL shape drifts.** Mitigation: evidence pinned in upstream research; spec cites verbatim bundle code. If drift happens, the one file to update is `claude-url.ts`; tests catch encoding regressions.
- **R2 — Cursor's double-encode behavior changes in a future version.** Mitigation: encoding-empirics evidence is live-tested; builder has a clear single code path; tests cover the `%`/em-dash edge cases. Downgrade to single-encoding is a one-line change if Cursor standardizes.
- **R3 — OpenAI "superapp" consolidation (announced 2026-03-19) merges ChatGPT + Codex + Atlas.** Mitigation: spec's `codex://` shape remains a hardcoded target; if the scheme consolidates, Codex row's URL builder becomes a `chatgpt://` variant. One-file impact.
- **R4 — Web host install-detection yields false-negatives (shell timeout, no OS tool available).** Mitigation: fall back to showing row as "Not detected — try anyway?" with a click-to-attempt affordance. Design-time consideration; v0 may show as disabled with tooltip "Detection failed."
- **R5 — IPC surface drift when adding `shell.spawnCursor`.** Mitigation: contract-equality test in `tests/integration/bridge-contract.test.ts` ensures duplicated bridge files (desktop + core) stay in sync.

---

## 13. Test Plan

Three tiers.

### 13.1 Unit (node, no Electron/browser)

In `packages/core/src/handoff/*.test.ts`:

- `buildClaudeUrl`: 8 cases covering cowork/code × path edge cases (`%`, em-dash, unicode, space).
- `buildCodexUrl`: 4 cases.
- `buildCursorUrl`: 8 cases, incl. the silent-corruption cases from cursor-encoding-empirics.md (`%41`, em-dash `%E2%80%94`, pct-encoded URLs).
- `buildClaudeAiWebUrl`: 2 cases.
- `composePrompt`: 5 cases (simple path, long path, edge-case path chars, budget-boundary, determinism).

`packages/desktop/src/main/shell-allowlist.test.ts`:

- Exact-set assertion (7 allowed schemes, not subset).
- 7-row `test.each` for expected allowed/blocked URLs (the 4 new + 3 must-block classics like `file:`, `ms-msdt:`, `javascript:`).

### 13.2 Integration

`packages/desktop/tests/integration/bridge-contract.test.ts`:

- Extend existing contract-equality test to cover the new `shell.detectProtocol` + `shell.spawnCursor` surfaces on both core + desktop bridge files.

`packages/desktop/tests/integration/handoff-ipc.test.ts` (new):

- `ok:shell:detect-protocol` with registered and unregistered schemes.
- `ok:shell:spawn-cursor` with valid path, empty path (rejected), non-absolute path (rejected), timeout case.
- `ok:shell:open-external` with each new scheme (allowed); `file:` / `ms-msdt:` (rejected).

`packages/server/tests/integration/handoff-api.test.ts` (new):

- `GET /api/installed-agents` shape + caching (3 calls within 60s → 1 OS probe).
- `POST /api/handoff/open-folder` with target=cursor + valid path (spawn mocked); target='claude' (rejected); path outside content dir (rejected).

### 13.3 E2E (Playwright — per-host)

`packages/app/tests/stress/handoff.e2e.ts` (new).

**XQ1-refined:** 18-cell matrix (2 hosts × 4 targets × 3 install states = 24 cells incl. Claude twice) → sample 6 cells:

| # | Host | Scenario |
|---|---|---|
| 1 | Electron | Claude Cowork happy path (all installed) → URL dispatched with correct shape |
| 2 | Electron | Cursor two-step happy path → spawn + prompt URL fired, single modal verified |
| 3 | Electron | Install-state flip (Codex not installed → installed; async refresh updates row) |
| 4 | Web      | Claude Cowork happy path (anchor-click, Playwright intercepts via route handler) |
| 5 | Web      | Cursor two-step via `/api/handoff/open-folder` (server-spawn mocked) |
| 6 | Web      | Disabled-state + "Open in claude.ai →" secondary tooltip click |

Target-app launch itself is not verified in Playwright (no headless-control of Claude/Codex/Cursor available); the assertion is "the correct URL was constructed and dispatched to the correct primitive."

---

## 14. Future Work

| Item | Tier | Notes |
|---|---|---|
| User-editable prompt field | Identified | Nick explicit NOT-NOW in PQ5. Revisit if dogfood feedback shows users routinely edit in target app's composer. |
| Saved prompt templates per target | Noted | Linear ships this. Revisit with "handoff registry" follow-up story. |
| Zed / Windsurf / VS Code handoff | Explored | Research report covers; excluded from v0 per NOT NOW. Spec's registry supports addition — new `zed-url.ts` + `BUILT_IN_TARGETS` descriptor + allowlist row. No UI / dispatch / detection code changes. |
| **Third-party handoff-target plugin API** | **Explored** | **SQ9 forward-fit.** Descriptor shape (`HandoffTargetDescriptor`) is designed to support user-declared targets, but v0 exposes no registration API. When picked up: add `registerHandoffTarget(desc)` with main-process validation (each `desc.schemes` entry must pass allowlist membership check before mounting), per-org plugin loading, and probably a declarative JSON/YAML surface for non-code contributions. Aligned with Linear's `customUrl` / `customTerminalScript` hooks and Mintlify's `contextual.options` custom-entry schema. Likely Q3 2026 work; this story lays the foundation. |
| MCP-install-via-URL handoff | Explored | Cursor + VS Code + Mintlify ship this. Separate story. |
| Multi-doc handoff (Claude's repeatable `folder=`/`file=`) | Noted | Technically supported by Claude's URL shape; requires multi-select UI elsewhere first. |
| `originUrl=<git>` on Codex (cross-machine repo resolution) | Noted | v0 uses `path=` only; future enhancement for cross-machine portability. |
| Embedding-aware UI | Noted | Parked as P2 per XQ5. Own story when partner embed materializes. |
| Telemetry (handoffs-per-target) | Noted | XQ3 LOCKED no phone-home. Local-only counters (`~/.open-knowledge/stats.jsonl`) possible for internal dogfood. |
| Detection of OK-MCP not configured in target agent | Identified | V0 assumes MCP available on dogfood machines; prompt is robust without it. If missing-MCP becomes a common failure, add "Configure open-knowledge in Claude Desktop →" in first-use UX. |

---

## 15. Agent Constraints

**SCOPE** (implementation may touch these):

- `packages/core/src/handoff/` (create — includes `registry.ts` with `BUILT_IN_TARGETS`)
- `packages/core/src/desktop-bridge.ts` (extend: `shell.detectProtocol`, `shell.spawnCursor`)
- `packages/desktop/src/main/shell-allowlist.ts` (extend: 3 new schemes)
- `packages/desktop/src/main/ipc-handlers.ts` (add 2 handlers)
- `packages/desktop/src/shared/ipc-channels.ts` (add 2 channels)
- `packages/desktop/src/shared/bridge-contract.ts` (mirror core)
- `packages/server/src/api-extension.ts` (add 2 endpoints)
- `packages/app/src/lib/handoff/` (create)
- `packages/app/src/components/handoff/` (create)
- `packages/app/src/components/EditorHeader.tsx`, `CommandPalette.tsx`, `FileTree.tsx` (extend to mount `OpenInAgentMenu`)
- `specs/2026-04-11-electron-desktop-app/meta/_changelog.md` (append D47 extension log entry at ship)

**EXCLUDE** (implementation MUST NOT touch):

- `packages/core/src/markdown/` (unrelated)
- `packages/core/src/extensions/` (unrelated)
- `packages/server/src/persistence.ts`, `reconciliation.ts`, `agent-sessions.ts` (unrelated)
- `packages/desktop/src/main/navigator-window.ts` (unrelated)
- `packages/app/src/editor/` (unrelated)
- Any test file outside the test plan in §13

**STOP_IF** (stop and ask before proceeding):

- Cursor's URL parser behavior differs from `evidence/cursor-encoding-empirics.md` during live testing (potential Cursor version drift).
- `app.getApplicationInfoForProtocol(scheme)` throws unexpected errors (not "not registered") on any platform.
- Shell allowlist test fails the exact-set assertion after your changes — you've likely added a scheme not in the spec; revisit spec first.
- `/api/handoff/open-folder` endpoint appears to enable path-traversal (spawning `cursor /etc/passwd` etc.) — stop and review the validation layer.

**ASK_FIRST** (confirm before acting):

- Renaming any existing bridge surface (contract-equality test gates this).
- Changing the dropdown copy away from "Open in …" prefix.
- Adding any 5th target to v0 (requires story amendment).
- Enabling any analytics SDK (XQ3 LOCKED blocks this).
- Exposing the handoff-target registration API publicly (third-party plugins — Future Work; requires its own spec).
- Changing the `HandoffTargetDescriptor` shape after ship (1-way door for any future third-party plugins — revisit deliberately).

---

## 16. Next steps

After user review of this draft: proceed to audit phase (spawn `/audit` + design-challenger in parallel per /spec skill step 6).
