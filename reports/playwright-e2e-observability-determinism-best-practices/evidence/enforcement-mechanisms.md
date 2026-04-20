# Evidence: Enforcing `waitForTimeout` Bans Mechanically

**Dimension:** 8 (enforcement)
**Date:** 2026-04-17
**Sources:** eslint-plugin-playwright docs, biome Playwright rule PR, community guides

---

## Key files / pages referenced

- [`eslint-plugin-playwright/no-wait-for-timeout`](https://github.com/playwright-community/eslint-plugin-playwright/blob/main/docs/rules/no-wait-for-timeout.md) — official rule docs
- [`eslint-plugin-playwright` npm page](https://www.npmjs.com/package/eslint-plugin-playwright)
- [BrowserStack — Setting Up ESLint for Playwright Projects 2026](https://www.browserstack.com/guide/playwright-eslint)
- [`biomejs/biome` PR #8960 — add Playwright ESLint rules](https://github.com/biomejs/biome/pull/8960)
- [`eslint-plugin-playwright/no-useless-await`](https://github.com/playwright-community/eslint-plugin-playwright/blob/main/docs/rules/no-useless-await.md)
- [`missing-playwright-await`](https://github.com/playwright-community/eslint-plugin-playwright/blob/main/docs/rules/missing-playwright-await.md)
- [`no-wait-for-selector`](https://github.com/mskelton/eslint-plugin-playwright/blob/main/docs/rules/no-wait-for-selector.md)

---

## Findings

### Finding: `eslint-plugin-playwright` is the canonical first-party lint ruleset

**Confidence:** CONFIRMED
**Evidence:** [eslint-plugin-playwright on npm](https://www.npmjs.com/package/eslint-plugin-playwright) is the `playwright-community` official plugin. Includes rules that "flag issues like unsafe locators, missing awaits on Playwright actions and incorrect usage of test functions."

Relevant rules:
- `no-wait-for-timeout` — **the rule that directly enforces our G1 goal**
- `no-wait-for-selector` — discourages legacy low-level API
- `no-useless-await` — flags `await` on things that don't return promises
- `missing-playwright-await` — flags missing `await` on Playwright actions
- `no-page-pause` — flags `page.pause()` left in code
- `no-element-handle` — discourages ElementHandle in favor of Locator

**Implications:**
- There's a first-class lint rule that implements exactly what our STOP-rule would do.
- Deploying `eslint-plugin-playwright` with the `recommended` preset enforces several of these automatically.

### Finding: The `no-wait-for-timeout` rule flags `page.waitForTimeout()` calls directly

**Confidence:** CONFIRMED (verified via direct fetch of raw rule doc)
**Evidence:** The [rule doc](https://github.com/playwright-community/eslint-plugin-playwright/blob/main/docs/rules/no-wait-for-timeout.md) — title and body (full text verified by `curl`):

> **Disallow usage of `page.waitForTimeout` (`no-wait-for-timeout`)**
>
> Example of **incorrect** code: `await page.waitForTimeout(5000)`
>
> Examples of **correct** code:
> ```javascript
> // Use signals such as network events, selectors becoming visible and others instead.
> await page.waitForLoadState()
> await page.waitForURL('/home')
> await page.waitForFunction(() => window.innerWidth < 100)
> ```

The "anti-pattern" framing appears in community guides ([BrowserStack](https://www.browserstack.com/guide/playwright-wait-types), [Laichenkov — 17 Playwright mistakes](https://elaichenkov.github.io/posts/17-playwright-testing-mistakes-you-should-avoid/)) but is not prose in the rule doc itself.

**Implications:**
- Enabling this rule at `error` severity fails the lint step on any new `waitForTimeout`. Any existing occurrences need to be migrated before the rule can be adopted.
- Alternative: run the rule at `warn` severity first to surface existing occurrences, then migrate and flip to `error`.

### Finding: Biome ships native Playwright lint rules today (PR #8960 merged 2026-02-16)

**Confidence:** CONFIRMED (direct fetch of PR page)
**Evidence:** [`biomejs/biome` PR #8960](https://github.com/biomejs/biome/pull/8960) merged into `biomejs:main` on 2026-02-16 by @dyc3. The PR migrates 11 Playwright-specific linting rules from `eslint-plugin-playwright`, including `noPlaywrightWaitForTimeout` — "Disallows `waitForTimeout`" with a diagnostic note about web-first assertions. Available in Biome v2.4.2+ as a nursery rule. Documented at https://biomejs.dev/linter/rules/no-playwright-wait-for-timeout/.

**Implications:**
- Biome Playwright rules are NO LONGER a future option — they ship today.
- Three viable paths (updated):
  - **Option A — Biome native (nursery):** Enable `lint.rules.nursery.noPlaywrightWaitForTimeout` in `biome.jsonc`. Zero new deps if Biome is already the linter. Caveat: nursery rules are marked experimental — default severity is conservative and may change across Biome versions.
  - **Option B — `eslint-plugin-playwright`:** Add ESLint alongside Biome for E2E files. Biome stays primary for non-test code; ESLint is specific to `tests/stress/*.e2e.ts`. Gets a broader Playwright ruleset beyond just `waitForTimeout`.
  - **Option C — Hand-rolled grep test:** Write a `.test.ts` that greps the E2E directory for `waitForTimeout` and fails if found. Simple, stable, no new dep. Matches existing repo precedent (`wysiwyg-stop-rule.test.ts`).

### Finding: A custom test-time grep guard is a precedent in this repo

**Confidence:** CONFIRMED
**Evidence:** `packages/app/src/editor/clipboard/wysiwyg-stop-rule.test.ts` (referenced in CLAUDE.md precedent #19(b) — clipboard pipeline STOP rule):
> "Other STOP rules in this codebase are enforced mechanically (e.g. `syncTextToFragment` was deleted, `schema-invariant.test.ts` guards schema narrowing). This test converts the prose rule into a grep-based assertion so regressions fail CI instead of relying on reviewer vigilance."

**Implications:**
- There's a repo-local precedent for "grep for an anti-pattern, fail the test if found."
- Replicating that pattern for `waitForTimeout` in E2E tests is low-cost, self-contained, and fits the existing convention.

### Finding: Options comparison

**Confidence:** INFERRED (based on properties of each)

| Option | Pros | Cons |
|---|---|---|
| Add `eslint-plugin-playwright` | First-class lint rule; gets all related Playwright rules for free | Adds ESLint dependency alongside Biome; two linters to maintain; ESLint needs its own config |
| Wait for Biome PR #8960 | Zero new deps; native integration when landed | Waiting on upstream; timing uncertain |
| Custom grep-based `.test.ts` | Minimal code; matches existing STOP-rule precedent; no new dep | Hand-rolled; less expressive than a real linter; doesn't catch related patterns |
| Shell-based `bun run check` hook | Very simple | Lives outside the test framework; less discoverable |

---

## Negative searches

- Searched for a native Biome Playwright rule already shipped in a stable (non-nursery) form: **NOT FOUND.** The rule ships as a nursery rule; nursery rules are opt-in and may change.

---

## Gaps / follow-ups

- Confirm whether `noPlaywrightWaitForTimeout` will graduate from nursery to a stable rule group in an upcoming Biome version. Graduation would change the severity defaults and likely simplify adoption.
