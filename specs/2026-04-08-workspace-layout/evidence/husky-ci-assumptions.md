---
name: Husky hooks and CI path assumptions
description: Everything in the repo that hardcodes the nested init_spike/ or docs/ layout
sources:
  - .husky/pre-commit
  - .husky/pre-push
  - package.json (root, lint-staged config)
  - .github/workflows/ci.yml
  - .gitignore
confidence: HIGH
---

# Hardcoded assumptions that break on migration

## Husky pre-commit

```bash
bun run lint-staged
```

- Single line. Runs `lint-staged` from repo root.
- Root `package.json:13-17` lint-staged config:
  ```json
  "lint-staged": {
    "*.{ts,tsx,js,jsx,json,md}": [
      "biome check --write --no-errors-on-unmatched --files-ignore-unknown=true"
    ]
  }
  ```
- **Impact on init_spike:** Currently never runs biome on init_spike source because root `biome.jsonc:33` excludes `!init_spike`. Hook is a no-op for init_spike files.
- **After migration:** Will cover `packages/editor/**`. Expect first commit after migration to hit lint errors unless pre-cleaned.

## Husky pre-push

```bash
bun run format && bun run lint
```

- Runs root `format` (biome check --write .) then `lint` (biome check .).
- **Impact:** Same story — never touches init_spike today.
- **After migration:** Covers all packages. Same cleanup concern as pre-commit.

## CI workflow `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main, feat/init-spike]
  pull_request:
    branches: [main, feat/init-spike]

permissions:
  contents: read

jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2

      - uses: oven-sh/setup-bun@4bc047ad259df6fc24a6c9b0f9a0cb08cf17fbe5 # v2.0.1
        with:
          bun-version: "1.3.11"
          cache: true

      - name: Install root tooling
        run: bun install --frozen-lockfile

      - name: Install docs deps
        working-directory: docs
        run: bun install --frozen-lockfile

      - name: Lint (biome)
        run: bun run lint

      - name: Typecheck (docs)
        working-directory: docs
        run: bun run typecheck

      - name: Build (docs)
        working-directory: docs
        run: bun run build

      - name: Install init_spike deps
        working-directory: init_spike
        run: bun install --frozen-lockfile

      - name: Test (init_spike unit)
        working-directory: init_spike
        run: bun run test
```

### Hardcoded path refs

| Line | Directive | Value | After migration |
|---|---|---|---|
| 5-7 | branch trigger | `main`, `feat/init-spike` | remove `feat/init-spike` (dead branch name) |
| 28-29 | working-directory | `docs` | remove — root install hoists all deps |
| 35-36 | working-directory | `docs` | replace with `turbo run typecheck --filter=@open-knowledge/docs` |
| 39-40 | working-directory | `docs` | replace with `turbo run build --filter=@open-knowledge/docs` |
| 42-44 | working-directory | `init_spike` | remove — root install hoists all deps |
| 46-48 | working-directory | `init_spike` | replace with `turbo run test --filter=@open-knowledge/<editor-name>` or just `turbo run test` |

### Install call count

- **Today:** 3 separate `bun install --frozen-lockfile` calls (root, docs, init_spike)
- **After migration:** 1 root install

## `.gitignore` path refs

```
# Runtime content file — accumulates test artifacts from dev/agent-sim runs
init_spike/content/test-doc.md
```

- Line 16 — needs rewrite to `packages/<editor-name>/content/test-doc.md`

## biome.jsonc path refs

```jsonc
"files": {
  "includes": [
    "**",
    "!**/node_modules",
    ...
    "!init_spike",
    ...
  ]
}
```

- Line 33: `"!init_spike"` — must be removed during migration
- Add: `"!**/.next"` (already present), `"!**/dist"` (already present via `!**/dist`)

## Root package.json path refs

- `"typecheck": "cd docs && bun run typecheck"` — line 9 of root package.json
- After migration: replace with `"typecheck": "turbo run typecheck"` (no more `cd docs`)

## Verdict

Path assumptions are all mechanical rewrites. No runtime code depends on the nested layout. Migration is tooling-only at the root level.
