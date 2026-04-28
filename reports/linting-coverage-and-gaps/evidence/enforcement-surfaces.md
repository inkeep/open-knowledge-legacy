# Evidence: Enforcement Surfaces

**Dimension:** Where each lint runs (pre-commit, pre-push, CI Tier 1/2/3, ad-hoc), what's blocking vs advisory
**Date:** 2026-04-27
**Sources:** `.husky/`, `package.json`, `.github/workflows/`, `AGENTS.md`

---

## Key files referenced

- `.husky/pre-commit`, `.husky/pre-push`
- `package.json` (scripts: `lint`, `format`, `check`, `tier1`, `tier2`, `tier3`)
- `.github/workflows/ci.yml` (Tier 1)
- `.github/workflows/nightly.yml` (Tier 2)
- `.github/workflows/weekly.yml` (Tier 3)
- `.github/workflows/stale.yml`
- `.github/workflows/claude-code-review.yml`

---

## Findings

### Finding: Enforcement is layered across four surfaces — pre-commit, pre-push, CI Tier 1, on-demand Tier 2/3
**Confidence:** CONFIRMED
**Evidence:** `.husky/pre-commit`, `.husky/pre-push`, `package.json:25-29`, `ci.yml`, `nightly.yml`, `weekly.yml`

| Surface | Trigger | What runs | Blocking? |
|---|---|---|---|
| pre-commit (`.husky/pre-commit`) | every `git commit` | `check-agents-md-size.sh` + `lint-staged` (Biome on staged files) | yes (locally) |
| pre-push (`.husky/pre-push`) | every `git push` | `bun run format && bun run lint && bun run check` | yes (locally) |
| CI Tier 1 (`ci.yml`) | every PR + push to `main` | `lint` job (knip + biome + notices) + `test` matrix + `playwright` | yes (PR-blocking) |
| CI Tier 2 (`nightly.yml`) | `workflow_dispatch` only | perf regression, parse-health, R15 guard | advisory |
| CI Tier 3 (`weekly.yml`) | `workflow_dispatch` only | elevated-sample PBT, perf trend | advisory |
| Ad-hoc | manual `bun run measure:fuzz` / `measure:stress` | residual sampling | advisory |

**Implications:** The deterministic gates are pre-commit, pre-push, and CI Tier 1. Tier 2/3 are explicitly opt-in (the `schedule:` triggers were retired per `specs/2026-04-19-ci-signal-quality/`). No content-quality check runs on any of these surfaces.

### Finding: Pre-commit is light, pre-push is heavy, CI mirrors pre-push
**Confidence:** CONFIRMED
**Evidence:** `.husky/pre-commit:1-2`, `.husky/pre-push:1`, `package.json:25`

```text
# pre-commit
bash scripts/check-agents-md-size.sh
bun run lint-staged

# pre-push
bun run format && bun run lint && bun run check

# bun run check
"check": "bash scripts/check-knip-clean.sh && bash scripts/check-notices-clean.sh
       && bun run lint && turbo run typecheck test test:integration
                                test:conversion test:fidelity"
```

CI Tier 1 runs the same `lint` + `knip` + `notices` + the test matrix.

**Implications:** Pre-push is the canonical local equivalent of CI Tier 1; passing one effectively passes the other (modulo Playwright E2E, which `check:full:parallel` covers and `check` does not). The model is "shift-left" — anything CI catches, pre-push catches first.

### Finding: `--error-on-warnings` removes the advisory tier — every Biome warning is a hard fail
**Confidence:** CONFIRMED
**Evidence:** `package.json:23,40,43,46`

```text
"lint": "biome check ... --error-on-warnings"
"lint-staged": [
  "biome check --write ... --error-on-warnings"
]
```

**Implications:** Biome rules are binary — there is no "warn but allow" middle ground in this repo. Every rule is enforcement-grade. Adding a noisy Biome rule has the same blast radius as adding a CI test.

### Finding: The Claude PR review bot is the only AI-mediated review surface
**Confidence:** CONFIRMED
**Evidence:** `.github/workflows/claude-code-review.yml:1-25`

```text
on:
  pull_request:
    types: [opened, synchronize, ready_for_review]
  issue_comment:
    types: [created]
```

Triggered automatically on every non-draft PR by non-bot users; also triggered by `@claude --review` / `@claude --full-review` comments from owners/members/collaborators.

**Implications:** Catches issues a deterministic linter cannot (e.g., "this comment cites a spec number that the comment-discipline rule says to avoid") but is non-deterministic and produces opinion, not pass/fail. Cannot substitute for missing deterministic gates.

### Finding: `stale.yml` enforces staleness on PRs only — there is no doc-staleness equivalent
**Confidence:** CONFIRMED
**Evidence:** `.github/workflows/stale.yml:31-50`

```text
days-before-pr-stale: 7
days-before-pr-close: 7
stale-pr-label: "stale"
exempt-pr-labels: "pinned,security,work-in-progress"

days-before-issue-stale: -1   # disabled
days-before-issue-close: -1   # disabled
```

Runs daily at midnight UTC.

**Implications:** "Stale" automation in this repo means "stale PR" — there is no precedent for staleness on docs, specs, reports, or evidence files. A one-off "stale doc" workflow would be net-new infrastructure.

### Finding: The `tier1` / `tier2` / `tier3` package scripts mirror the workflow tiers
**Confidence:** CONFIRMED
**Evidence:** `package.json:27-29`

```text
"tier1": "bun run check",
"tier2": "bun run tier1 && turbo run test:perf:regression:unit test:health:unit
       test:health test:e2e",
"tier3": "STRESS_FIDELITY=1 bun run tier2"
```

**Implications:** Developers can reproduce any CI tier locally — the tier vocabulary is consistent between scripts and workflows. Adding a "content lint" tier would naturally fit this taxonomy but is currently absent.

---

## Negative searches

- `grep -E "(content-lint|wiki-lint|docs-lint|markdown-lint|frontmatter)" package.json turbo.json` → no results.
- `grep -E "schedule:" .github/workflows/*.yml` → only `stale.yml` has an active cron; nightly + weekly are dispatch-only.
- `grep -rE "\.github/workflows/.*content" /Users/timothycardona/inkeep/open-knowledge` → no results.

---

## Gaps / follow-ups

- The "ad-hoc" tier (`bun run measure:fuzz`, `bun run measure:stress`) is the existing pattern for *opt-in* signal. If a content-lint pipeline were added, mirroring this pattern (`bun run audit:wiki` / `bun run audit:dead-links`) would be the lowest-friction integration point.
- The `tier1`/`tier2`/`tier3` taxonomy has a natural Tier-2 slot for content audits (high-value, lower-frequency).
