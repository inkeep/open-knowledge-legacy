# Changelog — OK Shell-Job Runner Spec

## 2026-04-28 — initial scaffold

- Created `specs/2026-04-28-ok-shell-job-runner/` with `SPEC.md`, `evidence/`, `meta/`.
- Baseline commit: `54443690`.
- Source material: `reports/ok-integrated-knowledge-lint-architecture/` (Phase 4 + Distribution Layer 3) and the canonical 1P GBrain coverage at `reports/gbrain-vs-openknowledge-parity/evidence/gbrain-durability-jobs.md`.
- Initial draft SPEC.md captured 16 functional requirements, 12 LOCKED/DIRECTED decisions in the Decision Log, 10 open questions (7 P0 needing user input), 5 assumptions.
- The architecture report decisions (D1: no default agent CLI; D2: off-by-default env gate; etc.) carried forward as LOCKED. New v1-implementation decisions (D3-D12) added.
- Open questions Q1-Q10 surfaced for user input. P0 set: Q1 (cron-entry indirection), Q3 (ship deterministic-only example script), Q4 (worker-crash detection mechanism), Q5 (`--dry-run` mode), Q6 (`schedule:` informational only), Q7 (cwd-only stream isolation), Q10 (env-var inclusion in installed scheduler config).

## 2026-04-28 — bundle `ok lint` aggregator + de-wiki-fy

User direction (after reviewing the v1 runner spec): "do we already have the lint commands or lint scripts available to us" surfaced that v1 ships a scheduler with no turnkey thing to schedule (5 atomic HTTP endpoints exist, but no aggregator command, no bash example, no `ok lint`). User chose **Option A**: bundle `ok lint` + bundled bash example into v1 scope so the runner ships with a working end-to-end loop on install day.

Plus user direction: "lets avoid using wiki specific stuff please" — KB-shape-neutral terminology throughout. OK supports any markdown-shaped knowledge base; spec must not assume `wiki/`, `articles/`, or any specific layout.

Substantive changes:

- **§1 Problem statement** rewritten — added the second coupled primitive (`ok lint`) to the Resolution; KB-neutral framing (wiki, LLM brain, spec collection, research log, agent memory).
- **§2 Goals** added G6 (KB-shape neutrality) and revised G3 to reflect bundled `ok lint` (was "user writes a bash script" → now "two lines of YAML").
- **§3 Non-goals** added NG3 (KB-shape-neutral; no `wiki/` assumption); added NG5 (net-new check primitives are NOT NOW — separate specs); renumbered NG4-NG9.
- **§4 Personas** removed wiki-specific phrasing; P3 renamed "per-stream" → "per-area".
- **§5 P1 user journey** rewritten — Step 2 went from "user writes a bash script that curls endpoints" to "`cmd: ok`, `argv: [lint, --output, ...]`". Step 6 example uses `--scope` instead of writing custom scripts.
- **§6 Functional requirements** added FR17-FR22:
  - FR17: `ok lint` CLI command (output formats, flags).
  - FR18: `lint` MCP tool (same logic, agent-callable).
  - FR19: `Finding` shared Zod schema in `packages/cli/src/lint/types.ts`.
  - FR20: Exit-code-on-findings semantics (0 / 1 / 2; `--strict` default).
  - FR21: Default `--output` path `.open-knowledge/lint-reports/<date>.md` (KB-neutral, NOT `wiki/`).
  - FR22: Bundled `examples/scheduling/scripts/lint-deterministic.sh` + agent-agnostic example YAMLs.
- **§9 Proposed solution** new subsection on `ok lint` design (Zod schemas, internal flow, output formats, scope/checks semantics, why this scope).
- **§10 Decision Log** added D13-D16:
  - D13 LOCKED: `ok lint` v1 scope = aggregator only, wraps 5 existing endpoints + redlinks; no net-new check primitives.
  - D14 LOCKED: Exit-code-on-findings is the default; mirrors lychee/markdownlint conventions.
  - D15 LOCKED: `Finding` shared Zod schema; single source of truth for CLI + MCP outputs.
  - D16 LOCKED: KB-shape-neutral default output path `.open-knowledge/lint-reports/<date>.md`; never `wiki/`.
- **§11 Open Questions** Q3 marked RESOLVED (superseded by D13/D16/FR17-FR22).
- **§13 In Scope** rewritten — two coupled primitives, FR1-FR22, expanded next actions.
- **§16 Agent constraints** expanded — added `packages/cli/src/lint/`, `packages/cli/src/commands/lint.ts`, `packages/cli/src/mcp/tools/lint.ts`, `examples/scheduling/scripts/lint-deterministic.sh` to SCOPE; added STOP_IF for net-new check primitives in `ok lint`, defaulting `--output` to content-tree paths, reaching into `api-extension.ts` to add new HTTP endpoints; added ASK_FIRST for `Finding.type` additions.

