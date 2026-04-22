# Audit Findings

**Artifact:** `specs/2026-04-21-open-in-agent-desktop/SPEC.md`
**Audit date:** 2026-04-21
**Total findings:** 10 (2 H, 5 M, 3 L)

Coverage: L1–L7 coherence lenses run; T1 (own codebase — shell-allowlist.ts, ipc-channels.ts, bridge-contract.ts), T3/T4 (Electron API docs via web search), T5 (upstream research report verification including Linear, Mintlify, Fumadocs extraction).

---

## High Severity

### [H] Finding 1: §5.1 module layout omits `ok:shell:spawn-cursor` IPC channel, handler, and bridge method

**Category:** COHERENCE
**Source:** L1 (cross-section contradiction)
**Location:** §5.1 (Module layout) vs §6.5 (Cursor two-step), §8.1 (Electron host), §15 (Agent Constraints)
**Issue:** §5.1's "Module layout" lists exactly one new IPC channel, one new handler, and one new bridge method — all `shell.detectProtocol` / `ok:shell:detect-protocol`. But §6.5 introduces a second narrow IPC channel (`ok:shell:spawn-cursor`) with its own handler and bridge method `shell.spawnCursor(path)`, §8.1 confirms the Electron host wires both (`window.okDesktop.shell.spawnCursor`), and §15 SCOPE says "`ipc-channels.ts` (add 2 channels)" and "extend: `shell.detectProtocol`, `shell.spawnCursor`". An implementer reading §5.1 as the architectural shape will miss a load-bearing surface.
**Current text (§5.1):**
> `ipc-handlers.ts         — NEW handler: ok:shell:detect-protocol`
> `ipc-channels.ts         — NEW channel: ok:shell:detect-protocol`
> `bridge-contract.ts      — EXTENDED: shell.detectProtocol(scheme)`
> `packages/core/src/desktop-bridge.ts ... bridge-contract.ts mirror: shell.detectProtocol added`
**Evidence:** §6.5 "TQ4 resolution: add a new narrow IPC channel `ok:shell:spawn-cursor`"; §15 "add 2 channels" and "extend: `shell.detectProtocol`, `shell.spawnCursor`"; §8.1 "Cursor folder-spawn via `window.okDesktop.shell.spawnCursor(path)` → `ok:shell:spawn-cursor` IPC".
**Status:** INCOHERENT
**Suggested resolution:** Update §5.1 to list both new channels / handlers / bridge methods. Also update `evidence/codebase-surface-map.md` which says "This spec adds 1 channel, bringing the total to 9" — the correct number after the SQ9/TQ4 evolution is 10 (8 existing + 2 new), still well within the 20-channel scale trigger.

---

### [H] Finding 2: §6.4 macOS install-detection probe checks "running", not "installed"

**Category:** FACTUAL
**Source:** T5 (macOS osascript semantics — verified against upstream research evidence)
**Location:** §6.4 (Install detection — web path, macOS branch)
**Issue:** The proposed probe `osascript -e 'tell application "System Events" to exists application process "Claude"'` checks whether the application PROCESS is currently running — not whether it is installed. An installed-but-not-running Claude Desktop would produce `false` and render the row as disabled-with-tooltip even though the URL dispatch would work correctly. Conversely, a running Claude returns `true` whether or not the `claude://` handler is registered. This misreads the UX goal of "is the app available to receive this URL?"
**Current text (§6.4):**
> macOS: `osascript -e 'tell application "System Events" to exists application process "Claude"'` PER scheme; OR bundle-id lookup via `osascript -e 'id of app "Claude"'`. Fall back to LaunchServices query.
**Evidence:** Standard macOS semantics: `exists application process X` is a runtime check against `System Events`'s process table; only `id of app X` (which throws / returns empty for uninstalled) or `LSCopyApplicationURLsForURL` / `/usr/bin/mdfind` / `defaults read com.apple.LaunchServices.plist` check registration state. The upstream research (`reports/deep-linking-ai-desktop-apps-2026/evidence/handoff-prior-art.md` line 233) explicitly calls `osascript -e 'tell application "Claude" to get name'` an identity check that "returns just 'Claude' — because `get name` is a universal property every app supports" — i.e. returning a value doesn't even require the app to exist; it's purely an AppleScript identity probe.
**Status:** CONTRADICTED
**Suggested resolution:** Replace the primary macOS probe with `osascript -e 'id of app "Claude"'` (returns bundle id on installed / throws with non-zero exit on uninstalled) and/or `mdfind "kMDItemCFBundleIdentifier == 'com.anthropic.claudefordesktop'"` for bundle-id lookup. Alternatively use `LSCopyApplicationURLsForURL(CFURLCreateWithString("claude://"))` via a tiny native helper. The "fall back to LaunchServices" phrasing already hints at the right primitive — promote it from fallback to primary.

