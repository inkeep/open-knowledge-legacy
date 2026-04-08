# Evidence: npm Global Package Structure

**Dimension:** npm global package structure
**Date:** 2026-04-08
**Sources:** npm registry, eslint, prettier, vite, tsx, taze, wrangler, @changesets/cli package.json files

---

## Key files / pages referenced

- eslint `package.json` — `"bin": { "eslint": "./bin/eslint.js" }`, conditional exports
- vite `package.json` — `"bin": { "vite": "bin/vite.js" }`, ESM entry with `"type": "module"`
- tsx `package.json` — `"bin": "./dist/cli.mjs"`, conditional exports with import/require
- @changesets/cli — scoped package with unscoped command: `"bin": { "changeset": "bin.js" }`
- taze `package.json` — separate `./cli` subpath export
- prettier `package.json` — conditional import/require exports

---

## Findings

### Finding: `bin` field supports both string shorthand and named object form
**Confidence:** CONFIRMED
**Evidence:** Multiple package.json files

String shorthand (command name = package name):
```json
"bin": "./bin/prettier.cjs"
```

Named object (explicit command name, required for scoped packages):
```json
"bin": { "eslint": "./bin/eslint.js" }
```

Scoped package with unscoped command:
```json
// @changesets/cli
"bin": { "changeset": "bin.js" }

// @biomejs/biome
"bin": { "biome": "..." }
```

**Implications:** `@open-knowledge/cli` can install the command `open-knowledge` via `"bin": { "open-knowledge": "./dist/cli.js" }`.

### Finding: `exports` map and `bin` field are independent concerns
**Confidence:** CONFIRMED
**Evidence:** eslint, taze, tsx package.json files

The `exports` map controls `import "package"` resolution. The `bin` field controls CLI command installation. They do not interfere with each other.

```json
"bin": { "open-knowledge": "./dist/cli.js" },
"exports": {
  ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
  "./package.json": "./package.json"
}
```

### Finding: `files` field is a whitelist — dominant pattern is `["dist"]`
**Confidence:** CONFIRMED
**Evidence:** taze, tsx, unbuild, ora, citty all use `"files": ["dist"]`

Always included regardless: package.json, README, LICENSE. Always excluded: .git, node_modules.

Verify with: `npm pack --dry-run`

### Finding: `open-knowledge` name is taken on npm
**Confidence:** CONFIRMED
**Evidence:** npm registry — v0.1.0, published 2018, "Decentralized linked open data on IPFS"

Alternatives: `@open-knowledge/cli` (scope available), `openknowledge` (available)

### Finding: ESM CLI entry needs `#!/usr/bin/env node` shebang; `import.meta.dirname` works on Node 22+
**Confidence:** CONFIRMED
**Evidence:** Node.js docs — `import.meta.dirname` added in Node 21.2/20.11

No `__dirname`/`__filename` in ESM. Use `import.meta.dirname` and `import.meta.filename` directly on Node 22+.

Top-level await is fully supported in Node 22+ ESM — no flags needed.

---

## Gaps / follow-ups

* None — dimension fully covered
