# D-Q5 Amendment — `failOnFlakyTests` reverted to global `false`

**Date:** 2026-04-19
**Amends:** `specs/2026-04-17-e2e-observability-determinism/SPEC.md` §D-Q5 LOCKED (2026-04-17)
**Driven by:** `specs/2026-04-19-ci-signal-quality/SPEC.md` FR-4 / D-Q3 LOCKED Option A
**Effective commit (after implementation):** on `spec/ci-signal-quality` / subsequent merge
**Canonical fix location:** `packages/app/playwright.config.ts`

---

## What this document is

A post-lock amendment to a shipped decision. Prior LOCKED decisions are moment-in-time artifacts; per the AGENTS.md post-ship corrigendum protocol, the original prose in `specs/2026-04-17-e2e-observability-determinism/SPEC.md` is NOT rewritten — it carries a breadcrumb pointing here on every occurrence of the `failOnFlakyTests: !!process.env.CI` claim (D-Q5, D-Q7, D-Q28, D-Q41, R4, §G2, §US-8, §US-27, §US-29, "Post-merge monitoring", open questions §5/§28, STOP assessment). This file carries the full rationale.

---

## Prior locked decision (verbatim from §D-Q5, 2026-04-17)

> | D-Q5 | Retries + failOnFlakyTests | `retries: process.env.CI ? 2 : 0`; `failOnFlakyTests: !!process.env.CI` | LOCKED | Playwright v1.52+ supports `failOnFlakyTests`. Community survey (`reports/playwright-e2e-observability-determinism-best-practices/evidence/oss-config-survey.md`) found zero surveyed projects use it — **this is pioneering, not following**. Adopted because OK's greenfield-discipline prefers loud flakes over silent retry-success. `retries: 2` absorbs transient infra noise; `failOnFlakyTests: true` makes retry-success still fail. Combined = tolerant runner, strict verdict. Rollout risk tracked in R4; AC-12 adds runtime-budget validation since D-Q7 worker sizing + retries=2 increase CI wall-clock. |

Retained at amendment time:
- `retries: process.env.CI ? 2 : 0` — unchanged, preserves the tolerant-runner half of the D-Q5 equation.
- `forbidOnly: !!process.env.CI`, `workers: process.env.CI ? 4 : undefined` — unchanged.
- HTML/list/github reporters + artifact uploads — unchanged.

Revised:
- `failOnFlakyTests: !!process.env.CI`  →  `failOnFlakyTests: false` (globally).

---

## Why the prior decision was revisited

### Operational evidence from 2026-04-17 → 2026-04-19

PR-tier CI green rate on correct code measured at **~22%** against **~29%** on main (last 50 runs, measured 2026-04-19 per `specs/2026-04-19-ci-signal-quality/SPEC.md` §3). The green-rate gap is driven by a compounding of three independent noise sources, each individually-accepted at the time of its locking decision:

1. **Bridge-convergence fuzz residual** — ~2-3% per-seed architectural race rate × 75 PR-tier seeds ⇒ ~80% PR-red probability under the dual-CRDT topology (Khanna-Kunal-Pierce 2007 impossibility; D4-LOCKED in `specs/2026-04-16-bridge-correctness/`).
2. **Server-authoritative stress flake** — ~11% CI flake rate per PR #206's diagnostic JSON.
3. **Playwright retry-success promoted to red** by `failOnFlakyTests: true`, where the retry was absorbing genuine infrastructure noise:
   - WebSocket `EPIPE` / `ECONNRESET` under CI runner contention (Package A, deferred investigation).
   - CC1 broadcast cadence jitter across workers (documented in `packages/app/package.json` comment: "Changes that pass `bunx playwright test` locally can fail `test:e2e` in CI due to different parallelism profiles and CC1 broadcast cadence").
   - Transient 120s-timeout-then-retry-passes pattern logged in PR review sessions.

Sources (1) and (2) are addressed in the CI signal quality spec (`specs/2026-04-19-ci-signal-quality/`) by removing fuzz and stress from CI entirely (FR-2, FR-3 — D-Q1/D-Q2 LOCKED Option A). Source (3) — retry-success being promoted to red — is the subject of this amendment.

### The `component-blocks-v2` agent observation

An AI coding agent working on an unrelated feature branch surfaced empirical evidence that retry-success in the Playwright job on its branch was **not** caused by the PR's changes — they were pre-existing infrastructure noise reproduced cleanly on a file-swap experiment (swap the branch's files onto main, observe the same retry-pass pattern). This materialized R4's risk — "failOnFlakyTests: true surfaces existing quiet retry-successes" — but in the inverse direction the original D-Q5 anticipated: instead of surfacing flakes that become implementation tasks, it promoted infra-noise to PR-red on every PR, blocking merge without providing actionable signal.

### Why the original pioneering-posture argument no longer holds

The 2026-04-17 locking explicitly noted: *"Community survey found zero surveyed projects use it — this is pioneering, not following... Adopted because OK's greenfield-discipline prefers loud flakes over silent retry-success."*

The pioneering posture depends on flakes being real bugs (actionable) rather than infra noise (unactionable-at-PR-time). Under the observed 22% PR-tier green rate, the ratio inverted: the dominant flake class was unactionable infrastructure, with real-flake signal drowned in the noise. A pioneering posture survives high signal-to-noise; it does not survive noise drowning the signal.

---

## New locked decision

**`failOnFlakyTests: false`** — globally, both local and CI.

