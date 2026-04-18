---
name: Webkit CORS race trace
description: Verified failure mechanism for the 5 webkit-skipped tests in slash-command.e2e.ts. Distinguishes CORS race (3 CORS skips + 1 describe covering accessibility tests) from the unrelated webkit overflow-scroll skip.
sources: packages/app/tests/stress/slash-command.e2e.ts, packages/app/src/components/FileSidebar.tsx, node_modules/playwright/*
collected_at: 2026-04-17
---

# Webkit CORS race — verified failure mechanism

## Symptom

From Playwright output (commit `83f89c2a` CI run, before `02d1985a` describe-block skip):

```
[webkit] › tests/stress/slash-command.e2e.ts:479:3 › slash command —
  accessibility › the menu uses listbox role with labeled options

Error: Uncaught page error: /localhost:13579/api/documents due to
  access control checks.

    at Page.<anonymous> (slash-command.e2e.ts:466:13)

Error: page.reload: Test ended.
Call log:
  - waiting for navigation until "networkidle"
    - navigated to "http://localhost:13579/#/test-doc"
```

## Causal chain (verified, three layers)

1. **Test setup.** `resetEditor()` (line 22-36 of `slash-command.e2e.ts`) calls `page.reload({ waitUntil: 'networkidle' })` after `POST /api/test-reset`.

2. **React mount triggers fetch.** On reload, `FileSidebar` re-mounts and fetches `GET /api/documents` to populate the file tree. This is a same-origin fetch (port 13579 for both page and API).

3. **Webkit headless policy.** WebKit's headless CORS implementation is stricter than Chromium/Firefox. Under Playwright, WebKit treats same-origin fetches during the page-lifecycle transition window as "cross-origin" with a **null origin**, emitting:
   > "fetched URL/api/documents due to access control checks"

   This is documented upstream behavior, not a code defect. Evidence:
   - [Playwright issue #32429 — Tests with "webkit" fails with Headless mode](https://github.com/microsoft/playwright/issues/32429)
   - [Playwright issue #12975 — WebKit forces HTTPS on localhost](https://github.com/microsoft/playwright/issues/12975)
   - [Playwright issue #4031 — Access-Control-Allow-Origin issue](https://github.com/microsoft/playwright/issues/4031)

4. **`pageerror` listener throws.** The describe block's `beforeEach` installs:
   ```typescript
   page.on('pageerror', (e) => {
     throw new Error(`Uncaught page error: ${e.message}`);
   });
   ```
   The webkit CORS error reaches this listener, the thrown Error propagates into the current test step, and `page.reload` is aborted mid-flight with "Test ended".

## Fix options (analysis, not decisions)

### Option A — Change `waitUntil`

Replace `waitUntil: 'networkidle'` with `waitUntil: 'domcontentloaded'` + an explicit app-ready signal (e.g. `waitForFunction(() => window.__activeProvider?.synced === true)` — the `__activeProvider` hook is already DEV-gated in `DocumentContext.tsx:218`).

- **Pro:** Removes the race at the source. `domcontentloaded` fires before the fetch resolves, so page.reload completes regardless of webkit's CORS verdict on the in-flight fetch.
- **Pro:** Composes with G1 — the "provider ready" signal is exactly the kind of event-coupled primitive G1 promotes.
- **Con:** Doesn't suppress the `pageerror`. The `beforeEach(pageerror)` listener would still throw during the transition. So Option A alone is insufficient.

### Option B — Filter the benign error in pageerror

Replace the unconditional `throw` in the `pageerror` listener with a filter that ignores the webkit CORS message. This is the pattern already established in `crdt-stress.e2e.ts:98-107` for the WebSocket reconnect error.

- **Pro:** Direct, surgical. Exact match to an existing precedent.
- **Con:** Silences a class of error. If the FileSidebar fetch genuinely breaks in a new way on webkit, we'd filter that too.
- **Mitigation:** Tie the filter to an explicit message substring (`'access control checks'`) rather than a broad pattern.

### Option C — Both

Combine A (fix the race at its source so the error is rare) + B (filter any residual occurrence so the `pageerror` listener doesn't trip even on a stray instance). **This is the evidence-based recommendation.**

- A addresses the root cause (race between networkidle and the CORS-rejected fetch).
- B provides a safety net for the same class of error on any path we didn't enumerate.
- Together: webkit coverage restored with defense in depth; pattern matches the existing WebSocket filter (precedent-aligned).

## The 4th skip at line 713 — NOT in scope

`slash-command.e2e.ts:713` — "menu repositions when editor container is scrolled". Different failure:
- Webkit's `getComputedStyle(el).overflowY` detection behaves differently; popup y-coordinate delta after scroll fails `toBeGreaterThan`.
- This is a CSS-layout rendering difference, not a CORS race.
- Separate investigation required. Out of scope for this spec. Listed in §15 Future Work (Identified tier).

## Blast radius of the fix

If Options A + C land together:
- `resetEditor()` in `slash-command.e2e.ts`: `waitUntil` and `beforeEach(pageerror)` both change.
- Similar `page.reload({ waitUntil: 'networkidle' })` calls elsewhere need audit:
  - `grep -rn "waitUntil: 'networkidle'" packages/app/tests/stress/` — need to run this audit as part of Phase 4. If other files use the same pattern, they should migrate too.
