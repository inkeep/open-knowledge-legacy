---
title: "CI Test Pipeline Patterns in TypeScript OSS Monorepos"
description: "How 26 top TypeScript-first OSS companies structure CI test pipelines — change detection, conditional execution, test tier organization, E2E strategy, caching, and nightly runs. Evidence from n8n, Supabase, Strapi, AFFiNE, Cal.com, PostHog, tldraw, and 19 others."
createdAt: 2026-04-11
updatedAt: 2026-04-11
subjects:
  - n8n
  - Supabase
  - Strapi
  - AFFiNE
  - Cal.com
  - PostHog
  - tldraw
  - Twenty
  - Directus
  - Medusa
  - Nango
  - Liveblocks
  - Formbricks
topics:
  - CI pipeline patterns
  - conditional test execution
  - monorepo test sharding
  - GitHub Actions
---

# CI Test Pipeline Patterns in TypeScript OSS Monorepos

**Purpose:** Factual survey of how 26 TypeScript-first OSS companies (183K–5K stars) structure their CI test pipelines — specifically, how they decide WHEN to run expensive test tiers vs always running them.

---

## Executive Summary

Across 26 repos, the dominant pattern is **"run everything on every PR"** — most repos do NOT conditionally skip test tiers based on changed paths. Change detection, where used, primarily gates entire workflow runs (docs-only skip) rather than individual test tiers within a workflow.

**Key Findings:**

- **15 of 26 repos (58%) run all tests on every PR** with no change-based filtering
- **`dorny/paths-filter` is the dominant change detection action** (6 repos), followed by `tj-actions/changed-files` (3 repos), native `paths:` triggers (4 repos), and custom scripts (3 repos)
- **E2E tests run on every PR at 16 of 19 repos that have them** — only 3 repos gate E2E behind labels
- **Merge queues are rare** — only 7 of 26 repos use `merge_group` triggers
- **Nightly/scheduled test runs are extremely rare** — only 2 of 26 repos run tests on a cron schedule; the rest use cron only for operational tasks (stale issues, releases)
- **Turbo is the dominant monorepo orchestrator** (11 repos), followed by Nx (2), pnpm workspaces alone (6), and no orchestrator (5)

---

## Research Rubric

| # | Dimension | Priority | Depth |
|---|---|---|---|
| D1 | Change detection mechanisms | P0 | Deep |
| D2 | Test tier organization | P0 | Deep |
| D3 | Conditional execution logic | P0 | Deep |
| D4 | E2E/browser test strategy | P0 | Deep |
| D5 | Monorepo orchestrator interaction with CI | P0 | Moderate |
| D6 | Gate/merge-queue patterns | P1 | Moderate |
| D7 | Cache strategy | P1 | Moderate |
| D8 | Nightly/scheduled runs | P1 | Moderate |

**Stance:** Factual — report what exists, no recommendations.

---

## Detailed Findings

### D1: Change Detection Mechanisms

**Finding:** The majority of repos (15/26 = 58%) run all tests on every PR with zero change-based filtering. Among those that filter, `dorny/paths-filter` is the most popular action.

| Mechanism | Repos | Examples |
|---|---|---|
| **No filtering** (run everything) | 15 | Firecrawl, Hoppscotch, NocoDB, Documenso, Formbricks, OpenCode, Papermark, OpenHands (partial), Medusa, Infisical (uses paths: triggers but not for test selection), Dub, AFFiNE (minimal) |
| **`dorny/paths-filter`** | 6 | Supabase, Strapi, Cal.com, Appsmith, PostHog, Nango, Liveblocks |
| **`tj-actions/changed-files`** | 3 | Twenty, Directus, Mastra (partial) |
| **Native `paths:` triggers** | 4 | Firecrawl (SDK tests), Infisical, Lago, Dub, tldraw (Playwright) |
| **Custom composite action / script** | 3 | n8n (`ci-filter` composite), Activepieces (git diff), Mastra (git diff) |
| **Nx/Turbo affected** | 2 | Twenty (Nx), PostHog (Turbo `--affected --dry-run`) |

