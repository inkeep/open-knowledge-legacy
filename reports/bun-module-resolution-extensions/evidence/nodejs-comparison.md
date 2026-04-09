# Evidence: Node.js ESM Comparison

**Dimension:** Comparison with Node.js ESM
**Date:** 2026-04-08
**Sources:** https://nodejs.org/api/esm.html, https://bun.com/docs/runtime/module-resolution

---

## Key pages referenced
- https://bun.com/docs/runtime/module-resolution — Bun resolution docs
- https://github.com/nodejs/node/issues/30927 — Node.js discussion on extensionless ESM imports

---

## Findings

### Finding: Node.js ESM requires explicit file extensions; Bun does not
**Confidence:** CONFIRMED
**Evidence:** https://github.com/nodejs/node/issues/30927, https://bun.com/docs/runtime/module-resolution

Node.js ESM follows the browser ESM specification which requires fully-specified import paths. `import "./foo"` produces `ERR_MODULE_NOT_FOUND` in Node.js ESM — you must write `import "./foo.js"`.

Bun deliberately departs from this, implementing bundler-style resolution that probes for extensions. This matches the behavior of webpack, esbuild, Vite, and other bundlers.

| Import style | Bun | Node.js ESM |
|---|---|---|
| `from "./foo"` | Probes extensions | ERR_MODULE_NOT_FOUND |
| `from "./foo.ts"` | Direct resolve | Unknown extension ".ts" |
| `from "./foo.js"` | Direct + .ts fallback | Direct resolve only |

**Implications:** Code relying on extensionless imports is not portable to Node.js ESM without a bundler or custom loader.

---

## Negative searches
None.

---

## Gaps / follow-ups
None.
