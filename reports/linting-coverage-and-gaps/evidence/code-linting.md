# Evidence: Code Linting

**Dimension:** Code linting (TS/JS/CSS/JSON/JSONC) tooling, rules, and enforcement
**Date:** 2026-04-27
**Sources:** root `package.json`, `biome.jsonc`, `scripts/`, `.husky/`, `.github/workflows/ci.yml`, `turbo.json`

---

## Key files referenced

- `package.json` — root scripts (`lint`, `format`, `check`, `knip`, `notices`)
- `biome.jsonc` — Biome 2 lint + format config
- `scripts/check-knip-clean.sh` — knip drift gate
- `scripts/check-notices-clean.sh` — THIRD_PARTY_NOTICES drift gate
- `scripts/check-agents-md-size.sh` — AGENTS.md size gate
- `.husky/pre-commit`, `.husky/pre-push` — local hooks
- `.github/workflows/ci.yml` — CI Tier 1 (PR-time lint + tests)
- `turbo.json` — `typecheck` task wiring

---

## Findings

### Finding: Biome is the canonical code linter + formatter
**Confidence:** CONFIRMED
**Evidence:** `package.json:23`, `biome.jsonc`

```text
"lint": "biome check packages docs *.json *.jsonc *.ts --error-on-warnings"
```

`biome.jsonc` defines:
- Format: 2-space indent, 100-char width, single quotes, semicolons.
- Lint enabled with `recommended: true`.
- Custom rules: `noReactForwardRef: error`; `noRestrictedImports` blocks `useMemo` / `useCallback` / `memo` / `useContext` (React Compiler is on) and `yXmlFragmentToProsemirrorJSON` (deprecated alias).

**Implications:** TS/TSX/JS/JSX/JSON/JSONC/CSS files are linted. The `--error-on-warnings` flag treats every warning as a CI failure — there is no advisory tier.

### Finding: Wiki content directories are excluded from Biome
**Confidence:** CONFIRMED
**Evidence:** `biome.jsonc:38-58`

```text
"files": {
  "includes": [
    "**",
    "!**/node_modules", "!**/dist", "!**/.next", "!**/.source", "!**/.turbo",
    "!**/tmp", "!**/test-results", "!**/playwright-report",
    "!**/next-env.d.ts", "!.claude", "!.bun",
    "!specs", "!reports", "!evidence", "!meta",
    "!docs/bun.lock", "!worktrees", ...
  ]
}
```

**Implications:** `specs/`, `reports/`, `evidence/`, `meta/` — the directories that hold the bulk of wiki content — are NOT inspected by Biome at all. Biome also has no first-class markdown linting rules even where it does run on `.md`.

### Finding: Biome runs on `packages/**/*.md` and `docs/**/*.md` via lint-staged — but is effectively a no-op on prose
**Confidence:** CONFIRMED
**Evidence:** `package.json:38-48`

```text
"lint-staged": {
  "packages/**/*.{ts,tsx,js,jsx,json,md}": [
    "biome check --write --no-errors-on-unmatched --files-ignore-unknown=true ..."
  ],
  "docs/**/*.{ts,tsx,js,jsx,json,md}": [...],
  ...
}
```

**Implications:** Biome 2 has no `.md` parser/lint rules — the `md` glob entries pass through unchanged. The pre-commit hook touches markdown files but does not analyze their content.

### Finding: knip enforces dead-code / dead-export / dead-types / dead-deps cleanliness
**Confidence:** CONFIRMED
**Evidence:** `package.json:15`, `scripts/check-knip-clean.sh:18-30`

```text
"knip": "turbo run build --filter=... && knip --files --dependencies
        --fix-type exports --fix-type types --include exports,types"
```

The wrapper (`check-knip-clean.sh`) snapshots `git diff` before and after knip runs; if knip mutated the working tree (auto-removed exports/types), the script fails non-zero with instructions to commit or revert.

**Implications:** Catches unused exports, unused TS types, unused files, unused dependencies. The drift check ensures CI's `bun run knip && bun run lint` chain doesn't surprise developers locally — same gate, same outcome. Caveats: knip runs only over `packages/` + `docs/` (TS/JS), not over markdown content.

