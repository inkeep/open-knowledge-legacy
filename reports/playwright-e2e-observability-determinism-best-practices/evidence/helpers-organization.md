# Evidence: Shared Helper Organization Patterns

**Dimension:** 9 (helper extraction patterns across OSS Playwright suites)
**Date:** 2026-04-17
**Sources:** Playwright docs, community guides, OSS project patterns

---

## Key files / pages referenced

- [Playwright Fixtures docs](https://playwright.dev/docs/test-fixtures) — `test.extend` API
- [Playwright Page Object Models docs](https://playwright.dev/docs/pom)
- [Murat Ozcan — Page Objects vs. Functional Helpers (DEV)](https://dev.to/muratkeremozcan/page-objects-vs-functional-helpers-2akj) — community analysis
- [Checkly — Improve Playwright Tests with POMs and Fixtures](https://www.checklyhq.com/blog/page-object-models-and-fixtures-with-playwright/)
- [Elio Navarrete — 12 Playwright Best Practices 2026](https://elionavarrete.com/blog/e2e-best-practices-playwright.html)
- OSS patterns: Milkdown (functional), BlockNote + GitButler + Plasmic (fixture), Cline (POM class) — see `oss-config-survey.md`

---

## Findings

### Finding: Three dominant patterns — functional helpers, test.extend fixtures, POM class

**Confidence:** CONFIRMED
**Evidence:** Cross-referencing OSS survey + docs:

| Pattern | Shape | When it fits |
|---|---|---|
| **Functional helpers** | `await focusEditor(page)`, `await getMarkdown(page)` — discrete `async` functions that take `page` | Small-to-medium suites (~5-20 files). Flat, discoverable. Milkdown uses this. |
| **`test.extend` fixtures** | `const test = base.extend<Fixtures>({ editor: async ({ page }, use) => { /* setup */; await use(editorObj); /* teardown */ } })` | Mid-size suites (~15-40 files). Composes with Playwright's own lifecycle (setup/teardown, per-test scoping). BlockNote, GitButler, Plasmic use this. |
| **POM class** | `class Editor { constructor(page); async focus(); async getMarkdown(); }` | Larger suites (40+ files). Encapsulates complex workflows and state. Cline uses this for VS Code integration. |

**Implications:**
- For OK (~10-12 E2E files, likely growing to ~15-20), **functional helpers are the right size**. `test.extend` becomes appropriate around 20-30 files; we're not there yet.
- The size trigger isn't about what "feels object-oriented" — it's about whether per-test setup/teardown benefits from Playwright's fixture lifecycle. For condition waits specifically (`waitForSlashMenuOpen(page)`), there's no per-test state to manage.

### Finding: Fixtures win when setup/teardown is per-test; functional helpers win when they're pure

**Confidence:** CONFIRMED
**Evidence:** [Murat Ozcan](https://dev.to/muratkeremozcan/page-objects-vs-functional-helpers-2akj):
> "Function helpers are suitable for one functionality test cases. However, when actions span multiple pages, creating separate methods for different items (like createAItem, createBItem, createCItem) seems easier to be done in terms of different classes."

[Playwright Fixtures docs](https://playwright.dev/docs/test-fixtures):
> "Custom fixtures let you encapsulate setup and teardown logic — authenticated sessions, test data creation, API state — so that test specs remain focused on behavior verification."

**Implications:**
- Condition waits = pure functions (given `page`, wait until condition holds). **Functional helpers.**
- Per-test doc seeding = setup/teardown = **fixture** (though this is playwright-stability spec's scope, not ours).
- Our G1 helpers (`waitForSlashMenuOpen`, `waitForProviderSynced`, etc.) are pure — functional is the right container.

### Finding: The community recommends combining patterns when the suite grows

**Confidence:** CONFIRMED
**Evidence:** [Kailash Pathak — Scalable Tests with Fixtures + POM](https://kailash-pathak.medium.com/building-scalable-playwright-tests-with-fixtures-and-page-object-model-f505504dde9a):
> "Fixtures are used to set up helper methods or provide access to the POM instance for the test. Fixtures and POMs help us to encapsulate reusable code."

[Checkly](https://www.checklyhq.com/blog/page-object-models-and-fixtures-with-playwright/): "Use fixtures to instantiate POMs; use POMs to encapsulate interactions."

**Implications:**
- The "grown-up" pattern when OK eventually hits ~30 E2E files: fixtures carry POM instances.
- For now (G1's scope), functional helpers are enough. We can promote to fixtures + POMs later without throwing away the functions — they'll become the POM method bodies.

### Finding: The right helper-file location is `tests/stress/_helpers/` (or similar leading-underscore)

**Confidence:** INFERRED (community convention)
**Evidence:** Multiple projects use a leading-underscore or `fixtures/` / `_helpers/` folder to co-locate helpers with the tests they serve. Playwright's `testMatch` by default ignores leading-underscore dirs, so helpers don't show up as test files.

Our baseline `playwright.config.ts` has `testMatch: /.*\.e2e\.ts$/` — so the pattern naturally excludes non-`.e2e.ts` files anyway. A `_helpers/` folder at `tests/stress/_helpers/` is clean and matches community conventions.

**Implications:**
- Recommended structure for OK:
  ```
  packages/app/tests/stress/
  ├── _helpers/
  │   ├── slash-menu.ts      — waitForSlashMenuOpen, waitForSlashMenuFiltered, etc.
  │   ├── editor-state.ts    — waitForEditorReady, waitForEditorEmpty
  │   ├── provider.ts        — waitForProviderSynced, waitForProviderConnected
  │   └── error-filters.ts   — filterBenignWebkitErrors, filterWebSocketReconnect
  ├── slash-command.e2e.ts
  ├── crdt-stress.e2e.ts
  └── ...
  ```
- Each helper file exports typed, documented functions. Tests import them directly.

---

## Negative searches

- Searched for a Playwright-official recommendation on "when to use fixtures vs functions": **NOT FOUND** as a normative doc. The guidance is pattern-by-example, not prescriptive.

---

## Gaps / follow-ups

- None for this dimension.