```ts
// packages/app/playwright.config.ts
retries: isCI ? 2 : 0,
failOnFlakyTests: false,  // was: failOnFlakyTests: isCI (prior D-Q5 LOCKED, 2026-04-17)
```

The single-line config change is atomically committed with the corrigendum breadcrumbs and this amendment. No rollout phasing — the prior locked value was already in production and produced the 22% green rate, so reverting is strictly an improvement.

---

## Compensating control — persistent-flake detection moves to nightly

The original D-Q5 served two purposes:
1. **PR-time flake signal** — catch flaky tests at merge before they trend into chronic flakiness.
2. **Trend observability** — provide a data point for flake rate over time.

Purpose (2) is preserved by the nightly workflow shipped in the same spec's US-29 (`specs/2026-04-17-e2e-observability-determinism/` §US-29):

- **Workflow:** `.github/workflows/nightly-e2e-stability.yml`
- **Cadence:** 09:00 UTC daily (off-minute from `nightly.yml`'s 06:17 UTC to avoid GHA contention).
- **Scope:** full Playwright suite with `--repeat-each=3 --workers=1`.
- **Signal:** auto-opens a GitHub issue labeled `e2e-flake` with the run URL and artifact pointers on failure.

The nightly workflow catches slow-burn drift (a test passing 99/100 accumulates a 1% tail only visible under `--repeat-each`) that PR-time enforcement cannot catch anyway. Under the prior D-Q5 locking, nightly was additive coverage; under this amendment, nightly **is** the flake-detection tier.

Purpose (1) — PR-time flake signal — is intentionally dropped. The 22% green rate evidence established that PR-time enforcement in a greenfield project with multi-source noise does not surface actionable signal; the retry absorbs infrastructure noise AND the nightly catches persistent flakes, so the PR tier does not need a third layer.

---

## What this does NOT change

Explicit non-change list, to prevent future drift:

- `retries: isCI ? 2 : 0` — unchanged. Tolerant-runner half of D-Q5 is preserved. Retries still happen in CI; retries still do not happen locally.
- Nightly E2E stability workflow — unchanged (`nightly-e2e-stability.yml` per D-Q41 / US-29).
- `forbidOnly: !!process.env.CI` — unchanged.
- `workers: isCI ? 4 : undefined` — unchanged (D-Q7 LOCKED at `ubuntu-64gb` calibration).
- Reporter stack (`html`, `list`, `github` in CI) — unchanged.
- Artifact upload (`playwright-report/` + `test-results/`) — unchanged.
- Trace/video/screenshot on failure — unchanged.

---

## Cross-references

- `specs/2026-04-19-ci-signal-quality/SPEC.md` — parent spec for this amendment. FR-4 (failOnFlakyTests globally false) and D-Q3 (LOCKED Option A). NG6 accepts the no-automated-regression-detection cost for the architectural residual that motivated bundling this change with FR-2/FR-3.
- `packages/app/playwright.config.ts` — the canonical fix location; comment above `failOnFlakyTests: false` points here for future readers.
- `.github/workflows/nightly-e2e-stability.yml` — compensating control.
- `AGENTS.md` precedent #20 (E2E test infrastructure conventions) — unaffected by this amendment; the seven sub-rules (condition-based waits, DEV-gated hooks, `data-state`, `_helpers/` barrel, artifact upload, `installClockAfterSync` opt-in, per-pattern STOP rule) remain in force.
- PR #206 — stress diagnostic JSON evidence for the 11% rate.

---

## What would reopen this decision

Any of the following would warrant revisiting:

1. **Nightly-e2e-stability.yml fails to surface a class of flakes** that accumulate in production (auto-issue rate ≠ real flake rate over a 30-day observation window). If the nightly proves inadequate as the sole flake detector, PR-tier needs a replacement signal — either a revised `failOnFlakyTests: true` with calibrated signature allowlists, or a separate tier-2 PR job on a subset of high-coverage tests.
2. **CI green rate fails to reach the G1 goal** (≥95%) after the full CI signal quality spec lands. If green rate stays <50% post-merge, the flake classes the prior D-Q5 targeted are still dominant and this amendment was premature.
3. **A new flake class emerges** that reaches production because it was absorbed silently by `retries: 2` and missed by nightly `--repeat-each=3`. At that point, re-evaluate whether failOnFlakyTests should enforce against the specific signature.
4. **Playwright ships a more precise signal** (e.g., test-level opt-in to fail-on-flaky, or structured retry-cause metadata) that addresses the infra-vs-test distinction at the library level.

None of the above are obligations on this spec — they are future conditions under which this decision would be reviewed.

---

## Record of amendment

| Field | Value |
|-------|-------|
| Original decision | §D-Q5 LOCKED in `specs/2026-04-17-e2e-observability-determinism/SPEC.md` (2026-04-17) |
| Amendment date | 2026-04-19 |
| Driven by | `specs/2026-04-19-ci-signal-quality/` (FR-4, D-Q3) |
| Canonical fix | `packages/app/playwright.config.ts` (`failOnFlakyTests: false`) |
| Corrigendum breadcrumbs applied | All occurrences of D-Q5 / `failOnFlakyTests` in the original SPEC.md (see §D-Q5, D-Q7, D-Q28, D-Q41, R4, §G2, §US-8, §US-27, §US-29, "Post-merge monitoring", Open questions §5/§28, STOP assessment) |
| Status | LOCKED |
