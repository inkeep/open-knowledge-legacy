---
title: "Source-read: stryker-mutator-bun-runner@0.4.0 perTest coverage implementation"
description: "Direct source-code verification that the published 0.4.0 npm tarball implements Stryker's coverageAnalysis: perTest protocol. Resolves the contradiction flagged in parent REPORT.md Exec Summary #13 between Finding #1 (stated 'coverageAnalysis: off') and the plugin author's upstream issue advertising perTest support."
createdAt: 2026-04-19
updatedAt: 2026-04-19
subjects:
  - stryker-mutator-bun-runner
  - Stryker-js
  - Bun
  - perTest coverage analysis
topics:
  - mutation testing
  - coverage analysis
  - source code verification
---

# Evidence: stryker-mutator-bun-runner@0.4.0 perTest support

**Dimension:** Resolution of Exec Summary #13 contradiction
**Date:** 2026-04-19
**Sources:** npm-published tarball (`npm pack stryker-mutator-bun-runner@0.4.0`), GitHub main branch (shallow clone)

---

## Investigation procedure

1. Cloned GitHub main branch (shallow, depth 1): `https://github.com/menoncello/stryker-mutator-bun-runner`
2. Fetched the npm-published 0.4.0 tarball: `npm pack stryker-mutator-bun-runner@0.4.0`
3. Extracted tarball and inspected `src/` for coverage implementation
4. Cross-compared the main-branch source with the 0.4.0 tarball source

**Key discovery:** The GitHub main branch and the published 0.4.0 tarball are **different codebases**. Main is a v1.0.0 in-progress rewrite; 0.4.0 is the legacy (but functional) implementation.

---

## Finding 1: The npm-published 0.4.0 implements perTest coverage

**Confidence:** CONFIRMED
**Evidence:** Direct source read of 0.4.0 tarball

The 0.4.0 tarball's `src/` directory contains:

```
src/
├── BunResultParser.ts
├── BunTestAdapter.ts
├── BunTestRunner.ts        (301 lines)
├── BunTestRunnerOptions.ts
├── coverage/
│   ├── CoverageHookGenerator.ts    (116 lines)
│   ├── CoverageTypes.ts            (75 lines)
│   ├── index.ts                    (3 lines)
│   ├── MutantCoverageCollector.ts  (184 lines)
│   └── TestFilter.ts               (101 lines)
├── index.ts
├── process/
└── utils/
```

Total coverage-module LOC: ~479 lines. This is not a stub — it's a real implementation of the Stryker TestRunner coverage-reporting protocol.

### Finding 1a: CoverageHookGenerator emits Stryker's `__stryker__` global protocol

**Evidence:** `src/coverage/CoverageHookGenerator.ts` lines 54–58, 64–98

The plugin generates a preload JavaScript hook that Bun loads before every test file. The hook:

```javascript
// From getInitializationCode()
if (typeof globalThis.__stryker__ === 'undefined') { globalThis.__stryker__ = {}; }

// From getTestWrapperCode()
const originalTest = globalThis.test || globalThis.it;
if (originalTest) {
  const wrappedTest = function(name, fn) {
    return originalTest(name, async function(...args) {
      const testId = name;
      globalThis.__stryker__.currentTestId = testId;

      if (!globalThis.__stryker__.mutantCoverage) {
        globalThis.__stryker__.mutantCoverage = { static: {}, perTest: {} };
      }
      if (!globalThis.__stryker__.mutantCoverage.perTest[testId]) {
        globalThis.__stryker__.mutantCoverage.perTest[testId] = {};
      }

      try {
        return await fn.apply(this, args);
      } finally {
        globalThis.__stryker__.currentTestId = null;
      }
    });
  };
  // preserve prototype + own-props...
  globalThis.test = wrappedTest;
  if (globalThis.it) globalThis.it = wrappedTest;
}
```

This matches Stryker's standard runner contract exactly: wrap `test`/`it` to set `currentTestId`, Stryker's core-injected mutation-counter code reads `currentTestId` and records `mutantCoverage.perTest[currentTestId][mutantId]++` on each hit.