**Patterns observed:**

- **`dorny/paths-filter` pattern:** Used in a dedicated `changes` or `should-run` job at the top of the workflow. Downstream jobs gate on `needs.changes.outputs.<filter> == 'true'`. Strapi has the most sophisticated setup with 7 category filters defined in an external `.github/filters.yaml`.

- **`paths:` trigger pattern:** The simplest approach — scoped at the workflow level, not the job level. Used by smaller repos (Infisical, Lago, Dub) where the monorepo has 2-3 clear packages. Limitation: can't conditionally skip individual jobs within a workflow.

- **Custom script pattern:** n8n uses a custom composite action (`ci-filter`) that does path-based categorization. Activepieces uses raw `git diff` to extract changed piece package names for targeted builds.

- **Turbo/Nx affected:** PostHog uses `turbo build --affected --dry-run` to discover what needs building. Twenty uses Nx's built-in affected detection. Both are monorepo-native approaches that avoid maintaining path lists.

**Evidence:** [evidence/change-detection.md](evidence/change-detection.md)

**Remaining uncertainty:** Several repos may have more sophisticated filtering in reusable workflows or composite actions that weren't visible from the top-level workflow files.

---

### D2: Test Tier Organization

**Finding:** Most repos organize tests into 3-5 tiers, typically split across separate workflow files. The universal split is "fast checks" (lint, typecheck) vs "slow tests" (unit, integration, E2E).

| Tier count | Repos | Examples |
|---|---|---|
| 0 (no tests) | 2 | OpenCode, Papermark |
| 1-2 tiers | 5 | Hoppscotch, Documenso, Dub, Lago, Infisical |
| 3-4 tiers | 10 | Firecrawl, NocoDB, tldraw, Directus, Medusa, Activepieces, Formbricks, Nango, Mastra, Liveblocks |
| 5+ tiers | 9 | n8n, Supabase, Strapi, AFFiNE, Twenty, Cal.com, Appsmith, PostHog, OpenHands |

**Common tier taxonomy:**
1. **Lint + format** (universal): Biome, ESLint, oxlint, Prettier, Stylelint
2. **Typecheck** (universal): tsc --noEmit or Turbo-orchestrated
3. **Unit tests** (22/26 repos): Jest, Vitest, bun test, pytest
4. **Integration tests** (15/26): Database-backed tests, API tests, server-side tests
5. **E2E / browser tests** (19/26): Playwright (dominant), Cypress (declining), custom
6. **Visual regression** (4/26): Chromatic/Storybook screenshots (n8n, Twenty, AFFiNE, Appsmith)
7. **Performance / load tests** (3/26): k6 (Cal.com), custom benchmarks (n8n, Activepieces)

**Workflow file organization:**
- **Single-file pattern** (7 repos): All tiers in one `ci.yml`. Simpler repos (Hoppscotch, Documenso, Dub).
- **Per-tier files** (12 repos): `ci-frontend.yml`, `ci-backend.yml`, `e2e.yml`. Larger repos (n8n, Twenty, Cal.com, PostHog).
- **Reusable workflow pattern** (7 repos): `workflow_call` reusable workflows called by an orchestrator. Cal.com, Formbricks, Activepieces, n8n.

**Evidence:** [evidence/test-tier-organization.md](evidence/test-tier-organization.md)

---

### D3: Conditional Execution Logic

**Finding:** The dominant pattern is "always run" — most repos run all their test tiers on every PR. Where conditional execution exists, it's typically one of three patterns: docs-only skip, label-gated E2E, or path-scoped workflows.

