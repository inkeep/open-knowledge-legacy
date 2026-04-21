# Changelog — 2026-04-20-cli-distribution-and-install-ux

## 2026-04-20 — spec scaffolded

- Intake: SCR + 5-probe stress-test completed. Scope confirmed by user: decision-codification spec covering D1-D14 (4 LOCKED + 4 NEVER + 3 NOT NOW + 1 NOT UNLESS + 2 Future Work Explored) + reconciliation against `specs/2026-04-08-cli-packaging/SPEC.md` §3.
- User selected same-PR placement (spec ships alongside `ok` bin + research report).
- Baseline commit stamped: `757d9fb3`.
- SPEC.md drafted with all 14 decisions pre-populated from the research report's §Application-to-Open-Knowledge section + the parent Electron spec's locked decisions.
- Open questions Q1 (CLAUDE.md pointer placement), Q2 (`2026-04-08-cli-packaging` other NG conflicts), Q3 (vendor naming in D14 telemetry design) deferred to iterate phase.
- Audit / challenge / assess-findings / finalize phases pending.

## 2026-04-20 — audit phase (13 pure corrections applied)

- Parallel /audit + /spec-design-challenge subprocesses ran on SPEC.md. Findings: audit 3H+3M+4L; challenger 2H+3M+2L.
- Applied /assess-findings protocol; 13 findings classified as Valid bug / Valid improvement (pure corrections) and auto-fixed inline:
  - **A-H1** NG8 subcommand count "~7" → "~13" (matches `packages/cli/src/cli.ts` reality).
  - **A-H2/M1/L2/L4** D13 + §15 Explored rationale "5 of 7 ship Cask" → "6 vendor-maintained of 7; Claude Desktop via community cask — a cask distribution path exists for 7/7." Flagged the internal inconsistency in `reports/electron-desktop-app-operations-2025/REPORT.md` §4 (table shows 7/7; summary says 5/7).
  - **A-H3** D3 + other references: replaced line-number anchors ("line 33", "line 34") with content-based ("the GUI/Electron bullet", "the auto-update bullet"). Stable across future edits of the old spec.
  - **A-M2** Confirmed old spec has exactly one occurrence of each reconciled phrase — no additional breadcrumbs required.
  - **A-M3** NG5 cites research report §D7 in addition to the `cli-command-name-ok-okb` report.
  - **A-L1** Added "Downstream specs" section to REPORT.md pointing at this spec — closes bidirectional link.
  - **A-L3** D3 Decision cell explicitly notes Docker distribution clause stays NEVER (not reversed).
  - **C-H1** §9 Alternatives Considered: expanded Option A rejection with three concrete reasons (citation-anchor fragmentation, D14 size, decision-provenance fragmentation). Records that the challenger flagged the thin rejection reasoning.
  - **C-M3** Added Bun `build --compile` CLI as a Noted item tied to oven-sh/bun#29120 resolution.
  - **C-M5** Tightened D10 and D11 triggers to observable signals. Discovered D11's original trigger ("count crosses ~10") had already fired (current count = 13) — reframed to flag-surface complexity heuristic.
  - **C-L6** NG5 wording: "Revisit `ok` alias choice" → "Re-litigate the alias naming choice" with clarification that implementation mechanics (`ok config alias`) are not foreclosed.
  - **C-L7** Promoted `.dxt`/MCPB and Windows+Linux desktop from Noted to Identified with "What investigation is needed" fields.
- On re-evaluation, both remaining "escalate" candidates resolved inline without user-input gates:
  - **C-H2** Homebrew Cask SHA256-bump workflow — added Option A (manual), Option B (GitHub Action automation), Option C (private tap) to D13's §15 Explored sketch with selection criteria. Decision deferred to activation-time implementer (not a spec-time judgment call — the release-CI shape hasn't been designed).
  - **C-M4** D14 vendor compatibility matrix — added 5-vendor research matrix (PostHog, Amplitude, Segment, self-hosted, Sentry-for-crashes) to the implementation sketch as research input, NOT pre-selection. Activation-time implementer uses it as research; per Q3 resolution, no vendor is pre-picked. This is additive information, not a new decision — self-apply under the /assess-findings protocol.