### Finding 1b: TestFilter consumes perTest coverage for selective execution

**Evidence:** `src/coverage/TestFilter.ts` lines 14–46, 68–78

```typescript
public static getTestsForMutant(mutant: Mutant, mutantCoverage: MutantCoverage | undefined): string[] {
  if (!mutantCoverage) return [];                       // no data → run all
  if (!mutantCoverage.perTest) return [];

  const coveringTests: string[] = [];
  for (const [testId, mutants] of Object.entries(mutantCoverage.perTest)) {
    const mutantRecord = mutants as Record<string, number>;
    const mutantCoverage = mutantRecord[mutant.id];
    if (mutantCoverage && mutantCoverage > 0) {
      coveringTests.push(testId);
    }
  }

  // static-only fallback: if no perTest hits but static coverage exists,
  // return empty → caller runs all tests
  if (coveringTests.length === 0) {
    const staticCoverage = mutantCoverage.static[mutant.id];
    if (staticCoverage) return [];
  }
  return coveringTests;
}

public static createTestNamePattern(testIds: string[]): string | undefined {
  if (testIds.length === 0) return undefined;
  const escapedNames = testIds.map(id => id.replace(/[$()*+.?[\\\]^{|}]/g, '\\$&'));
  return `^(${escapedNames.join('|')})$`;
}
```

The regex pattern is passed to Bun via its `--test-name-pattern` CLI flag, constraining the mutant-run to only the covering tests.

### Finding 1c: BunTestRunner wires the coverage collection path conditionally

**Evidence:** `src/BunTestRunner.ts` (grep matches on the term survey)

```
Line 18: import { StrykerOptions, MutantCoverage } from '@stryker-mutator/api/core';
Line 31: import { TestFilter, CoverageResult } from "./coverage/index.js";
Line 54: private mutantCoverage?: MutantCoverage;
Line 109:        coverage: options.coverageAnalysis !== 'off'
Line 116:      if (options.coverageAnalysis !== 'off' && result.coverage) { ... }
Line 201: const mutantCoverage = this.bunAdapter.getCoverageCollector().toMutantCoverage(coverage.coverage);
Line 203: result.mutantCoverage = mutantCoverage;
Line 204: this.mutantCoverage = mutantCoverage;
Line 205: this.log.debug(`Collected coverage for ${Object.keys(mutantCoverage.perTest).length} tests`);
Line 230: if (this.mutantCoverage && options.testFilter) { ... }
Line 244: const coveringTests = TestFilter.getTestsForMutant(options.activeMutant, this.mutantCoverage);
Line 247: const testNamePattern = TestFilter.createTestNamePattern(coveringTests);
Line 252: if (!TestFilter.shouldRunAllTests(options.activeMutant, this.mutantCoverage)) { ... }
```

The runner respects the user's `coverageAnalysis` option: `"off"` skips the hook generation + collector; `"perTest"` produces a `mutantCoverage` object on the dry-run result AND uses it per-mutant to filter the test run.

### Finding 1d: README documents perTest as the recommended config

**Evidence:** `README.md` lines 22, 37, 39, 78–86

README-stated features:
- "📊 **Smart Coverage Analysis** - Only run tests that can detect mutations"
- "**Coverage Analysis** - Smart test filtering with perTest coverage"
- "**Test Filtering** - Run only tests that can kill specific mutants"
- "**90% Less Test Runs** with perTest coverage analysis"
- Quick-start `stryker.config.json` example uses `"coverageAnalysis": "perTest"` (not `"off"`)

---

## Finding 2: The GitHub main branch is a v1.0.0 in-progress rewrite with stubbed core logic