### Finding: THIRD_PARTY_NOTICES.md is drift-checked
**Confidence:** CONFIRMED
**Evidence:** `scripts/check-notices-clean.sh:16-17`

```text
cd "$REPO_ROOT"
bun scripts/generate-third-party-notices.mjs --check
```

The generator regenerates the notices file from `node_modules/` and fails if the committed file doesn't match.

**Implications:** Catches license / dependency drift. Wired into `bun run check` and the CI lint job (`ci.yml:52-53`).

### Finding: AGENTS.md (CLAUDE.md) has a hard 40k char cap, soft 35k warn
**Confidence:** CONFIRMED
**Evidence:** `scripts/check-agents-md-size.sh:17-19`, `.husky/pre-commit:1`

```text
WARN_AT=35000
FAIL_AT=40000
```

Pre-commit-only check; bypass with `OK_SKIP_AGENTS_MD_SIZE_CHECK=1`. Spot-checks file size even when not staged (catches upstream-merge bloat).

**Implications:** Targeted at exactly one file (the load-bearing root agent prompt). Not a generic markdown lint — it's a single-file size guard. No analogous cap on any other doc.

### Finding: TypeScript typecheck is part of `bun run check`
**Confidence:** CONFIRMED
**Evidence:** `package.json:21,25`, `turbo.json:21-23`

```text
"typecheck": "turbo run typecheck"
"check": "... && bun run lint && turbo run typecheck test test:integration ..."
```

Turbo `typecheck` task depends on `^build`. Each package runs `bunx tsc --noEmit` (per-package script). `verbatimModuleSyntax: true` repo-wide.

**Implications:** Catches type errors before commit/push (via pre-push) and at CI. Counts as a code-quality gate alongside lint.

### Finding: Pre-commit and pre-push hooks gate local commits
**Confidence:** CONFIRMED
**Evidence:** `.husky/pre-commit`, `.husky/pre-push`

```text
# pre-commit
bash scripts/check-agents-md-size.sh
bun run lint-staged

# pre-push
bun run format && bun run lint && bun run check
```

`prepare` script in `package.json:33` chmod's both hooks on install via husky.

**Implications:** Pre-commit is light (size check + Biome on staged files); pre-push is heavy (full repo lint + typecheck + test + integration + fidelity). Pre-push is the local equivalent of CI Tier 1.

### Finding: CI Tier 1 (`ci.yml`) runs lint + knip + notices + tests on every PR and push to main
**Confidence:** CONFIRMED
**Evidence:** `.github/workflows/ci.yml:36-94`

```text
jobs:
  lint:
    - run: bun run knip
    - run: bun run lint
    - name: THIRD_PARTY_NOTICES.md drift check
      run: bash scripts/check-notices-clean.sh
  test:
    matrix:
      task: [typecheck, test, test:integration, test:conversion, test:fidelity]
  playwright:
    - run: bunx turbo run test:e2e
```

5-min budget on lint job; 15-min budgets on test + playwright.

**Implications:** Biome lint, knip cleanliness, notices drift, and TypeScript typecheck are all PR-blocking. Tier 2 (`nightly.yml`) and Tier 3 (`weekly.yml`) are workflow_dispatch-only — no automatic regression detection.

---

## Negative searches

- Searched: `eslint`, `prettier`, `oxlint`, `dprint`, `rome` in `package.json` + workflows → **NOT FOUND**. Biome is the only formatter+linter.
- Searched: `markdownlint`, `remark-lint`, `vale`, `cspell`, `alex`, `write-good` in any config file outside `node_modules` → **NOT FOUND** (only fixture data hit, not config).
- Searched: any `eslint-plugin-*` or other linter dependencies in `package.json` → **NOT FOUND**.

---

## Gaps / follow-ups

- Tier 2/3 schedule retired — perf/parse-health regressions only run on manual dispatch (intentional per `specs/2026-04-19-ci-signal-quality/`, but worth flagging that the `bun run check` PR gate does not cover them).
- knip excludes `markdown` — its dead-code semantics don't apply to wiki content.