- No remaining user-input findings. All pre-existing LOCKED decisions survived challenge.

## 2026-04-20 — verify + finalize

- **Mechanical adversarial checks passed:** 0 ASSUMED / 0 INVESTIGATING decisions; all 1-way-door decisions (D5, D6, D8) are LOCKED with HIGH-confidence evidence; non-goal temporal tags (NEVER / NOT NOW / NOT UNLESS) verified per the decision protocol.
- **Resolution completeness gate passed** for the In Scope items:
  - All decisions made (D1-D14 have resolution status; 8 LOCKED + 6 DIRECTED).
  - No 3P dependency selections pending (D14 explicitly leaves vendor to activation-time implementer with a research matrix).
  - Architectural viability validated — spec is docs-only; no runtime code to validate.
  - Integration feasibility confirmed: corrigendum breadcrumbs landed in `specs/2026-04-08-cli-packaging/SPEC.md` §3; AGENTS.md pointer landed; REPORT.md Downstream Specs link landed.
  - Acceptance criteria (§6 Must rows) verifiable: every claim has an evidence pointer; reconciliation breadcrumbs render correctly in Markdown.
  - No dependency on Future Work items for the In Scope set.
- **Status promoted:** Draft → In Review.
- **Baseline commit held at `757d9fb3`** — no code changes to the CLI since baseline; the companion PR's `packages/cli/package.json` + `README.md` edits happened before the spec was created and are already reflected in the worktree state. Baseline not overwritten because the spec's In Scope is docs-only and the referenced codebase state is unchanged.
- **Implementation applied within this worktree:**
  - `specs/2026-04-08-cli-packaging/SPEC.md` §3: two corrigendum breadcrumbs (GUI/Electron reversal, auto-update scope-split).
  - `AGENTS.md`: pointer at end of `### CLI Commands` subsection (CLAUDE.md symlinks to AGENTS.md — no separate edit).
  - `reports/mastra-speakeasy-cli-install-recommendations/REPORT.md`: "Downstream specs" section added.
- **Remaining action (user):** commit + land in PR. Spec artifact is complete; content stable.
- Confirmed held under challenge (no change): D3 reconciliation framing, D5 postinstall-CLI rejection, D14 posture constraints, NG1-NG4 anti-pattern closure.

## 2026-04-20 — iterate phase (Q1-Q3 resolved)

- **Q1 resolved:** Pointer placement = end of `### CLI Commands` subsection in AGENTS.md (CLAUDE.md symlinks to it). Contributors touching CLI code pass through this section naturally.
- **Q2 resolved:** Audit of `specs/2026-04-08-cli-packaging/SPEC.md` §3 found TWO rows needing reconciliation, not one. Line 33 "NEVER: GUI/Electron" reversed by parent Electron spec; line 34 "NOT NOW: auto-update" needs scope-split (CLI stays NOT NOW per D10; desktop has auto-update LOCKED per parent spec). D3 extended to cover both. A2 promoted HIGH → Verified.
- **Q3 resolved:** D14 does NOT pre-select a telemetry vendor. Spec locks posture (opt-in, DO_NOT_TRACK, env+subcommand+docs-page, crash/usage split) but leaves PostHog/Amplitude/Segment/vendor-hosted choice to the activation-time implementer. D9 evidence shows no vendor is ecosystem-dominant.
- §16 Agent constraints updated: two corrigendum lines on old spec (not one); AGENTS.md pointer (not CLAUDE.md directly, since CLAUDE.md is a symlink).
- §6 Functional Requirements updated: row for reconciliation now says "two one-line edits" (not one).

## Scope decisions ledger (this session)

- **Confirmed:** 4 LOCKED + 4 NEVER + 3 NOT NOW + 1 NOT UNLESS + 2 Future Work Explored; telemetry implementation design included as Future Work D14 (user declined narrower alternative that would have deferred D14 to a later spec).
- **Confirmed:** Same-PR placement (spec + `ok` bin + research report).
- **Deferred to iterate:** Q1-Q3 open questions (mechanical/judgment; not blockers).
