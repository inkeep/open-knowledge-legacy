---
title: "Design challenge — SPEC 2026-04-21 open-in-agent-desktop"
description: "Evidence-based challenge to the spec's rejected-alternatives and structural decisions. Findings, not prescriptions — implementer decides response."
date: 2026-04-21
reviewer: "agent (design-challenger)"
baselineCommit: "a1e74cb8 (spec draft handoff)"
scope: "§5.1 Module layout; §6.1.5 Registry; §6.3 Prompt composer; §6.5 Cursor two-step; §7.1–7.2 UI; §8.2 Web host; §12 Risks"
---

# Design challenge: open-in-agent-desktop

Priority legend: **BLOCKING** (must resolve before audit sign-off) · **MATERIAL** (decision needs evidence or disclosure, not necessarily a reversal) · **CLARIFY** (gap / wording / test).

The spec has strong bones. The complaints below cluster on two themes: (a) the registry abstraction was built for a third-party-plugin future that v0 does not ship, and forward-fitting creates a core-layer dependency on app-layer code; (b) the minimal prompt composer is a scope regression relative to the story seed and degrades unevenly across targets. Everything else is structural: web-host threat model, settle-delay evidence drift, Claude-Code `file=` correctness, rollback posture.

## 1. Registry pattern (§6.1.5, SQ9 DIRECTED) — **MATERIAL**

**Claim under challenge:** v0's four targets justify a polymorphic registry with a discriminated-union dispatch kind.

**Counter-evidence:**

1. **Layering violation admitted in the spec itself.** §6.1.5 imports `spawnCursorFolder` from `packages/app/src/lib/handoff/cursor-two-step.ts` into `packages/core/src/handoff/registry.ts`. The inline comment ("import path pragmatics: registry data lives in core; the Cursor spawn is host-dependent") acknowledges the problem and defers it: "the descriptor's spawnFolder is wired at the dispatch-module boundary, not imported circularly. Shown here conceptually." That phrase — *shown here conceptually* — is an unresolved architectural seam. `packages/core` is contracted as "No React or Node.js server dependencies — browser + Node compatible" (CLAUDE.md Package: core). The only way to satisfy the registry descriptor's `dispatch.kind === 'two-step'` variant without violating that contract is to either (a) inject `spawnFolder` at dispatch-site (in which case the descriptor's `spawnFolder` field is a lie — the registry doesn't actually contain it), or (b) move the registry to the app layer (in which case it isn't shared across core/desktop/server). Neither is spelled out.

2. **Kind discrimination has exactly one instance per kind.** `dispatch.kind === 'url-scheme'` has three descriptors (claude-cowork, claude-code, codex). `dispatch.kind === 'two-step'` has exactly one (cursor). A discriminated union whose `'two-step'` branch has cardinality 1 is a switch statement with extra steps — the branch exists to support the Future Work third-party plugin API (§14), not v0.

3. **The claimed extensibility win is shared by the null-alternative.** Adding a 5th target via the registry: new `zed-url.ts` + descriptor in `BUILT_IN_TARGETS` + allowlist row. Adding via a hand-rolled switch: new `zed-url.ts` + new `case 'zed':` in `dispatch.ts` + allowlist row. Same three-file change, same one-commit footprint. The registry's claimed "one-commit agent add" is not a differentiator.

4. **The drift detector (`registry-schemes ⊂ allowlist`) test is a net win — but not registry-exclusive.** You can write the same test against a hand-rolled `KNOWN_TARGETS: ReadonlyArray<{id: string, schemes: string[]}>` constant that lives in app-layer dispatch.

**Challenge question:** *what concrete bug is the registry pattern preventing that a hand-rolled switch in `dispatch.ts` + a per-target module per URL builder would not?* If the answer is "third-party plugin API shape compatibility," that commits v0 to an API surface for a feature the spec says is "likely Q3 2026 work" — a five-month forward-fit of a non-trivial type shape (HandoffTargetDescriptor with its dispatch union, web-fallback, install-detection enumeration, etc.). Forward-fitting for that kind of horizon usually ages poorly because (a) Q3 requirements will add shape (per-user config? plugin manifest? security review?); (b) the shape that survives real third-party usage rarely matches the one sketched before any third-party exists.

**What the spec would look like without the registry:**

