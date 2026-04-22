# Changelog — open-in-agent-desktop

## 2026-04-21 — Story seed drafted from upstream research

**Input:** Rich context carried forward from `reports/deep-linking-ai-desktop-apps-2026/` — a 5-round research report with extensive live-testing on 2026-04-21 covering Claude Cowork / Claude Code / Codex / Cursor desktop apps.

**Upstream artifacts referenced:**
- `reports/deep-linking-ai-desktop-apps-2026/REPORT.md` — Executive Summary, Addendum E (project/folder scoping)
- `reports/deep-linking-ai-desktop-apps-2026/evidence/claude-desktop-deep-links.md` — Findings 8–12 (cowork/code host routes, public.folder handler, sidebar-mode enum)
- `reports/deep-linking-ai-desktop-apps-2026/evidence/project-scoping-on-launch.md` — Finding E3/E4 updated matrix
- `reports/deep-linking-ai-desktop-apps-2026/evidence/cursor-encoding-empirics.md` — two-pass decoder + silent-corruption edge case + window-targeting
- `reports/deep-linking-ai-desktop-apps-2026/evidence/codex-desktop-deep-links.md` — codex://new parser + path/originUrl semantics
- `reports/deep-linking-ai-desktop-apps-2026/evidence/cursor-desktop-deep-links.md` — 10-route surface + CursorJack hardening

**Routing decision:** /stories (not /projects, not /spec). The feature is one coherent customer action ("Open this wiki page in an AI desktop app") across three app integrations — not a portfolio question, not a decomposition-needed bet, not yet at technical-design stage.

**Scope coherence check (2-3 sentence test):** PASS. The story is: "OK users can hand off a wiki page (or the whole workspace) to Claude Cowork / Claude Code / Codex / Cursor with one click; the target app receives the repo as workspace context, the page as an optional attached file, and an optional prompt; when the target isn't installed, OK degrades gracefully."

**Greenfield check:** `grep -r 'claude://|codex://|cursor://' packages/` → no matches. `grep -r 'Open in (Claude|Codex|Cursor)' packages/` → no matches. No existing implementation; this is net-new work.

**Items carried forward:** ~15 items (decisions from research + open assumptions + cross-cutting constraints). See Items table in STORY.md.

**Load-bearing items flagged for user judgment:** priority ranking across the 3 apps (which is the first to ship?), scope decision on file-attachment-as-part-of-v1 (Claude-only capability — either drives UX to be Claude-first or forces the dropdown to be app-aware about what's supported per target), fallback UX for the "no AI desktop app installed" empty state, and a NEVER/NOT-NOW call on the MCP-install handoff variant (Cursor + VS Code + Mintlify all support this; do we include it in v1 or separate story?).

**No audit run for the seed stage.** Seed is the input to the specification process; audit happens downstream.

---

## 2026-04-21 — Added XQ5 embedding-aware UI (parked, P2) + forward connection + NOT NOW non-goal

Raised by Nick during the story review: if OK's web viewer ends up embedded in a third-party desktop shell (Claude Desktop / Codex / Cursor / a generic MCP-electron client renders OK inline as iframe/webview), the "Open in…" affordance this story ships creates a recursive-UX failure mode — "Open in Claude Cowork" rendered inside a Claude Cowork-embedded OK page is nonsensical. Broader UX adjustments likely needed: auto-collapse sidebar, compact chrome, possibly suppress command-palette entries that duplicate the host shell.

Three additions:
1. **[NOT NOW] non-goal** added to Non-goals section — captures embedding-aware UI + lists detection candidates (`window.parent !== window`, host-injected globals, `?embedded=1&host=<app>`, `document.referrer`, User-Agent sniffing, `postMessage` handshake) + revisit trigger (partner embed intent, OR OK embedding third-party content).
2. **XQ5 Parked P2** cross-cutting item in the Items table — preserves the detection-options list + notes this is likely its own story rather than v0 scope.
3. **Forward connection** in the Context section — explicit pointer that this deserves its own /stories run when partner-embed use cases materialize.

**Why captured here rather than a new story now:** no partner embed has been requested yet; raising it as v0 scope would triple the surface area of the handoff story without a concrete first-ship motivator. Parked-P2 with a clear revisit trigger is the correct decision latitude — specifiers reading this seed see the concern surfaced but not blocking; future strategists see it as identified work awaiting a motivator.

---

## 2026-04-21 — Nick resolved the 5 load-bearing items flagged for judgment

During review of the seed's progress scorecard, Nick confirmed 5 LOCKED decisions in one turn:

1. **PQ2 — Cowork vs Code as separate dropdown rows** (not merged into one "Claude" entry). Ship as 4 rows total: Claude Cowork / Claude Code / Codex / Cursor.
2. **PQ3 — Parallel ship** (not Claude-first-then-others). All four targets in the same iteration.
3. **PQ5 — OK composes the prompt, not the user.** No user-prompt-input field in v0. The composer reads page context (path, title, frontmatter, maybe a short excerpt) and generates a structured handoff prompt that the target app's composer receives pre-filled. User can edit in the target app before pressing Enter.
4. **PQ6 — Disabled button with tooltip** on both Electron AND web (not auto-web-fallback). Claude rows get a secondary "Open in claude.ai →" action inside the tooltip for explicit user opt-in.
5. **PQ7 — No URL-length-cap UX** needed, because PQ5 means OK bounds its own prompt content by construction. Spec-level concern only: pick safe per-app character budgets.
6. **XQ3 — No phone-home.** Extends the LOCKED telemetry posture from `specs/2026-04-20-cli-distribution-and-install-ux/` to the Electron desktop build and to this feature.

**Cascade from PQ5 (OK composes, not user).** This is the biggest structural change. Downstream updates applied to the seed:
- Observable success narrative rewritten — removed "if the user entered one" language; target-app composers land pre-filled with OK-composed content.
- I3 (encoding correctness) narrowed to focus on file paths + OK's structured prompt content (path can still have `%`, em-dashes, unicode; OK content is more predictable).
- I8 (URL length cap) reframed as "composer stays under caps by construction" rather than "dispatch-time truncation UX." Observable test is "feed composer edge-case pages + assert emitted URL length."
- AC7 reworded to target file paths (the actual encoding edge class) rather than hypothetical user-typed prompts.
- AC10 reworded as a unit-test assertion on composer-output-length, not a dispatch-time truncation path.
- New AC11 — "zero analytics SDKs" static-code assertion, matching XQ3 LOCKED.

Seed status: **all P0 items resolved** (9 decided + 10 assumed-with-verification-plan + 1 parked P2). Zero Open, zero Blocked. Ready for /spec handoff.
