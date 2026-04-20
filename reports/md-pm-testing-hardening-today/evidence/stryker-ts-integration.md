---
dimension: D1.1 — Stryker-js + TypeScript integration
date: 2026-04-19
sources: stryker-mutator.io/docs, github.com/stryker-mutator/stryker-js, github.com/oven-sh/bun, npmjs.com
---

# Evidence: D1.1 — Stryker-js + TypeScript Integration

## Key files / pages referenced

- [Stryker TypeScript Checker docs](https://stryker-mutator.io/docs/stryker-js/typescript-checker/) — plugin behavior
- [Announcing Stryker 4.0 — Mutation Switching](https://stryker-mutator.io/blog/announcing-stryker-4-mutation-switching/) — `activeMutant` runtime switch
- [Announcing faster TypeScript checking for StrykerJS](https://stryker-mutator.io/blog/announcing-faster-typescript-checking/) — mutant grouping in 6.4+
- [Stryker Configuration docs](https://stryker-mutator.io/docs/stryker-js/configuration/) — full runner list
- [stryker-js#4439 Support bun test runner](https://github.com/stryker-mutator/stryker-js/issues/4439) — open 2023-09-27
- [stryker-js#5424 Add Bun test runner plugin](https://github.com/stryker-mutator/stryker-js/issues/5424) — open 2025-07-07
- [stryker-js#5931 Add support for bun (PR)](https://github.com/stryker-mutator/stryker-js/pull/5931) — in progress as of 2026-03-31
- [oven-sh/bun#26191 Programmatic Test Runner API](https://github.com/oven-sh/bun/issues/26191) — closed duplicate, documents the architectural blocker
- [menoncello/stryker-mutator-bun-runner](https://github.com/menoncello/stryker-mutator-bun-runner) — community plugin
- [npm: stryker-mutator-bun-runner@0.4.0](https://www.npmjs.com/package/stryker-mutator-bun-runner) — Apache-2.0, single maintainer
- [stryker-js/stryker.parent.conf.json](https://github.com/stryker-mutator/stryker-js/blob/master/stryker.parent.conf.json) — canonical self-config
- [mscharley/generic-type-guard/stryker.conf.json](https://github.com/mscharley/generic-type-guard/blob/master/stryker.conf.json) — TS type-guard library
- [evanliomain/taninsam/stryker.config.mjs](https://github.com/evanliomain/taninsam/blob/master/stryker.config.mjs) — TS functional utils, vitest runner
- [pedromsantos/ts-kata/stryker.conf.json](https://github.com/pedromsantos/ts-kata/blob/master/stryker.conf.json) — TS kata scaffold

---

## Findings

### Finding: `@stryker-mutator/typescript-checker` filters type-invalid mutants in-memory using the TS compiler API
**Confidence:** CONFIRMED
**Evidence:** [stryker-mutator.io/docs/stryker-js/typescript-checker/](https://stryker-mutator.io/docs/stryker-js/typescript-checker/)

The plugin compiles each mutated source in-memory (no disk writes), tags mutants with TS errors as `CompileError`, and excludes them from the test runner. It forcibly overrides three tsconfig options to suppress false positives from mutation-induced dead code:

- `allowUnreachableCode: true`
- `noUnusedLocals: false`
- `noUnusedParameters: false`

Project references (`tsc --build`) are auto-detected.

**Implications:** Stricter tsconfig (e.g., `strict`, `noImplicitAny`) means more mutants are eliminated before reaching the test runner — improving reported mutation score numerator quality, but shrinking the denominator.

### Finding: Mutation switching (Stryker v4+) embeds all mutants into source behind an `activeMutant` runtime flag
**Confidence:** CONFIRMED
**Evidence:** [stryker-mutator.io/blog/announcing-stryker-4-mutation-switching/](https://stryker-mutator.io/blog/announcing-stryker-4-mutation-switching/)

```javascript
function add(a, b) {
  if (global.activeMutant === 0) {
    // 👾
  } else {
    return global.activeMutant === 1
      ? a - b // 👽
      : a + b;
  }
}
```

Instrumentation uses Babel parser (handles JS, TS, Flow, JSX). Test runner flips `activeMutant` between mutant runs rather than rewriting source per mutant. Announcement cites "20–70% speed gain" with bundlers like webpack that only need to build once.

### Finding: Stryker 6.4+ groups mutants by TS dependency graph for batched type checking
**Confidence:** CONFIRMED
**Evidence:** [stryker-mutator.io/blog/announcing-faster-typescript-checking/](https://stryker-mutator.io/blog/announcing-faster-typescript-checking/)

Maintainers report "43% performance increase while still being 99.1% accurate" on Stryker's own core package. Controlled by `typescriptChecker.prioritizePerformanceOverAccuracy` (default `true`).

### Finding: Stryker-js has no first-party `bun` test runner plugin
**Confidence:** CONFIRMED
**Evidence:** [stryker-mutator.io/docs/stryker-js/configuration/](https://stryker-mutator.io/docs/stryker-js/configuration/)

Official runner list: **cucumber, jasmine, jest, karma, mocha, tap, vitest**, plus the default `command` runner. Two open issues requesting bun support (#4439, #5424) and one in-progress PR (#5931).

### Finding: Architectural blocker for bun integration is bun's lack of a programmatic test runner API
**Confidence:** CONFIRMED
**Evidence:** [oven-sh/bun#26191](https://github.com/oven-sh/bun/issues/26191), closed 2026-01-17 as duplicate

Bun's test runner is CLI-only. `@stryker-mutator/jest-runner` and `@stryker-mutator/vitest-runner` both consume programmatic APIs that bun does not expose.

### Finding: Community `stryker-mutator-bun-runner@0.4.0` exists but is single-maintainer
**Confidence:** CONFIRMED
**Evidence:** [npmjs.com/package/stryker-mutator-bun-runner](https://www.npmjs.com/package/stryker-mutator-bun-runner), [github.com/menoncello/stryker-mutator-bun-runner](https://github.com/menoncello/stryker-mutator-bun-runner)

- Version: 0.4.0, published 2025-07-07 by Eduardo Menoncello
- License: Apache-2.0
- GitHub: 5 stars, single maintainer
- Peer deps: `@stryker-mutator/core ^9.0.0`, `bun >=1.0.0`, Node `>=20`
- Architecture per author's PRD: "Hybrid Subprocess" via `Bun.spawn()`, claims 2-3× perf vs. Node runners

Example config from repo:

```json
{
  "$schema": "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
  "testRunner": "bun",
  "coverageAnalysis": "off",
  "mutate": ["src/**/*.ts", "!src/**/*.d.ts", "!src/**/*.spec.ts", "!src/**/*.test.ts"],
  "concurrency": 2,
  "reporters": ["html", "clear-text", "progress"],
  "tempDirName": "stryker-tmp",
  "cleanTempDir": true,
  "thresholds": { "high": 80, "low": 60 }
}
```

Note `coverageAnalysis: "off"` — the community runner does not support per-test coverage filtering, which is the single largest Stryker performance multiplier.

### Finding: `command` runner is the safe fallback but cannot do per-test coverage filtering
**Confidence:** CONFIRMED
**Evidence:** [stryker-mutator.io/docs/stryker-js/configuration/](https://stryker-mutator.io/docs/stryker-js/configuration/)

> "The command test runner can be made to work in any use case, but comes with a performance penalty, as Stryker cannot do any optimizations and just runs all tests for all mutants."

Minimal shape:

```javascript
{
  testRunner: 'command',
  commandRunner: { command: 'bun test' }
}
```

Implication: running Stryker against a bun test suite via `command` runner means running the **entire** suite per mutant, regardless of which file the mutant is in.

### Finding: Canonical TS config pattern across 4+ adopters
**Confidence:** CONFIRMED
**Evidence:** stryker-js itself, mscharley/generic-type-guard, pedromsantos/ts-kata, xocomil/AngularSudoku

Stryker-js self-config snippet:

```json
{
  "coverageAnalysis": "perTest",
  "testRunner": "mocha",
  "checkers": ["typescript"],
  "buildCommand": "tsc -b",
  "disableTypeChecks": "{test,src,lib}/**/*.{js,ts,jsx,tsx,html,vue,cts,mts}",
  "ignoreStatic": true
}
```

generic-type-guard snippet (pnpm + jest + typescript-checker):

```json
{
  "packageManager": "pnpm",
  "plugins": ["@stryker-mutator/jest-runner", "@stryker-mutator/typescript-checker"],
  "testRunner": "jest",
  "checkers": ["typescript"],
  "tsconfigFile": "tsconfig.json",
  "coverageAnalysis": "perTest",
  "thresholds": { "high": 100, "low": 99, "break": 95 },
  "mutate": [
    "{src,lib}/**/!(*.+(s|S)pec|*.+(t|T)est).+(cjs|mjs|js|ts|jsx|tsx|html|vue)",
    "!{src,lib}/**/+(__tests__|__utils__|__mocks__)/**/*.+(cjs|mjs|js|cts|mts|ts|jsx|tsx|html|vue)",
    "!src/index.ts"
  ]
}
```

taninsam snippet (vitest runner, typed `.mjs`):

```javascript
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  testRunner: 'vitest',
  coverageAnalysis: 'perTest',
  mutate: ['src/**/*.ts', '!src/**/*.spec.ts'],
  vitest: { dir: 'src' }
};
export default config;
```

**Pattern:** All production-tuned TS configs pair `coverageAnalysis: "perTest"` with either jest or vitest. No production-tuned config in primary sources uses the bun runner.

---

## Negative searches

- Searched stryker-mutator.io docs + GitHub issues for per-strictness-flag guidance (how `strict` vs. `noImplicitAny` vs. `strictNullChecks` individually affect mutant elimination) → **NOT FOUND**. Only the three overridden flags are documented.
- Searched for commercial/enterprise bun support timeline from Stryker team → **NOT FOUND**.
- Searched for production-tuned stryker config using bun as testRunner in a non-demo repo → **NOT FOUND**.

---

## Gaps / follow-ups

- PR #5931 merge status requires individual fetch; marked UNCERTAIN.
- Real-world benchmark of community bun-runner vs. jest/vitest Stryker runners → not published by maintainer as of 2026-04-19.