```
packages/core/src/handoff/
  types.ts              — HandoffTarget, HandoffPayload, HandoffOutcome, InstallState
  claude-url.ts         — buildClaudeUrl, buildClaudeAiWebUrl
  codex-url.ts          — buildCodexUrl
  cursor-url.ts         — buildCursorUrl
  prompt-composer.ts    — composePrompt

packages/app/src/lib/handoff/
  dispatch.ts           — switch(target) { case 'claude-cowork': ...; case 'cursor': await two-step(); }
  targets.ts            — KNOWN_TARGETS: readonly [{id, displayName, schemes, icon, installUrl, webFallback?}] — pure data, no functions
  install-detect.ts     — iterates new Set(KNOWN_TARGETS.flatMap(t=>t.schemes))
  cursor-two-step.ts    — host-specific spawn + settle + fire
```

Lose: the discriminated union for `dispatch.kind`. Gain: core layer stays pure (no circular seam to hand-wave), `cursor-two-step` lives where its host-specific IPC lives, one fewer level of indirection, same registry-coverage test, same "one commit to add Zed."

**Decision cost:** reverting from "registry with plugin-shape" to "hand-rolled switch + data constant" after ship is harder than the reverse — deleting a registry requires finding every consumer iterating it. So if registry is wrong, better to catch now.

**Recommendation:** Disclose the core→app import seam explicitly. Either resolve it (registry = pure data in core, dispatch = switch in app) or relocate the registry to app layer. Don't ship the "shown here conceptually" gap.

## 2. Minimal prompt hypothesis (§6.3, SQ1 DIRECTED) — **MATERIAL**

**Claim under challenge:** `"Open Knowledge doc: {relativePath}. Use the open-knowledge MCP tool for backlinks and related context."` is sufficient context because the agent uses native file-attachment + MCP tools.

**Counter-evidence:**

1. **The story seed PQ5 explicitly envisioned structured context, not minimal.** Verbatim: *"OK generates a bounded, structured prompt from the page's context (**path, title, frontmatter, possibly a short excerpt**) that the handoff inserts into the target app's composer."* The spec's SQ1 DIRECTED drops title, frontmatter, and excerpt. That is a **scope reduction from story to spec without a recorded stress test**. The decision log attributes SQ1 to "Andrew batch 1" with rationale "agent uses native attachment + MCP tools" — but the story's value stress test in §Problem stress-test ("demo-worthy" in §Value) assumed richer pre-fill.

2. **Native file-attachment coverage is uneven per target.** The spec silently accepts this asymmetry:

   | Target        | What the agent gets atomically               | If OK-MCP is absent |
   |---------------|----------------------------------------------|---------------------|
   | Claude Cowork | `file=<abs>` → file pre-attached in composer | Agent reads the attached file directly |
   | Claude Code   | `file=` probed-asymmetric (see §4 below)     | May or may not work — unverified |
   | Codex         | `path=<projectDir>` only, no `file=`         | Agent must infer `relativePath` is workspace-relative and use file-read tool |
   | Cursor        | `workspace=<basename>` only, no path, no file | Agent has only basename — must rely on Cursor's workspace-context awareness |

   The spec treats "native attachment" as a uniform fallback. It isn't. For Codex and Cursor without OK-MCP, the agent has a path string in prose and must figure out what to do with it. That may work reliably, or it may not — the spec has no empirical evidence either way.

3. **OK-MCP configuration is not a uniform assumption.** The spec's §2 Non-Goals says *"v0 assumes MCP is set up on dogfood machines"* — a scope decision, fine. But "assumes" is doing heavy lifting: if a dogfood machine has OK-MCP configured for `~/work-project` and the user opens a doc from `~/personal-project`, the agent will invoke the MCP tool against the *wrong* project. The prompt directs the agent to a tool that misbehaves silently. This is a failure mode the spec's risk register (§12) doesn't name.

4. **Zero verb in the prompt.** "Open Knowledge doc: specs/foo/SPEC.md. Use the open-knowledge MCP tool for backlinks and related context." tells the agent *what* but not *what to do*. Users routinely intend different things: "explain this," "implement this," "review this," "apply this plan to the repo." The story's value prop ("clicking a button and having an agent ready-to-go") is weakened if the agent lands in ready-to-parse-instruction mode with no instruction. Claude/Codex/Cursor composers are pre-filled with a breadcrumb, and the user must still type the ask. That's a smaller lift than six-step manual copy-paste (the status quo), but it's not the "one click → agent is working" end state.

