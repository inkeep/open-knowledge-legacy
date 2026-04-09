# Evidence: Hierarchical YAML Config Resolution

**Dimension:** Hierarchical YAML config resolution
**Date:** 2026-04-08
**Sources:** Git config system, npm .npmrc cascade, ESLint, Prettier, c12/defu, cosmiconfig, @inkeep/agents-cli, yaml v2, Zod

---

## Key files / pages referenced

- Git documentation — 3-level config (system/global/local), per-key override
- npm documentation — 4-level .npmrc cascade
- cosmiconfig source — walk-up-tree discovery + searchPlaces
- c12 source — multi-source deep merge via defu
- yaml v2 (eemeli) — comment preservation, YAML 1.2
- @inkeep/agents-cli utils/config.ts — directory walking + tsx import pattern
- Zod documentation — safeParse, .default(), z.coerce

---

## Findings

### Finding: Fixed-location resolution (not walk-up-tree) is the right pattern for a server CLI
**Confidence:** CONFIRMED
**Evidence:** Git, npm, Docker all use known fixed paths for their config hierarchy

Walk-up-tree (cosmiconfig/lilconfig) is designed for tools that process files in arbitrary subdirectories (Prettier, ESLint). A server process has a clear project root and user home — fixed locations:
1. `~/.open-knowledge/config.yml` (user-level)
2. `${CWD}/.open-knowledge/config.yml` (workspace-level)

### Finding: Deep merge with array replacement is the correct merge strategy
**Confidence:** CONFIRMED
**Evidence:** c12/defu semantics, mise behavior

Workspace `server.port: 9090` overrides user `server.port: 3000` but preserves user `server.host: 0.0.0.0`. Arrays (like `exclude` patterns) are replaced entirely — workspace array is authoritative.

### Finding: `yaml` v2 (eemeli) is the right YAML parser — comment preservation is critical
**Confidence:** CONFIRMED
**Evidence:** Library comparison

| Feature | yaml v2 | js-yaml |
|---------|---------|---------|
| Comment preservation | Yes | No |
| YAML 1.2 | Yes | Partial |
| Zero deps | Yes | Yes |
| TypeScript | Built-in | @types needed |

Comment preservation matters for `init` command that generates commented templates, and for programmatic config updates that don't destroy user comments.

### Finding: Zod is the right schema validator — already in ecosystem, excellent error messages
**Confidence:** CONFIRMED
**Evidence:** @inkeep/agents-cli uses Zod v4

Every field gets `.default()` — `ConfigSchema.parse({})` produces a complete valid config. Error messages include path + message per issue. `z.coerce.number()` handles YAML string-to-number conversion.

### Finding: Config precedence should be: Schema defaults < User config < Workspace config < ENV vars < CLI flags
**Confidence:** CONFIRMED
**Evidence:** Git, npm, Commander.js source tracking

This matches Git's mental model (system < global < local) with ENV and CLI on top. Commander tracks sources via `setOptionValueWithSource()`.

### Finding: `.open-knowledge/` directory is appropriate — follows `.vscode/`, `.claude/` convention
**Confidence:** CONFIRMED
**Evidence:** .vscode/, .claude/, .husky/, ~/.docker/ precedents

Use a directory (not a single file) when you'll need 2+ of: config, credentials, cache, plugins. The directory contains `config.yml` as the primary config file.

### Finding: Init command should generate fully-commented YAML template from Zod schema defaults
**Confidence:** CONFIRMED
**Evidence:** mise, ESLint init patterns

All options present but commented out, showing default values. Serves as self-documentation.

---

## Gaps / follow-ups

* Exact env var prefix (OK_ vs OPENKNOWLEDGE_) is a naming decision, not a research question
