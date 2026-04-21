# Changelog — Claude Desktop init --cwd spec

## 2026-04-17 — Session 1 (intake + scaffold + decisions)

**Baseline commit:** `ee1fc3af`

### Intake
- SCR drafted and stress-tested (all 5 probes pass).
- Scope hypothesis: add `claude-desktop` editor target with project-qualified key + `--cwd` in args; other editors untouched.

### Decisions locked
- **D1.** Server key shape = `open-knowledge-<basename(cwd)>`. Rationale: owner's hand-crafted config uses this pattern; global config motivates project qualification. User answered `A`.
- **D2.** Collision handling = auto-disambiguate (`-2`, `-3`, …) with idempotence via match-by-`--cwd`. Rationale: non-interactive, protects hand-crafted entries. User answered `C` (overriding spec default recommendation of `B`).
- **D3.** Windows + macOS day-one. User answered `A`.
- **D4.** Auto-detect + preselect in multiselect. User answered `A`.

### Decisions derived
- **D5.** `buildEntry` signature widened to `(cwd: string) => ...`. Cleaner than branching per-editor in init.ts.
- **D6.** `resolveServerKey` added as optional target method. Absence preserves current behavior.
- **D7.** `--desktop-key` override deferred (NG5).
- **D8.** `claude-ai` web connector out of scope — different surface (NG1).
- **D9.** No Linux support — Anthropic ships macOS + Windows only (NG4).
- **D10.** Disambiguation upper bound N=1000; DELEGATED to implementer.

### Evidence persisted
- `evidence/claude-desktop-shape.md` — observed shape of owner's working config + failure modes from MCP logs.
- `evidence/current-state.md` — `EditorMcpTarget` abstraction + touchpoints for this change.

### Open
- Q1 (P2): Windows `%APPDATA%` resolution approach — deferred to implementation time.
- Q2 (P2): Does claude.ai web share `claude_desktop_config.json` on macOS? Evidence suggests yes but unverified. Non-blocking.

### Next
- World model (Phase B — spec-unique analysis) — largely completed inline during intake (abstraction already well-understood).
- Backlog extraction — ran inline.
- Iterate — ready to proceed; P0 decisions all LOCKED. Remaining work is AC verification + implementation.

## 2026-04-17 — Session 1 cont. (audit + challenger + assess)

**Subagents spawned:** `audit` + `design-challenger`, parallel, no scope of work overlap.

### Audit findings applied (all MEDIUM / LOW — corrections, no design change)
- **M1.** D10 flipped `DELEGATED` → `LOCKED at N=1000`. §9 failure-modes table now references D10 rather than hard-coding the constant. Contradiction resolved.
- **M2.** §11 Q2 marked `Resolved`. Evidence: live MCP log `~/Library/Logs/Claude/mcp-server-open-knowledge-bim-tools.log:28` — `clientInfo.name === 'claude-ai'` on a server registered through `claude_desktop_config.json`. New D15 LOCKED: `claude-ai` web connector is covered by virtue of the shared file (not a separate target). §1 Complication updated to state this up-front.
- **M3.** FR4 Linux fallback removed. D14 LOCKED: unsupported platforms (neither `darwin` nor `win32`) throw a friendly error rather than silently writing a ghost macOS path. Consistent with NG4.
- **M4.** §8 line reference corrected to `init.ts:274-292` (covers both read at 274-275 and write at 286-292).
- **L1-L4.** Wording polish: `resolveServerKey` default prose, "non-breaking widening" softened to "non-breaking for internal consumers," §13 step 9 (changeset) added, FR4 Windows pseudocode made concrete.

### Design-challenger findings applied (non-escalating subset)
- **C2 (HIGH).** New FR14 — summary-line hint for `written` / `overwritten` outcomes: "quit and relaunch Claude Desktop to activate." New D13 LOCKED.
- **C3 (MEDIUM).** FR6 revised: realpath-normalize both sides of the `--cwd` match; ENOENT falls back to string equality. New D12 LOCKED. Addresses symlink/worktree duplication.
- **C4 (HIGH).** FR14 also handles auto-disambiguation: when a `-2`+ suffix fires, print `(<default-key> is already bound to --cwd <other-path>)` on the line below the summary. Matched-key also printed on `skipped-existing`.
- **C6 (MEDIUM).** Merged into M2 — resolved by shared-file evidence.
- **C7 (MEDIUM).** FR5 updated: server key uses `slugify(basename(cwd))` (kebab-lowercase-ASCII). New D11 LOCKED. `bim-tools` remains idempotent.
- **C8 (LOW).** FR10 test count raised from `≥ 5` to `≥ 8`, with Windows-path testing approach concretely specified (`Object.defineProperty(process, 'platform')` + env mocks, restored in `afterEach`).

### Design-challenger findings deferred
- **C5 (LOW).** `resolveServerKey` abstraction vs. `applyEntry` refactor — contingent on C1 (if two global-scope editors adopt the pattern, abstraction right-sizes). Deferred to follow-up spec if C1 is accepted.
- **C3 gap 2 (stale entries when projects move).** Added as FR15 `Could`-tier + §15 Future Work (Explored tier).

