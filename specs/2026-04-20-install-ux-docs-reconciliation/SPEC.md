---
title: Install UX Docs Reconciliation — Spec
description: Reconcile install-path guidance across 6 user-facing surfaces (root README, docs site, plugin README, scaffolded AGENTS.md, agent-facing MCP tool descriptions, generated MCP configs) to satisfy [[specs/2026-04-20-cli-distribution-and-install-ux/SPEC]] D1 LOCKED + its implication "docs must show both forms in every install snippet."
tags: [spec, docs, install-ux, v0-launch]
---
# Install UX Docs Reconciliation — Spec

**Status:** In Review
**Owner(s):** Andrew Mikofalvy
**Last updated:** 2026-04-20
**Baseline commit:** `3f069185` (finalized — all 8 decisions LOCKED, audit + challenger resolved via framing updates; no decision reopens)
**Links:**

- Parent spec (governing, not superseded): [[specs/2026-04-20-cli-distribution-and-install-ux/SPEC|CLI distribution + install UX]] — D1 LOCKED (dual-bin `open-knowledge` + `ok`), D1 implications, G5 discoverability
- Audit report (evidence): [[reports/bunx-npx-usage-audit/REPORT|bunx/npx/pnpm dlx Usage Audit]] — 8 code-verified findings; this spec operationalizes them
- PR #227 (adds audit): <https://github.com/inkeep/open-knowledge/pull/227>
- Related (shipped): [[specs/2026-04-11-zero-config-bunx-packaging/SPEC]] — `bunx @inkeep/open-knowledge` first-class entrypoint
- V0-launch context: [[projects/v0-launch/PROJECT|projects/v0-launch/PROJECT.md]] + [[projects/v0-launch/bug-bash-triage|bug-bash-triage.md]]

---

## 1) Problem statement

**Situation.** Install UX is surfaced across 6 independent channels — root `README.md` (GitHub landing), `docs/content/**` (Fumadocs site, 40+ CLI examples across 15 `.mdx` files), `packages/plugin/README.md` (Claude Code plugin consumers), scaffolded `.open-knowledge/AGENTS.md` (injected by `ok init` per `packages/cli/src/content/init.ts:78`), agent-facing MCP tool descriptions (`packages/cli/src/mcp/tools/init-content.ts:32-39`), and generated MCP configs + `.claude/launch.json` (hardcoded `npx` at `packages/cli/src/commands/{editors.ts:23, init.ts:233, self-spawn.ts:45}`). [[specs/2026-04-20-cli-distribution-and-install-ux/SPEC]] D1 LOCKED registered the dual-bin `open-knowledge` + `ok`, and its implication reads verbatim: *"docs must show both forms in every install snippet."*

**Complication.** [[reports/bunx-npx-usage-audit/REPORT]] code-verified 8 findings showing these 6 surfaces drift in three simultaneous directions:

1. **V0 launch polish.** GitHub repo landing (`README.md` L12-18) uses `bunx` as primary; docs-site landing (`docs/content/overview.mdx` L35-38 + all `guides/*.mdx`) uses `npx` exclusively. First-touch users get different commands depending on which channel they land on.

2. **D1 compliance.** The docs site has 40+ `npx @inkeep/open-knowledge <subcommand>` examples and **zero** `ok <subcommand>` examples. D1's "docs must show both forms" implication is silently violated on the biggest user-facing surface.

3. **Silent correctness failure.** Every editor's generated `mcp.json` (`editors.ts:23` → `MCP_SERVER_COMMAND = 'npx'`) + the Claude Code launch entry (`init.ts:233` → `runtimeExecutable: 'npx'`) + the argv\[1]-empty fallback (`self-spawn.ts:45`) all hardcode `npx`. A pure-Bun user who invoked `bunx @inkeep/open-knowledge init` gets an `npx`-wired MCP config. If they don't have Node/npm installed, the MCP server fails at spawn with `spawn npx ENOENT` — a failure mode mechanically plausible by inspection of `editors.ts:23` + `init.ts:233` (the test at `packages/cli/src/commands/mcp.test.ts:356` simulates the stderr string to exercise upstream error-surfacing but does not execute the kernel-level ENOENT end-to-end). The rationale for the hardcoding exists in `self-spawn.ts:1-17` comments (lockfile-ABI drift prevention) but is never surfaced to users.

Plus two secondary drifts:

- **Prerequisites mismatch.** Root `README.md:7` lists Bun only; `docs/content/guides/getting-started.mdx:7` lists `Bun >= 1.3.11` OR `Node.js >= 22`. The docs version is consistent with the install-path matrix (which includes npm/pnpm); the root README's own line 40 matrix contradicts its line 7 prereq.
- **Docs-internal inconsistency.** `internals/*.mdx` prose uses `ok start` / `ok ui` / `ok mcp` freely; `guides/*.mdx` code blocks use `npx @inkeep/open-knowledge <cmd>` exclusively. Same docs site, two vocabularies.

**Resolution.** Ship a documentation + templates reconciliation that covers five dimensions co-equally: primary-runner consistency across 6 surfaces, `ok` alias docs-site coverage, prerequisites unification, a durable decision on the `npx`-hardcoded rationale (investigated with options), and docs-internal consistency (`internals/*.mdx` prose vs `guides/*.mdx` code blocks).

## 2) Goals

- **G1 — Primary-runner consistency across first-touch surfaces.** Root README, docs-site overview/getting-started, and plugin README present a unified install-path matrix (bun/npm/pnpm + bunx/npx/pnpm dlx one-shot) consistent with parent spec §8's install-matrix phrasing. A user landing on any of these three surfaces sees the same primary command and the same alternates.

- **G2 — D1 implication satisfied on the docs site.** Every install-path snippet in `docs/content/**` shows both `open-knowledge` and `ok` forms. First-time users discover the `ok` alias via the docs they're most likely to read, not just via the root README they may skip.

