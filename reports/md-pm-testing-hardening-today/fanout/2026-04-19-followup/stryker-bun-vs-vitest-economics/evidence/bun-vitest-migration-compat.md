# Evidence: Bun test → Vitest migration compatibility matrix

**Dimension:** FU1.3 — Bun → vitest migration compatibility matrix
**Date:** 2026-04-19
**Sources:** Vitest migration docs, Bun docs, fast-check docs, community migration reports

---

## Key pages referenced

- [Vitest Migration Guide](https://vitest.dev/guide/migration.html)
- [Bun: bun:test vi property API reference](https://bun.com/reference/bun/test/vi)
- [@fast-check/vitest on npm](https://www.npmjs.com/package/@fast-check/vitest)
- [fast-check blog: Bringing Controlled Randomness to Vitest (2025)](https://fast-check.dev/blog/2025/03/28/beyond-flaky-tests-bringing-controlled-randomness-to-vitest/)
- [elizaOS issue #5185 — migration from vitest to bun:test (reverse direction, informative)](https://github.com/elizaOS/eliza/issues/5185)
- [PkgPulse compatibility gaps](https://www.pkgpulse.com/blog/bun-test-vs-vitest-vs-jest-2026)

---

## Findings

### Finding: Core `describe/it/expect` API is identical between bun:test and vitest (both Jest-flavored)
**Confidence:** CONFIRMED
**Evidence:**

- [Vitest Migration Guide](https://vitest.dev/guide/migration.html): "Most migrations take hours, not days, with the main effort being replacing `jest.*` namespace calls with `vi.*` equivalents."
- Bun's `bun:test` offers `vi.*` as an alias: [bun:test vi property](https://bun.com/reference/bun/test/vi): "Bun provides Vitest-compatible mocking utilities that offer Vitest-style mocking API for easier migration from Vitest to Bun."

**Implications:** For a TS test suite that only uses describe/it/expect/mocks, the migration is mostly mechanical: swap imports (`import { test, expect } from "bun:test"` → `import { test, expect } from "vitest"` OR enable `globals: true` in `vitest.config.ts` and delete the imports).

---

### Finding: Inline snapshots and `.toMatchSnapshot` file format migrate cleanly
**Confidence:** CONFIRMED
**Evidence:**

- [Vitest snapshot docs](https://vitest.dev/guide/snapshot): Vitest uses the same `.snap` file format as Jest.
- [PkgPulse 2026](https://www.pkgpulse.com/blog/bun-test-vs-vitest-vs-jest-2026): "Bun test no inline snapshots (snapshots work, inline doesn't)."

**Implications:** If the md ⇄ PM test suite uses `.toMatchSnapshot()` (not `.toMatchInlineSnapshot()`), .snap files transfer verbatim. If inline snapshots are in use — and they're *not* under bun test because bun doesn't support them — this isn't a migration concern.

---

### Finding: fast-check is runner-agnostic; `@fast-check/vitest` exists as a first-class integration
**Confidence:** CONFIRMED
**Evidence:**

- [fast-check docs](https://fast-check.dev/): "fast-check is a Property-based Testing framework that works with Jest, Mocha, Vitest, and others. fast-check can be used within any test runner without any specific integration needed."
- [@fast-check/vitest npm](https://www.npmjs.com/package/@fast-check/vitest): "Official support for vitest 4.x starts at @fast-check/vitest 0.2.3. Properties accepted by @fast-check/vitest as input can be either synchronous or asynchronous, and Vitest's beforeEach and afterEach hooks are natively integrated into predicates."

**Implications:** The ~4000 LOC of fidelity tests — if they use fast-check via `fc.assert(fc.property(...))` inside `it(...)` blocks (the runner-agnostic pattern) — migrate with zero changes. Optional upgrade path: adopt `@fast-check/vitest`'s `test.prop([...])` helper for tighter ergonomics, but not required.

---

### Finding: Real friction points are `Bun.*` globals, `jsdom` vs `happy-dom`, and `bun:*` imports
**Confidence:** CONFIRMED
**Evidence:**

- [Bun test migration discussion #8559](https://github.com/oven-sh/bun/discussions/8559) & [elizaOS #5185](https://github.com/elizaOS/eliza/issues/5185): most friction comes from direct use of `Bun.env`, `Bun.file`, `Bun.spawn`, and other runtime-specific APIs which vitest cannot shim.
- [PkgPulse compatibility gaps](https://www.pkgpulse.com/blog/bun-test-vs-vitest-vs-jest-2026): "no jsdom environment (use happy-dom), limited @testing-library/react support, no `@vitest/coverage-v8` equivalent (bun has built-in), and some TypeScript decorators may behave differently."

**Implications:** For a parser pipeline with no DOM, no React, minimal I/O → friction is very low. The main work is: grep for `Bun.` usage in test files and src files under test, replace with node equivalents (`process.env`, `fs.readFileSync`, etc.). If production code uses `Bun.file` for file reads, that code is Bun-only at runtime regardless — moving tests to vitest doesn't require changing production code unless the tests themselves depended on those calls resolving.

---

### Finding: Empirical migration effort on a parser-shaped TS codebase with fast-check + snapshots
**Confidence:** INFERRED (no direct case study; synthesis of migration-guide claims)
**Evidence:** Synthesizing:

- Vitest docs self-estimate: "hours, not days" for API swaps ([Vitest Migration Guide](https://vitest.dev/guide/migration.html))
- fast-check: zero changes if using runner-agnostic pattern
- Snapshots: zero changes if using file-based `.toMatchSnapshot()`
- Config: one new file (`vitest.config.ts`), one dependency swap in `package.json`
- Bun.* grep: requires code audit

**Rough estimate for ~4000 LOC test suite, parser pipeline shape:**
- Low end: **0.5–1 person-day** if no `Bun.*` usage and globals already imported explicitly.
- High end: **2–3 person-days** if `Bun.file`/`Bun.spawn` are used throughout and a DOM env is needed.

**Important:** The migration does NOT require abandoning `bun test` as the dev-loop runner. A repo can keep `bun test` for local dev + CI smoke, and introduce `vitest` only as the runner Stryker consumes. See FU1.4 for this hybrid pattern.

---

## Negative searches

- No published case study located of a TypeScript parser or serializer codebase that migrated from `bun test` to `vitest` with tracked effort hours.
- No documented gotchas specific to fast-check's `fc.assert` under `bun:test` vs under `vitest`.

## Gaps

- Concrete hours for the specific "~4000 LOC tests, fast-check + snapshots" shape are synthesized, not measured.
- TypeScript decorator quirks called out by PkgPulse are unspecified — whether they affect a parser codebase depends on whether the code uses decorators.
