---
name: Color library comparison
description: Size, deps, NO_COLOR support, and Bun compat for picocolors vs chalk vs kleur
type: evidence
sources:
  - npm registry
  - no-color.org
---

## Library comparison

| Library | Version | Unpacked Size | Install Size | Packages | Zero deps? | ESM? | NO_COLOR native? | Bun verified? |
|---------|---------|---------------|-------------|----------|------------|------|-------------------|---------------|
| picocolors | 1.1.1 | 6KB | 32KB | 1 | Yes | CJS (bundler/Bun handles) | Yes | Yes |
| kleur | 4.1.5 | 20KB | 44KB | 1 | Yes | Dual ESM/CJS (conditional exports) | Yes | Yes |
| chalk | 5.6.2 | 44KB | 76KB | 1 | Yes (v5+) | Yes | Via supports-color | Yes |
| ora | 9.3.0 | 38KB | 640KB | 17 | No (chalk + deps) | Yes | Via chalk | Yes |

## NO_COLOR standard (no-color.org)

**Spec:** When `NO_COLOR` env var is present and non-empty (any value), CLI tools suppress ANSI color output.

**De facto hierarchy:** `FORCE_COLOR` > `NO_COLOR` > `--no-color`/`--color` flags > terminal detection

**FORCE_COLOR levels:** 0=off, 1=16 colors (basic), 2=256 colors, 3=16M colors (truecolor)

**Other env vars:** `TERM` (dumb=no color), `COLORTERM` (truecolor/24bit), `CI` (many tools disable color)

## picocolors implementation detail
- `isColorSupported` checks: `!NO_COLOR && (FORCE_COLOR || (tty.isatty(1) && TERM !== 'dumb'))`
- All color functions become identity functions when disabled
- Zero overhead when colors off

## Existing in repo's dependency tree
- **kleur** — direct dep of @hocuspocus/server (v4.0.0-rc.1)
- **picocolors** — transitive via @babel/code-frame, PostCSS, Fumadocs

## What production CLIs use
- Vercel CLI: chalk v4 + ora v3 + cli-table3
- Wrangler: minimal deps, no chalk/Ink
- Turbo: Rust (custom turborepo-ui crate)
- Biome: Rust (termcolor + terminal_size)
- create-next-app: minimal, no chalk or Ink
- **No major production CLI uses Ink**