---

## Medium Severity

### [M] Finding 3: §13.3 E2E matrix arithmetic is internally inconsistent (18 vs 24)

**Category:** COHERENCE
**Source:** L1 (mathematical contradiction)
**Location:** §13.3 Test Plan — E2E
**Issue:** The header says "18-cell matrix" but the multiplicative expansion in the same parenthesis evaluates to 24. `2 × 4 × 3 = 24`, not 18. The phrase "incl. Claude twice" suggests the intended dedup was to fold Claude Cowork + Claude Code into one install state (they share the `claude:` scheme per §6.4), but that would give `2 hosts × 3 unique schemes × 3 install states = 18`, not `2 × 4 × 3`. As written, an implementer cannot reconcile the two numbers.
**Current text:**
> **XQ1-refined:** 18-cell matrix (2 hosts × 4 targets × 3 install states = 24 cells incl. Claude twice) → sample 6 cells
**Evidence:** Pure arithmetic plus §6.4 "Cowork + Code share the `claude:` scheme; detection enumerates unique schemes."
**Status:** INCOHERENT
**Suggested resolution:** Pick one: either "24-cell matrix (2 hosts × 4 targets × 3 install states)" or "18-cell matrix (2 hosts × 3 unique schemes × 3 install states — Claude Cowork + Code share `claude:` install state)". The existing sampling of 6 cells is unaffected either way.

---

### [M] Finding 4: §6.1.5 registry descriptor signature mismatches §6.5 `spawnCursorFolder` implementation

**Category:** COHERENCE
**Source:** L1 (type-contract contradiction across sections)
**Location:** §6.1.5 (registry — `cursor` descriptor) vs §6.5 (Cursor two-step dispatcher)
**Issue:** The descriptor's wire-up passes a `HandoffPayload`; the implementation accepts a `string`. A TypeScript compiler would reject this as written. Either the descriptor's `spawnFolder` takes `HandoffPayload` (per §6.1 type declaration: `spawnFolder: (p: HandoffPayload) => Promise<HandoffOutcome>`) and the implementation must destructure `payload.projectDir`, or the function signature should accept `HandoffPayload`.
**Current text (§6.1.5):**
> ```ts
> spawnFolder: (p) => spawnCursorFolder(p),
> ```
> ```ts
> // §6.1 interface declaration
> spawnFolder: (p: HandoffPayload) => Promise<HandoffOutcome>;
> ```
**§6.5 text:**
> ```ts
> async function spawnCursorFolder(projectDir: string): Promise<HandoffOutcome> { ... }
> ```
> `const step1 = await spawnCursorFolder(payload.projectDir);`  // top of dispatchCursor
**Evidence:** Side-by-side inspection of §6.1, §6.1.5, §6.5 code blocks.
**Status:** INCOHERENT
**Suggested resolution:** Unify on `HandoffPayload` (matches §6.1 interface): change §6.5 to `async function spawnCursorFolder(payload: HandoffPayload)` and have it destructure `payload.projectDir` internally. Then §6.1.5's `(p) => spawnCursorFolder(p)` works, and §6.5's top-level `dispatchCursor` call becomes `spawnCursorFolder(payload)`.

---

### [M] Finding 5: §6.1.5 shows a circular import (`core` importing from `app`)

