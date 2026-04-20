# Evidence: A2 + A3 — Prior art on Playwright webServer isolation

**Dimensions:** A2 (Hocuspocus consumers), A3 (Next.js / SvelteKit / Remix / tldraw)
**Date:** 2026-04-18
**Sources:** Local OSS clones + GitHub primary sources

---

## A2 — Hocuspocus consumer Playwright patterns

| Project | E2E framework | Server strategy | Port | Notes |
|---|---|---|---|---|
| **Hocuspocus (own tests)** | AVA | **Per-test server, port 0 (OS-allocated)** | Dynamic | `~/.claude/oss-repos/hocuspocus/tests/utils/newHocuspocus.ts:1-39` |
| **Outline** | Jest (no Playwright) | Per-test TestServer, port 0 | Dynamic | `~/.claude/oss-repos/outline/server/test/TestServer.ts:16-26` |
| **Tiptap** | Cypress | **Shared static server on port 3000** | Hardcoded | `~/.claude/oss-repos/tiptap/tests/cypress.config.js:1-13` |
| **Docmost** | NestJS boilerplate (no real E2E) | N/A | N/A | E2E test file is unused |
| **Slate-yjs** | Vitest (unit only) | N/A | N/A | No E2E |
| **BlockSuite** | (not a Hocuspocus consumer) | — | — | Grep: 0 hits for `hocuspocus` |

**Key finding: No Hocuspocus consumer uses Playwright E2E with per-worker server isolation.** The closest equivalent is Hocuspocus's own AVA-based test harness which spawns per-test (finer granularity than per-worker). Tiptap uses Cypress with a shared hardcoded port.

**Source:** Hocuspocus's own `newHocuspocus.ts`:

```ts
// ~/.claude/oss-repos/hocuspocus/tests/utils/newHocuspocus.ts
const server = new Server({
  quiet: true,
  port: 0,  // OS-allocated random port
  stopOnSignals: false,
  ...options
});
// per-test teardown closes connections + shuts down HTTP server
```

This is the canonical pattern in the Hocuspocus ecosystem.

---

## A3 — Framework Playwright prior art

### Next.js (vercel/next.js, 130k+ stars)

**Does NOT use Playwright** for internal e2e. Uses Jest + bespoke `NextInstance` abstraction.

Source: [contributing/core/testing.md](https://github.com/vercel/next.js/blob/canary/contributing/core/testing.md):
> *"A local version of Next.js will be created inside your system's temp folder (e.g. /tmp), which is then linked to an isolated version of the application. A server is started on a random port, against which the tests will run. After all tests have finished, the server is destroyed and all remaining files are deleted from the temp folder."*

Implementation: [`test/lib/e2e-utils/index.ts`](https://github.com/vercel/next.js/blob/canary/test/lib/e2e-utils/index.ts) — `nextTestSetup()` factory with `NextDevInstance`/`NextStartInstance`/`NextDeployInstance` variants.

**Takeaway:** Next.js concluded Playwright's `webServer` was insufficient for isolation and built a per-test-file abstraction owning a full Next install per test suite. Strongest precedent for per-worker-or-stricter isolation.

---

### SvelteKit (sveltejs/kit, 18k+ stars)

**Uses shared `webServer`** — per-feature-dir, not per-worker.

Source: [packages/kit/test/utils.js:282-289](https://github.com/sveltejs/kit/blob/main/packages/kit/test/utils.js#L282-L289):
```ts
export const config = defineConfig({
  webServer: {
    command: process.env.DEV ? 'pnpm dev --force' : 'pnpm build && pnpm preview',
    port: process.env.DEV ? 5173 : 4173
  },
  workers: process.env.CI ? 2 : number_from_env('KIT_E2E_WORKERS', undefined),
});
```

Each SvelteKit *feature test* (`packages/kit/test/apps/{basics,amp,async,dev-only,embed,...}`) has its own app directory + its own `playwright.config.js` extending the shared config with `webServer.command`/`port` overrides.

**Takeaway:** SvelteKit accepts cross-worker contamination because their E2E surface is mostly render + routing — no backend state to leak. One server per feature dir, not per worker.

---

### React Router v7 (remix-run/react-router, 54k+ stars)

**Per-TEST server spawn** (stronger than per-worker). **No `webServer` config at all.**

Source: [integration/playwright.config.ts](https://github.com/remix-run/react-router/blob/main/integration/playwright.config.ts):
```ts
const config: PlaywrightTestConfig = {
  testDir: ".",
  testMatch: ["**/*-test.ts"],
  build: { external: ["**/packages/**/*"] },
  fullyParallel: true,
  workers,
  // NO webServer
  projects: [{ name: "chromium" }, { name: "webkit" }, { name: "msedge" }, { name: "firefox" }],
};
```

Each test calls `createFixture()` in [integration/helpers/create-fixture.ts](https://github.com/remix-run/react-router/blob/main/integration/helpers/create-fixture.ts), which:
1. Scaffolds Vite template into `.tmp/integration/<unique>`
2. Calls `getPort()` (npm `get-port`) for kernel-assigned random port
3. Calls `cross-spawn` for child process
4. Awaits stdout regex before accepting
5. Returns a teardown function the test invokes in `afterAll`

**Takeaway:** Closest match to per-worker goal. React Router went even further (per-test) because each test scaffolds a different Vite app shape. The `spawnTestServer` + `getPort` + tmpdir pattern ports directly into a `scope: 'worker'` fixture.

---

### tldraw (tldraw/tldraw, 40k+ stars)

**Requires external pre-existing dev server.**

Source: [apps/examples/e2e/playwright.config.ts](https://github.com/tldraw/tldraw/blob/main/apps/examples/e2e/playwright.config.ts) — no `webServer` entry; `baseURL: 'http://localhost:5420'` commented out. `global-setup.ts` is trivial. Users run `pnpm dev` separately before `pnpm e2e`.

Test fixtures are **page-object pattern** (`Toolbar`, `MainMenu`), not server-lifecycle fixtures. State isolation via `page.evaluate(() => window.tldrawApi.reset())` in-browser.

**Takeaway:** tldraw's editor is mostly client-side; cross-worker contamination is a non-issue.

---

## Cross-framework summary table

| Framework | Test runner | `webServer`? | Per-worker isolation? | State strategy |
|---|---|---|---|---|
| **Next.js** | Jest | N/A | Per-test tmpdir + random port | Full app scaffold in `os.tmpdir()` |
| **SvelteKit** | Playwright | Yes, shared | No | Per-feature-dir tmpdir; workers share server |
| **React Router v7** | Playwright | **No** | **Per-test** (stronger than per-worker) | `get-port` + `cross-spawn` in `.tmp/integration/` |
| **tldraw** | Playwright | No (external) | N/A | Client-side reset via `page.evaluate` |
| **Hocuspocus (own)** | AVA | N/A | Per-test | Port 0 OS-allocated |
| **Tiptap** | Cypress | Static shared | No | No per-worker isolation |
| **Outline** | Jest (no Playwright) | N/A | Per-test | Port 0 OS-allocated |

---

## Observations

1. **Per-test isolation is strongly precedented** — React Router, Next.js, Hocuspocus's own tests, Outline all run per-test or per-test-suite.
2. **Per-worker isolation is a new position in this space** — sits between per-test (strongest, proven) and shared-webServer (weakest, simplest). No direct precedent, but derivable by taking React Router's per-test pattern and scoping it to `worker`.
3. **`webServer` removal is a documented primary-source pattern** — React Router proves it. Not all Playwright setups use `webServer`.
4. **Hocuspocus ecosystem has ZERO Playwright + per-worker precedents.** Consumer is first here.