Additions: ~280 LOC additional spec scope (FR17-FR22 implementation + types + tests). Total v1 LOC estimate: ~880-1080 LOC across the runner + lint aggregator + types + 5 examples + 3 prompt templates + bundled bash script.

Net effect: **v1 ships a complete, useful, end-to-end loop** instead of a scheduler with no turnkey workload. Persona P1 (deterministic-only, no LLM) gets a two-line YAML setup. Persona P2 (single-agent) and P3 (mixed-agent team) work the same as before (their `cmd:` is their agent CLI). KB-neutral defaults respect projects of any shape.

## 2026-04-28 — locked Q1/Q4/Q5/Q6/Q7/Q10 + audit + design challenge

User direction: "lets do the recommendations here lets go for it" — accepted all 6 P0 recommendations from the prior batch; locked them as D17-D22. Spawned audit + design-challenge subprocesses; sandbox policy blocked the spawned-Claude challenger (autonomous-loop guard); ran both passes inline against the same loaded conversation context.

Decisions locked from prior batch:
- D17 LOCKED: cron-entry indirection (`ok schedule run --once --job=<n>` invokes user's cmd) — resolves Q1.
- D18 LOCKED: SQLite stranded-row reconciliation for crash detection (no PID file) — resolves Q4.
- D19 LOCKED: `--dry-run` mode with credential redaction — resolves Q5.
- D20 LOCKED: `schedule:` informational-only — resolves Q6.
- D21 DIRECTED: stream isolation = `cwd` + `scope` + `agent_label` only — resolves Q7.
- D22 LOCKED: env-var written into generated scheduler config + warning + no-auto-load — resolves Q10.

Audit/challenge findings applied:

- **Audit Finding A1 (MEDIUM)**: §15 had stale NG3 / NG6 references after de-wiki-fy renumbering. Fixed → NG4 / NG8.
- **Audit Finding A2 (MEDIUM)**: FR17 listed `/api/backlinks` as wrapped; §9 design didn't fan it out. Resolution: removed `/api/backlinks` from FR17 wrapped set (it's per-doc, not corpus-lint). Endpoint count corrected from "5 graph-health endpoints" → "4 endpoints + content-scan-derived redlinks." Affected: §1, §6 FR17.
- **Audit Finding A3 (LOW)**: "5 endpoints" count cleaned up post-A2 fix.
- **Audit Findings A4/A5 (LOW)**: `/api/link-graph` and `/api/backlink-counts` deliberately excluded; documented in FR17.
- **Challenger Finding 2 (MEDIUM)**: SQLite WAL mode wasn't explicitly decided. Added D23 LOCKED: `journal_mode=WAL`, `synchronous=NORMAL`, `busy_timeout=5000ms`.
- **Challenger Finding 5 (MEDIUM, highest priority)**: lint v1 scope risks "looks clean, isn't" failure mode. Added FR23: `ok lint` output MUST surface "Checks run" + "Not yet checked" in all formats. Prevents user-trust risk without expanding scope.
- **Challenger Finding 7 (MEDIUM)**: G1 conflated cross-host setup with cross-host output consumption. Rewritten to distinguish.
- **Challenger Finding 8 (LOW)**: `--strict` default is hostile for cron use. Updated FR22: bundled cron examples use `--no-strict` by default; hook examples use `--strict`. Documented in `ok lint --help`.
- **Challenger Finding 9 (LOW)**: D19 redaction heuristic was unspecified. Extended D19 with regex pattern + `automation.dry_run.redact_extra_patterns` config override.
- **Challenger Finding 10 (LOW)**: Q2 (where examples ship) was deferred and would create install friction. Added D24 LOCKED: `ok schedule install-examples` sub-command (~30 LOC). Resolves Q2.
- **Challenger Findings 3, 4 (LOW/MEDIUM)**: runner-crash-between-status-and-exec + malicious-config-edit attack surface. Added two §14 risk rows with documented mitigation (no v1 implementation impact; user-facing docs + threat model).
- **Challenger Finding 6 (LOW)**: Phase 5 lint extension should reuse `Finding` schema. Added note to §15 Future Work.
- **Challenger Findings 1**: D1 (no default agent CLI) holds — accepted current design.

No high-severity findings. No decisions reopened. Net additions: D23, D24 (LOCKED), FR23, 2 risk rows, surgical edits to §15 NG references and FR17/FR22.

(At time of this entry, spec status was Approved. Subsequent audit pass — see next entry — overwrote this assessment.)

## 2026-04-28 — audit subprocess landed, decision-reopens surfaced (status reverted to Draft)