**Category:** COHERENCE
**Source:** L4 (evidence/synthesis fidelity — shown code conflicts with architectural constraint stated inline)
**Location:** §6.1.5 (Built-in registry)
**Issue:** The registry lives in `packages/core/src/handoff/registry.ts` but imports `spawnCursorFolder` from `../../app/src/lib/handoff/cursor-two-step.ts`. `packages/core/` has no dependency on `packages/app/`, and §5.1 documents core as "shared, no React, no Node APIs" — an import from `app/` would both invert the dependency direction and pull DOM/React into core's compilation surface. SPEC acknowledges this inline ("import path pragmatics: ... the descriptor's spawnFolder is wired at the dispatch-module boundary, not imported circularly. Shown here conceptually"), but leaves the broken code block as the only concrete shape an implementer has to follow.
**Current text (§6.1.5):**
> ```ts
> import { spawnCursorFolder } from '../../app/src/lib/handoff/cursor-two-step.ts'; // app-layer hook
> // (import path pragmatics: registry data lives in core; the Cursor spawn is
> //  host-dependent — see §6.5 for the indirection. In implementation, the
> //  descriptor's spawnFolder is wired at the dispatch-module boundary, not
> //  imported circularly. Shown here conceptually.)
> ```
**Evidence:** §5.1 declares core as "shared, no React, no Node APIs"; `packages/core/package.json` has no `@inkeep/open-knowledge-app` dependency; the `spawnCursorFolder` implementation in §6.5 uses `window.okDesktop` and `fetch('/api/handoff/open-folder')` — browser-only surfaces that break core's compat constraint.
**Status:** INCOHERENT
**Suggested resolution:** Rewrite §6.1.5 to show the real shape: core exports the registry with `spawnFolder: null | (undefined)` slot per descriptor, and the app-layer `dispatch.ts` module injects the host-specific spawn at mount time (either via a `registerSpawnHandler(id, fn)` call from app, or by having the app compose its own `APP_TARGETS = BUILT_IN_TARGETS.map(...)` that fills in spawn handlers). This also more naturally supports the Future-Work third-party plugin API in §14.

---

### [M] Finding 6: §6.4 `app.getApplicationInfoForProtocol` platform coverage gap (Linux Electron)