| Pattern | Repos | How it works |
|---|---|---|
| **Always run everything** | 15 | No conditions. Every PR runs every tier. |
| **Docs-only skip** | 5 | Nango, Liveblocks, Cal.com: skip tests on PRs that only touch docs/examples. PostHog: skip frontend on docs-only. |
| **Label-gated E2E** | 3 | Cal.com (`ready-for-e2e`), Activepieces (`ready-for-e2e`), OpenHands (`end-to-end`). Expensive E2E requires explicit label from a maintainer. |
| **Path-scoped workflows** | 6 | Supabase, Strapi, Infisical: entire workflows trigger only when their package paths change. Each package has its own workflow file. |
| **Changeset-only skip** | 1 | n8n: custom composite detects changeset-only PRs and skips all expensive jobs. |

**Label-gated E2E is the standout pattern for expensive tests.** Cal.com and Activepieces both require a maintainer to add a `ready-for-e2e` label before Playwright runs. This is human-in-the-loop filtering — not automated path detection. The rationale: E2E is expensive (8-30 minutes), and most PRs don't need it until they're close to merge.

**Merge-queue-only execution** is another pattern: n8n runs E2E only in the merge queue (not on regular PRs). Twenty runs full E2E only on `merge_group` events. This gates expensive tests on "about to merge" rather than "just opened a PR."

**Evidence:** [evidence/conditional-execution.md](evidence/conditional-execution.md)

---

### D4: E2E / Browser Test Strategy

**Finding:** Playwright is the dominant E2E framework (15 of 19 repos with E2E). Cypress is declining (only Appsmith still uses it alongside Playwright). Most repos run E2E on every PR without sharding.

| E2E tool | Repos |
|---|---|
| **Playwright** | 15 (n8n, Supabase, AFFiNE, tldraw, Twenty, Cal.com, Appsmith, PostHog, Documenso, Dub, Formbricks, Activepieces, Liveblocks, OpenHands, Mastra-docs) |
| **Cypress** | 1 (Appsmith — alongside Playwright) |
| **Custom / npm test** | 3 (Directus blackbox, Infisical npm E2E, Medusa CLI smoke) |
| **None** | 7 (Hoppscotch, NocoDB, OpenCode, Lago, Papermark, Nango, Firecrawl-app) |

**Sharding:**

| Sharding approach | Repos |
|---|---|
| **No sharding** | 10 (Supabase 2-shard is minimal; Documenso, Dub, Formbricks, Liveblocks, OpenHands, Activepieces, Infisical, Mastra run single-job) |
| **2-8 shards** | 4 (Supabase: 2, Cal.com: 8, AFFiNE: 5, tldraw: implicit via multiple files) |
| **8+ shards** | 2 (n8n: 8 custom-distributed, Twenty: 12 via 3×4 Storybook matrix) |
| **Database vendor matrix** | 1 (Directus: 6 DBs × 2 Redis = 12 combinations — not traditional sharding but similar parallelism) |

**Browser caching:** 8 repos explicitly cache Playwright browsers via `actions/cache` keyed on playwright version or lockfile hash. Others rely on fresh installs per run.

**E2E gating summary:**

| Gating | Repos |
|---|---|
| Every PR (always) | 13 |
| Label-gated | 3 (Cal.com, Activepieces, OpenHands) |
| Merge queue only | 2 (n8n, Twenty) |
| Deployment-triggered | 1 (Dub — runs on `deployment_status`) |

**Evidence:** [evidence/e2e-strategy.md](evidence/e2e-strategy.md)

---

### D5: Monorepo Orchestrator Interaction with CI

**Finding:** Turborepo is the dominant orchestrator (11 repos), but CI invocation patterns vary significantly.

| Orchestrator | Repos |
|---|---|
| **Turborepo** | 11 (n8n, Cal.com, Medusa, Documenso, Formbricks, Activepieces, Mastra, PostHog-partial, AFFiNE-minimal, tldraw-LazyRepo, Liveblocks) |
| **Nx** | 2 (Twenty, Strapi) |
| **pnpm/npm/yarn workspaces alone** | 6 (Supabase, Directus, Hoppscotch, Nango, Dub, Infisical) |
| **Custom / none** | 5 (Appsmith, OpenHands, NocoDB, Lago, OpenCode) |

