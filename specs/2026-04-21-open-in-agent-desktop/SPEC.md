---
title: "Open in Agent Desktop — one-click handoff from OK to Claude / Codex / Cursor"
description: "Technical spec for the Open in ⌄ dropdown action that hands off an OK wiki page to Claude Cowork, Claude Code (Epitaxy), OpenAI Codex Desktop, or Cursor via atomic URL schemes (single-call for Claude + Codex; two-step-with-modal for Cursor). Minimal prompt + open-knowledge MCP hint; disabled-with-tooltip when target not installed; dual-host parity (Electron + web — Cursor web-disabled per local-use-case posture). Audit-reviewed + challenger-reviewed + user-decisions absorbed; ready for /ship."
status: "READY — audit complete, all escalations resolved, ready for /ship handoff"
baselineCommit: "b924fa97"
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
- Telemetry / phone-home transmitted externally (XQ3 — local-only counters are OK; see §13 E5b).
- Embedding-aware UI (XQ5 parked P2).
- Zed / Windsurf / VS Code handoff (NOT NOW).
- MCP-install-via-URL handoff (NOT NOW — separate story).
- User-added handoff targets / handoff registry (NOT NOW).
- Auto-execute URL params (NEVER — I5).
- OK-MCP configuration prerequisite enforcement (DIRECTED — v0 assumes MCP is set up on dogfood machines; if not, agent falls back to native file-read tools on `file=`/`path=`; not blocked).
- **Cross-machine `ok start` deployments (NEW — E4 DIRECTED 2026-04-21).** v0 assumes server + browser + target agents are all on the same machine. The feature is **local-use-case only** — "I'm on my dev machine running Electron OR `ok start` in my local browser, and I have Claude/Codex/Cursor installed on the same machine." Running `ok start` on workstation A and browsing from laptop B is out of scope. If picked up later: server would need to signal "agent dispatch is host-local, not server-local" and web clients would detect their own install state rather than the server's.
- **Web-host Cursor handoff (NEW — E4 DIRECTED 2026-04-21).** Web-host Cursor row is **always disabled-with-tooltip** ("Cursor handoff requires the desktop build"). Rationale: even in the local-use-case, Cursor requires step-1 `cursor <path>` spawn which would need a server-side shell-out endpoint — net-new threat surface + ~300 LOC for a path Electron users have natively. Claude and Codex anchor-click works cross-OS-dispatch without server involvement. The `/api/handoff/open-folder` endpoint is therefore NOT shipped in v0.

---

## 3. Invariants (carried from story)