**Category:** FACTUAL
**Source:** T4 (Electron API documentation)
**Location:** §6.4 (Install detection — Electron path), §11 Assumption A1
**Issue:** `app.getApplicationInfoForProtocol(url)` is a macOS + Windows API per Electron documentation; it has no Linux implementation. §11 A1 asserts "available in Electron 41.2.1 (OK's shipped version)" without platform qualification, and §6.4's Electron handler calls the API unconditionally. SPEC §5/§8 support all three platforms (`platform: 'darwin' | 'win32' | 'linux'` in `bridge-contract.ts`). A Linux Electron user would hit the timeout path on every detect call and all rows would render disabled.
**Current text (§6.4):**
> ```ts
> const info = await Promise.race([
>   app.getApplicationInfoForProtocol(`${scheme}://`),
>   new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
> ]);
> ```
**Evidence:** Electron docs: "`app.getApplicationInfoForProtocol(url)` ... macOS, Windows". Introduced in Electron 11 (PR #24112, 2020), never backfilled to Linux. OK ships Electron 41.2.1 per `packages/desktop/package.json:30`, so the version isn't the issue — platform coverage is.
**Status:** STALE (partial coverage; not wrong, just incomplete)
**Suggested resolution:** Either (a) fall back to the web-path's `xdg-mime query default x-scheme-handler/<scheme>` shell probe inside the Electron host on Linux, or (b) document Linux as an explicit NOT NOW (rows show as disabled with a platform-specific tooltip). Also correct Assumption A1's minimum Electron version: the API shipped in Electron 11, not 25+ (see Low-severity Finding 8).

---

### [M] Finding 7: §7.2 miscredits Linear for the "Open in" prefix convention

**Category:** FACTUAL
**Source:** T5 (research-report cross-check — Linear registry extraction)
**Location:** §7.2 (Dropdown copy — PQ4 DIRECTED)
**Issue:** SPEC claims the "Open in" prefix "matches Linear's 19-tool registry convention" and cites `reports/.../evidence/linear-ai-deeplinks-extraction.md`. The verbatim Linear registry in that evidence file uses just the tool name (e.g. `name: 'Cursor'`, `name: 'Codex desktop'`, `name: 'Claude Code'`, `name: 'Amp'`) — not "Open in X" — with descriptions like `"Opens in the Cursor desktop app"`. The "Open in X" literal UI pattern is Mintlify + Fumadocs + Vercel AI Elements, not Linear. The decision (PQ4 LOCKED) is fine; only the attribution is wrong.
**Current text (§7.2):**
> Rationale for "Open in" prefix: matches Linear's 19-tool registry convention (per `reports/.../evidence/linear-ai-deeplinks-extraction.md`); matches Mintlify's contextual menu; reduces ambiguity in the command palette where entries don't share a header.
**Evidence:** `linear-ai-deeplinks-extraction.md` lines 64-100: Linear entries literally read `name: 'Cursor'`, `name: 'Codex desktop'`, etc. The "Open in X" pattern IS attested by Mintlify (`reports/.../evidence/docs-site-handoff-landscape.md` lines 196-201: `title: "Open in Claude"`, `title: "Open in Cursor"`, etc.) and Fumadocs (same file lines 319-325: `label: t("open.chatgpt")`, etc.).
**Status:** CONTRADICTED (factual miscite)
**Suggested resolution:** Replace "matches Linear's 19-tool registry convention" with "matches Mintlify and Fumadocs' contextual-menu conventions." The decision remains PQ4 LOCKED; only the evidence pointer changes.

---

## Low Severity

### [L] Finding 8: Assumption A1 understates `app.getApplicationInfoForProtocol` minimum Electron version

**Category:** FACTUAL
**Source:** T4 (Electron release history)
**Location:** §11 Assumptions — A1
**Issue:** SPEC says "Electron 25+ API". The API was introduced in Electron 11.0.0 (PR #24112, merged 2020-06). The minimum is 11, not 25. OK ships 41.2.1 so the practical conclusion (API is available) is right; only the floor is wrong.
**Current text:**
> A1: `app.getApplicationInfoForProtocol(scheme)` is available in Electron 41.2.1 (OK's shipped version). HIGH | Electron 25+ API; spec checks at implementation start
**Evidence:** electron/electron PR #24112 "feat: add app.getApplicationInfoForProtocol API" merged 2020 and shipped in Electron 11.0.0 blog post.
**Status:** STALE
**Suggested resolution:** Change "Electron 25+ API" to "Electron 11+ API (OK ships 41.2.1)".

---

### [L] Finding 9: `evidence/codebase-surface-map.md` channel count stale vs SPEC's final shape

**Category:** COHERENCE
**Source:** L4 (evidence/synthesis drift)
**Location:** `evidence/codebase-surface-map.md` §Spec-additions to IPC channels
**Issue:** Evidence file says "This spec adds 1 channel (see §Spec-additions below), bringing the total to 9 — well within the hand-rolled budget." After SQ9 / TQ4 iteration SPEC now adds 2 channels (`ok:shell:detect-protocol` + `ok:shell:spawn-cursor`, per §15). Total is 10, not 9.
**Current text (evidence):**
> This spec adds 1 channel (see §Spec-additions below), bringing the total to 9 — well within the hand-rolled budget.
**Evidence:** SPEC §15 SCOPE says "`ipc-channels.ts` (add 2 channels)". Counted against `packages/desktop/src/shared/ipc-channels.ts` at baseline commit (8 channels) → 10 after the spec lands.
**Status:** STALE
**Suggested resolution:** Update evidence file to "adds 2 channels, bringing the total to 10." Does not change the scale-trigger conclusion (10 << 20).

---

### [L] Finding 10: `installUrl` values unverified against research / vendor pages

**Category:** FACTUAL
**Source:** T5 (research cross-check)
**Location:** §6.1.5 (registry entries for `claude-cowork`, `claude-code`, `codex`, `cursor`)
**Issue:** `installUrl` values (`https://claude.com/download`, `https://openai.com/codex`, `https://cursor.com/`) are not pinned in the upstream research report or its evidence files. The URLs are plausible but not verified. Low blast radius — the worst case is a 404 in the tooltip link, easy to fix post-ship — but they're baked into the spec as exact strings.
**Current text (§6.1.5):** per-descriptor `installUrl` fields.
**Evidence:** Grep of the research report for `claude.com/download`, `openai.com/codex`, `cursor.com/` returns no hits; only the SPEC file references those URLs.
**Status:** UNVERIFIABLE (from spec+research alone)
**Suggested resolution:** Spot-check the three install-URL destinations during implementation (cheap: `curl -I`). Consider OQ-B (disabled-row "Install…" target — vendor page vs OK-hosted hint) as the canonical place to resolve long-term rot.

