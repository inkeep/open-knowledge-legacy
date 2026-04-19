# Visual regression suite

Playwright + `toHaveScreenshot` baselines that lock the 18 built-in
component renders under editor + fumadocs CSS bridge (SPEC §7a VR01-VR18).

## First-time setup

Baselines are **not committed**. `__snapshots__/.gitkeep` is a placeholder
so the directory exists; running `test:visual` on a clean clone fails
fast — by design, so a regression authored in the same changeset cannot
silently become the golden (see `playwright.visual.config.ts:25`,
`updateSnapshots: 'none'`).

After cloning the repo:

```bash
bun install
bun run --cwd packages/app test:visual:update
```

That invokes `playwright test --config playwright.visual.config.ts
--update-snapshots`, writes PNGs under `__snapshots__/`, and passes.
**Commit those PNGs in a reviewable PR** — baseline updates are never
automatic. The protocol matches `packages/app/tests/stress/perf-baseline.json`
(see `packages/app/tests/stress/perf-baseline-update.md`).

## Day-to-day

Once baselines exist, verify locally:

```bash
bun run --cwd packages/app test:visual
```

Failures produce side-by-side diffs under `packages/app/test-results/`.
Review the diff before deciding whether to update the baseline or fix
the regression.

## CI

`test:visual` is intentionally **not** part of `ci.yml` tier-1 or
`nightly.yml` tier-2. The runtime cost is low but the signal is only
useful once baselines are committed, and the baseline-refresh step
(`test:visual:update` → commit PNGs) is inherently a review-gated human
action. Wiring it to CI before baselines land would mean every PR fails
the shard. When a first round of baselines lands, add `test:visual` to
the `tier2-gates` matrix in `.github/workflows/nightly.yml`.

## Updating a baseline

1. Make the intentional visual change on a feature branch.
2. Run `bun run --cwd packages/app test:visual:update`.
3. Inspect the diff (`git diff --stat packages/app/tests/visual/__snapshots__/`).
4. Commit the updated PNGs in the same PR as the code change.
5. A reviewer approves the baseline shift alongside the code diff.

Never run `--update-snapshots` on `main` or in automation — baseline
updates always flow through a human review.