**CI invocation patterns:**
- **`turbo run <task>`** — most common (8 repos). CI runs turbo directly, relying on turbo's task graph and caching.
- **`turbo run --affected`** — PostHog uses this for build-level affected detection.
- **Package-level scripts directly** — Supabase, Directus, Infisical run `pnpm --filter <pkg> test` instead of going through turbo/nx.
- **Nx affected** — Twenty uses `npx nx <task> <project>` for targeted task execution.

**Turbo remote cache adoption:** 4 of 11 Turbo repos use remote caching (Medusa, Formbricks, Mastra, Activepieces with S3). The rest use local-only turbo cache in CI (which provides minimal benefit since each runner starts fresh).

**Evidence:** [evidence/orchestrator-ci.md](evidence/orchestrator-ci.md)

---

### D6: Gate / Merge-Queue Patterns

**Finding:** Merge queues are used by 7 of 26 repos (27%). Gate jobs that satisfy branch protection when expensive tests skip are used by ~10 repos.

| Pattern | Repos |
|---|---|
| **Merge queue (`merge_group` trigger)** | 7 (n8n, AFFiNE, tldraw, Twenty, Cal.com, PostHog, Formbricks, Nango) |
| **Gate/aggregator job** | ~10 (n8n `required-checks`, Cal.com `all-checks`, Twenty `ci-*-status-check`, Strapi `test_result`, Formbricks `required`, PostHog per-workflow) |
| **No merge queue, no gate job** | ~12 |

**Gate job pattern:** A lightweight job that `needs: [all-other-jobs]` and uses `if: always()` to run regardless of upstream skips. Reports success only if all dependencies succeeded. This is the branch protection required check — it passes when expensive tests skip (because the gate job still runs) while failing when any test actually fails.

n8n's `required-checks` gate is the most sophisticated: it runs `if: always()`, checks all needed job results, and is the single required check for branch protection.

Cal.com's `all-checks` in `ci-merge-queue.yaml` aggregates 13 separate check results.

**Evidence:** [evidence/gate-merge-queue.md](evidence/gate-merge-queue.md)

---

### D7: Cache Strategy

**Finding:** Caching is universal but approaches vary by what's cached and how keys are structured.

| Cache target | Prevalence | Key pattern |
|---|---|---|
| **Package manager deps** | 24/26 | `actions/setup-node` with `cache: 'pnpm'` or explicit `actions/cache` on lockfile hash |
| **Turbo local cache** | ~5 | `actions/cache` on `.turbo/` keyed by `runner.os + task + sha` |
| **Turbo remote cache** | 4 | `TURBO_TOKEN` + `TURBO_TEAM` secrets (Vercel hosted or S3 self-hosted) |
| **Playwright browsers** | 8 | `actions/cache` on `~/.cache/ms-playwright` keyed by playwright version or lockfile |
| **Build artifacts** | ~8 | Uploaded via `actions/upload-artifact` and downloaded in dependent jobs |
| **Docker layers** | ~5 | `/tmp/.buildx-cache` or registry-based caching |

**Notable patterns:**
- **tldraw** uses LazyRepo with its own `.lazy` cache directory structure
- **PostHog** has the most granular caching: separate caches for pnpm, uv (Python), Rust, pip, and .typegen
- **n8n** caches Playwright browser by a dedicated `.playwright-version` file (not lockfile)

**Evidence:** [evidence/cache-strategy.md](evidence/cache-strategy.md)

---

### D8: Nightly / Scheduled Runs

**Finding:** Scheduled test runs are extremely rare. Only 2 of 26 repos run tests on a cron schedule. Most cron workflows are operational (stale issues, releases, sync jobs).