- **G3 — Silent-failure path upgraded to documented-with-escalation.** A pure-Bun user who follows the bunx install flow sees a clear prereq note that Node is required for MCP spawning before they hit the failure. The failure mode stops being silent — it becomes documented-but-still-possible, with a structural fix (runner-matching detection, D5 Option 2) pre-designed and ready to ship under the escalation triggers in D5. G3 is honestly a partial closure; the spec's audit (§6 R2 in the design-challenge record) flagged that a full structural close requires D5 Option 2, which is deferred to Future Work with explicit triggers.

- **G4 — Prerequisites coherent.** Root README and docs-site prerequisites match. Both reflect the install-path matrix (Bun OR Node, whichever the user's chosen runner requires).

- **G5 — Docs-site internal consistency.** `guides/*.mdx` code blocks and `internals/*.mdx` prose use the same vocabulary — either both use `ok <cmd>` (post-install form), both use `npx @inkeep/open-knowledge <cmd>` (one-shot form), or each picks per-context with a documented convention.

- **G6 — Single source of truth for the install-path snippet.** When the matrix changes (e.g., Homebrew Cask lands per parent D13), one edit propagates to every surface. Drift becomes mechanically impossible, not just diligently avoided.

## 3) Non-goals

- **\[NEVER] NG1: Re-litigating D1 (dual-bin) or D2 (npm-only distribution).** Both are LOCKED in the parent spec with evidence. This spec propagates those decisions; it does not re-open them.

- **\[NEVER] NG2: Changing the `open-knowledge` or `ok` bin names.** Parent spec NG5 already forbids re-debating the naming choice. Revisit: never.

- **\[NEVER] NG3: Adding a `bunx`-specific or `pnpm`-specific distribution channel.** Parent D2 locks npm-only. All runners (`bunx`, `npx`, `pnpm dlx`) resolve against the same npm tarball. Revisit: never — violates D2.

- **\[NOT NOW] NG4: Auto-detecting the invoking runner in `ok init` to match MCP config to user runtime.** Per D5 LOCKED (Option 1 chosen); full implementation sketch in §14 Future Work "Explored" tier and escalation triggers in D5 Implications. Revisit: per D5 triggers.

- **\[NOT NOW] NG5: Rewriting docs-site `internals/*.mdx` pages to change their audience.** Internals pages target contributors+advanced users; their `ok <cmd>` vocabulary is appropriate for that audience. This spec aligns `guides/` with `internals/` (or vice versa) via G5 but does not restructure the docs site's information architecture. Revisit: when a docs IA restructure is planned.

- **\[NOT UNLESS] NG6: Docs-site restructure (topic groupings, nav, Fumadocs upgrade).** Out of scope unless the reconciliation requires structural moves (e.g., a new shared install-path partial file that needs a canonical home). Revisit: only if G6's single-source-of-truth requires it.

## 4) Personas / consumers

This spec targets contributors and end users — pure docs reconciliation with downstream user impact.

- **P1 — First-time user landing on GitHub (PRIMARY end-user).**
  - **Role:** Developer discovering Open Knowledge via the repo page (search, social, word-of-mouth).
  - **Needs:** Copy-paste a working command, understand prerequisites, know alternatives if their runtime differs.
  - **Success:** One command works on first paste; alternates are discoverable without reading the full README.

- **P2 — First-time user landing on docs.inkeep.com/... (PRIMARY end-user).**
  - **Role:** Developer discovering via docs (search, linked from blog post, referral).
  - **Needs:** Same as P1 but via a different surface.
  - **Success:** Same unified experience as P1 — different surface, same content.

- **P3 — AI agent reading the scaffolded `AGENTS.md` or MCP tool descriptions (PRIMARY end-user, non-human).**
  - **Role:** Claude Code / Cursor / Windsurf / Codex agent inside a user's repo after `ok init`.
  - **Needs:** Correct command strings in tool descriptions + scaffolded agent instructions.
  - **Success:** When the agent needs to run `open-knowledge init`, the displayed command matches what actually exists on the user's system.

- **P4 — Claude Code plugin user reading `packages/plugin/README.md` (SECONDARY end-user).**
  - **Role:** User installing the repo as a Claude Code plugin.
  - **Needs:** Same unified install-path matrix as P1/P2.
  - **Success:** Plugin README doesn't contradict the main README.

- **P5 — Future contributor touching any install-UX surface (SECONDARY contributor).**
  - **Role:** Engineer making a PR that modifies install docs, the scaffolded AGENTS.md, or generated MCP configs.
  - **Needs:** A single source of truth to edit + clarity that this spec governs install-UX reconciliation.
  - **Success:** Changes one file, propagates everywhere (G6); finds this spec before designing a one-off.

## 5) User journeys

### P1/P2 happy path — first-time install

1. User reads README.md (or docs overview / getting-started).
2. Sees a unified install-path matrix showing both runner + both bin name options.
3. Picks the runner matching their toolchain (most likely `bunx` or `npx`).
4. Runs the command; `ok init` scaffolds; MCP config written.
5. Opens editor; MCP server spawns successfully.

### P1/P2 failure path — pure-Bun user, no Node (documented-but-possible ENOENT)

1. User installs Bun, reads README. Post-spec, README says "Prerequisites: any JS runner — Bun/Node/pnpm. Note: MCP spawning invokes `npx`, so Bun-only users also need Node."
2. Runs `bunx @inkeep/open-knowledge init`. The init step writes MCP configs with `"command": "npx"`.
3. If the user read the prereq note and installed Node, editor spawns successfully. If they skipped the note, editor tries to spawn `npx` and **fails with `spawn npx ENOENT`** — now documented-but-still-possible rather than silent-and-unexpected.
4. Failure mode is monitored via GitHub issues + Slack for `spawn npx ENOENT` string; ≥3 occurrences in 30 days triggers D5 Option 2 promotion (structural fix via runner-matching).
5. **This is G3's honest state: silent → documented-with-escalation.** Full structural closure deferred to D5 Option 2 (pre-designed; see §14 Future Work Explored).

### P3 happy path — agent scaffolding with init-content

1. Agent loads the `init-content` MCP tool description.
2. Description says `open-knowledge init` or `npx @inkeep/open-knowledge init` (current L34).
3. Agent asks user to run the command in a terminal.
4. User pastes the one that matches their runner.

### P5 journey — contributor adding Homebrew Cask

1. Contributor picks up the trigger for parent D13 (Homebrew Cask for desktop DMG stable).
2. Needs to update the install-path matrix on all surfaces to add a Homebrew row.
3. If G6 is met: edits the shared partial; all 6 surfaces update.
4. If G6 is not met: edits 6 files; one surface gets missed; drift reappears.

### Debug experience

- "Why is my MCP server failing to spawn?" → error is `spawn npx ENOENT` → current: user has to guess Node is missing; post-spec: prereq warning or runner-matching config tells them.
- "Where do I edit the install instructions?" → current: 6 places with no pointer to authoritative source; post-spec: shared partial + pointer.

### "Aha moment"

Reviewer notices a PR touching `docs/content/overview.mdx` that changes an `npx` command. With G6 met, reviewer says "edit the partial, not the page." Consistency is default.

## 6) Requirements

### Functional requirements

| Priority  | Requirement                                                                                                                                                     | Acceptance criteria                                                                                                                                                                                                                                         | Notes                                                       |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Must (G1) | Root README, `docs/content/overview.mdx`, and `docs/content/guides/getting-started.mdx` present identical install-path matrices. | Line-by-line equivalence (modulo Fumadocs component syntax) when the sections are compared. Matrix includes: `bunx` / `npx` / `pnpm dlx` one-shot rows + `bun install -g` / `npm install -g` / `pnpm add -g` global rows + both bin-name options. | Matrix content per D3 (bunx primary) + D4 (bin-form toggle). |
| Must (G2) | Every install-path code snippet in `docs/content/**` shows both `open-knowledge` AND `ok` forms. | Automated check: grep every fenced code block in `docs/content/` for `@inkeep/open-knowledge` mentions; every match is accompanied by an `ok`-form equivalent within the same snippet or referenced via a Fumadocs tab + top-of-page callout. | Per D1 implication verbatim; rollout via D4. |
| Must (G3) | Silent-failure path upgraded from silent to documented-with-escalation via (a) Node-as-MCP-prereq note + (b) documented rationale + (c) escalation triggers to structural fix. | Root README + docs prereq section explicitly lists "Node.js >= 22 OR Bun >= 1.3.11 OR pnpm >= 10" with a Level-2 note that MCP config uses `npx` and requires Node. Failure-mode monitoring commitment documented in D5. | Resolution per D5 (Option 1 + escalation triggers to Option 2). |
| Must (G4) | Root README prerequisites match docs-site prerequisites. | Both surfaces list identical runtime requirements per D8 two-level phrasing. | Trivially a doc edit per D8. |
| Must (G5) | `guides/*.mdx` code blocks and `internals/*.mdx` prose agree on command vocabulary per D7's documented convention (prose uses `ok <cmd>`, code blocks use D4 Tabs matrix). | Convention declared in D7; enforced in CI via grep-based lint rule on fenced code blocks only. | Convention per D7. |
| Must (G6) | The install-path matrix is defined once and referenced from every surface. | Editing `docs/content/_partials/install-path.mdx` propagates to root README (via sync script), plugin README (via sync script), docs-site MDX files (via Fumadocs `<include>`), and scaffolded AGENTS.md (via committed `install-path.generated.ts`). CI drift check = run script + `git diff --exit-code`. | Mechanism per D6. |
| Should | `packages/plugin/README.md` matrix matches the canonical one. | Same automated check as G1. | Low cost; do in same PR. |
| Should | Scaffolded `.open-knowledge/AGENTS.md` (injected into every user repo) reflects the matrix. | The `AGENTS_MD_CONTENT` constant in `packages/cli/src/content/init.ts` consumes `install-path.generated.ts` (committed, script-regenerated). | Shipped via code edit + test fixture update. |
| Should | Agent-facing MCP tool descriptions (`init-content.ts`) match the matrix. | `init-content.ts:32-39` consumes the same source OR drops the runner example entirely. | Trivial edit per D6. |
| Could | CI lint rule prevents regression — a new fenced code block with `@inkeep/open-knowledge` that doesn't follow the canonical matrix form fails lint. | PR-blocking lint rule per D7. | Stretch; the grep-based drift check in D6 may subsume this. |

### Non-functional requirements

- **Drift resistance:** After shipping, the only way a surface can drift from the matrix is if someone deliberately edits the canonical source or adds a brand-new surface. G6 addresses this.
- **Reversibility:** If the chosen primary runner turns out to be wrong for the user base, the fix is a one-line matrix edit (per G6). No architectural lock-in.
- **First-impression latency:** First-touch readers should not need to scroll or click to see the command that works for their runtime. Matrix is above-the-fold on every surface.
- **Localization readiness:** If docs are ever translated, the matrix is a discrete unit (one file) that can be localized without touching surrounding prose.

## 7) Success metrics & instrumentation

This is a docs reconciliation spec; success is partly measurable and partly absence-of-incidents.

- **Metric 1 — Surface consistency score.**
  - **Target:** 6/6 surfaces show the canonical matrix.
  - **Instrumentation:** The G6 check (shared partial + drift check) makes this mechanical.

- **Metric 2 — `spawn npx ENOENT` support tickets.**
  - **Baseline:** Unknown (pre-launch); failure mode is mechanically plausible by inspection (see §2.3), not test-verified end-to-end.
  - **Targets:** (a) ≥3 tickets in any rolling 30-day window → D5 Option 2 escalation trigger fires; (b) ≥5 tickets cumulative in first 90 days → secondary trigger (equivalent signal via a cumulative window, since the 30-day rolling window can miss slow-burn accumulation).
  - **Known bias:** self-report under-counts — users who hit ENOENT and abandon don't file tickets. Operational commitment to compensate: Andrew greps GitHub issues + Slack for `npx ENOENT` weekly during the first 90 days post-launch, and release notes include an explicit call for bug reports on "MCP server failed to start" to raise self-report rate. D5 Option 2 is pre-designed in §14 Future Work Explored so the escalation PR is mechanical, not a re-design.
  - **Instrumentation:** manual grep (`gh issue list --search "npx ENOENT"`, Slack search) on weekly cadence.

- **Metric 3 — First-run success rate for new users.**
  - **Baseline:** Not currently instrumented.
  - **Target:** Aspirational — if anonymized first-run telemetry is ever added (NOT NOW per parent D14), track install → first MCP tool call without intermediate error.
  - **Instrumentation:** N/A under current telemetry posture (no telemetry today per parent spec).

- **Metric 4 — PR citation rate.** How many PRs touching install-UX surfaces cite this spec?
  - **Baseline:** 0 (spec doesn't exist yet).
  - **Target:** ≥2 within 6 months.
  - **Instrumentation:** `gh search prs --repo inkeep/open-knowledge "specs/2026-04-20-install-ux-docs-reconciliation"` periodic check.

## 8) Current state (how it works today)

**Verified against baseline `3f069185`** (commit under which this spec was drafted).

### Six surfaces + their current state

1. **Root `README.md`** (L7, L12-18, L39-45):
   - Prereq: `Bun >= 1.3.11` (only).
   - Quick start: `bunx @inkeep/open-knowledge <cmd>` primary; alt line "Use `npx …` or `pnpm dlx …`".
   - Global install matrix: `bun install -g` / `npm install -g` / `pnpm add -g` + documents both `ok` and `open-knowledge` bins.

2. **`docs/content/overview.mdx`** (L34-38):
   - 4 `npx @inkeep/open-knowledge <cmd>` examples. No bun/pnpm alternate. No `ok` alias.

3. **`docs/content/guides/getting-started.mdx`** (L5-7, L22, L45, L66-77, L99, L107-109, L182):
   - Prereq: `Bun >= 1.3.11` OR `Node.js >= 22`.
   - 17 `npx @inkeep/open-knowledge <cmd>` examples.
   - MCP config example uses `command: "npx"` + `args: ["@inkeep/open-knowledge", "mcp"]`.

4. **`docs/content/guides/cli-reference.mdx`** + `configuration.mdx`, `mcp-integration.mdx`, `content-filtering.mdx`, `github-sync.mdx`, `overview.mdx`:
   - ≈40+ code blocks. All use `npx @inkeep/open-knowledge <cmd>`. Zero `ok` form.

5. **`packages/plugin/README.md` L38:**
   - `bunx @inkeep/open-knowledge` (only, no alternates).

6. **Scaffolded `AGENTS.md`** (`packages/cli/src/content/init.ts:78`) + **agent-facing MCP tool description** (`packages/cli/src/mcp/tools/init-content.ts:32-39`):
   - Both say `open-knowledge init` or `npx @inkeep/open-knowledge init`.
   - Both reference `open-knowledge start` / `open-knowledge ui` in prose (assumes global install).

### Generated artifacts (downstream of surfaces)

- `packages/cli/src/commands/editors.ts:23` — `MCP_SERVER_COMMAND = 'npx'`. Consumed by every per-editor MCP config target (Claude Code, Cursor, VS Code, Codex, Windsurf, Claude Desktop).
- `packages/cli/src/commands/init.ts:233` — `runtimeExecutable: 'npx'` in `.claude/launch.json` for the `open-knowledge-ui` entry.
- `packages/cli/src/commands/self-spawn.ts:45` — fallback `npx` when `process.argv[1]` is empty.
- Rationale at `self-spawn.ts:7-13`: "`npx` with an unpinned lockfile-ABI drift." Never surfaced to users.

### Internal contributor surfaces (excluded from this spec)

- `CLAUDE.md` / `AGENTS.md` at repo root use `bunx tsc` / `bunx playwright test` — correct repo-internal dev commands. Not user-facing install UX.
- `packages/server/README.md` is a library-consumer README — no install UX.

### Known gaps

- Parent spec ([[specs/2026-04-20-cli-distribution-and-install-ux/SPEC]]) §8 claims "README.md documents the install-path matrix (bun/npm/pnpm global + bunx/npx/pnpm dlx one-shot)" — true of root README but never extended to docs site. G5 of parent spec is unsatisfied.

## 9) Proposed solution (vertical slice)

### User experience / surfaces

**Single canonical install-path matrix** rendered on every user-facing surface:

```
Quick start (one-shot, no install):
  bunx @inkeep/open-knowledge init     # Bun users
  npx @inkeep/open-knowledge init      # Node users
  pnpm dlx @inkeep/open-knowledge init # pnpm users

Install globally (after which both bins work):
  bun install -g @inkeep/open-knowledge    # Bun users
  npm install -g @inkeep/open-knowledge    # Node users
  pnpm add -g @inkeep/open-knowledge       # pnpm users

  ok init             # short alias
  open-knowledge init # long form (equivalent)
```

(The exact presentation — Fumadocs `<Tabs>` vs table vs prose — is a D-n decision.)

### System design

- **Canonical source:** one file (candidates: `docs/content/_partials/install-path.mdx` as a Fumadocs partial, OR a plain markdown snippet in `docs/content/_shared/install-path.md` copied into other surfaces via a build step, OR an MDX component).
- **Consumers:** root README (harder — not MDX), docs overview\.mdx, getting-started.mdx, plugin README (harder), scaffolded AGENTS.md (code-generated via `init.ts` — reads from a constants file).
- **Drift check:** CI grep asserts each surface matches the canonical string. New surface adoption = add path to the grep allowlist or refactor to import.
- **Generated-artifact rationale (dimension d):** three options investigated in §10 D-n; picked option determines whether editors.ts / init.ts / self-spawn.ts change or stay, and whether a prereq warning or runtime detection is added.

### Alternatives considered

- **Option A — No canonical source; update all 6 surfaces manually and enforce via diligence.** *Rejected:* audit proves diligence fails across 6 surfaces; G6 requires mechanical enforcement.
- **Option B — Canonical source with Fumadocs partial for docs site + hand-synced copies for non-MDX surfaces (root README, plugin README, generated AGENTS.md) + CI drift check.** *Leading candidate* for D-n.
- **Option C — Single MDX file rendered to HTML at build time for the website + extracted-to-markdown for non-MDX surfaces via a script.** *More complex; defer to Future Work unless C proves untenable.*
- **Option D — Kill the problem by going single-runner (npm-only) on every user-facing surface.** *Rejected:* parent spec D2 locks npm-only *distribution*, but the runner choice is a user preference; forcing `npx` everywhere hurts the V0-launch demographic (Bun users) and violates parent spec's shipped install matrix.

## 10) Decision log

| ID | Decision                                                                                                                                                                      | Type          | Resolution        | 1-way | Rationale                                                                                          | Evidence                                                                          | Implications                                                                                             |
| -- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ----------------- | ----- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| D1 | This spec scope is documentation + templates reconciliation — not a re-decision of bin names or distribution channels.                                                        | Scope         | **LOCKED**        | No    | Parent spec D1/D2 already locked those; this spec propagates.                                      | Parent §10 D1, D2                                                                 | Out of scope: renaming bins, adding Homebrew for CLI, adding non-npm distribution.                       |
| D2 | V0-launch polish + D1 compliance are primary drivers (fully satisfiable in this spec); silent-correctness (G3) is a secondary driver satisfied via documented-with-escalation pending observable triggers. All three remain Must goals; priority ordering surfaces when they conflict. | Scope | **LOCKED** | No | User intake §4 selected "all three co-equal" as motivation. After the iterative loop resolved D5 as Option 1 (documented-not-structural closure), audit challenge #7 flagged that co-equal framing obscures the actual priority ordering. Re-framed in finalization pass to match how D5 resolved. | This spec §4 intake + audit `meta/design-challenge.md` Challenge 7 | Scope stays broad (all 6 surfaces); when G3 conflicts with V0 polish or D1 compliance, V0 polish / D1 compliance wins (as seen in D5's choice of Option 1 over Option 2). G3 closure is accepted as partial with explicit escalation. |
| D3 | Primary runner on the canonical matrix stays `bunx` (first) with `npx` and `pnpm dlx` as co-equal alternates in the same matrix. **Explicit bet** (per challenge #1): V0 docs-site visitors are Bun-adjacent or indifferent; `bunx` primary signals the repo's Bun-native identity without materially disadvantaging Node users (who see `npx` as an equal alternate in the same matrix). | Cross-cutting | **LOCKED** | No | Root README already ships `bunx` primary per parent spec §8 (shipped precedent). [[specs/2026-04-11-zero-config-bunx-packaging/SPEC]] makes `bunx @inkeep/open-knowledge` a first-class entrypoint (Approved, shipped). Repo is itself a Bun monorepo. Making docs site match preserves the shipped decision. The bet is reversible under D6's G6 mechanism (one-line canonical edit) if post-launch audience-skew data contradicts. | Parent §8 + [[specs/2026-04-11-zero-config-bunx-packaging/SPEC]] + audit F1 + `meta/design-challenge.md` Challenge 1 | Docs-site edits show the matrix form with `bunx` primary. Reversal is mechanical post-launch if docs-site referrer analytics ever show Node-heavy skew. |
| D4 | Docs-site `ok` alias rollout uses **Fumadocs `<Tabs groupId="bin">` for bin-form toggle** in CLI code blocks + a **top-of-page callout** on every `guides/*.mdx` explicitly stating both `open-knowledge` and `ok` bins exist (addresses challenge #2: Tabs alone hide the inactive form from non-clickers). Root README + plugin README + scaffolded AGENTS.md show both bin forms in a single fenced matrix (their existing pattern). | Product | **LOCKED** | No | Option (a) double-show every block is visually noisy across 40+ examples; option (b) one-time callout alone is the weakest reading of D1's "both forms in every install snippet"; option (c) Tabs alone hide the inactive form on initial render. The combined approach (Tabs + one-time callout per page) shows both forms equally as user-selectable alternatives AND guarantees every reader sees the alias exists at least once per page, satisfying a strict reading of D1's implication. | Parent D1 implication verbatim + audit F3 + [[evidence/d6-canonical-source-analysis]] + `meta/design-challenge.md` Challenge 2 | Every `guides/*.mdx` code block wraps in `<Tabs groupId="bin">` with two items (`open-knowledge` + `ok`). Every `guides/*.mdx` page adds a one-time callout at the top (rendered from the canonical partial per D6). Root README + plugin README keep their existing fenced-block matrix. |
| D5 | `npx` stays hardcoded in generated MCP configs + `.claude/launch.json` + self-spawn fallback. Silent-failure path upgraded from silent → **documented-with-escalation** via (a) Node-as-MCP-prereq note, (b) documented rationale, and (c) operational monitoring + pre-designed structural fix (Option 2) ready to ship under triggers. Option 2 (runner detection) promoted to NOT NOW with operationally-grounded triggers. | Technical | **LOCKED** | No | Mastra (parent spec's install-UX north star) generates `npx` MCP configs universally — Option 1 is ecosystem-default posture, verified from Mastra source at `packages/cli/src/commands/init/mcp-docs-server-install.ts` (writes `"command": "npx"` on non-Windows, `"cmd"` + `/c, npx` on Windows). No surveyed CLI applies runner detection to generated configs (would be ecosystem-first). `self-spawn.ts:1-17` lockfile-ABI rationale applies to self-spawn path specifically; preserving `editors.ts`/`init.ts` preserves ~20 test cases. Option 3 rejected: 3a breaks committed `.mcp.json` portability; 3b regresses one-shot `bunx` cohort. Honest scope: Option 1 does not structurally close G3 (see `meta/design-challenge.md` Challenge 3); closure is partial + monitored. | [[evidence/d5-runner-choice-analysis]] §Feasibility + §Prior art + §Claude Desktop PATH + [Mastra source](https://github.com/mastra-ai/mastra/blob/main/packages/cli/src/commands/init/mcp-docs-server-install.ts) + `meta/design-challenge.md` Challenges 3 + 9 | No code change to `editors.ts`/`init.ts`/`self-spawn.ts`. User-facing prereq + rationale prose is load-bearing. **Operational commitment:** Andrew monitors `gh issue list --search "npx ENOENT"` + Slack weekly for 90 days post-launch; release notes explicitly solicit "MCP server failed to start" reports. **Escalation triggers (any one fires D5 Option 2 promotion):** ≥3 tickets in a rolling 30-day window, OR ≥5 cumulative in 90 days, OR Claude Desktop GUI PATH reduction becomes primary failure mode (per [[reports/web-to-macos-desktop-wrapping-2025/REPORT]]:431), OR Electron desktop app subsumes P1 install path. Option 2 implementation is pre-designed in §14 Future Work Explored — activation PR is mechanical. |
| D6 | Canonical source: plain-markdown snippet at `docs/content/_partials/install-path.mdx`. Docs-site MDX consumes via Fumadocs `<include>`. Root README + plugin README synced via `scripts/sync-install-matrix.ts` injecting between marker comments. Scaffolded AGENTS.md consumes a committed generated `packages/cli/src/content/install-path.generated.ts`. CI check runs script + `git diff --exit-code`. Unused `remark-mdx-snippets` dep + empty `docs/_snippets/` directory are deleted. **Trade-off acknowledged** (challenge #4): this is three mechanisms (include, sync script, generated.ts), not "minimum viable" — it optimizes for edit-path ergonomics and pays complexity in setup + dependency surface. Alternative (lint-only) was considered and rejected because matrix semantic content (prereq notes, failure-mode language) benefits from a single source of truth. | Technical | **LOCKED** | No | Fumadocs's native `remarkInclude` verified in pinned version (`fumadocs-mdx@14.0.4`, source at `node_modules/fumadocs-mdx/dist/chunk-FBLMK4RS.js:128-205` for the function; module section spans 64-209). Supports `.mdx`/`.md`, relative paths, HMR. Prior art: `streetsidesoftware/inject-markdown`, `SimonCropp/MarkdownSnippets`. | [[evidence/d6-canonical-source-analysis]] + Fumadocs docs + `docs/source.config.ts:5,22` + `meta/design-challenge.md` Challenge 4 | New: `docs/content/_partials/install-path.mdx`, `scripts/sync-install-matrix.ts`, `packages/cli/src/content/install-path.generated.ts` (committed, bundled into `dist/cli.mjs` by tsdown — no `packages/cli/package.json` `files` change required). **Developer workflow:** edit canonical partial → run `bun run sync:install-matrix` (new package.json script) → CI fails any PR where `git diff --exit-code` is non-zero after running it. New CI step: drift check. Deleted: `remark-mdx-snippets` from `docs/package.json` + `docs/source.config.ts` references + empty `docs/_snippets/` directory. |
| D7 | Docs-site vocabulary convention: **prose uses `ok <cmd>`** (shorter, matches existing `internals/*.mdx` and root README prose); **code blocks in `guides/*.mdx` use the full matrix** (D4's `<Tabs>` wrapping). Enforced via grep-based CI check on fenced code blocks only. **Trade-off acknowledged** (challenge #5): readers alternate between prose `ok start` and fenced `bunx @inkeep/open-knowledge start` within a page, asking them to maintain two mental models. D4's top-of-page callout partially compensates by teaching the alias explicitly once per page. | Product | **LOCKED** | No | Prose is comprehension; code blocks are copy-paste. Root README already mixes prose `auto-spawns ok ui` with fenced `bunx @inkeep/open-knowledge <cmd>` — codify what works. Keeps `internals/*.mdx` untouched (NG5 deferred IA restructure). | Audit F7 + root `README.md:15` + `docs/content/internals/service-topology.mdx:11-16` + `meta/design-challenge.md` Challenge 5 | Lint rule: fenced code blocks in `docs/content/**/*.mdx` containing `@inkeep/open-knowledge` or bare `open-knowledge` must be wrapped in D4's `<Tabs>` OR match an allowlisted pattern (e.g. MCP config JSON). Prose mentions unchecked. |
| D8 | Prereq phrasing: two-level prereq in root README + `getting-started.mdx`. Level 1: "Any JavaScript package runner — Bun >= 1.3.11, Node.js >= 22, or pnpm >= 10." Level 2 (MCP caveat): "Bun-only or pnpm-only users will also need Node.js >= 22 installed, because the generated MCP config invokes `npx`. Alternative: override the generated config manually (with the caveat that re-running `ok init` reverts the override)." | Product | **LOCKED** | No | D5 chose Option 1 (keep `npx`), so prereq must name Node as MCP-spawning dep. Two-level phrasing separates the install story (any runner works on its own) from the MCP config story (Bun-only / pnpm-only users need Node additionally). Challenge #6 (single-level alternative: "requires Node") rejected because it under-sells Bun-as-a-runner story which D3 locked as primary. Pedagogically: reader scans Level 1 to pick their runner, then reads Level 2 to learn the MCP caveat applies to Bun/pnpm-only cohorts. | D5 + audit F4/F6 + `meta/design-challenge.md` Challenge 6 | `README.md:7` edit + new paragraph in `docs/content/guides/getting-started.mdx`. Level-2 caveat appears once (not per-code-block), rendered from the canonical partial per D6. |

All P0 decisions resolved (D1-D8 LOCKED).

## 11) Open questions

### P0 (In Scope — all resolved)

All OQ1-OQ6 resolved as D3-D8 LOCKED in §10. No open P0 items.

### P2 (Future Work)

- **OQ7 — CI lint rule exact shape.** Scope defined in D7 (grep on fenced code blocks inside `docs/content/**/*.mdx`). Implementation details (regex vs AST, which CI workflow hosts it) deferred to implementation.
- **OQ8 — Internationalization readiness.** Defer until i18n is on the roadmap. The D6 mechanism (one canonical `.mdx` partial) already positions well for i18n — a translated `install-path.es.mdx` would be the natural extension.
- **OQ9 — Homebrew Cask integration into the matrix.** Deferred per parent D13 — triggers on signed DMG URL stable. When that fires, the canonical partial gets a new row; the G6 mechanism makes this one edit instead of six.
- **OQ10 (new) — Runner-matching generated-config (D5 Option 2) escalation path.** Not needed today (see D5 escalation triggers), but if triggered, the implementation sketch is in [[evidence/d5-runner-choice-analysis]] §"Seed for Option 2": detect via `npm_config_user_agent` leading token (verified empirically), write matching runner into `editors.ts`'s `MCP_SERVER_COMMAND`, leave `self-spawn.ts` fallback on `npx` (preserves lockfile-ABI rationale). ~20 test cases + migration story for existing users.

## 12) Assumptions

| #  | Assumption | Confidence | Verification |
| -- | ---------- | ---------- | ------------ |
| A1 | Fumadocs's `remarkInclude` (from `fumadocs-mdx/config`) works at pinned version `14.0.4` for our content layout. | HIGH | Verified in [[evidence/d6-canonical-source-analysis]] — function source at `node_modules/fumadocs-mdx/dist/chunk-FBLMK4RS.js:128-205` (module section spans 64-209). |
| A2 | `npx` in `editors.ts`/`init.ts`/`self-spawn.ts` is load-bearing for Mastra-parity + lockfile-ABI rationale at `self-spawn.ts:1-17`; keeping it preserves parent-spec alignment. | HIGH | [[evidence/d5-runner-choice-analysis]] §Prior art + §Lockfile-ABI rationale + Mastra source at `packages/cli/src/commands/init/mcp-docs-server-install.ts` (fetched via WebFetch during audit; SHA'd citation to be added to evidence file in Phase 1). |
| A3 | Audit's 8 findings are complete. | HIGH | Re-runnable grep commands documented at [[reports/bunx-npx-usage-audit/REPORT]] Evidence provenance section. |
| A4 | No current user has filed `spawn npx ENOENT` ticket. | MEDIUM | Checked pre-launch: `gh issue list --search "npx ENOENT"` returned 0; user base is small. Re-checked weekly post-launch per D5 operational commitment. |
| A5 | Runner detection via `npm_config_user_agent` is reliable enough for Option 2 escalation (distinguishes `bunx` / `npx` / `pnpm dlx`). | MEDIUM | Probe script output not currently committed to `evidence/`. TO-DO as Phase 1 work: commit probe script + captured output snapshot to `evidence/d5-probe/` so the claim is re-verifiable after `/tmp/runner-detect/` is lost to reboot. Confidence downgraded to MEDIUM until committed. |
| A6 | `remark-mdx-snippets` is unused (only configured in `docs/source.config.ts:5,22` with empty `_snippets/.gitkeep`). | HIGH | Verified by grep: no `<Snippet>` usage in any `docs/content/*.mdx`. |
| A7 | `mcp.test.ts:356` is a simulation, not end-to-end execution of `spawn npx ENOENT`. The failure mode is mechanically plausible by inspection of `editors.ts:23` + `init.ts:233` but not proven by a kernel-level test. | HIGH | Audit finding F01/F12/F20 verified by reading `packages/cli/src/commands/mcp.test.ts:345-378` — test uses `writeFileSync(path, 'spawn npx ENOENT\n', ...)` to pre-populate the stderr log, then asserts upstream error-surfacing behavior. |

## 13) Risks / Unknowns

| #  | Risk                                                                                                                            | Impact | Mitigation                                                                                                          |
| -- | ------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------- |
| R1 | Docs edit volume is high (40+ code blocks across 15 files). Reviewer fatigue → incomplete review → regression.                  | Medium | G6 mechanism reduces future edits to one file; for the initial migration, ship as a series of small PRs by surface. |
| R2 | Chosen D5 option (especially #2 runner-matching) changes MCP config contents — risks regression in existing user installations. | High   | If D5 resolves toward runner-matching, version-gate + write migration notes + add "re-run init" guidance.           |
| R3 | G6 mechanism is chosen but proves brittle (Fumadocs version bump breaks partial, build-step breaks).                            | Medium | Pick mechanism with fewest moving parts; instrument drift check in CI.                                              |
| R4 | `ok` alias on docs-site causes confusion with the word "ok" in prose (grep false-positives in lint rules).                      | Low    | Use fenced-code-block-only checks; lint rule scopes to code blocks.                                                 |
| R5 | Spec scope creeps into D5 deep investigation and loop doesn't converge.                                                         | Medium | Box D5 timebox: 2 iterative-loop rounds max; if unresolved, demote to separate spec (NG4 becomes active).           |

## 14) Future work

### Explored — ready to implement when triggered

- **Runner-matching generated MCP configs (D5 Option 2).** Detection via `npm_config_user_agent` leading token is empirically verified in [[evidence/d5-runner-choice-analysis]] (probe script output to be committed to `evidence/d5-probe/` in Phase 1 work per A5). Implementation sketch: `editors.ts:MCP_SERVER_COMMAND` becomes a function `detectRunner()` that reads `process.env.npm_config_user_agent` and returns `'bunx'` / `'npx'` / `'pnpm dlx'` (or falls back to `'npx'`); leaves `self-spawn.ts:45` fallback on `npx` to preserve the self-spawn lockfile-ABI rationale. Blast radius: ~20 test cases in `init.test.ts` + migration story (existing users need `ok init --force` to regenerate their configs — documented in release notes when Option 2 ships). **Escalation triggers (any one fires promotion):** (a) ≥3 `spawn npx ENOENT` support tickets in a rolling 30-day window post-launch, (b) ≥5 cumulative tickets in the first 90 days, (c) Claude Desktop GUI PATH reduction becomes the dominant failure mode (users on Bun have `~/.bun/bin` but Claude Desktop spawns MCP with reduced PATH — see [[reports/web-to-macos-desktop-wrapping-2025/REPORT]]:431), or (d) Electron desktop app subsumes the P1 install path and CLI moves to developer-only (would justify a simpler Node-always prereq). Operational monitoring per D5.

### Identified — needs its own spec

- **First-run telemetry** (parent NG3/D14 LOCKED posture, implementation NOT NOW). If ever added, would measure G3's success quantitatively. Triggered by parent D14 conditions.
- **Homebrew Cask row in matrix** — triggered by parent D13 (signed DMG URL stable). When fired, edit `docs/content/_partials/install-path.mdx` → re-run `scripts/sync-install-matrix.ts` → all 6 surfaces update in one PR.

### Noted — not examined

- Renaming `open-knowledge` to a shorter NPM name. Parent NG5 forbids re-debating.
- Vendor CI GitHub Action that installs + runs OK commands with its own docs. Parent NG6 (NOT NOW).
- i18n of the install-path partial (OQ8).

## 15) Rollout / phasing

Ordered to validate the G6 mechanism before investing in full docs-site rewrite. **Phasing trade-off acknowledged** (challenge #8): Phase 1 validates G6 on the root README (low-volume, low-risk) rather than the docs site (high-volume, where brittleness would show fastest). Chosen this ordering because Phase 1 is reversible (revert the one PR, delete the partial + script), while a docs-site-first Phase 1 that fails under editing density would leave 40+ half-migrated code blocks to untangle. Alternative one-PR collapse was rejected because review ergonomics benefit from a ~200-LOC Phase 1 + a mostly-mechanical Phase 2 diff.

1. **Phase 1 — Canonical source + root README.** Create `docs/content/_partials/install-path.mdx` with the D3 matrix + D4 bin-form structure + D8 prereq. Write `scripts/sync-install-matrix.ts` with marker-block injection. Add marker-block in root `README.md`. Run sync + commit. **Phase 1 → Phase 2 promotion criterion:** at least one edit to the canonical partial must propagate to the README via script without hand-editing, proving the sync mechanism works end-to-end before docs-site migration commits.
2. **Phase 2 — Docs-site guides migration.** Convert every CLI code block in `docs/content/guides/*.mdx` and `docs/content/overview.mdx` to D4's `<Tabs groupId="bin">` form using Fumadocs `<include>` where appropriate. Add D4's top-of-page callout on every `guides/*.mdx`. Delete unused `remark-mdx-snippets` wiring + empty `docs/_snippets/` directory. Largest line-count change.
3. **Phase 3 — Secondary surfaces.** Plugin README (`packages/plugin/README.md`) sync via the script. Scaffolded AGENTS.md: create `packages/cli/src/content/install-path.generated.ts` (script-written), refactor `init.ts` to consume it, update existing scaffolded-content tests. Agent-facing MCP tool descriptions (`init-content.ts`) updated inline.
4. **Phase 4 — Enforcement.** Add CI drift check (runs script + `git diff --exit-code`). Add D7 lint rule for docs-site fenced code blocks. Add entry to parent spec's [[specs/2026-04-20-cli-distribution-and-install-ux/SPEC|discoverability pointer]] referencing this spec. Add `bun run sync:install-matrix` to `package.json` scripts for developer use.

Each phase is a separate PR. Phase 1 gates Phase 2 (G6 mechanism validated first). Phases 3 and 4 can parallelize once Phase 2 lands.

## 16) Agent constraints

- **SCOPE:**
  - `README.md` (root) — D3/D4/D8 matrix + prereq edits via marker-block.
  - `docs/content/**` (15 `.mdx` files) — primary work surface. D4 `<Tabs>` wrapping on every CLI code block; Fumadocs `<include>` for the canonical partial.
  - `docs/content/_partials/install-path.mdx` (new) — canonical source.
  - `docs/source.config.ts` — delete unused `remark-mdx-snippets` wiring per D6.
  - `docs/package.json` — delete unused `remark-mdx-snippets` dep.
  - `packages/plugin/README.md` — marker-block sync target.
  - `packages/cli/src/content/init.ts` — refactor AGENTS_MD_CONTENT to consume the generated TS file.
  - `packages/cli/src/content/install-path.generated.ts` (new, committed) — script output consumed by `init.ts`.
  - `packages/cli/src/mcp/tools/init-content.ts` — inline edit to match D3/D8.
  - `scripts/sync-install-matrix.ts` (new) — canonical-source → non-MDX surface sync.
  - `.github/workflows/ci.yml` (or equivalent) — new drift check step.

- **EXCLUDE:**
  - **Behavior-level changes** to `packages/cli/src/commands/{editors.ts:23 MCP_SERVER_COMMAND, init.ts:233 runtimeExecutable, self-spawn.ts:45 fallback}` — D5 LOCKED keep-as-is; modifying the runner string requires re-opening D5 with the escalation triggers. **Comment-only annotations** cross-referencing this spec + D5 are in-scope and recommended (e.g. adding a one-line comment at `editors.ts:23` citing D5 so future contributors find the rationale). The distinction is: behavior change = EXCLUDE, documentation annotation = SCOPE.
  - `packages/{app,server,core}/src/` — not user-facing install UX.
  - `CLAUDE.md` / `AGENTS.md` at repo root — internal contributor docs (use `bunx tsc` / `bunx playwright` correctly; not install UX).
  - `packages/cli/package.json` `bin` map — governed by parent spec D1; don't touch.
  - `docs/content/internals/*.mdx` — NG5 defers IA restructure; prose can continue using `ok <cmd>`.

- **STOP_IF:**
  - Change modifies `MCP_SERVER_COMMAND` in `editors.ts:23`, `runtimeExecutable` in `init.ts:233`, or `command` in `self-spawn.ts:45` — re-opens D5.
  - Change touches `packages/cli/package.json` `bin` map — governed by parent spec D1.
  - Change adds a non-npm distribution channel — governed by parent D2.
  - Fumadocs `<include>` fails at build time — re-open D6 with evidence.
  - `scripts/sync-install-matrix.ts` produces a diff that developers can't quickly reconcile — revisit D6 complexity.

- **ASK_FIRST:**
  - Renaming any existing `.mdx` file.
  - Adding a new `docs/content/` subdirectory.
  - Changing the `<Tabs groupId="bin">` structure (affects D4).
  - Changing the marker-block comment syntax (affects D6).



