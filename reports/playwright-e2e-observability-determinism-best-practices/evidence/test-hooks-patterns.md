# Evidence: Test Hooks vs. DOM Signals + Gating Patterns

**Dimension:** 2 (test hooks vs. DOM signals — when to prefer which)
**Date:** 2026-04-17
**Sources:** Playwright GitHub discussions, Vite env-and-mode docs, OSS project patterns

---

## Key files / pages referenced

- [Vite — Env Variables and Modes](https://vite.dev/guide/env-and-mode) — `import.meta.env.DEV` tree-shaking behavior
- [Playwright Issue #31576 — resolve environment variables in Playwright tests for React/Vite](https://github.com/microsoft/playwright/issues/31576)
- OSS patterns: BlockNote `window.__TEST_OPTIONS`, Milkdown `window.__getMarkdown__` etc. (see `oss-config-survey.md`)
- Repo precedent: `packages/app/src/editor/DocumentContext.tsx:217` — `import.meta.env.DEV` gated hooks

---

## Findings

### Finding: `import.meta.env.DEV` is statically replaced + tree-shaken by Vite

**Confidence:** CONFIRMED
**Evidence:** [Vite Env Variables and Modes](https://vite.dev/guide/env-and-mode):
> "Vite exposes certain constants under the special import.meta.env object. These constants are defined as global variables during dev and statically replaced at build time to make tree-shaking effective."
>
> "code inside `if (import.meta.env.DEV)` being tree-shaken in production builds"

Verified by our own precedent in `DocumentContext.tsx:217` (per the clipboard-mdast-canonical spec's investigation — the code comment explicitly states "Vite replaces this statically at build time, so the entire branch tree-shakes out of the production bundle").

**Implications:**
- `if (import.meta.env.DEV) { window.__test_xxx = ... }` is the correct gating pattern for test hooks in a Vite codebase.
- The hook is present in dev + playwright runs; absent in production bundles.
- Any other gate (e.g., `process.env.NODE_ENV === 'development'`) does NOT tree-shake as cleanly and should be avoided in favor of `import.meta.env.DEV` in Vite projects.

### Finding: Test hooks are appropriate when no DOM signal captures the condition

**Confidence:** INFERRED
**Evidence:** Community + OSS practice converges:

**Prefer DOM signal when:**
- The condition is user-observable (visible element, ARIA state, role, text content).
- A data-attribute on the element could expose the state (`data-ok-status="synced"`, `data-ready="true"`).
- A web-first assertion (`expect(locator).toBeVisible()`, etc.) matches the shape.

**Prefer test hook when:**
- The condition is NOT DOM-reachable (CRDT state, provider synced flag, internal debounce timer completion).
- A DOM signal would require adding a DOM mutation the user doesn't need.
- The hook encapsulates state that's already managed by React / Y.js / WebSocket — and exposing it via DOM would be incidental complexity.

**Examples from our own codebase:**
- Our `window.__activeProvider` hook (DEV-gated) exposes the HocuspocusProvider's `.status` and `.synced` — both are page-internal state with no natural DOM counterpart. **Test hook is correct.**
- A hypothetical "slash menu is rendered" check could use a DOM signal (`[role="listbox"]` element present). **DOM signal is correct.**
- A hypothetical "slash menu filter has settled" check could use either a data attribute on the menu (`data-filter-query="heading"`) or a `waitForFunction` that reads page state. **Data attribute likely cleaner; reduces the hook surface.**

### Finding: Milkdown exposes test hooks unconditionally (non-gated)

**Confidence:** CONFIRMED
**Evidence:** `~/.claude/oss-repos/milkdown/e2e/tests/misc/index.ts` — `window.__getMarkdown__()`, `window.__setMarkdown__()`, `window.__view__`, `window.__milkdown__`, `window.__crepe__`, `window.__macros__` all exposed in the built artifact (no env-gating).

**Implications:**
- Milkdown's approach works but ships test-only API in production. This is an intentional trade-off — test hooks double as a public-ish API for embedders.
- Our approach (DEV-gating) is stricter and safer. No need to revisit.

### Finding: BlockNote injects test globals at page-init time via Playwright fixture

**Confidence:** CONFIRMED
**Evidence:** `~/.claude/oss-repos/blocknote/tests/setupScript.ts` + the fixture that uses `context.addInitScript(...)` to run code before page scripts execute.

**Implications:**
- An alternative pattern: the test harness (Playwright) injects the hook into the page, rather than the app code exposing it.
- Advantages: zero production-bundle footprint, no gating needed.
- Disadvantages: the hook only sees what the app code exposes to the page context (e.g., needs `window.__foo = ...` somewhere the fixture can override); harder to expose *internal* React/CRDT state without cooperation from app code.
- For reactive / internal state (provider sync, CRDT readiness), the DEV-gated in-app pattern (our precedent) is cleaner. For test-data seeding or mock responses, the `addInitScript` pattern is cleaner.

### Finding: Data-attributes are a first-class signal per Playwright best practices

**Confidence:** CONFIRMED
**Evidence:** [Playwright Best Practices](https://playwright.dev/docs/best-practices) — implicitly via the locator recommendations:
> Use roles, labels, placeholders, text content — and `data-testid` for anything else.

More broadly, the "data-* as a test-visible state surface" pattern is ubiquitous (React Testing Library, Cypress, Playwright). `data-state="loading" | "ready" | "error"` on a root element is a direct, robust signal.

**Implications:**
- For component-level readiness, a `data-*` attribute is the lowest-ceremony signal:
  - Zero production cost (Data attributes are part of the HTML contract already).
  - Available to `page.waitForFunction` and `expect(locator).toHaveAttribute()`.
  - Self-documenting — the attribute name is the API.
- Before introducing a new `window.__test_*` hook, ask: could a `data-*` attribute expose the same state?

---

## Negative searches

- Searched for "community consensus on the hook vs. DOM boundary": **NOT FOUND** as a single canonical article. The guidance is distributed across multiple sources + project patterns.

---

## Gaps / follow-ups

- Did not find a widely-cited blog post "test hooks vs. data-attributes" that formalizes the boundary. It's largely an experience-based decision. Our spec can formalize the decision rule for our project.
