---
name: ~/agents reference template (alternative, not selected)
description: Code-verified snapshot of ~/agents workspace layout — the pnpm + top-level-package alternative that we're NOT following
sources:
  - ~/agents/package.json
  - ~/agents/pnpm-workspace.yaml
  - ~/agents/agents-api/package.json
  - ~/agents/agents-api/tsconfig.json
confidence: HIGH
---

# ~/agents as alternative template

## Why it's not the recommended path for open-knowledge

- Uses pnpm (`pnpm@10.10.0`) — open-knowledge uses bun. Migration cost is not justified.
- Uses top-level dirs as primary packages (`agents-api/`, `agents-manage-ui/`, `agents-cli/`, `agents-cookbook/`, `agents-docs/`, `agents-ui-demo/`, `test-agents/`) plus `packages/*` for shared internals. This mixes package dirs with data dirs at the root — awkward for open-knowledge which has `specs/`, `reports/`, etc. at the root.
- No root `tsconfig.json` — each package is self-contained. Viable, but openbolts's DRY base is cleaner for a small-package-count repo.

## Still useful as a reference

- Root-level `specs/`, `reports/`, `projects/`, `scripts/`, `.changeset/` confirms the pattern of data dirs as root-level siblings to code packages
- Root `AGENTS.md` (real, 32674 bytes) + `CLAUDE.md` symlink → `AGENTS.md` — same convention as openbolts
- Root `biome.jsonc`, `turbo.json`, `tsdown.config.ts`, `vitest.config.ts`, `coverage.config.ts` — shared tooling pattern
- No per-package `AGENTS.md` or `CLAUDE.md` — same convention as openbolts
- Turbo filter syntax for scoped runs: `turbo dev --filter=@inkeep/agents-api`
- Single pnpm-lock.yaml at root, single `node_modules/` (pnpm hoisted)

## Root package.json (abridged)

```json
{
  "name": "agent-framework",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "turbo build --filter='!agents-cookbook-templates'",
    "dev": "turbo dev --filter=@inkeep/agents-api --filter=@inkeep/agents-manage-ui --filter=@inkeep/agents-docs --filter=@inkeep/agents-core --filter=@inkeep/agents-sdk",
    "test": "turbo test --filter='!agents-cookbook-templates'",
    "typecheck": "turbo typecheck --filter='!agents-cookbook-templates'",
    "check": "turbo check --filter='!agents-cookbook-templates' && pnpm format:check && ...",
    ...
  },
  "devDependencies": {
    "@biomejs/biome": "2.3.11",
    "turbo": "^2.7.0",
    "husky": "^9.1.6",
    ...
  },
  "packageManager": "pnpm@10.10.0"
}
```

## pnpm-workspace.yaml

```yaml
packages:
  - agents-api
  - agents-manage-ui
  - agents-cli
  - agents-ui-demo
  - agents-docs
  - agents-cookbook
  - test-agents
  - "packages/*"

catalog:
  # shared version pins
  ...
```

- Top-level dirs listed by name (not glob)
- Plus `packages/*` for shared internals
- `catalog:` — pnpm-specific; not available in bun workspaces

## packages/core-equivalent tsconfig.json

`agents-api/tsconfig.json` is standalone — **no `extends`**:

```json
{
  "compilerOptions": {
    "types": ["vitest/globals"],
    "verbatimModuleSyntax": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "rootDir": "./",
    "outDir": "./dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "allowSyntheticDefaultImports": true,
    "declaration": true,
    "noEmit": false
  },
  "include": ["src/**/*", "scripts/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- Every package redeclares the full compilerOptions block
- Drift risk: higher than openbolts's base-extension model
- Fine for a large repo with many divergent packages; overkill for open-knowledge

## Verdict for open-knowledge

- **Take:** root `AGENTS.md` + `CLAUDE.md` symlink convention, turbo filter syntax, `specs/`/`reports/` as root-level siblings
- **Don't take:** pnpm, top-level packages, standalone per-package tsconfigs