| Scheduled testing | Repos |
|---|---|
| **Cron test runs** | 2 (n8n: benchmarks at 1:30/2:30/3:30 AM UTC daily + workflow tests at 2 AM; tldraw: staging E2E is dispatch-only, not cron) |
| **Cron operational jobs only** | ~10 (Cal.com: 11 cron jobs for reminders/digest/sync; PostHog: AI costs, bot IPs; Mastra: alpha publish, Discord sync; NocoDB: stale issues) |
| **No cron workflows** | ~14 |

**The overwhelming pattern is: no nightly test runs.** Repos rely on their PR-gate CI to catch regressions. Even n8n's "nightly" benchmarks are performance benchmarks, not functional test suites.

**Evidence:** [evidence/nightly-scheduled.md](evidence/nightly-scheduled.md)

---

## Synthesis: Convergent and Divergent Patterns

### Convergent (most repos agree)

1. **Run all tests on every PR** (58%). The default is simplicity — no change detection, no conditional logic. This works for repos where the full test suite is under 5-10 minutes.

2. **Playwright is the E2E standard** (79% of repos with E2E). Cypress is in sunset. Custom test frameworks (Directus blackbox, Infisical BDD) exist for specific use cases.

3. **E2E runs on every PR** (68% of repos with E2E). Most repos don't gate E2E — they accept the cost.

4. **No nightly test runs** (92%). The industry has converged on "if it passes PR CI, it's fine." Nightly runs are considered overhead without proportional value.

5. **Separate workflow files per tier** at scale. Repos above ~5 tiers use per-tier or per-package workflow files.

### Divergent (repos disagree)

1. **Change detection: dorny/paths-filter vs tj-actions/changed-files vs paths: triggers vs none.** No single standard. The choice correlates with repo complexity more than community consensus.

2. **E2E gating: always vs label vs merge-queue.** Three distinct strategies exist with no convergence. Label-gating is the most cost-effective for repos with expensive E2E (>5 minutes).

3. **Merge queues: adopted vs not.** Only 27% use merge queues. Adoption correlates with team size and PR volume, not repo complexity.

4. **Turbo remote cache: on vs off.** Only 4 of 11 Turbo repos use remote caching in CI. Most treat each CI runner as a cold start.

---

## Limitations & Open Questions

### Dimensions Not Fully Covered
- **Private/internal workflows**: Some repos (NocoDB, Appsmith) dispatch to private repositories for E2E. Those workflows aren't visible.
- **Cost data**: Runner minutes per PR are not publicly available. The analysis infers cost from job count × timeout.
- **Flake rates**: No repo publishes test reliability data. The presence of retry logic (PostHog: 3x per test) suggests flakes are managed but not eliminated.

### Out of Scope (per Rubric)
- Deployment pipelines and release automation
- Docker/container build CI
- Non-test CI steps (security scanning, license checks)

---

## References

### Evidence Files
- [evidence/change-detection.md](evidence/change-detection.md) — per-repo change detection mechanisms
- [evidence/test-tier-organization.md](evidence/test-tier-organization.md) — tier counts and workflow structure
- [evidence/conditional-execution.md](evidence/conditional-execution.md) — gating logic
- [evidence/e2e-strategy.md](evidence/e2e-strategy.md) — Playwright/Cypress, sharding, caching
- [evidence/orchestrator-ci.md](evidence/orchestrator-ci.md) — Turbo/Nx/pnpm in CI
- [evidence/gate-merge-queue.md](evidence/gate-merge-queue.md) — merge queue and gate job patterns
- [evidence/cache-strategy.md](evidence/cache-strategy.md) — what's cached and key structure
- [evidence/nightly-scheduled.md](evidence/nightly-scheduled.md) — cron workflow inventory

### External Sources
- GitHub Actions workflow files from all 26 repositories (accessed 2026-04-11)
- turbo.json / nx.json configuration files from applicable repositories
