---
name: openbolts reference template
description: Code-verified snapshot of ~/openbolts workspace layout — the closest template for this migration
sources:
  - ~/openbolts/package.json
  - ~/openbolts/tsconfig.json
  - ~/openbolts/biome.jsonc
  - ~/openbolts/turbo.json
  - ~/openbolts/packages/core/package.json
  - ~/openbolts/packages/core/tsconfig.json
confidence: HIGH
---

# ~/openbolts as migration template

## Why this is the closest template

- Same package manager: `bun@1.3.11` (exact match with open-knowledge)
- Same root-level strategy/docs layout: `specs/`, `.reports/`, `AGENTS.md`, `README.md`, `tmp/` all live at the root as siblings to code
- Same "docs as a package" precedent (`packages/docs/` is a real package)
- Lightweight package count (5): similar scale to open-knowledge's 1-2 initial packages

## Root package.json

```json
{
  "name": "openbolts",
  "devDependencies": {
    "@biomejs/biome": "^2.3.11",
    "husky": "^9.1.7",
    "knip": "^6.3.0",
    "lint-staged": "^16.4.0",
    "turbo": "^2.7.0",
    "typescript": "^5.9.2"
  },
  "packageManager": "bun@1.3.11",
  "private": true,
  "scripts": {
    "build": "turbo run build",
    "typecheck": "turbo run typecheck",
    "lint": "biome check .",
    "format": "biome check --write .",
    "test": "turbo run test",
    "test:integration": "turbo run test:integration",
    "test:llm": "turbo run test:llm",
    "check:fast": "bun run typecheck && bun run lint && bun run test",
    "check": "bun run typecheck && bun run lint && bun run test && bun run test:integration",
    "prepare": "husky && chmod +x .husky/pre-commit .husky/pre-push 2>/dev/null || true"
  },
  "lint-staged": {
    "*.{ts,tsx,js,jsx,json,md}": [
      "biome check --write --no-errors-on-unmatched --files-ignore-unknown=true"
    ]
  },
  "workspaces": [
    "packages/*"
  ]
}
```

**Key observations:**
- Line 30-32: `"workspaces": ["packages/*"]` inline in root `package.json` (bun convention — no separate `pnpm-workspace.yaml`)
- Build/typecheck/test delegate via `turbo run <task>` (pick up package-level scripts)
- Lint/format run biome at root directly, NOT through turbo (single biome pass across all packages)
- `check:fast` / `check` compose the root scripts, giving a unified gate

## Root tsconfig.json (base)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true
  },
  "exclude": ["node_modules", "dist"]
}
```

- Base config. **No `include` field** — this config isn't used directly for a build; it's a base to extend
- Packages extend via `"extends": "../../tsconfig.json"` and add their own `outDir`, `rootDir`, `include`

## Root biome.jsonc

```json
{
  "$schema": "https://biomejs.dev/schemas/2.4.4/schema.json",
  "assist": { "actions": { "source": { "organizeImports": "on" } } },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "semicolons": "always"
    }
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  },
  "overrides": [],
  "files": {
    "includes": [
      "**",
      "!**/node_modules",
      "!**/dist",
      "!**/.next",
      "!**/.source",
      "!**/next-env.d.ts",
      "!**/.turbo",
      "!**/tmp",
      "!.claude",
      "!.dmux",
      "!test-scenarios",
      "!specs",
      "!.reports"
    ]
  }
}
```

**Key observations:**
- Excludes data dirs (`specs`, `.reports`, `test-scenarios`) but **NOT** any packages — biome covers all code in `packages/*` by default
- Near-identical shape to open-knowledge's current root biome minus the `!init_spike` exclusion

## Root turbo.json

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "dev": {},
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "lint": {},
    "test": {
      "dependsOn": ["^build"]
    },
    "test:integration": {
      "dependsOn": ["^build"]
    },
    "test:llm": {
      "dependsOn": ["^build"],
      "cache": false
    }
  }
}
```

**Key observations:**
- `dependsOn: ["^build"]` — task runs after all workspace deps' `build` completes
- `outputs: ["dist/**", ".next/**"]` — cache key includes both bun-build and next-build outputs
- `dev: {}` — no dependencies, runs in parallel
- `test:llm` has `cache: false` — not deterministic, skip cache

## packages/core/package.json (sample)

```json
{
  "name": "@openbolts/core",
  "version": "0.0.1",
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "types": "./dist/index.d.mts"
    },
    "./engine": { "import": "./dist/engine/index.mjs", "types": "./dist/engine/index.d.mts" },
    "./data-access": { "import": "./dist/data-access/index.mjs", "types": "./dist/data-access/index.d.mts" },
    "./context": { "import": "./dist/context/index.mjs", "types": "./dist/context/index.d.mts" },
    "./recipes": { "import": "./dist/recipes/index.mjs", "types": "./dist/recipes/index.d.mts" }
  },
  "scripts": {
    "build": "tsdown",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --project unit",
    "test:integration": "vitest run --project integration",
    "test:llm": "vitest run --project llm"
  }
}
```

- `@openbolts/<name>` scoped naming
- `"type": "module"`
- Multi-entry `exports` map pointing at `dist/`
- Per-package scripts invoked by turbo
- Own `tsdown.config.ts`, `vitest.config.ts`, `drizzle.config.ts` at package root

## packages/core/tsconfig.json

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

- 8 lines. Extends root base, sets package-local `outDir`, `rootDir`, `include`

## Packages in ~/openbolts

- `core` (→ `@openbolts/core`)
- `engine-runtime`
- `mcp`
- `docs` (the fumadocs site, equivalent role to open-knowledge's docs/)
- `adapter-vercel-ai`

No per-package `AGENTS.md` or `CLAUDE.md` anywhere under `packages/*` (verified via glob).

## AGENTS.md / CLAUDE.md at root

- `AGENTS.md` — real file, 65893 bytes (large — it carries the real content)
- `CLAUDE.md` — symlink → `AGENTS.md` (`lrwxr-xr-x ... CLAUDE.md -> AGENTS.md`)
- This is the convention we want open-knowledge to adopt