5. **The 1 KB budget cap is an artifact of the minimal composer, not a rationale for it.** §6.3's "Budget: 1024-character hard cap" is trivially satisfied because composer output is ~80 chars for any realistic path. The invariant test is forward-proofing against re-expansion (§6.3 explicitly says "if a future spec re-adds richer context, the budget check fires") — which is fine, but undermines the argument that minimality *itself* is the right end state.

**Challenge questions:**
- What is the empirical evidence that a path-only prompt produces the "demo-worthy" UX the story promised? The spec cites none.
- What does the agent actually do with `"Use the open-knowledge MCP tool"` when MCP isn't configured? Claude will say "I don't have that tool" and proceed to guess — reasonable. Codex and Cursor agent modes behave differently; unverified.
- What is lost by including a title + optional short excerpt within the 1 KB cap? The composer is a pure string fn; the cost of adding `title` and a bounded excerpt is one `DocContext` field extension. The upside is a prompt that reads like human context: *"Read this Open Knowledge doc titled "{title}" at path {relativePath}. Use the open-knowledge MCP tool for backlinks and related docs when available; otherwise read the file directly."*

**Recommendation:** Either (a) run the dogfood A/B for one week with the minimal composer + capture "did the user type additional instruction?" as the success metric, committing to re-open SQ1 if the rate is high; OR (b) ship with title included at minimum and keep frontmatter/excerpt as follow-on. The current spec commits to minimal as the v0 shape with no feedback loop that would escalate.

## 3. Cursor settle delay (§6.5, SQ4 DIRECTED) — **BLOCKING**

**Claim under challenge:** 500ms settle buffer is sufficient; `&workspace=<basename>` safety-net handles overshoot.

**Counter-evidence from the cited source:**

`reports/deep-linking-ai-desktop-apps-2026/evidence/cursor-encoding-empirics.md:135-139`, the canonical recipe the spec cites:

```bash
cursor /abs/path/to/project
# 2. Small settle delay
sleep 1
open "cursor://anysphere.cursor-deeplink/prompt?text=${DOUBLE_ENC_PROMPT}&mode=agent&workspace=$(basename "$project")"
```

The research recipe uses **1 second**, not 500ms. Earlier in the same file (line 27-30) an initial test used `sleep 3`. The spec cites "per evidence/cursor-encoding-empirics.md Finding 5" — but Finding 5 (line 120) is titled *"Window-targeting via `&workspace=<basename>`"* and talks about the safety-net, **not the settle duration**. The duration citation is misattributed.

**Cold-start risk the spec doesn't address:**
- macOS Launch Services takes 500ms–1.5s just to launch a non-resident app. If Cursor isn't already running when `cursor /path` fires, 500ms lands the prompt URL before Cursor's process has even bound its URL handler. The evidence file reports "initially landed in a different Cursor window" when a prompt URL fires with no focused workspace; it doesn't describe what happens when *no* Cursor process is up at all.
- `&workspace=<basename>` requires a Cursor window *with that name* to exist at route time. Before Cursor has opened the workspace, the name doesn't exist — the URL either queues, routes to a splash screen, or fails silently depending on Cursor's URL-handler implementation (unverified at 500ms cold-start).