### Design-challenger finding ESCALATED to user
- **C1 (HIGH).** Windsurf is already `scope: 'global'` with a single `open-knowledge` key across all projects — same collision problem the spec attributes to Claude Desktop. Original directive was "only Claude Desktop"; this evidence is new. Presented for user decision: (A) keep Claude Desktop only; (B) apply same pattern to Windsurf; (C) explicitly defer in NG2 with reason.

### Open
- **C1 awaiting user decision** before §3 NG2 / §13 scope are re-confirmed.

## 2026-04-19 — Session 2 (C1 resolved + cascade + finalize)

### Decision
- **C1 resolved: Owner chose B — extend the pattern to Windsurf in the same slice.** Recorded as **D16 LOCKED** (Cross-cutting, 1-way door on Windsurf registration UX). D17 LOCKED: legacy migration is non-interactive, no `--force`, gated on (exact key `'open-knowledge'` + no `--cwd` in args).

### Spec cascade applied
- **Title + §1 Problem statement** — reframed from "Claude Desktop only" to "every `scope: 'global'` target." Windsurf's latent multi-project collision is now a first-class motivation alongside Claude Desktop's zero-cwd failure.
- **§2 Goals** — added G5 (Windsurf legacy migration).
- **§3 Non-goals** — NG2 narrowed to the three project-scoped editors (Claude Code / Cursor / VS Code). NG6 added for stale-entry auto-removal.
- **§4 Personas** — added P3 (legacy Windsurf user).
- **§5 User journeys** — happy path now covers both global editors; added P3 legacy-migration journey; interaction-state matrix adds a `Legacy migration` row.
- **§6 Functional requirements** — FR1 covers both new + upgraded targets; FR3 generalized to all `scope: 'global'` targets; **FR16 added** (legacy migration with detection gate + summary hint); test count in FR10 raised accordingly.
- **§8 Current state** — notes Windsurf is already global-scope with the latent bug.
- **§9 Alternatives considered** — added Option F (Claude Desktop only, rejected) and Option G (partial `resolveServerKey`, rejected).
- **§9 Affected files** — added explicit Windsurf touchpoint + changeset file.
- **§10 Decision log** — **D16 (LOCKED, 1-way door)** and **D17 (LOCKED)** added. All D1-D17 now have cited evidence.
- **§11 Open questions** — remain Resolved (Q1, Q2).
- **§12 Assumptions** — A1 retired (replaced by D11 slug rule); A5 added (Windsurf hot-reload, MEDIUM, verify at implementation); A6 added (legacy-entry semantics, HIGH).
- **§13 In Scope** — goal rephrased to "every scope:'global' target"; Next actions list expanded to 9 steps including the shared helper (step 2) and Windsurf upgrade.
- **§13 Deployment / rollout** — legacy-migration + partial-legacy (user-modified) test scenarios added.
- **§14 Risks** — two new rows (false-positive legacy migration, multi-project-sharing-legacy-entry).
- **§15 Future Work** — "Windsurf parity" removed from Identified (now In Scope); replaced with "Future global-scope targets" refactor note.
- **§16 Agent Constraints** — SCOPE mentions the shared helper; EXCLUDE snapshot-protects project-scoped editors' `buildEntry` output; STOP_IF adds ambiguous-legacy-classification rule; ASK_FIRST guards Windsurf `configPath`.

### Mechanical adversarial checks (run 2026-04-19, clean)
- **ASSUMED decisions** — none. All D1-D17 are LOCKED or DELEGATED (D10 now LOCKED; none remain ASSUMED or INVESTIGATING).
- **1-way doors at LOW/MEDIUM confidence** — D1 (server key shape), D15 (claude-ai coverage), D16 (Windsurf inclusion). All HIGH-confidence with cited evidence (owner's config, live MCP log, challenger C1 evidence, owner decision).
- **Non-goal accuracy** — NG1 (NOT NOW, conditional on Anthropic remote-MCP shipping), NG2 (NOT NOW, narrowed to project-scoped editors), NG3 (NEVER — interactive prompts break non-TTY), NG4 (NOT UNLESS, conditional on Anthropic Linux build), NG5 (NEVER — flag adds surface area), NG6 (NOT NOW). All temporal tags pressure-tested; no item in NG would cause rework if moved in.

### Resolution completeness gate (§13 In Scope, 2026-04-19)
- [x] All decisions that affect In Scope items made — D1-D17 LOCKED
- [x] 3P dep selections named — no new 3P deps
- [x] Architectural viability validated — evidence-based; owner's hand-crafted config proves shape; Windsurf existing target proves abstraction
- [x] Integration feasibility confirmed — `--cwd` flag already wired end-to-end (`cli.ts:33`); detection heuristic already used by Windsurf
- [x] Acceptance criteria verifiable — every FR has an AC column tests can assert against
- [x] No dependency on Out of Scope item

### Spec status
- **Finalized.** Ready for `/implement` hand-off. Baseline commit rolled forward from scaffold baseline to finalization baseline.