The spawned audit subprocess (which had been blocked from spawning the challenger but was running its own pass in background) finally completed and produced a much more rigorous `meta/audit-findings.md` (25 findings, 5 high). That file overwrote my inline audit pass.

**The headline issue: H1 — OK does not currently use SQLite.** I had "verified" earlier in conversation that "OK already uses SQLite via Hocuspocus" — that was a false positive (I had confused Hocuspocus's git-backed shadow repo at `<projectRoot>/.git/open-knowledge/` with a SQLite database). The audit subprocess went to the codebase via Explore subagent at baseline `54443690` and confirmed: `packages/server/package.json` deps include `simple-git`, `chokidar`, `yjs`, `ws` etc. — **no `better-sqlite3`, no `bun:sqlite` import, no SQLite anywhere in the server package**. The shadow repo is a git bare repository created via `simple-git`, not a SQLite file.

This is decision-implicating. D3, D18, D23, A1 all rested on the false premise. The SQLite choice may still be correct, but it is *not* a reuse of an existing dependency — it's a new dependency adoption, which requires explicit user confirmation as a 1-way door.

Plus M11 (medium): `ok lint` calls Hocuspocus HTTP endpoints, which means **Hocuspocus must be running** for the deterministic-only lint path to work. Persona P1's "two-line setup" promise quietly assumes the user has `open-knowledge start` running as a service — not a default. Three plausible resolutions; user must pick.

**Status reverted to Draft.** D3 changed to INVESTIGATING. D23 changed to INVESTIGATING (cascades from H1). A1 confidence dropped to MEDIUM (cascades from H1).

Auto-applied audit fixes (high/medium/low pure-corrections, surgical edits — no decision-reopen):
- H2: §13 stale "Next actions" listing already-resolved Q1/Q4-Q7/Q10 → updated to reflect all P0 questions resolved; remaining work is implementation/tests/docs.
- H3: §6 NFR worker-startup ("matches GBrain Minions' 753ms goal") → reframed as "OK targets <½ that; 500ms = regression."
- H4: FR13 specified `withSpanSync` for async spawn-and-wait → split into `withSpan` (async, for spawn-and-wait + post-exit attribute set) and `withSpanSync` (for synchronous state-row insert). A4 updated.
- H5: §1 said "nine target hosts" but listed ten → reframed as "OK target host matrix ... — ten hosts."
- M1: Endpoint count oscillation (4 vs 5 vs 6) → §1 Resolution + FR17 + D13 all standardized on "OK exposes 6 graph-health HTTP endpoints today; v1 `ok lint` wraps 4."
- M3, M7: A2 marked Confirmed (resolved by D13/FR22). A5 NG3 → NG4. Stale NG references in §15 already fixed.
- M4: "21+ cron jobs" → "20+ recurring cron jobs" (matches evidence).
- M5: "17,888 → 45,000 page deployments" growth narrative → "production deployments measured at 17,888 pages and 45,000 pages" (decoupled snapshots).
- M6: D22 honest framing — single-explicit-action gate post-install (was framed as "dual-gate preserved"; verbal sleight-of-hand corrected).
- M8: Residual `wiki/` references → `.open-knowledge/jobs/failures.md` (P2 step 5, FR12), `content tree` (M3 instrumentation).
- M9: §13 "FR1-FR22" → "FR1-FR23".
- M10: §13 "Q2 deferrable" → removed (Q2 resolved by D24).
- L8: Karpathy quote attribution clarified — "Karpathy framed wikis as abandoned because [exact quote]; (KB-shape-neutral framing applies equally...)" instead of paraphrase-as-quote.

Pending decision-reopens (blocking re-approval):
- **H1**: Substrate choice. Options surfaced in §13 Blocking. User picks Option 1 (`bun:sqlite`) or Option 2 (alt substrate). Recommended: Option 1 — Bun runtime is already required, `bun:sqlite` ships with it, no compile, no extra dep payload, gives WAL/durability/atomic-tx for free.
- **M11**: Hocuspocus dependency for `ok lint`. Options: (a) auto-start, (b) install as service, (c) on-disk read directly, (d) hybrid. Recommended: (c) on-disk read — aligns with G6 KB-shape neutrality, removes Hocuspocus dependency for the deterministic path entirely, cleanest persona-P1 story. Trade-off: doesn't see in-flight CRDT state (acceptable for lint — lint is about persisted state).

Final spec state: 24 decisions (D1-D24), but D3 and D23 are INVESTIGATING pending H1; otherwise LOCKED/DIRECTED. 23 functional requirements (FR1-FR23). 14 risk rows (2 added post-audit). 25 audit findings — 23 auto-corrected, 2 surfaced as decision-reopens.

## 2026-04-28 — H1 + M11 resolved; spec re-Approved

User direction: "1. option2. 2. c" — H1 → Option 2 (alternative substrate, NOT bun:sqlite); M11 → Option (c) (`ok lint` reads on-disk).

Follow-up direction: "but mention that option 1 is an easy option if we want sqlite" — added SQLite migration as Future Work Identified with explicit "non-breaking migration via one-pass JSON→SQLite ingest" framing.

For H1 Option 2, picked sub-option (a) JSON-file-per-run as the most defensible v1 choice (vs JSONL, vs git-shadow-write). Reasoning: zero new dependencies (only `node:fs/promises`); single-file-per-run = trivially inspectable by hand; ULID run-IDs give natural sortability; atomic-rename gives durability guarantees comparable to SQLite WAL at v1 scale; conceptually closest to GBrain `dream` cycle's stateless-per-fire posture.

Decisions updated:
- **D3 LOCKED** (was INVESTIGATING): State substrate = JSON-file-per-run at `.open-knowledge/jobs/runs/<run-id>.json`. Migration path to `bun:sqlite` documented as easy v2.
- **D18 LOCKED** updated: stranded-run reconciliation now operates on directory entries (readdir + filter + atomic-rename to mark failed) rather than SQLite scan.
- **D23 LOCKED** (was INVESTIGATING): Replaced "SQLite WAL config" with "JSON-file durability via atomic write-tmp + fsync + rename" — POSIX-atomic rename + fsync gives the equivalent crash-safety contract.
- **D25 LOCKED** (NEW): `ok lint` reads on-disk markdown directly via `node:fs` + the existing `@inkeep/open-knowledge-core` markdown pipeline. No Hocuspocus dependency. The `lint` MCP tool has a dual read-path: in-session uses live `backlinkIndex` (no re-parse cost); standalone falls back to the on-disk path.
- **A1**: Confidence MEDIUM, replaced verification plan with "synthesize 1000 run files, list, parse, atomic-rename-update; assert each <50ms."

Section updates:
- §6 FR5 (job state): "SQLite at `.open-knowledge/jobs.db`" → "JSON file at `.open-knowledge/jobs/runs/<run-id>.json`."
- §6 FR17 (`ok lint`): Removed `--server-url` flag; added `--content-dir` flag. Reads on-disk, not HTTP.
- §6 FR18 (`lint` MCP tool): documented dual read-path.
- §9 data model: replaced SQLite DDL with directory layout diagram + operations description.
- §9 lint design internal flow: rewritten — file walk + parse + in-memory index build + check computation, no HTTP fan-out.
- §13 In Scope: removed "Blocking" section (both reopens resolved); reframed as "Audit reopens resolved 2026-04-28."
- §15 Future Work Identified: added SQLite migration as the first item.

Status reverted from Draft to **Approved**. All P0 questions resolved; all audit reopens addressed; agent constraints (§16) hold.

Final spec state: 25 decisions (D1-D25), all LOCKED/DIRECTED. 23 functional requirements. 14 risk rows. Ready for `/ship`.

## 2026-04-28 — re-audit (cold-reader pass with codebase verification)

A fresh audit was run against `SPEC.md` per the unified audit protocol (intake → reader pass → claim extraction → 7 coherence lenses → factual tracks T1/T3/T5). The prior `audit-findings.md` (in-context inline pass) was overwritten because it had a critical false-positive: it "verified" the SPEC's claim that *OK already uses SQLite via Hocuspocus* by citing the `<projectRoot>/.git/open-knowledge/` shadow-repo path — that path is a **git bare repository**, not a SQLite database. Codebase verification at baseline `54443690` shows no `better-sqlite3`, `bun:sqlite`, or `@hocuspocus/extension-sqlite` in any `package.json` or import; `packages/server/src/persistence.ts` uses `simple-git`. The corrected finding is now H1 in the new `audit-findings.md`.

New audit totals: 25 findings (5 high, 12 medium, 8 low). Headline issues:
- **H1** SQLite is not a current OK dependency (D3/A1/§8/D18/D23 all built on a false premise).
- **H2** §13 Next Actions stale — lists already-resolved P0 questions as remaining.
- **H3** NFR mischaracterizes GBrain's 753ms as a "goal" (it's the measured production time).
- **H4** FR13 specifies `withSpanSync` for an inherently async spawn-and-wait operation.
- **H5** §1 says "nine target hosts" but lists ten.

The prior pass's MEDIUM findings (NG renumbering, FR17/§9 endpoint disagreement) and LOW findings (`/api/link-graph` and `/api/backlink-counts` unmentioned, Karpathy quote attribution) are folded into the new audit (M1, M3, M7, L8) — most are subsumed under M1 (the canonical "endpoint count" finding).