**A3 in §11 says:** "Cursor's 500ms settle buffer is sufficient on cold-launch for 95% of dogfood machines — confidence MEDIUM — verify via E2E test + dogfood feedback." 95% with MEDIUM confidence for a silent-failure mode is a weak posture. If 5% of clicks land in the wrong window with a pre-filled prompt containing wiki content, that is a trust-erosion UX that users will not report (it looks like the feature "glitched" and they'll retry) and won't surface in telemetry (XQ3 no-phone-home).

**Recommendation:**
- Align with the research's documented recipe: **1000ms default**, not 500ms. The added 500ms on the happy path is imperceptible; the avoided silent-fail cases on cold-start are non-trivial.
- Add a detection probe for "is Cursor already running" — on macOS: `pgrep -x Cursor || false`. If not running, use 1500ms; if running, 500ms is probably fine. Cheap and empirical.
- Update the citation in §6.5: Finding 5 supports the `&workspace=` safety-net, not the duration. The duration source is the R1–R5 canonical recipe (line 135).
- Update A3's expiry trigger: not "Week 1 dogfood" but "1st cold-start failure" — a single repro that makes it past 500ms means the duration is wrong.

## 4. Claude Code `file=` correctness — **BLOCKING** (unverified claim)

`reports/deep-linking-ai-desktop-apps-2026/evidence/claude-desktop-deep-links.md` Finding 9 (line 242-243):

> "Composes a webview path `/epitaxy?q=<p>&folder=<a>&src=external` and navigates to it via `jk(I, A)` (webview navigation helper). The Cowork branch goes through IPC (`dispatchOnCoworkFromMain`) rather than webview nav. **The composed URL only carries `q` + `folder` (no `file=`)**; a probed asymmetry, though `c` (files) is still read and counted in the `desktop_code_deeplink_received` analytics event."

The spec's `buildClaudeUrl({mode: 'code'}, ...)` emits `claude://code/new?q=&folder=&file=` — but the webview nav throws away `file=` according to the bundle inspection. The spec's §6.2 note says *"`docPath` is NOT threaded to Codex (no atomic file param)"* but has no equivalent disclosure for Claude Code. AC2 in the story promises *"Fires `claude://code/new?q=&folder=&file=`. Claude.app foregrounds on the Code tab (Epitaxy route `/epitaxy?q=&folder=&src=external`). Same single-click semantics as AC1."* The research says the `/epitaxy` nav composes only `q` + `folder`. AC2 therefore overstates the attached-file reality.

**Options:**
- (a) Drop `file=` from the claude-code URL shape. Ship Claude Code as folder-scoped only; agent reads file via MCP or prose path reference, like Codex.
- (b) Keep `file=` in the URL (it's read by the analytics event) but disclose in §6.2 that Claude Code's Epitaxy webview may not surface the attachment. This is accurate but erodes the I1 "atomic single-URL" invariant for this target.
- (c) Live-test Claude Code with `file=` on Claude.app 1.2581.0 before ship to establish what actually happens — Finding 9 stops short of saying it's ignored, only that it's "a probed asymmetry."

**Recommendation:** (c) live-test before ship. If `file=` on Claude Code is ignored, publish the evidence and pick (a) or (b). Either way, the spec's current §6.2 + AC2 overstate the verified behavior.

## 5. Cowork + Code as two rows (PQ2 LOCKED) — **CLARIFY**

The prompt asks whether users would prefer a single "Claude" row with a Cowork-vs-Code sub-choice. I don't think the LOCKED decision should flip, but flag these tensions:

1. **Both rows share the `claude:` scheme** — install-detection returns a single boolean, so the two rows always enable/disable together. From a user's mental model, there is one "Claude Desktop" install state but two distinct rows in the dropdown. This invites "why two?" questions during first-use.

2. **Power-user optimization, casual-user tax.** Users who don't think in Cowork-vs-Code terms see two rows and must pick. For a first-time user who doesn't know the distinction, the choice is confusing. Linear ships 19 tools in its registry; a hierarchical "Claude" → "Cowork | Code" reduces apparent dropdown size by 1 row and reframes the choice as "I picked Claude, now what mode?"

3. **PQ2 LOCKED rationale cites "power users explicitly want Cowork-vs-Code routing control; the dropdown is small (3 entries becomes 4), not overwhelming."** Valid. But the test is not "is 4 overwhelming" — it's "does the 2nd Claude row provide enough marginal utility to justify the branching cost." Power users can set a default (future work) and casual users get one row.

**Recommendation:** Keep LOCKED as shipped, but add a pre-ship product-copy check with the dogfood team on the first-run experience. If confusion rate is non-trivial after week 1, revisit. Don't touch until data.

## 6. Dual-host parity I7 (§5.3, §8.2) — **MATERIAL**

**Claim under challenge:** Feature parity between Electron and `open-knowledge start` web build is a v0 invariant (I7).

The web-host story requires, net-new:
- `GET /api/installed-agents` server endpoint with per-OS shell probes
- `POST /api/handoff/open-folder` server endpoint with spawn primitive (target='cursor' allowlisted)
- Anchor-click dispatch path in the app layer
- Playwright E2E coverage per-host (3 of 6 sampled cells are web-host)
- Cache policy duplicated (60s server-side + 10s client throttle, vs Electron's single-path boot + async-refresh)

**Pressure points:**

1. **Dogfood primary surface is Electron.** Story §Value frames this as the "demo button" for OK's positioning. Most demos happen in Electron. The web host's dogfood use case is less articulated.

2. **Cross-machine `open-knowledge start` pattern.** The web host can be accessed from a different machine than the one running the server. If user runs `ok start` on workstation A and views from laptop B, clicking "Open in Cursor" spawns Cursor on A, not B. The feature does the wrong thing silently. The spec's §8.2 treats web-host as single-machine, but the deployment shape supports multi-machine and the spec doesn't call out the single-machine assumption.

3. **`/api/handoff/open-folder` is a new local-RPC spawn primitive.** Any local-bound HTTP server endpoint that spawns processes is a net-new threat surface. Mitigations needed:
   - Bind-address: localhost only (not 0.0.0.0). Spec doesn't state which.
   - CSRF: same-origin requests only. Spec doesn't discuss.
   - Path validation: "inside OK content dir" — but symlinks inside content dir can point outside; path-traversal with `../` is not mentioned as a test case.
   - Auth: none specified.

4. **Asymmetric Cursor v0 cost.** Claude and Codex on web are just anchor-click (cheap). Cursor on web requires the `/api/handoff/open-folder` endpoint (expensive + threat model). Disabling Cursor on web-host v0 removes a multi-hundred-LOC server-endpoint + its tests + its cache-layer code, while preserving 3 of 4 targets at parity.

**Alternative to consider:** **"Electron-only v0" OR "Claude + Codex on web, Cursor desktop-only."** The I7 invariant can narrow to "every user-observable affordance is present on both hosts, but Cursor specifically is disabled-with-tooltip on web with `"Cursor handoff requires desktop build"` message." This is not a silent degradation — it's an explicit documented limitation that maps to the technical constraint (Cursor's two-step spawn has no browser-only path).

**Decision cost:** Shipping web-Cursor now and removing later is a UX regression for users who adopt it. Not shipping now and adding later is pure addition. The asymmetry argues for deferring.

**Recommendation:** Relax I7 for Cursor specifically. Ship web-host with Claude + Codex anchor-click dispatch; Cursor disabled-with-tooltip on web-host v0. Reduces server surface + threat model + test matrix significantly. Revisit when a dogfood user specifically requests web-host Cursor.

## 7. Security / threat model gaps — **MATERIAL**

1. **`ok:shell:spawn-cursor` IPC channel (§6.5, TQ4b LOCKED).** Hardcoded command name `cursor` is resolved from `PATH`. A compromised `PATH` (malicious binary named `cursor` earlier in `PATH`) turns the IPC into an RCE primitive. Standard Electron mitigation: resolve via `app.getApplicationInfoForProtocol('cursor')`'s returned `path`, not `PATH`. The spec doesn't specify the resolution strategy.

2. **`/api/handoff/open-folder` bind address + CSRF.** Not specified in spec. Must be: (a) localhost-only bind, (b) same-origin enforcement via Origin/Referer header check, (c) canonical path validation after `realpath` (not lexical — handles symlinks). Spec §13.2 tests "path outside content dir (rejected)" but doesn't name symlink escape.

3. **`https://claude.ai/new?q=<prompt>` web fallback (§6.2, PQ6).** Prompt content is transmitted to Anthropic's servers via URL. For confidential wiki content (security reviews, internal planning, customer data in specs), clicking "Open in claude.ai →" is a data-egress event. The spec treats this as a UX affordance; it's also a privacy boundary. Worth a sentence in §12 risks or §8.2 web host noting: *"Web fallback transmits prompt content to claude.ai — explicit user opt-in preserved via disabled-tooltip-only surfacing."*

4. **Install-detection shell probes (§6.4).** Inputs are from the registry (trusted). If Future Work third-party plugins contribute schemes (§14), shell injection becomes live. Flag as a precondition for plugin API: scheme strings must match `^[a-z][a-z0-9+.-]*$` before they're interpolated into `osascript`/`reg query`/`xdg-mime` commands.

## 8. Testability gaps (§13) — **CLARIFY**

1. **E2E install-state flip (cell #3).** Test scenario is "Codex not installed → installed; async refresh updates row." Playwright can't install Codex mid-test. Must be mock-based — mock the `ok:shell:detect-protocol` IPC return to flip values. Spec doesn't call out the mocking boundary.

2. **"Not installed" cases on a dev machine with all three installed.** Every dogfood machine has Claude, Codex, and Cursor installed (that's the primary audience). E2E tests cannot observe the disabled-tooltip state without injecting false negatives into install-detection. Same mocking boundary as (1).

3. **Shell-allowlist registry-coverage test (§6.6).** Good test. But note it imports from `@inkeep/open-knowledge-core/handoff/registry` — the main-process shell-allowlist test file now depends on a core-layer path that the main process doesn't ship. Test-only import; verify the dependency doesn't bleed into the runtime bundle.

4. **Playwright per-host sampling.** 6 cells of 18 is sampled. The omitted cells include the "all three targets disabled, web host" composite — the empty-dropdown user experience. Worth adding as a 7th cell because it's the worst-case UX and the most-overlooked failure mode.

5. **Unit test corpus (§6.2 / AC7).** `/Users/who/My %Project — docs/café-notes.md` is a great stress path. Missing: (a) a path with literal `&` in a filename (`/Users/x/A & B/doc.md`) — breaks `&`-delimited query params if encoding is wrong; (b) Windows paths with `\` separators if supported (spec pins to "OS-native separator" but doesn't test `\`).

## 9. Rollback plan — **CLARIFY**

Spec §12 lists R1–R5 mitigations but doesn't spell out a rollback path. For the allowlist extension (I6, a 1-way door per story §Value), an actual revert-and-re-ship is costly. For the feature itself, if a production-blocking bug lands:

- **Revert the PR?** Works, but the allowlist extension is part of the same PR; reverting un-allows `claude:` / `codex:` / `cursor:`, which is fine but also reverts the server endpoints (potentially breaking `/api/installed-agents` callers if any accrue).
- **Feature flag?** Spec doesn't propose one. For a dogfood-only internal feature this is arguably fine, but worth an explicit note: *"Feature ships without a runtime flag; rollback via PR revert. Allowlist extension is intentionally 1-way per story §Value, accepted cost."*

**Recommendation:** Add a §12 R6 "rollback": identify the one commit that reverts cleanly; confirm the allowlist-extension 1-way-door commitment is deliberate.

## 10. Documentation debt (§5.1) — **CLARIFY**

`packages/core/src/desktop-bridge.ts` and `packages/desktop/src/shared/bridge-contract.ts` are duplicates kept in sync via `tests/integration/bridge-contract.test.ts`. This spec adds **two more surfaces** to the duplication: `shell.detectProtocol` + `shell.spawnCursor`. Each addition has a 2× maintenance cost. The spec doesn't question whether this pattern scales. At what count of surfaces does the duplication become the bug? Not something this spec must solve, but worth a §14 entry: *"Revisit bridge-contract duplication as surface count grows. Current: 8 channels; after this spec: 10. Trigger: 15 or next spec that adds 3+ surfaces."*

## 11. Observability / feedback loop — **MATERIAL**

XQ3 LOCKED (no phone-home) is correct posture for OK's distribution. The consequence: if the minimal prompt composer under-serves users, or if 500ms settle delay fails on 5% of cold-starts, or if Claude Code silently ignores `file=`, **there is no telemetry to catch it**. The dogfood feedback loop (XQ2) is 1 week with Nick + immediate team — a small sample for uneven failure modes.

Two mitigations worth considering:

1. **Local-only counter file.** Already suggested in §14 Future Work ("`~/.open-knowledge/stats.jsonl` possible for internal dogfood"). Promote to v0 scope for this feature specifically — count `handoff.dispatched.{target}` + `handoff.ok` / `handoff.error.{reason}` locally. Zero phone-home; huge diagnostic value if a user reports "it didn't work." Low implementation cost: one `fs.appendFile` call per dispatch.

2. **Explicit post-dispatch UX.** The user clicks "Open in Cursor" and the dropdown closes. If dispatch fails silently (target app not launched, prompt lost, wrong window), the user sees nothing in OK. A toast after successful dispatch ("Opened in Cursor.") + a toast after failure ("Couldn't reach Cursor — try again?") gives the user a signal and acts as a lightweight behavioral probe ("do users report 'I clicked and nothing happened' to Nick? they will now tell us where the gap is"). Spec doesn't specify post-dispatch UX at all.

## 12. Scope / appetite check — **CLARIFY**

Rough estimate of the surface this spec commits to:

| Area | Rough LOC (not load-bearing — shape indicator) |
|------|------------------------------------------------|
| Core handoff module (types + 3 URL builders + composer + registry) | 300 |
| Desktop IPC + allowlist + 2 new handlers | 150 |
| Server: 2 new API endpoints + cache + OS probes | 250 |
| App: dispatch + install-detect + 3 components + 3 host-surface wiring | 400 |
| Tests: unit + integration + E2E | 600 |
| **Total** | **~1700 LOC across 5 packages** |

Plus: D47 changelog + shadcn component install + Playwright route-handler setup + install-state mocking harness.

Story C7 constraint: *"Appetite: single-iteration feature, not a multi-quarter platform project."* 1700 LOC across 5 packages is single-iteration-plausible but not single-iteration-trivial. Cutting Cursor from web-host (see §6 above) saves ~300 LOC. Cutting the registry (see §1) saves ~150 LOC and resolves the layering seam. Landing both cuts brings the feature closer to C7's appetite and reduces 1-way-door exposure.

## Summary table

| # | Concern | Priority | Suggested action |
|---|---------|----------|------------------|
| 1 | Registry in core imports app-layer `spawnCursorFolder` | MATERIAL | Resolve layering: registry = pure data in core OR relocate to app layer |
| 2 | Minimal prompt drops title/frontmatter (story scope regression) | MATERIAL | Add title at minimum; commit dogfood success metric for re-opening SQ1 |
| 3 | 500ms settle delay misattributes research (recipe says 1s) | BLOCKING | Align with R1-R5 recipe: 1000ms default; detect cold-start for 1500ms fallback |
| 4 | Claude Code `file=` likely ignored (Finding 9 asymmetry) | BLOCKING | Live-test before ship; update §6.2 / AC2 to reflect verified behavior |
| 5 | Cowork+Code as 2 rows — install state always couples | CLARIFY | Keep LOCKED; watch first-run confusion rate in dogfood |
| 6 | I7 dual-host parity inflates Cursor web-host surface | MATERIAL | Relax I7 for Cursor on web-host v0; revisit on demand |
| 7 | `spawn-cursor` PATH resolution + `/api/handoff/open-folder` threat model | MATERIAL | Resolve via `getApplicationInfoForProtocol` path; spec bind-address + CSRF + realpath validation |
| 8 | Install-state E2E needs mock boundary | CLARIFY | Name the IPC/HTTP mocking seam in §13; add empty-dropdown cell |
| 9 | Rollback plan not stated | CLARIFY | Add §12 R6: revert path + allowlist 1-way-door acceptance |
| 10 | Bridge-contract duplication grows from 8 → 10 surfaces | CLARIFY | §14 entry: revisit duplication pattern at 15 surfaces |
| 11 | No observability, short dogfood loop | MATERIAL | Local-only `stats.jsonl` + post-dispatch toast UX |
| 12 | ~1700 LOC for a "single-iteration" feature | CLARIFY | Cutting web-Cursor + registry brings appetite in line with story C7 |

## What I'm NOT challenging

- **PQ5 LOCKED "OK composes prompt"** — correct; user-typed prompt is gold-plating for v0.
- **PQ6 LOCKED "disabled-with-tooltip, no auto-fallback"** — correct; explicit opt-in is the right trust posture.
- **XQ3 LOCKED "no phone-home"** — correct; matches OK's stated distribution posture.
- **TQ6 DIRECTED "extend allowlist with per-scheme rationale + exact-set test"** — excellent. The test shape (exact-set, not subset) is the right thing.
- **TQ7 LOCKED "anchor-click for web dispatch"** — correct; matches consensus.
- **Cursor double-encoding discipline** — research is solid, builder is correct.
- **Pure-string URL builders** — correct separation; tests well.
- **Registry-coverage test** — good, regardless of whether you keep the registry or switch to a data-constant.
- **Claude Cowork `file=` attachment** — verified in Finding 8; correct.
- **`mode=agent` pinned for Cursor** — correct v0 default; future work is clear.

## Resurfaced alternatives from the prompt

The prompt asked whether I'd independently arrive at rejected alternatives. I did, twice:
- **Single "Claude" row** with Cowork/Code sub-pick (PQ2) — I evaluated and agree with LOCKED.
- **Hand-rolled switch instead of registry** (SQ9) — I evaluated and believe the rejection doesn't hold; the registry is paying rent for a Future Work that isn't ready.

One more arrived-at-independently: **dropping web-Cursor support in v0** (against I7) — not explicitly in the rejected-alternatives list, but a natural surface-reduction move given §6's pressure points.

---

*Findings, not prescriptions. Implementer owns the response — including the right to say "keep LOCKED anyway because X." The asks of this challenge are disclosure and evidence, not reversal.*
