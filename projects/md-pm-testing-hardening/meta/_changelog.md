# Changelog — md-pm-testing-hardening project

## 2026-04-19 — Session start

- Project scaffolded at `projects/md-pm-testing-hardening/PROJECT.md`
- Traces to research report at `~/reports/md-pm-testing-hardening-today/REPORT.md` (initial pass + followup + audit + #13 resolution all 2026-04-19)
- Bet stated verbally: "harden TS md⇄PM pipeline's test infrastructure before Rust bridge migration locks in whatever we ship"
- Worktree created on `project/md-pm-testing-hardening` off `origin/main@0ae6cc8d`
- Note: worldmodel (full depth) pass already executed earlier in session producing topology map of current fidelity test suite + arbitraries coverage + PR #213 artifacts; re-dispatch skipped to avoid redundant work per /projects fallback guidance. Grounding inputs: research report + in-session worldmodel.

## 2026-04-19 — Phase 1 complete

- SCR locked (iron-clad definition: 5 gates). See Strategic context.
- Bet-level non-goals locked: NEVER Rust impl work, NEVER mutation on non-pipeline code, NEVER scheduled/nightly CI tiers. NOT UNLESS evidence changes: coverage-guided fuzz. NOT UNLESS customer-facing failure: byte-identity CRLF.
- Multi-dimensional value articulated: customer × platform × internal intersection; GTM weakly connected.
- 11 items Decided (D1-D11), 2 Exploring (Q3 wiki-link, Q4 layer-granularity — both deferred to specific stories), 3 Assumed (A1-A3 with verification plans).
- 5 cross-cutting concerns mapped: CC1 test harness, CC2 measurement scripts, CC3 Rust-compat, CC4 precedent-setting, CC5 CI simplicity.
- 6 outcomes enumerated passing the quality gate: O1 oracle strength, O2 edge cases, O3 differential, O4 plugin security, O5 policies, O6 layer bisectability.

## 2026-04-19 — Phase 2 complete

- 14 stories decomposed from 6 outcomes (S1-S14).
- Each story has multi-multi-dimensional value + constraints + lateral/forward connections.
- Key architectural decisions captured within stories:
  - S7 BOM strip-on-input at pipeline boundary
  - S8 CRLF AST-equivalence as oracle, no preservation layer
  - S9 Tab fenced-output canonical, remove `SKIP_SECTIONS`
  - S10 Wiki-link URL-encoding policy deferred to investigation within the story
  - S11-S13 layer boundaries: md↔mdast, mdast↔PM, PM↔Y.XmlFragment with parser-agnostic interfaces for Rust compat
- Dependency graph drawn and validated (no Now→Later dependencies).

## 2026-04-19 — Phase 3 complete

- Phasing: Now 7 stories (S4 + S7-S9 + S11-S13), Next 5 (S1, S3, S5, S6, S10), Later 2 (S2, S14).
- Phasing heuristic: dependency-first + risk-first, with capacity-first as a constraint. Rationale recorded in PROJECT.md Phasing rationale section.
- Walking skeleton test passes: Now alone delivers layer-bisectability + policy docs + curated fixture data (substantial but not iron-clad).
- 6 rabbit holes identified (RH1-RH6).
- 6 pre-mortem scenarios identified (PM1-PM6) with mitigations.
- PROJECT.md complete: ~400 lines.