I1–I7 as written in [story §Invariants](../../stories/open-in-agent-desktop/STORY.md#invariants). Three adjust based on SQ1 DIRECTED (minimal composer):

- **I3 (encoding correctness):** narrowed — the only free-form input the composer emits is the doc's relative path; only `%`/em-dash/unicode path edge cases matter. Still enforced; test corpus in §13.
- **I8 (implied from PQ7):** trivially satisfied. Minimal composer output is <500 chars; Cursor's 8K `text=` cap has 15× headroom.
- **All other invariants unchanged.**

---

## 4. Acceptance Criteria (carried from story, adjusted)

AC1–AC11 as written in [story §Acceptance criteria](../../stories/open-in-agent-desktop/STORY.md#acceptance-criteria), with adjustments from SQ1 + E3-b DIRECTED:

- **AC2 (Claude Code handoff) WEAKENED per E3-b:** the story wrote "Same single-click semantics as AC1" implying atomic file-attachment. Spec-scope AC2 now reads: "fires `claude://code/new?q=&folder=&file=`; Claude.app foregrounds on the Code (Epitaxy) tab with prompt pre-filled and workspace folder scoped. **File attachment via `file=` is uncertain on Claude.app 1.2581.0 per upstream research Finding 9; live-test gate at implementation determines final AC2 wording.** If `file=` is ignored, AC2 drops the file-attachment claim and matches Codex's folder-only semantics."
- **AC7 (encoding correctness):** test corpus is **paths only** (`%`, em-dashes, spaces, unicode). No structured-prompt-content test corpus needed.
- **AC10 (composer budget):** test asserts composer output stays under a **fixed 1 KB character budget** (not per-target variable). Every page in the corpus fits by construction.
- **AC-dogfood-1 (NEW, E2-a):** observe ≤50% of dispatches followed by the user adding >20 chars before pressing Enter in the target agent, over a 7-day dogfood window. Instrumented via `stats.jsonl` + qualitative feedback. Failure triggers SQ1 re-open in a follow-up story.

---

## 5. Architecture

### 5.1 Module layout

```
packages/core/src/handoff/                      (new; shared, no React, no Node APIs)
  types.ts                — HandoffTarget, HandoffPayload, HandoffOutcome, InstallState
  prompt-composer.ts      — composePrompt(docContext) → string
  claude-url.ts           — buildClaudeUrl({mode:'cowork'|'code'}, payload) → string
  codex-url.ts            — buildCodexUrl(payload) → string
  cursor-url.ts           — buildCursorUrl(payload) → string
  web-fallback-url.ts     — buildClaudeAiWebUrl(prompt) → string (for PQ6 "Open in claude.ai →")
  index.ts                — barrel

packages/app/src/lib/handoff/
  targets.ts              — KNOWN_TARGETS: ReadonlyArray<TargetData> — pure data,
                            no functions. Per E1-b DIRECTED 2026-04-21: simple
                            data constant + hand-rolled switch in dispatch.ts.
                            No registry pattern; no descriptor type; dropped for v0.
                            Third-party plugin API (Future Work) will design its
                            own shape without pre-commit.

packages/desktop/src/main/
  shell-allowlist.ts      — EXTENDED: +claude: +codex: +cursor: with JSDoc per §6.6
  ipc-handlers.ts         — NEW handlers: ok:shell:detect-protocol,
                                          ok:shell:spawn-cursor

packages/desktop/src/shared/
  ipc-channels.ts         — NEW channels (2): ok:shell:detect-protocol,
                                              ok:shell:spawn-cursor
  bridge-contract.ts      — EXTENDED: shell.detectProtocol(scheme),
                                      shell.spawnCursor(path)

packages/core/src/desktop-bridge.ts              (DUPLICATE — kept in sync via contract-equality test)
  bridge-contract.ts mirror: shell.detectProtocol + shell.spawnCursor added

packages/server/src/api-extension.ts             (new endpoints)
  GET  /api/installed-agents     → { claude: bool, codex: bool, cursor: bool }
  // POST /api/handoff/open-folder — REMOVED 2026-04-21 per E4 DIRECTED.
  // Web-host Cursor is always disabled-with-tooltip; no server-side spawn
  // primitive ships in v0.

packages/app/src/lib/handoff/                    (new)
  dispatch.ts             — ONE outbound-dispatch entry point (AC9 asserts no other sites).
                            Host-aware: falls through to web-disabled for Cursor on web host.
  install-detect.ts       — unified Electron + web install-detection with cache policy
  cursor-two-step.ts      — Cursor two-step FSM (Electron ONLY; spawn folder → settle →
                            fire prompt URL). Web entry point returns
                            {ok:false, reason:'web-host-cursor-unsupported'} without
                            attempting any server dispatch.
  telemetry.ts            — NEW (E5b DIRECTED): append-only local counter writes to
                            ~/.open-knowledge/stats.jsonl. No network. One line per
                            dispatch: {target, host, outcome, ts, reason?}.

packages/app/src/components/handoff/             (new)
  OpenInAgentMenu.tsx     — dropdown component (shadcn/ui dropdown-menu)
  OpenInAgentMenuItem.tsx — per-target row with disabled/tooltip states
  useInstalledAgents.ts   — React hook — boot-time + on-open + async-refresh per SQ5 DIRECTED
  useHandoffDispatch.ts   — NEW (E5a DIRECTED): wraps dispatch + renders sonner toast
                            on success ("Opened in Claude Cowork.") / failure
                            ("Couldn't reach Claude — try again?"). Uses the existing
                            sonner `Toaster` — no new toast library.

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
 * Target data — one entry per handoff target in v0.
 *
 * Per E1-b DIRECTED 2026-04-21: simple data constant (pure fields only,
 * no functions). Dispatch logic lives in the hand-rolled switch in
 * packages/app/src/lib/handoff/dispatch.ts. The registry-pattern from
 * Session 3 was dropped in favor of "keep it simple." Extensibility win
 * is preserved: adding a 5th target = add KNOWN_TARGETS entry + new URL
 * builder file + new switch case + allowlist row. Same one-commit pattern.
 *
 * Lives in packages/app/src/lib/handoff/targets.ts — NOT core — because
 * core is "shared, no React, no Node.js" and the data's consumer is
 * app-layer dispatch + UI. No cross-package dependency.
 */
export interface TargetData {
  /** Stable ID — dropdown key, test matrix key. Kebab-case. */
  readonly id: 'claude-cowork' | 'claude-code' | 'codex' | 'cursor';

  /** User-facing display name — fills "Open in <displayName>". */
  readonly displayName: string;

  /** URL scheme(s) to probe for install detection. Cowork + Code both
   *  list ['claude:']; Cursor lists ['cursor:']. Install detection uses
   *  `new Set(KNOWN_TARGETS.flatMap(t => t.schemes))` to dedupe. */
  readonly schemes: ReadonlyArray<string>;

  /** Lucide / shadcn icon slug (e.g. 'Sparkles', 'Terminal', 'Bot', 'Code2'). */
  readonly icon: string;

  /** Download / install page URL — shown in the disabled tooltip. */
  readonly installUrl: string;

  /** True if this target supports a web fallback (claude-only in v0).
   *  The actual URL is produced by `buildClaudeAiWebUrl` in core/handoff/. */
  readonly hasWebFallback?: boolean;
}

// Dispatch variants (kind='url-scheme' | 'two-step') are NOT encoded in the
// data — dispatch.ts knows per-target which shape applies via its switch.
// This saves the discriminated-union + function-field complexity from the
// retired registry pattern without losing anything for v0.
```

### 6.1.5 Known targets + dispatch (E1-b DIRECTED — simplified from retired registry pattern)

`packages/app/src/lib/handoff/targets.ts`:

```typescript
import type { TargetData } from '@inkeep/open-knowledge-core/handoff/types';

export const KNOWN_TARGETS: ReadonlyArray<TargetData> = [
  { id: 'claude-cowork', displayName: 'Claude Cowork', schemes: ['claude:'],
    icon: 'Sparkles', installUrl: 'https://claude.com/download', hasWebFallback: true },
  { id: 'claude-code',   displayName: 'Claude Code',   schemes: ['claude:'],
    icon: 'Terminal',  installUrl: 'https://claude.com/download', hasWebFallback: true },
  { id: 'codex',         displayName: 'Codex',         schemes: ['codex:'],
    icon: 'Bot',       installUrl: 'https://openai.com/codex' },
  { id: 'cursor',        displayName: 'Cursor',        schemes: ['cursor:'],
    icon: 'Code2',     installUrl: 'https://cursor.com/' },
] as const;
```

`packages/app/src/lib/handoff/dispatch.ts` (single outbound entry point per AC9):

```typescript
import { buildClaudeUrl, buildClaudeAiWebUrl, buildCodexUrl, buildCursorUrl }
  from '@inkeep/open-knowledge-core/handoff';
import { openExternal } from './open-external.ts';      // wraps Electron IPC + web anchor-click
import { dispatchCursor } from './cursor-two-step.ts';  // Electron-only; web→disabled per E4
import type { HandoffPayload, HandoffOutcome } from '@inkeep/open-knowledge-core/handoff/types';

export async function dispatchHandoff(p: HandoffPayload): Promise<HandoffOutcome> {
  switch (p.target) {
    case 'claude-cowork':
      return openExternal(buildClaudeUrl({ mode: 'cowork' }, p));
    case 'claude-code':
      return openExternal(buildClaudeUrl({ mode: 'code' }, p));
    case 'codex':
      return openExternal(buildCodexUrl(p));
    case 'cursor':
      if (!window.okDesktop) {
        // Web host: disabled per E4 — never reached in practice (UI filters),
        // but defense-in-depth.
        return { ok: false, reason: 'web-host-cursor-unsupported' };
      }
      return dispatchCursor(p);
    default: {
      const _exhaustive: never = p.target;
      return { ok: false, reason: 'invalid-payload', detail: `unknown target: ${p.target}` };
    }
  }
}
```

**Implications:**

- **Dropdown renders from `KNOWN_TARGETS.map(...)`.** Display names, icons, install URLs all from data; no hardcoded JSX strings.
- **Install detection enumerates `new Set(KNOWN_TARGETS.flatMap(t => t.schemes))`.** One probe per scheme — Cowork + Code share `claude:` → one install state.
- **Dispatch is a hand-rolled switch** on `p.target`. TypeScript's `never` exhaustiveness check guarantees every `HandoffTarget` union value has a case — adding a 5th target forces a compile error until the switch is updated.
- **Allowlist drift detector test** (§6.6) now imports `KNOWN_TARGETS` (a pure data constant) instead of a registry with function fields. Same signal, simpler dependency.
- **Adding a 5th target:** (1) add to `HandoffTarget` union in `types.ts`; (2) add to `KNOWN_TARGETS`; (3) add switch case in `dispatch.ts`; (4) add URL builder file in `core/handoff/`; (5) add scheme to `ALLOWED_SCHEMES`. Five files; one commit; exhaustiveness check + drift detector enforce completeness.

**Why this shape over a registry** (per E1-b DIRECTED 2026-04-21): the registry pattern committed to a discriminated-union `dispatch.kind` whose `'two-step'` branch had cardinality 1. It forward-fit a third-party plugin API (Q3 2026 Future Work) that hasn't been designed yet. A hand-rolled switch gets the same extensibility footprint (one commit per target add/remove) without pre-committing a descriptor shape that might not match what the plugin API actually needs. Third-party plugin API stays Explored Future Work, designed later without constraint from v0. Layering seam from Session 3 (core importing from app) also disappears — `KNOWN_TARGETS` lives in app-layer where dispatch lives.

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

**Claude Code (Epitaxy webview) `file=` handling — UNCERTAIN (E3-b DIRECTED 2026-04-21):**

Upstream research `evidence/claude-desktop-deep-links.md` Finding 9 documents that the Claude Code webview-nav composes `/epitaxy?q=<p>&folder=<a>&src=external` — with NO `file=` param passed through — even though the handler parses `file=` and counts it in the `desktop_code_deeplink_received` analytics event. Research called this "a probed asymmetry" and stopped short of saying `file=` is ignored.

Spec v0 behavior:
- `buildClaudeUrl({mode:'code'}, p)` emits `claude://code/new?q=&folder=&file=` (same shape as Cowork).
- `file=` is kept in the URL for forward-compat and because the handler does parse it.
- **Live-test gate at implementation (`STOP_IF` in §15):** implementer must verify whether `file=` actually surfaces the attachment in the Code tab's composer on Claude.app 1.2581.0+. If it is ignored, implementer updates this section + AC2 before merging (do not ship with overclaimed behavior).
- AC2 weakens accordingly (see §4 note below): "folder-scoped open + prompt pre-fill; file-attachment verification deferred to implementation."

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

**Dogfood success metric (E2-a DIRECTED 2026-04-21):** per the challenger's DC2 concern, the minimal composer is shipping as-is with a **week-1 dogfood feedback metric** to re-open SQ1 if warranted:

- **Metric:** observe whether dogfood users (Nick + immediate team) routinely type additional instruction into the target-agent composer after pre-fill. Instrumented via the local `stats.jsonl` counter (E5b) + qualitative feedback.
- **Re-open trigger:** if >50% of dispatches are followed by the user adding >20 chars before pressing Enter in the target agent, SQ1 re-opens and we add structured fields (title, optional excerpt).
- **Capture location:** XQ2 dogfood rollout observations; re-open happens in a follow-up story if triggered.
- **Expiry:** 7 days post-merge to dogfood build. Beyond that window, the minimal composer is the accepted v0 shape.

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

`packages/server/src/api-extension.ts` handler — per-OS **install-registration** probe (not running-process check; see audit H2 2026-04-21):

- macOS: `osascript -e 'id of app "Claude"'` — returns bundle id on installed; **non-zero exit + error on uninstalled**. This is the install check, not the run check. (Alternative: `mdfind "kMDItemCFBundleIdentifier == 'com.anthropic.claudefordesktop'"` — same signal, different primitive.)
- Windows: `reg query "HKCU\\Software\\Classes\\claude" /ve` — exit 0 means scheme is registered in the user hive (installer-written registration). Merged view of `HKCR` means this catches HKLM too.
- Linux: `xdg-mime query default x-scheme-handler/claude` — non-empty stdout means a `.desktop` handler is registered for the scheme.
- Per-OS shell invocation with 2s timeout; results cached server-side for 60s. On timeout or unexpected error, respond `{installed: false}` (conservative default; row renders disabled-with-tooltip).

**Electron host — Linux fallback (see audit M6):** `app.getApplicationInfoForProtocol` is a macOS + Windows Electron API (not implemented on Linux). On Linux Electron hosts the `ok:shell:detect-protocol` handler falls back to the same `xdg-mime query default x-scheme-handler/<scheme>` shell probe as the web path. Same 2s timeout, same conservative default.

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

### 6.5 Cursor two-step dispatcher (SQ4 DIRECTED)

`packages/app/src/lib/handoff/cursor-two-step.ts`:

```typescript
export async function dispatchCursor(payload: HandoffPayload): Promise<HandoffOutcome> {
  // Step 1: spawn `cursor <projectDir>` via host-specific primitive.
  const step1 = await spawnCursorFolder(payload);
  if (!step1.ok) return step1;

  // Step 2: settle buffer, then fire prompt URL.
  //
  // Default 1000ms — matches the canonical recipe in
  // reports/deep-linking-ai-desktop-apps-2026/evidence/cursor-encoding-empirics.md
  // §Test protocol (the R1–R5 reference invocation uses `sleep 1`).
  //
  // Cold-start heuristic: if Cursor isn't already running, Launch Services
  // adds 500-1500ms to cold-launch. Probe: on macOS `pgrep -x Cursor` via
  // the existing ok:shell:detect-protocol IPC (extended to accept a
  // process-running probe) — if not running, use 1500ms.
  //
  // The &workspace=<basename> safety-net (separately — see buildCursorUrl
  // + evidence/cursor-encoding-empirics.md Finding 5) pins the URL to the
  // right window once it exists; the settle delay is about ensuring the
  // window HAS opened before the URL fires, since an un-opened workspace
  // name can't be matched.
  const settleMs = await isCursorRunning() ? 1000 : 1500;
  await wait(settleMs);

  const promptUrl = buildCursorUrl(payload);
  return openExternal(promptUrl);
}

async function spawnCursorFolder(payload: HandoffPayload): Promise<HandoffOutcome> {
  if (window.okDesktop) {
    // Electron host: narrow IPC channel ok:shell:spawn-cursor
    // (see TQ4b LOCKED below for why not overloading open-external).
    return window.okDesktop.shell.spawnCursor(payload.projectDir);
  } else {
    // Web host: NOT SUPPORTED per E4 DIRECTED 2026-04-21.
    // Web-host Cursor row is always disabled-with-tooltip ("Cursor handoff
    // requires the desktop build"). This branch is never reached in practice
    // because dispatch.ts filters Cursor on web before calling the two-step
    // dispatcher — but returning cleanly here is a defense-in-depth.
    return { ok: false, reason: 'web-host-cursor-unsupported' };
  }
}
```

**TQ4b LOCKED (Cursor Electron-host folder-spawn):** new narrow IPC channel `ok:shell:spawn-cursor`. Shape:

- Args: `{ path: string }` — must be absolute, non-empty, no null bytes.
- Main-process handler resolves the `cursor` binary via **`app.getApplicationInfoForProtocol('cursor://').path`** (NOT via `$PATH` — see DC7.1 security note). If `getApplicationInfoForProtocol` returns no path, fall back to `which cursor` with a 500ms timeout, then fail with `{ok:false, reason:'not-installed'}`.
- Spawns `<resolved-path> <user-path>` with a 2s timeout. Stderr drained; stdout ignored.
- No shell interpolation (`spawn()` with argv array, `shell: false`).

Why a dedicated channel (not overloading `ok:shell:open-external`):

- `shell.openExternal`'s threat model is a **URL scheme allowlist** (Shabarkin 2022 class — 1-click RCE via target-app URL parsers).
- `shell.spawnCursor`'s threat model is a **command allowlist** with additional concerns (PATH hijacking, argument injection, path traversal).
- Conflating the two would blur PR review + audit traceability. One channel = one threat model = one validation path = one test surface.

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
import { KNOWN_TARGETS } from '@inkeep/open-knowledge-app/handoff/targets';
// ^ test-only cross-package import; main-process runtime bundle does NOT
//   include app-layer code (tree-shaken since no runtime handler imports it).

test('exact-set allowlist membership', () => {
  expect([...ALLOWED_SCHEMES].sort()).toEqual([
    'claude:', 'codex:', 'cursor:', 'http:', 'https:', 'mailto:', 'openknowledge:',
  ]);
});

test('known-target schemes are covered by allowlist (drift detector)', () => {
  // Per E1-b DIRECTED: if a future spec adds a target to KNOWN_TARGETS
  // without adding its scheme to ALLOWED_SCHEMES, this test catches it
  // before ship. Operates on the simple data constant; no registry type.
  const knownSchemes = new Set(
    KNOWN_TARGETS.flatMap((t) => t.schemes),
  );
  for (const scheme of knownSchemes) {
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

Three host surfaces, one shared component, **rendered from `KNOWN_TARGETS` data constant** (E1-b DIRECTED — `OpenInAgentMenu` iterates the array):

- **`EditorHeader.tsx`**: dropdown button in the header's action strip. Primary surface. Opens on click; trigger is a `MoreHorizontal` icon with "Open in…" aria-label. Rows rendered from `KNOWN_TARGETS.map(...)`.
- **`CommandPalette.tsx`**: entries derived from `KNOWN_TARGETS` (one per target: "Open in Claude Cowork", etc.). Keyboard-first path. Disabled entries still appear (with "not installed" hint) — matches the dropdown's disabled-row pattern.
- **`FileTree.tsx`** right-click context menu: submenu "Open in…" with rows from the same data constant. Triggered on any `.md` file in the sidebar, not just the active doc — resolves `docPath` from the right-clicked file.

All three paths route through the single `dispatchHandoff()` entry point in `packages/app/src/lib/handoff/dispatch.ts` — AC9 asserts zero other dispatch sites. Dispatch is a hand-rolled switch on `p.target` (per E1-b DIRECTED) with TypeScript `never` exhaustiveness checks.

**Adding a 5th target** is a 5-file change: (1) add to `HandoffTarget` union in `types.ts`, (2) add to `KNOWN_TARGETS`, (3) add switch case in `dispatch.ts`, (4) add URL builder in `core/handoff/`, (5) add scheme to `ALLOWED_SCHEMES`. Exhaustiveness check + drift detector enforce completeness; same one-commit footprint as a registry, without the registry's forward-fit complexity.

### 7.2 Dropdown copy (PQ4 DIRECTED)

Four rows, in order:

1. **Open in Claude Cowork**
2. **Open in Claude Code**
3. **Open in Codex**
4. **Open in Cursor**

Rationale for "Open in" prefix: matches **Mintlify's and Fumadocs' contextual-menu conventions** (per `reports/.../evidence/docs-site-handoff-landscape.md` lines 196-201 + 319-325). Reduces ambiguity in the command palette where entries don't share a header. (Note: Linear's 19-tool registry uses bare names like `'Cursor'` / `'Codex desktop'` — not "Open in X" — so Mintlify + Fumadocs are the right attribution for this copy pattern.)

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

**Cursor on web-host** (E4 DIRECTED): Cursor row is **always disabled** on web-host regardless of install state. Tooltip:

```
┌─────────────────────────────────────────┐
│ [○] Open in Cursor                      │
│                                         │
│     Cursor handoff requires the        │
│     desktop build.                      │
│     [Install the Open Knowledge        │
│      desktop app →]                     │
└─────────────────────────────────────────┘
```

No secondary affordance (no web fallback for Cursor — unlike Claude's claude.ai fallback). The disabled state is intrinsic to v0's local-use-case posture, not a function of the user's Cursor-install state.

### 7.4 Electron/web parity (I7)

Both hosts render the same three surfaces, same dropdown, same disabled states. Underlying dispatch differs (IPC vs anchor-click) but the user-observable outcomes are identical for the same install-state configuration. Playwright coverage samples representative cells per host (see §13).

---

## 8. Host-Specific Details

### 8.1 Electron host

- Outbound URL dispatch via `window.okDesktop.shell.openExternal(url)` → `ok:shell:open-external` IPC → `checkOutboundUrl` → `shell.openExternal`.
- Cursor folder-spawn via `window.okDesktop.shell.spawnCursor(path)` → `ok:shell:spawn-cursor` IPC → validated spawn.
- Install detection via `window.okDesktop.shell.detectProtocol(scheme)` → `ok:shell:detect-protocol` IPC → `app.getApplicationInfoForProtocol` with timeout.

### 8.2 Web host (`open-knowledge start`)

- **Local-use-case posture (E4 DIRECTED):** v0 assumes server + browser + target agents are all on the same machine. Cross-machine `ok start` is out of scope (see §2 Non-Goals).
- Outbound URL dispatch via anchor-click (TQ7 LOCKED): `const a = document.createElement('a'); a.href = url; a.click();`. Avoids browser-level "Allow this site to open X?" dialogs that `window.location.href` triggers.
- **Cursor on web-host: DISABLED in v0.** No server-side folder-spawn endpoint. Dropdown row renders disabled-with-tooltip ("Cursor handoff requires the desktop build") regardless of Cursor install state. See §7.3.
- Install detection via `GET /api/installed-agents` server endpoint (per-OS shell probe, 60s server-side cache + per-client 10s React-layer throttle). Probes `claude:` + `codex:` only in web-host — Cursor detection is moot since the web row is always disabled.

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
| SQ9 | Registry-driven target definitions | **RETIRED — replaced by E1-b below (2026-04-21 batch 4).** | Session 3 introduced a `HandoffTargetDescriptor` registry pattern; Session 4 audit/challenge surfaced a layering violation (core importing from app) + over-engineering (discriminated-union with cardinality-1 branch + forward-fit for Q3 Future Work). Andrew E1-b: "drop registry, keep it simple." Replaced by E1-b. |
| **E1-b** | **Hand-rolled switch + pure-data `KNOWN_TARGETS` constant** | **DIRECTED (supersedes SQ9)** | **Andrew 2026-04-21 batch 4.** Target data is a `ReadonlyArray<TargetData>` in `packages/app/src/lib/handoff/targets.ts` with no function fields. Dispatch is a switch on `p.target` in `dispatch.ts` with TypeScript `never` exhaustiveness check. Install detection enumerates `KNOWN_TARGETS.flatMap(t => t.schemes)`. Shell-allowlist drift-detector test reads the data constant. Layering seam gone (target data + dispatch both in app-layer; core stays pure). Third-party plugin API stays Explored Future Work without v0 pre-commit to a descriptor shape. Same one-commit pattern to add a 5th target (5-file change enforced by `never` exhaustiveness + drift detector); ~150 LOC simpler than the registry. |
| **E2-a** | **Keep minimal prompt + 7-day dogfood re-open metric** | **DIRECTED** | **Andrew 2026-04-21 batch 4.** SQ1's minimal composer stays as-is. New AC-dogfood-1: observe ≤50% of dispatches followed by user adding >20 chars in target agent composer; failure triggers SQ1 re-open in a follow-up story. Instrumented via `stats.jsonl` (E5b). 7-day window post-merge to dogfood build. |
| **E3-b** | **Claude Code `file=` kept + UNCERTAIN disclosed + live-test gate** | **DIRECTED** | **Andrew 2026-04-21 batch 4.** `buildClaudeUrl({mode:'code'}, p)` emits `file=` for forward-compat (the handler does parse it per research Finding 9; only the Epitaxy webview composition may drop it). AC2 weakened — file-attachment verification deferred to implementation (see §4). STOP_IF added: implementer live-tests Claude.app 1.2581.0+; if `file=` is ignored, implementer updates §6.2 + AC2 before merging. No ship with overclaimed behavior. |
| TQ4b | Cursor step-1 folder-spawn is required | LOCKED | **2026-04-21 Andrew batch 2.** Confirmed load-bearing: Cursor's `cursor://` has no folder-open route of any kind (research-verified). Without step 1 the prompt URL fires into the wrong window or fails silently. New `ok:shell:spawn-cursor` IPC channel (not overloading `ok:shell:open-external`) because the threat model differs — scheme allowlist vs command allowlist. |
| OQ-C | Cursor `mode=agent` pinned in v0 | DIRECTED | Not configurable per-call in v0. Future work if users request `ask`/`debug`/`plan` handoffs. |
| OQ-Codex-originUrl | Codex `originUrl=<git>` omitted in v0 | DIRECTED | No cross-machine repo resolution in v0. v0 uses `path=` only. |
| **E4-Local** | **v0 is local-use-case only** | **DIRECTED** | **Andrew 2026-04-21 batch 3.** Server + browser + target agents all on the same machine. Cross-machine `ok start` deployments are non-goals in v0 (see §2 Non-Goals). Web-host Cursor row is always disabled-with-tooltip ("Cursor handoff requires the desktop build") — no server-side folder-spawn endpoint (`/api/handoff/open-folder`) ships. Cuts ~300 LOC + threat model surface. Claude + Codex anchor-click from web browser still works in local-use-case (browser machine = agent machine). I7 relaxed specifically for Cursor on web; preserved for Claude + Codex. |
| **E5a** | **Post-dispatch toast UX** | **DIRECTED** | **Andrew 2026-04-21 batch 3.** Success toast ("Opened in Claude Cowork.") / failure toast ("Couldn't reach Claude — try again?"). Uses existing sonner `Toaster`. Closes user-visible silent-failure gap for DC3 (Cursor cold-start misfire) + DC4 (Claude Code file= asymmetry) + vendor URL-drift. Implementation: `useHandoffDispatch.ts` hook. |
| **E5b** | **Local-only telemetry counters** | **DIRECTED** | **Andrew 2026-04-21 batch 3.** `~/.open-knowledge/stats.jsonl` — append-only one line per dispatch: `{target, host, outcome, ts, reason?}`. Zero phone-home (matches XQ3 LOCKED). Diagnostic value when dogfood users report "it didn't work." Implementation: `telemetry.ts` in `packages/app/src/lib/handoff/`. Extends OK's broader local-only-counter Future Work pattern. |

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
| A1 | `app.getApplicationInfoForProtocol(scheme)` is available in Electron 41.2.1 (OK's shipped version) — **macOS + Windows only; Linux falls back to `xdg-mime query` per §6.4** | HIGH | Electron 11+ API (shipped via [electron/electron#24112](https://github.com/electron/electron/pull/24112), Electron 11 blog post). OK ships 41.2.1. | Before ship |
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
- **R6 — Rollback path.** The spec ships as one PR-worth of commits (spec + implementation PRs, same branch). Rollback = `git revert <impl-commit>` + restore `shell-allowlist.ts` to `{https:, http:, mailto:, openknowledge:}`. The allowlist extension is intentionally a **1-way door per story §Value** (accepted cost) — reverting is mechanically trivial but any user who built a workflow on `claude://` / `codex://` / `cursor://` dispatch from OK would lose it. No feature flag in v0; internal-dogfood distribution makes flag-gating unnecessary. If a post-ship bug is localized to one target's URL builder, a narrow revert of that one file is preferred over the whole-feature revert.
- **R7 — Privacy / data egress via claude.ai web fallback (PQ6 secondary affordance).** The `https://claude.ai/new?q=<prompt>` path transmits OK-composed prompt content to Anthropic's servers via URL query string. For wiki pages containing confidential content (security reviews, internal planning, customer data), clicking "Open in claude.ai →" is a data-egress event. Mitigation: the affordance is surfaced ONLY inside the disabled-row tooltip (user explicitly opts in — no primary-click auto-fallback per PQ6 LOCKED). Copy change to consider at product-copy review: add "opens in browser with prompt pre-filled" hint under the secondary action to signal the data-path.

---

## 13. Test Plan

Three tiers.

### 13.1 Unit (node, no Electron/browser)

In `packages/core/src/handoff/*.test.ts`:

- `buildClaudeUrl`: 8 cases covering cowork/code × path edge cases (`%`, em-dash, unicode, space, **literal `&` in filename `/Users/x/A & B/doc.md`**, **`#` in filename**, **Windows `\` path** per DC8.5).
- `buildCodexUrl`: 4 cases (same path-edge dimensions).
- `buildCursorUrl`: 8 cases, incl. the silent-corruption cases from cursor-encoding-empirics.md (`%41`, em-dash `%E2%80%94`, pct-encoded URLs) + the DC8.5 `&` and Windows `\` path cases.
- `buildClaudeAiWebUrl`: 2 cases.
- `composePrompt`: 5 cases (simple path, long path, edge-case path chars, budget-boundary, determinism).

**`packages/app/src/lib/handoff/telemetry.test.ts` (new — E5b):**

- `recordHandoff({target, host, outcome, ts})` appends exactly one JSON line to `~/.open-knowledge/stats.jsonl`.
- Appends, not truncates — 3 sequential calls produce 3 lines.
- Fails gracefully when HOME dir is unwritable (logs warning, returns — does not throw).
- Electron host: uses Node `fs.promises.appendFile` via main-process bridge.
- Web host: uses same bridge via a new narrow `POST /api/handoff/record` endpoint (appends to the server-run-user's home) — OR deferred to Electron-only if simpler. Spec lean: Electron-only in v0; web-host is a no-op (diagnostic counters matter most on the dogfood Electron build).

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
- `POST /api/handoff/open-folder` — **NOT SHIPPED in v0** per E4 DIRECTED. No test needed. If re-added in a future spec, must ship with: bind-address=localhost, Origin/Referer same-origin check, realpath canonical-path validation (not lexical — handles symlinks), path-traversal test (`../` and symlink escape).

### 13.3 E2E (Playwright — per-host)

`packages/app/tests/stress/handoff.e2e.ts` (new).

**XQ1-refined matrix (18 cells):** 2 hosts × 3 **unique schemes** (Cowork + Code share `claude:` → one install state) × 3 install states = 18. Sample **8 cells** (added cell 8 per E5a/E5b — failure-path coverage for toast + stats telemetry):

| # | Host | Scenario |
|---|---|---|
| 1 | Electron | Claude Cowork happy path (all installed) → URL dispatched with correct shape; **success toast renders** ("Opened in Claude Cowork.") per E5a |
| 2 | Electron | Cursor two-step happy path → spawn + prompt URL fired, single modal verified; success toast renders |
| 3 | Electron | Install-state flip (Codex not installed → installed; async refresh updates row) |
| 4 | Web      | Claude Cowork happy path (anchor-click, Playwright intercepts via route handler); success toast renders |
| 5 | Web      | **Cursor on web is ALWAYS disabled** (E4 DIRECTED — no `/api/handoff/open-folder` in v0). Row renders disabled; tooltip shows "Cursor handoff requires the desktop build". Clicking the disabled row does nothing. |
| 6 | Web      | Disabled-state + "Open in claude.ai →" secondary tooltip click; success toast for web fallback |
| 7 | Web      | **Empty-dropdown case — all schemes unavailable + Cursor always-disabled.** Every row disabled; confirm no silent-failure paths, all tooltips render, Claude rows surface the web-fallback affordance, Cursor row shows the desktop-build tooltip. Highest-UX-regression-risk cell per DC8.4. |
| 8 | Electron | **Failure path — `ok:shell:spawn-cursor` IPC returns `{ok:false, reason:'not-installed'}`.** Failure toast renders ("Couldn't reach Cursor — try again?"). `stats.jsonl` append-line asserted with correct `{target, host, outcome:'error', reason}`. Covers E5a + E5b together. |

**Mocking boundary (per DC8.1-8.3):** E2E cells cannot depend on the dev machine's actual install state (every OK contributor has Claude + Codex + Cursor installed). Tests inject faked install state via:

- **Electron host:** mock the `ok:shell:detect-protocol` IPC response per cell (Playwright fixtures in `tests/stress/fixtures/handoff-mocks.ts`). The main-process handler stays unchanged; the test harness intercepts at the IPC boundary.
- **Web host:** mock `GET /api/installed-agents` responses at Playwright's route-handler level (`page.route('/api/installed-agents', ...)`).
- **Cursor spawn (both hosts):** mock the `ok:shell:spawn-cursor` IPC (Electron) / `POST /api/handoff/open-folder` endpoint (web) to return `{ok: true}` without actually spawning Cursor. Cells 2 and 5 assert the correct IPC call / endpoint call was made with the expected arguments, not that Cursor actually opened.

**Test-only cross-package import note (DC8.3):** `shell-allowlist.test.ts` imports `BUILT_IN_TARGETS` from `@inkeep/open-knowledge-core/handoff/registry` for the registry-coverage drift-detector. This is a test-only dev-dependency boundary; runtime bundle for the Electron main process does NOT include the registry (tree-shaken by the main-process bundler since the handler never imports `registry`). Verify via bundle size audit at implementation.

Target-app launch itself is not verified in Playwright (no headless-control of Claude/Codex/Cursor available); the assertion is "the correct URL was constructed and dispatched to the correct primitive."

---

## 14. Future Work

| Item | Tier | Notes |
|---|---|---|
| User-editable prompt field | Identified | Nick explicit NOT-NOW in PQ5. Revisit if dogfood feedback shows users routinely edit in target app's composer. |
| Saved prompt templates per target | Noted | Linear ships this. Revisit with "handoff registry" follow-up story. |
| Zed / Windsurf / VS Code handoff | Explored | Research report covers; excluded from v0 per NOT NOW. Spec's registry supports addition — new `zed-url.ts` + `BUILT_IN_TARGETS` descriptor + allowlist row. No UI / dispatch / detection code changes. |
| **Third-party handoff-target plugin API** | **Explored** | **Designed later without v0 pre-commit.** Per E1-b DIRECTED 2026-04-21, the plugin API is NOT forward-fit in v0 — no descriptor type is exported; `KNOWN_TARGETS` is a simple data constant in app-layer. When the plugin API is picked up (likely Q3 2026): shape the `TargetData` extension + registration surface against real partner requirements at that time, rather than a pre-specified interface. Aligned with Linear's `customUrl` / `customTerminalScript` hooks and Mintlify's `contextual.options` custom-entry schema as inspiration. Current v0 surface is "fork + add target" — same as Linear and Mintlify's early versions. |
| MCP-install-via-URL handoff | Explored | Cursor + VS Code + Mintlify ship this. Separate story. |
| Multi-doc handoff (Claude's repeatable `folder=`/`file=`) | Noted | Technically supported by Claude's URL shape; requires multi-select UI elsewhere first. |
| `originUrl=<git>` on Codex (cross-machine repo resolution) | Noted | v0 uses `path=` only; future enhancement for cross-machine portability. |
| Embedding-aware UI | Noted | Parked as P2 per XQ5. Own story when partner embed materializes. |
| Telemetry (handoffs-per-target) | Noted | XQ3 LOCKED no phone-home. Local-only counters (`~/.open-knowledge/stats.jsonl`) possible for internal dogfood. |
| Detection of OK-MCP not configured in target agent | Identified | V0 assumes MCP available on dogfood machines; prompt is robust without it. If missing-MCP becomes a common failure, add "Configure open-knowledge in Claude Desktop →" in first-use UX. |
| Linux Electron `getApplicationInfoForProtocol` parity | Identified | Spec covers Linux via `xdg-mime query` fallback inside the IPC handler (§6.4). If Electron upstream ships Linux support, we can remove the fallback. |
| Bridge-contract duplication surface-count revisit | Noted | `packages/core/src/desktop-bridge.ts` + `packages/desktop/src/shared/bridge-contract.ts` are kept in sync via contract-equality test (US-010). After this spec: 10 channels + bridge surfaces across both files. Trigger for unifying the duplication (via core export map, moving to electron-core subpackage, or similar): either (a) count exceeds 15 channels, or (b) next spec adds ≥3 new surfaces and the sync overhead becomes load-bearing in PR review. Not this spec's scope to resolve. |
| Third-party plugin API — security preconditions | Explored | When the registry is opened to third-party contributions, scheme strings passed to shell probes (osascript / reg query / xdg-mime) become a shell-injection vector. Precondition for plugin API: scheme strings must match `^[a-z][a-z0-9+.-]*$` (RFC 3986 `scheme` production) **before** interpolation into any shell command. Also: every plugin-declared scheme must pass the main-process allowlist check before the plugin mounts — plugins can declare schemes but cannot unilaterally add them to the D47 allowlist. |
| Post-dispatch user feedback (toast UX) | **Shipped in v0 per E5a DIRECTED** | Renders sonner success/failure toast per dispatch. See §6 / §13 cell 1-2/4/8. No longer Future Work. |
| Local-only telemetry (`~/.open-knowledge/stats.jsonl`) | **Shipped in v0 per E5b DIRECTED** | Append-only counter per dispatch. See §5.1 / §13.1 / §15 SCOPE. No longer Future Work. |
| Web-host Cursor support + cross-machine `ok start` | **Identified** | Deferred per E4 DIRECTED. Reviving requires: server-side `/api/handoff/open-folder` with bind-address=localhost + Origin/Referer + realpath + path-traversal tests; detection of server-vs-client machine mismatch; possibly a "dispatch-on-client" pattern where server sends URL back to browser for anchor-click (breaks the shell-out model entirely). Story-level redesign — not a small follow-up. |

---

## 15. Agent Constraints

**SCOPE** (implementation may touch these):

- `packages/core/src/handoff/` (create — types + URL builders + prompt-composer; NO registry/descriptor per E1-b)
- `packages/app/src/lib/handoff/targets.ts` (create — `KNOWN_TARGETS` pure-data constant per E1-b)
- `packages/core/src/desktop-bridge.ts` (extend: `shell.detectProtocol`, `shell.spawnCursor`)
- `packages/desktop/src/main/shell-allowlist.ts` (extend: 3 new schemes)
- `packages/desktop/src/main/ipc-handlers.ts` (add 2 handlers)
- `packages/desktop/src/shared/ipc-channels.ts` (add 2 channels)
- `packages/desktop/src/shared/bridge-contract.ts` (mirror core)
- `packages/server/src/api-extension.ts` (add 1 endpoint — `GET /api/installed-agents`; `POST /api/handoff/open-folder` was removed per E4 DIRECTED)
- `packages/app/src/lib/handoff/` (create — includes `telemetry.ts` per E5b DIRECTED)
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
- **Claude Code `file=` live-test shows the param is ignored on Claude.app 1.2581.0+ (per E3-b DIRECTED):** stop, update §6.2 + AC2 to match verified behavior (drop the file-attachment claim), re-run the audit's cell 1/cell 4 assertions. Do not ship with overclaimed AC2.
- **Registry pattern reappears in code** (descriptor types, discriminated-union dispatch.kind, core→app imports for spawn handlers): E1-b DIRECTED retired this pattern deliberately — re-introducing it re-opens the layering seam and the audit challenge. Stop and re-open the decision in spec before implementing.

**ASK_FIRST** (confirm before acting):

- Renaming any existing bridge surface (contract-equality test gates this).
- Changing the dropdown copy away from "Open in …" prefix.
- Adding any 5th target to v0 (requires story amendment).
- Enabling any analytics SDK (XQ3 LOCKED blocks this).
- Exposing a handoff-target registration API publicly (third-party plugins — Explored Future Work per E1-b; requires its own spec).
- Introducing a `HandoffTargetDescriptor` type or discriminated-union dispatch kind (see STOP_IF above — E1-b DIRECTED retired the registry pattern).

---

## 16. Next steps

**Ready for `/ship`.** Spec is finalized: audit + design-challenger complete, all findings resolved (14 pure corrections applied; 5 escalations resolved via user direction: E1-b, E2-a, E3-b, E4, E5). Resolution summary:

| Decisions | Count |
|---|---|
| LOCKED (story carry) | 9 |
| DIRECTED (spec-resolved) | 19 |
| DELEGATED (implementer latitude within constraints) | 1 |
| Future Work (Explored / Identified / Noted) | 10 |
| **Open questions remaining** | **0** |

**Critical implementation gates** (STOP_IF in §15):
1. Live-test Claude Code `file=` on Claude.app 1.2581.0+ before merging; update §6.2 + AC2 if ignored (E3-b).
2. Do not re-introduce registry pattern / HandoffTargetDescriptor type (E1-b retired deliberately).
3. Cursor URL-parser behavior verification on Cursor 3.1.15+ before merging encoding tests.

**Quality-bar checks passed:**
- ✅ Every In Scope item has LOCKED or DIRECTED resolution status.
- ✅ 3P dependency selections (sonner for toast, Electron IPC for bridge) are named.
- ✅ Architectural viability validated against real codebase (evidence/codebase-surface-map.md).
- ✅ Integration feasibility confirmed (Electron IPC shape, bridge-contract duplication pattern, server API-extension insertion point).
- ✅ Acceptance criteria verifiable (8 E2E cells map to AC1-AC11 + AC-dogfood-1).
- ✅ No In Scope item depends on an Out of Scope item.
- ✅ Mechanical adversarial checks: no ASSUMED resolution status on load-bearing items; no LOW-confidence 1-way doors.

**Ship handoff:**
- Run `/ship` against this spec when ready to begin implementation.
- Implementation PR adds ~1400 LOC across 5 packages (down from ~1700 after E1-b + E4 cuts).
- Dogfood first to Nick + immediate team; AC-dogfood-1 re-open window is 7 days post-merge.
