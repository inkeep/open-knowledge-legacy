# Evidence: A1 — Playwright worker-scoped fixture mechanics

**Dimension:** A1 — Can `webServer` be replaced with worker-scoped fixtures?
**Date:** 2026-04-18
**Sources:** playwright.dev official docs (primary)

---

## Findings

### Finding A1-1: Worker-scoped fixture syntax — tuple form

**Confidence:** CONFIRMED
**Evidence:** [playwright.dev/docs/test-fixtures](https://playwright.dev/docs/test-fixtures)

Canonical shape:
```ts
export const test = base.extend<TestFixtures, WorkerFixtures>({
  // test-scoped fixture (first generic)
  page: async ({ page, account }, use) => { /* ... */ },

  // worker-scoped fixture (second generic)
  account: [
    async ({ browser }, use, workerInfo) => {
      const username = 'user' + workerInfo.workerIndex;
      // ... setup
      await use({ username });
    },
    { scope: 'worker' }  // ← tuple with scope
  ],
});
```

Key mechanics:
- `test.extend<TestFixtures, WorkerFixtures>()` — test-scoped in first generic, worker-scoped in second
- Fixture value is a tuple `[asyncFn, { scope: 'worker' }]`
- Async function receives `workerInfo` as third argument

---

### Finding A1-2: `webServer` is OPTIONAL, not required for any feature

**Confidence:** CONFIRMED (empirical from React Router repo)
**Evidence:** [playwright.dev/docs/test-webserver](https://playwright.dev/docs/test-webserver), [remix-run/react-router integration/playwright.config.ts](https://github.com/remix-run/react-router/blob/main/integration/playwright.config.ts)

Docs: *"Playwright comes with a `webServer` option in the config file which gives you the ability to launch a local dev server before running your tests."*

Docs do NOT state `webServer` is required for any feature.

**React Router's `integration/playwright.config.ts`** has NO `webServer` entry at all. Server spawning is moved to a per-test fixture `spawnTestServer()` in `integration/helpers/create-fixture.ts`, which:
1. Scaffolds a Vite template into `.tmp/integration/<unique>`
2. Calls `getPort()` (npm `get-port`) for a kernel-assigned random port
3. Calls `cross-spawn` for the child process
4. Awaits a regex match on stdout before accepting

**Implication:** `webServer` and worker-scoped fixtures are complementary. Either alone or both together work. React Router proves `webServer` can be removed entirely and replaced with fixture-driven server spawning.

---

### Finding A1-3: Worker reuse across test files

**Confidence:** CONFIRMED
**Evidence:** [playwright.dev/docs/test-parallel](https://playwright.dev/docs/test-parallel)

> *"Playwright Test reuses a single worker as much as it can to make testing faster, so multiple test files are usually run in a single worker one after another."*
> *"Workers are always shutdown after a test failure to guarantee pristine environment for following tests."*

**Implications for worker-scoped fixtures:**
- Same worker running test-file-A then test-file-B does NOT re-run the worker fixture between files — the fixture persists for the worker's lifetime
- A test failure forces a fresh worker, which re-runs the fixture setup
- `fullyParallel: true` parallelizes tests within a file across multiple workers — it does NOT change worker-reuse across files

For a per-worker Vite+Hocuspocus server, this means **one cold-start per worker, not per file**. Cost amortizes over multiple test files.

---

### Finding A1-4: `workerInfo.workerIndex` + `parallelIndex` for unique resources

**Confidence:** CONFIRMED
**Evidence:** [playwright.dev/docs/api/class-workerinfo](https://playwright.dev/docs/api/class-workerinfo)

From docs:
> **workerIndex** — *"The unique index of the worker process that is running the test. When a worker is restarted, for example after a failure, the new worker process gets a new unique `workerIndex`."* Also exposed as `process.env.TEST_WORKER_INDEX`.
> **parallelIndex** — *"The index of the worker between `0` and `workers - 1`. It is guaranteed that workers running at the same time have a different `parallelIndex`."* Exposed as `process.env.TEST_PARALLEL_INDEX`.

**Canonical pattern** (from docs): `const port = 3000 + workerInfo.workerIndex;`

**Safety consideration:** For long-running suites with many retries, `workerIndex` is monotonically increasing. For bounded port ranges, prefer `parallelIndex` (always 0..workers-1). For truly unique resources (tmpdirs, DB prefixes), prefer `workerIndex` OR collision-safe allocation via `get-port`.

---

### Finding A1-5: Worker-scoped fixture teardown ordering

**Confidence:** CONFIRMED
**Evidence:** Fixtures doc

> *"Worker-scoped fixtures are only torn down when the worker process executing tests is torn down."*

Details:
- Teardown runs when (a) worker completes all assigned tests naturally, OR (b) worker killed after a test failure (teardown still runs for in-scope fixtures on graceful exit; a crashed worker may skip teardown)
- Within a worker, fixture teardown is **reverse of setup order** — later fixtures tear down first
- Worker-scoped fixtures have their own timeout (default = test timeout)

**Implication:** A worker-scoped Vite+Hocuspocus server will be torn down once per worker at end-of-suite. If the server owns files in a tmpdir, cleanup must handle async completion.
