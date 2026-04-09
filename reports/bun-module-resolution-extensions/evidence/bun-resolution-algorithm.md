# Evidence: Bun Resolution Algorithm

**Dimension:** Bun's default module resolution
**Date:** 2026-04-08
**Sources:** https://bun.com/docs/runtime/module-resolution

---

## Key pages referenced
- https://bun.com/docs/runtime/module-resolution — official module resolution documentation

---

## Findings

### Finding: Extensions are optional — Bun probes a fixed extension sequence
**Confidence:** CONFIRMED
**Evidence:** https://bun.com/docs/runtime/module-resolution

From the official documentation:

> Extensioned imports are optional but supported.

When resolving `from "./hello"` (no extension), Bun checks:

```
./hello.tsx
./hello.jsx
./hello.ts
./hello.mjs
./hello.js
./hello.cjs
./hello.json
./hello/index.tsx
./hello/index.jsx
./hello/index.ts
./hello/index.mjs
./hello/index.js
./hello/index.cjs
./hello/index.json
```

**Implications:** TypeScript files (.tsx, .ts) are checked before JavaScript files, so in a project with both `foo.ts` and `foo.js`, the TypeScript file wins.

### Finding: Explicit extensions resolve directly with .js → .ts fallback
**Confidence:** CONFIRMED
**Evidence:** https://bun.com/docs/runtime/module-resolution

From the documentation:

> If you import `from "*.js{x}"`, Bun will additionally check for a matching `*.ts{x}` file

This means `import "./bar.js"` will find `./bar.ts` if no `./bar.js` exists, matching TypeScript's ESM convention.

---

## Negative searches
None — behavior is well-documented in official docs.

---

## Gaps / follow-ups
None.
