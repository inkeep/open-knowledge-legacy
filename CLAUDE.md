# Open Knowledge

Bun monorepo (`bun@1.3.11`) — CRDT collaboration server + editor.

## Monorepo Structure

```
packages/
  core/    — @inkeep/open-knowledge-core (shared extensions, types, utils)
  server/  — @inkeep/open-knowledge-server (Hocuspocus server library)
  cli/     — @inkeep/open-knowledge (published CLI + MCP)
  app/     — React editor frontend (private)
docs/      — Next.js docs site (Fumadocs)
```

Each package has its own `CLAUDE.md` with package-specific commands and architecture.

## Quick Start

```bash
bun install                    # Install all workspace dependencies
cd packages/app && bun run dev # Start dev server (Vite + Hocuspocus on port 5173)
```

## Quality Gates

```bash
bun run lint                   # Biome lint across all packages
bun run format                 # Biome format across all packages
```

Per-package:
```bash
cd packages/<pkg> && bunx tsc --noEmit  # Typecheck
cd packages/<pkg> && bun test           # Unit tests
```

## Package Manager

- Use `bun` for everything (install, test, run scripts)
- Workspace deps use `"workspace:*"` in package.json

## Conventions

- ESM everywhere (`"type": "module"`)
- Biome for lint/format (config at root `biome.jsonc`)
- Tests co-located with source: `foo.test.ts` next to `foo.ts`
- TypeScript strict mode, `verbatimModuleSyntax: true`