**Confidence:** CONFIRMED
**Evidence:** Shallow clone of [menoncello/stryker-mutator-bun-runner](https://github.com/menoncello/stryker-mutator-bun-runner), head commit `7e4ef88` ("Merge pull request #17 from menoncello/feature/story-1.1"). No git tags, no release history on-disk.

### Finding 2a: No `coverage/` directory on main

The main-branch `src/` contains:

```
src/
├── bun-test-runner.ts
├── config/
├── index.ts
├── mutation/
│   ├── index.ts
│   └── mutation-activator.ts
├── plugin.ts
├── process/
├── security/
├── types/
└── utils/
```

`bun-test-runner.ts` imports `CoverageAnalyzer` from `./coverage/index.js` — but no such directory exists in the source tree. This is a forward-looking placeholder.

### Finding 2b: MutationActivator is a `// TODO` stub

**Evidence:** `src/mutation/mutation-activator.ts` lines 39–53

```typescript
public async activateMutation(_mutation: unknown): Promise<void> {
  this.logger.debug('Activating mutation');
  // TODO: Implement mutation activation
}

public async deactivateMutation(_mutation: unknown): Promise<void> {
  this.logger.debug('Deactivating mutation');
  // TODO: Implement mutation deactivation
}
```

The parameter `_mutation` uses the unused-prefix convention (TypeScript lint), confirming the stub status. Installing from this branch would produce a plugin that runs tests but never actually applies mutations — every mutant would appear as "Survived."

### Finding 2c: Capabilities() reports only `reloadEnvironment`

**Evidence:** `src/bun-test-runner.ts` lines 63–67

```typescript
public async capabilities(): Promise<TestRunnerCapabilities> {
  return { reloadEnvironment: true };
}
```

No coverage capability, no mutation-activation capability reported. Stryker's core would disable perTest analysis on a runner that returns only `reloadEnvironment`.

---

## Finding 3: Resolution path

**Confidence:** CONFIRMED

- **Install via npm** (`npm install --save-dev stryker-mutator-bun-runner`) → gets the published 0.4.0 tarball with full perTest implementation
- **Install via GitHub main** (e.g., `npm install github:menoncello/stryker-mutator-bun-runner`) → gets the stub rewrite that would silently fail
- Future-watch: if the plugin publishes its v1.0.0 rewrite to npm before completing `MutationActivator`, the ecosystem's working perTest path would regress. As of 2026-04-19 the published 0.4.0 is the stable functional version

---

## Implications for parent REPORT.md Findings

- **Parent Finding #1** corrected: "coverageAnalysis: 'off'" was an incorrect characterization. 0.4.0 implements `"perTest"` via the four-file `src/coverage/` module
- **Parent Finding #13** resolved: the contradiction between #1's "off" and [stryker-js#5424](https://github.com/stryker-mutator/stryker-js/issues/5424)'s "perTest coverage support" collapses — the upstream-adoption issue was not aspirational marketing; it described shipping functionality in the 0.4.0 npm release
- **Part I economics** (§I.6 in parent report): the bun-runner path's runtime profile is better than initially modeled. The 1.7–2.5× `perTest` speedup of Finding #12 applies to the 0.4.0 runner, not only to the vitest-migration alternative. The runner-swap economic sketch in §I.6 uses the "off" assumption as the primary cost input; that assumption should be revised

---

## Gaps / follow-ups

- Empirical measurement of the 0.4.0 perTest implementation on a real parser-shaped TS suite (the 2–3× process-pool claim is maintainer-self-report; the 90% test-run reduction is calculated from CommonMark-spec-size fixture counts in the Stryker docs, not independent reproductions)
- No snapshot of 0.4.0's stability record: the plugin has no published GitHub Releases, making version-to-version behavior drift hard to bound
- The main-branch rewrite (v1.0.0 WIP) should be tracked; if it reaches completeness and is published, the evidence-file findings would need a refresh

---

## Raw tooling used

```
git clone --depth 1 https://github.com/menoncello/stryker-mutator-bun-runner ~/.claude/oss-repos/stryker-mutator-bun-runner
npm pack stryker-mutator-bun-runner@0.4.0
tar -xzf stryker-mutator-bun-runner-0.4.0.tgz
grep -rn "coverageAnalysis\|perTest\|mutantCoverage\|__stryker__" package/src/
```

No third-party source or documentation was consulted for this resolution — all findings are from direct inspection of the 0.4.0 tarball and the main-branch clone.
