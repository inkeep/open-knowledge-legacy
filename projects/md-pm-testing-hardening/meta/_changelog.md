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

## 2026-04-21 — Audit #1 (source + PR level, post-landing)

**Window:** `a27a3c49` (PROJECT.md merge, 2026-04-20 01:58 PT) → `fa8f5def` (origin/main tip). 9 non-merge commits, 18 PRs updated.

### Story progress — all 14 stories UNSTARTED

Verified on-disk state in the `md-pm-testing-hardening` worktree + on `origin/main`. No artifact exists for any story:

- **Now 7 (S4, S7-S9, S11-S13):** none started. No `packages/app/tests/fidelity/layers/` dir, no `packages/app/tests/fidelity/fixtures/*.yaml`, no `docs/pipeline-policies.md`. `corpus-commonmark.test.ts` still carries `SKIP_SECTIONS = ["Tabs", "Indented code blocks"]` (S9 unshipped).
- **Next 5 (S1, S3, S5, S6, S10):** none started. No `measure-mutation.sh`, no `audit-plugins.sh`, no `differential-harness.ts`.
- **Later 2 (S2, S14):** not expected yet.
- **Worktree state:** `.claude/worktrees/md-pm-testing-hardening` checked out on `main` at `a27a3c49`, clean working tree, 9 commits behind origin/main. No `project/md-pm-testing-hardening` branch pushed to remote.

### Decisions / Exploring / Assumed — no drift

- **D1-D11:** all still valid. No non-goal crossed. No LOCKED item (D5 CRLF, D10 tab, D11 mutation bar) weakened.
- **Q3 (wiki-link URL policy):** still exploring — `remark-wiki-link` source unread, no non-ASCII investigation.
- **Q4 (layer granularity):** still exploring — S11-S13 unstarted.
- **A1 (bun-runner 0.4.0 stability):** unverified — S1 not run.
- **A2 (differential harness runtime fits in-PR):** unmeasured — S5 not prototyped.
- **A3 (bun-runner 2-3× speedup):** unverified — not strategically blocking.

### External commits touching project scope

Two merged PRs touched files listed in PROJECT.md's "Key code references":

- **#228 `docs: promote architectural precedents to PRECEDENTS.md`** (Andrew, 2026-04-20 15:49 PT, `24d69b63`). Splits 23 precedents from AGENTS.md into a new repo-root `PRECEDENTS.md`. Scope-relevant diff hunks:
  - `packages/core/tests/health/README.md`: 1-line precedent-ref rename only (no contract change).
  - `packages/app/tests/fidelity/bridge-observer-conversion.test.ts`: 3-line NG11 ref correction (NG11 is an Irreducible gap, not a precedent; now points at AGENTS.md). S13 "verify PR #213 coverage" story may want to incorporate the corrected reference when it executes.
  - `packages/core/src/markdown/merged-walker.ts` + `.test.ts`: 1-line precedent-ref rename each.
  - **Implication for S7-S10 policy docs:** the project names `docs/pipeline-policies.md` as the target. PRECEDENTS.md exists at repo root as a parallel convention; story authors should decide whether policies live under `docs/` (S7-S10 as written) or alongside `PRECEDENTS.md` at repo root. **No PROJECT.md change proposed here — flag for the implementing agent.**

- **#107 `remove unused dependencies and exports`** (2026-04-20 07:39 PT, `029f7f7f`). Plugin-audit-surface delta for S6:
  - **Added to pipeline deps:** `mdast-util-to-hast@^13.2.1` (explicitly named CVE-bearing in PROJECT.md SCR's remark-html/mdast-util-to-hast/DOMPurify plugin list — S6 audit must include it), `@lezer/markdown`, `@codemirror/language`, `@codemirror/commands`.
  - **Removed from pipeline deps:** `mdast-util-mdx-expression`, `mdast-util-mdx-jsx`, `mdast-util-mdxjs-esm`, `ws`, `diff-match-patch` + `@types/diff-match-patch`, `@tiptap/starter-kit` (split into individual extensions).
  - **No change to `@handlewithcare/remark-prosemirror`, `remark`, `remark-parse`, `remark-mdx`, `micromark*`** (load-bearing pipeline primitives untouched).
  - **Implication for S6:** the audit script's dep enumeration should reflect current state, not PROJECT.md's snapshot. Approach stays the same (audit transitive deps against GHSA), but the specific package list in the evidence artifact updates accordingly.

### Scope-adjacent work (NOT part of this project; flagged for visibility)

An independent draft spec exists in a sibling worktree that overlaps with the pre-Rust deliverables this project subsumed:

- **Worktree:** `.claude/worktrees/docs-fidelity-attrs-contract` on branch `docs/fidelity-attrs-contract`.
- **Artifact:** `specs/2026-04-18-fidelity-attrs-contract/SPEC.md` (24KB, uncommitted as of audit) + `evidence/current-attr-inventory.md` (10.6KB).
- **Scope:** extract canonical doc at `packages/core/src/markdown/FIDELITY-ATTRS.md` covering ~11 `data.source*` fidelity attrs — writers, readers, shapes, invariants. Traces to `post-ship-docs-polish` FW-2 deferral (reopened after clipboard PR #171 expanded the attr-reader surface).
- **Relation to this project:** adjacent but distinct. FIDELITY-ATTRS.md documents the existing attr surface for contributor discoverability (CC4 precedent-setting spirit). This project's stories don't produce that doc — if the fidelity-attrs work ships separately, it lands one of the artifacts the f423af89 session originally scoped as "Gap E" before the project reformulated everything around stronger testing. **No action needed from this project; flag so the project audit doesn't claim the work as unshipped when it's moving on another branch.**

### Pre-mortems — none materialized

PM1-PM6 all still theoretical. No signal yet — consistent with stories being unstarted.

### Summary

**Shipped toward project outcomes:** 0 stories.
**Affected by external changes:** S6 (plugin-audit surface updated by #107), S13 (bridge-observer-conversion.test.ts NG11 refs corrected by #228).
**Docs-target ambiguity for S7-S10:** flagged (repo-root PRECEDENTS.md vs `docs/pipeline-policies.md`).
**Scope-adjacent parallel work:** `fidelity-attrs-contract` spec draft (different branch, different worktree).
**No PROJECT.md status changes proposed.** D/Q/A items unchanged. Story-claim updates are the implementing agent's responsibility when work begins.

**Next audit trigger:** next `workflow_dispatch` of measure scripts OR first story to land commits under `packages/app/tests/fidelity/layers/` / `packages/app/scripts/measure-mutation.sh` / `docs/pipeline-policies.md`.