---

## Confirmed Claims (summary)

**URL shape claims (§6.2) — all confirmed against upstream research:**
- `claude://cowork/new?q=&folder=&file=` and `claude://code/new?q=&folder=&file=` with `folder=` / `file=` repeatable (research Addendum E round 5, live-verified 2026-04-21).
- `codex://new?prompt=&path=` — confirmed; `originUrl=` deliberate v0 omission matches research's "uses `path=` only" guidance.
- `cursor://anysphere.cursor-deeplink/prompt?text=&workspace=&mode=agent` — confirmed, including the double-encoding rule for `text=` (research Addendum D.1 Linear extraction + `evidence/cursor-encoding-empirics.md`).
- Cursor two-step necessity (TQ4b LOCKED: Cursor `cursor://` has zero folder-open routes) — confirmed verbatim in research Addendum E.

**Version anchors (§11 Assumptions) — all confirmed against evidence files:**
- Claude.app 1.2581.0 (A5): matches research's probe version.
- Codex 26.415 (A6): matches research Addendum D.2 probe.
- Cursor 3.1.15 (A7): matches `evidence/cursor-encoding-empirics.md` live-test version.

**Codebase surface claims (§5.1, §6.6) — all confirmed against working copy at baseline commit `a1e74cb8`:**
- `shell-allowlist.ts` current state `{https:, http:, mailto:, openknowledge:}`: confirmed.
- `ipc-channels.ts` current 8 channels: confirmed (`ok:dialog:open-folder`, `ok:dialog:create-folder`, `ok:shell:open-external`, `ok:clipboard:write-text`, `ok:project:get-info`, `ok:project:list-recent`, `ok:project:open`, `ok:project:close`).
- `bridge-contract.ts` duplication pattern (core mirror, kept in sync via contract-equality test): confirmed by inspecting `bridge-contract.ts` docstring.
- D47 defense-in-depth rationale citation (Shabarkin 2022): confirmed in `shell-allowlist.ts` module docstring.

**Coherence spot-checks (L2, L3, L5, L6, L7):**
- L2 confidence-prose alignment: HIGH/MEDIUM/LOW labels on assumptions are consistent with stated evidence paths.
- L3 conditionality: version-bound claims in §11 are explicitly tagged with expiry (MEDIUM "Re-probe on version jumps") — good discipline.
- L5 summary coherence: §1 problem pointer and §2 goals/non-goals align; §9 Decision Log cross-references are consistent with §5-§8 details.
- L6 stance consistency: spec maintains implementable-prescriptive stance throughout.
- L7 inline attribution: most quantitative claims (500ms settle, 60s cache, 10s throttle, 2s timeout, 1 KB budget, 8K Cursor cap) are self-explanatory or cross-referenced to evidence. Exception: the "18-cell matrix" / "24 cells" discrepancy (Finding 3).

## Unverifiable Claims

- **§8.2 TQ7 LOCKED rationale: "anchor-click ... avoids browser-level 'Allow this site to open X?' dialogs that `window.location.href` triggers"** — carried from STORY as LOCKED; not in scope for audit to re-adjudicate. Modern Chrome/Safari/Firefox behavior on custom-scheme dispatch is heuristic-driven and not perfectly documented; the TQ7 LOCKED status + A4 coverage-via-Playwright is the remediation path if the claim turns out to be browser-version-dependent in practice.
- **§6.4 60s server-side cache + 10s client throttle interaction:** plausible, not tested here.
- **§6.4 "2s timeout" sufficient on slow Windows / Linux systems:** listed as A2 MEDIUM with integration-test verification plan — appropriate.

Sources:
- [Electron app.getApplicationInfoForProtocol API doc](https://www.electronjs.org/docs/latest/api/app)
- [feat: add app.getApplicationInfoForProtocol API — PR #24112](https://github.com/electron/electron/pull/24112)
- [Electron 11.0.0 release notes](https://www.electronjs.org/blog/electron-11-0/)
