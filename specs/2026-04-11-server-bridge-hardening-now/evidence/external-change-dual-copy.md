---
title: "external-change.ts and standalone.ts applyToDoc are a drifted dual-copy"
type: raw-proof
sources:
  - packages/server/src/external-change.ts
  - packages/server/src/standalone.ts
  - packages/app/tests/integration/test-harness.ts
  - packages/app/tests/integration/bridge-matrix.test.ts
  - packages/app/src/server/hocuspocus-plugin.ts
created: 2026-04-11
baseline-commit: 2d35736
---

## TLDR

`external-change.ts` was *extracted* to prevent drift between two near-identical disk→CRDT bridge implementations, but `standalone.ts` was never updated to use it. The CLI production path still has its own inline `applyToDoc` copy (standalone.ts:177-205). The two copies have already drifted in small ways. The PROJECT.md S1 premise — "tests for `external-change.ts` close the highest-blast-radius data-integrity gap because bridge-matrix only exercises it indirectly" — is based on a mistaken model: **bridge-matrix tests the CLI copy in `standalone.ts`, not `external-change.ts`**. Testing `external-change.ts` closes a dev-mode correctness gap, not the production data-integrity gap.

## Detail

### Evidence: `external-change.ts` is only called from the Vite dev plugin

**CONFIRMED** — `grep "createExternalChangeHandler"` across the repo:

```
packages/server/src/external-change.ts:31  // definition
packages/app/src/server/hocuspocus-plugin.ts:15  // import
packages/app/src/server/hocuspocus-plugin.ts:196 // call site
packages/server/src/index.ts:14  // barrel export
```

Zero references from `standalone.ts` or anywhere in the CLI code path.

### Evidence: `standalone.ts` has its own inline copy

**CONFIRMED** — `packages/server/src/standalone.ts:177-205`:

```typescript
/** Apply markdown content to Y.Doc with skipStoreHooks. */
function applyToDoc(docName: string, content: string): void {
  const document = hocuspocus.documents.get(docName);
  if (!document) return;
  const { frontmatter, body } = stripFrontmatter(content);
  const parsedJson = mdManager.parse(body);
  const pmNode = schema.nodeFromJSON(parsedJson);
  const xmlFragment = document.getXmlFragment('default');

  document.transact(
    () => {
      const meta = { mapping: new Map(), isOMark: new Map() };
      updateYFragment(document, xmlFragment, pmNode, meta);
      const metaMap = document.getMap('metadata');
      metaMap.set('frontmatter', frontmatter);

      const ytext = document.getText('source');
      const currentText = ytext.toString();
      if (currentText !== content) {
        ytext.delete(0, currentText.length);
        ytext.insert(0, content);
      }
    },
    {
      source: 'local',
      skipStoreHooks: true,
      context: { origin: 'file-watcher' },
    } satisfies LocalTransactionOrigin,
  );
}
```

### Diff between the two copies

| Property | `external-change.ts` (dev mode) | `standalone.ts applyToDoc` (CLI) |
|---|---|---|
| Body shape (stripFrontmatter, parse, transact, updateYFragment, metaMap, ytext compare+replace) | Identical | Identical |
| Return type | `Promise<void>` | `void` |
| Error handling | Inner `try/catch` logs `console.error` and swallows | No try/catch — throws propagate to caller |
| Success log | `console.log('[file-watcher] Applied external change: ...')` | Silent |
| Closure access | Takes `hocuspocus` as factory arg | Closes over `hocuspocus` + `mdManager` + `schema` from outer `createServer` scope |
| Is exported? | `export function createExternalChangeHandler` | Nested function inside `createServer` — NOT exported |
| Is tested? | No — zero tests | Covered indirectly by `bridge-matrix.test.ts` + `conversion-fidelity.test.ts` via `createTestServer` |

### Evidence: integration tests exercise the CLI copy, not the extracted handler

**CONFIRMED** — `packages/app/tests/integration/test-harness.ts:28,70`:

```typescript
import { createServer } from '@inkeep/open-knowledge-server';
// ...
const srv = createServer({ contentDir, quiet: true, ... });
```

`createServer` resolves to `standalone.ts createServer()`, whose file-watcher callback dispatches to `standalone.ts applyToDoc`, NOT `external-change.ts`. So every bridge-matrix, conversion-fidelity, and file-watcher integration test exercises the CLI copy.

### Evidence: `external-change.ts` is untested at any level

**NOT FOUND** — searched for `externalChange` / `createExternalChangeHandler` in:
- `packages/server/src/*.test.ts` → nothing
- `packages/app/tests/*.test.ts` → nothing  
- `packages/app/tests/stress/*.e2e.ts` → nothing

The only consumer is `hocuspocus-plugin.ts` (the Vite dev server). No Playwright E2E test triggers an external file change against `bun run dev`, so the dev-mode code path is effectively dark — not covered at any test tier.

## Implications

1. **The PROJECT.md S1 framing is wrong in a specific way:** it claimed bridge-matrix exercises `external-change.ts` indirectly. That is false. Bridge-matrix exercises `standalone.ts applyToDoc` — a *copy* of `external-change.ts` that has already drifted (missing try/catch, missing log line).

2. **Two separate gaps exist, not one:**
   - **Gap A (production):** `standalone.ts applyToDoc` is covered at the integration level but not at the unit level. No test isolates the 4 branches (no-op, frontmatter round-trip, concurrent edit, encoding) for the production code path. Regressions in those branches can pass integration tests for unrelated reasons.
   - **Gap B (dev mode):** `external-change.ts` has zero test coverage at any tier. Regressions in the dev-mode copy would slip through PR review entirely.

3. **The drift concern is already active.** The two copies are out of sync: `external-change.ts` has a try/catch wrapper, `standalone.ts applyToDoc` does not. A future bug fix applied to one would miss the other. The original JSDoc on `external-change.ts` explicitly calls this out as the reason for extraction — but the extraction is half-done.

4. **Unifying the two copies is the cleanest fix** — replace `standalone.ts applyToDoc` with a call to `createExternalChangeHandler(hocuspocus)`. BUT: this touches `standalone.ts`, which Miles's PR #39 is heavily modifying. Per PQ3 (heavy conflict-avoidance weight), this violates the narrow-wedge appetite.

5. **Alternative: test both copies separately** — add `external-change.test.ts` (targets the dev-mode handler via a fake Hocuspocus) PLUS a dedicated integration test file targeting the CLI path (exercises the 4 branches via `createTestServer`). No `standalone.ts` source changes. Higher test surface but respects PQ3.

## Pointers

- `packages/server/src/external-change.ts` (69 lines, extracted handler)
- `packages/server/src/standalone.ts:177-205` (inline duplicate)
- `packages/server/src/standalone.ts:378-464` (onDiskEvent → handleDiskEvent → applyToDoc dispatch chain)
- `packages/app/src/server/hocuspocus-plugin.ts:196` (only caller of `createExternalChangeHandler`)
- `packages/app/tests/integration/test-harness.ts:28,70` (proof that integration tests use `createServer` = `standalone.ts`, not the dev plugin)

## Gaps / follow-ups

- Have not verified whether the `currentText !== content` branch is actually exercised by existing bridge-matrix tests. Suspicion: it isn't — no test specifically writes the same content twice to trigger the no-op branch. Worth confirming during S1 implementation.
- Have not verified whether the frontmatter asymmetry (`body` for XmlFragment, `content` for Y.Text) is deliberately tested anywhere. If not, it's a subtle invariant that's easy to regress.
