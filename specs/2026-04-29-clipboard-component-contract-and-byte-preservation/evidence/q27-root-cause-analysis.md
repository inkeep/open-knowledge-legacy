---
date: 2026-04-29
type: meta
sources:
  - packages/core/src/markdown/pipeline.ts
  - packages/core/src/markdown/index.ts
  - packages/core/src/markdown/details-accordion-promoter.ts
  - packages/core/src/markdown/autolink-void-html-guard.ts
  - packages/core/dist/index.mjs (pre-rebuild snapshot, mtime Apr 27 01:40)
  - packages/core/package.json (exports conditions)
  - packages/app/tests/fidelity/invariant-i19.test.ts
  - packages/app/tests/fidelity/helpers.ts
  - packages/app/package.json (test:fidelity script)
  - turbo.json + repo-root package.json (check script)
---

# Q27 — Root cause of details-accordion-promoter not firing in production parse path

## Method

1. Read `pipeline.ts` `createParseProcessor`, `index.ts` `MarkdownManager.{parse,parseToMdast}`, and `details-accordion-promoter.ts`.
2. Read I19 test file (`invariant-i19.test.ts`) and `helpers.ts` (constructs `mdManager` from `sharedExtensions`).
3. Reproduced the failure: `bun test packages/app/tests/fidelity/invariant-i19.test.ts` from repo root → 11/19 fail with the documented `paragraph > text` shape.
4. Built two ad-hoc scripts:
   - One imports `MarkdownManager` from the workspace package (`@inkeep/open-knowledge-core`) and calls `parseToMdast('<details>...')` → returned `paragraph > text` with PUA-restored value (BROKEN).
   - One uses **relative imports into `packages/core/src/`** to manually mirror `createParseProcessor` and call it via `protectFromMdx → parse → runSync` → returned the correct `mdxJsxFlowElement(name='HtmlDetailsAccordion')` (WORKS).
5. The only difference is the resolution path. Inspected `packages/core/package.json` exports map — confirmed two conditions: `"development": "./src/index.ts"` and `"default": "./dist/index.mjs"`.
6. Checked `dist/index.mjs` for the registration and found the stale processor literal.
7. Re-ran I19 tests with `bun --conditions=development test ...` from `packages/app/` → all 19 pass.
8. Rebuilt `packages/core` (`bun run build` → tsdown). Re-ran I19 tests via plain `bun test` (no conditions flag) from repo root → all 19 pass.

## pipeline.ts processor structure

`createParseProcessor` (`packages/core/src/markdown/pipeline.ts:137-187`) is the single source of truth. The plugin chain on lines 149-184 is:

```
remarkParse
  → remarkFrontmatter(['yaml'])
  → remarkMdxAgnostic
  → remarkGfm
  → remarkWikiLink
  → remarkGithubAlerts(REMARK_GITHUB_ALERTS_OPTIONS)
  → calloutTransformerPlugin
  → restoreFromMdx                       (Phase A)
  → detailsAccordionPromoterPlugin       (US-011 / FR-8)
  → imagePromoterPlugin
  → mergedPostParseWalkerPlugin          (Phase B)
  → ensureNonEmptyDoc
  → remarkProseMirror({schema, handlers})
```

Eager `processor.freeze()` at line 185. Caching: one processor per `MarkdownManager` instance, built in the constructor (`index.ts:107-112`). After freeze the processor is stateless — `parse()`, `parseToMdast()`, and any other consumer share `this.parseProcessor` via `parseMd` / `parseMdToMdast` (`pipeline.ts:233-261`). No re-attach occurs at runtime, so precedent #15(d) idempotent-attacher concerns are NOT in play here.

## mdManager.parseToMdast chain

`MarkdownManager.parseToMdast(markdown)` (`index.ts:150-155`) calls `parseMdToMdast(markdown, this.parseProcessor)` (`pipeline.ts:255-261`):

```ts
const protected_ = protectFromMdx(source);
const file = new VFile(protected_);
const tree = processor.parse(file);
file.value = source;
return processor.runSync(tree, file) as MdastRoot;
```

Identical to the parse path used by `parse()` (`pipeline.ts:233-245`) up through `runSync` — both share the **same** cached processor. There is exactly one parse-path processor; there is no second processor that could be missing the transformer.

## Comparison: working manual chain vs broken production chain

The Track-C subagent's working manual chain rebuilt the processor literal in fresh user code with relative imports into `packages/core/src/markdown/*.ts`. That import path resolves to source.

The "broken production chain" is `mdManager.parseToMdast(...)` invoked from a test/script that imports `MarkdownManager` from `@inkeep/open-knowledge-core`. The `bun test packages/app/tests/fidelity/...` invocation from repo root resolves the workspace dep through Bun's normal exports condition resolution. With no `--conditions=development` flag, Bun picks the `"default"` condition → `./dist/index.mjs`.

`packages/core/dist/index.mjs` (mtime **Apr 27 01:40**, two days stale) contains a baked processor literal at line 2909:

```js
const processor = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ["yaml"])
  .use(remarkMdxAgnostic)
  .use(remarkGfm)
  .use(remarkWikiLink)
  .use(restoreFromMdx)
  .use(mergedPostParseWalkerPlugin)
  .use(() => ensureNonEmptyDoc)
  .use(remarkProseMirror, { ... });
```

Compared to the source on disk, the dist literal is missing **four** registrations:

- `remarkGithubAlerts(REMARK_GITHUB_ALERTS_OPTIONS)`
- `calloutTransformerPlugin`
- `detailsAccordionPromoterPlugin`  (the one Q27 cares about)
- `imagePromoterPlugin`

`grep -c "detailsAccordionPromoterPlugin\|HtmlDetailsAccordion" dist/index.mjs` → `0`. Verified directly.

Source `packages/core/src/markdown/{pipeline,details-accordion-promoter}.ts` mtime is **Apr 29 21:25**. Dist predates the most recent edits to the markdown pipeline by ~48 hours.

## Root cause

**Stale `packages/core/dist/index.mjs`.** `tsdown` was last run on Apr 27 (before US-011 / FR-8 wired the details promoter into `pipeline.ts`). The exports map sends non-development consumers to that frozen artifact:

```json
".": {
  "development": "./src/index.ts",
  "types": "./src/index.ts",
  "default": "./dist/index.mjs"
}
```

- `bun --conditions=development test ...` (the per-package `test`, `test:fidelity`, etc. scripts in `packages/{app,server,cli,desktop}/package.json`) → resolves to source → transformer fires → all 19 I19 tests pass.
- `bun test ...` from repo root (or any production import) → resolves to dist → transformer is absent from the literal → text falls through unchanged → I19 fails 11/19.

There is **no precedent #15(d) idempotent-attacher violation, no caching staleness, no freeze-order issue**. Source `pipeline.ts` is correct. The runtime behavior on dist is exactly what the dist code says: a processor that never registered `detailsAccordionPromoterPlugin`.

## Proposed fix

**Run `bun run build` in `packages/core`** (alias for `tsdown`). Performed in this investigation; output:

```
ℹ dist/index.mjs               258.09 kB │ gzip: 78.30 kB
ℹ dist/server.mjs               19.19 kB │ gzip:  6.65 kB
ℹ dist/shadow-repo-layout.mjs   17.68 kB │ gzip:  5.96 kB
✔ Build complete in 33ms
```

Post-rebuild: `grep -c detailsAccordionPromoterPlugin dist/index.mjs` → `7`. I19 passes 19/19 via plain `bun test` (no conditions flag).

**LoC: 0** (the source is already correct). The fix is a build-system action, not a code change. **Risk: zero** — `tsdown` regenerates only the `dist/` artifacts and `clean: true` in `tsdown.config.ts` removes stale chunks before re-emit.

Three follow-ups worth considering (each independent of the immediate fix):

1. **CI gate.** `bun run check` calls `turbo run typecheck test test:integration test:conversion test:fidelity`. Each `test:*` task uses `--conditions=development` per the per-package scripts, so a stale dist hides from `check`. `turbo.json`'s `test` task has `"dependsOn": ["^build"]`, which forces `^build` BEFORE running tests — but `^build` only runs for upstream packages of the testing package (e.g., `core` is upstream of `app`), so this should already trigger `core#build` before `app#test:fidelity`. Verify by deleting `dist/index.mjs` and running `bun run check` cold; if it doesn't rebuild, the dependency wiring is incomplete.

2. **Pre-commit guard.** Add a check that detects "dist is older than newest src file" and either errors or auto-rebuilds. Trivial as a git hook; mirrors the THIRD_PARTY_NOTICES drift check called out in `bun run check`.

3. **Drop the dist condition for non-published consumers.** The exports map's `"default"` condition is only meaningful for consumers outside the workspace — published `@inkeep/open-knowledge` CLI bundles and the Electron app. If every workspace consumer is set up to use `--conditions=development`, the dist condition's only purpose is the published surface. That's correct usage; just worth confirming no in-workspace tooling silently falls into the dist path. (One known case: `bun test` from repo root.)

## Blast radius

- **Markdown pipeline only.** Stale dist is missing four transformer plugins; effects are confined to parse-direction behavior for `<details>`, `[!NOTE]` callouts (FR-7), images via `![alt](src)` syntax (FR-13), and any `remarkGithubAlerts`-styled blockquote. Phase B (`mergedPostParseWalkerPlugin`) is present in dist, so position-slice / autolink-promotion / unknown-mdast-guard / doc-start-thematic-fix all behave correctly.
- **All consumers of `@inkeep/open-knowledge-core` via the dist path inherit the same stale behavior.** This includes the published `@inkeep/open-knowledge` CLI (server-side parse on file load), `@inkeep/open-knowledge-server` HTTP API agent-write paths, and Electron utility-process server. So `<details>` content authored against a deployed CLI/Electron build today round-trips as `paragraph > text` instead of `HtmlDetailsAccordion` — a real production parity gap, not just a test artifact.
- **Bridge / observer / CRDT layer is unaffected.** The bridge runs on top of the parse output; stale parse output produces stale PM trees but doesn't violate the three observer invariants. Agent-write attribution, CC1 push, presence — all orthogonal.
- **Single fix point.** Rebuilding `packages/core` repairs every downstream consumer in one shot. No coordination across `core/server/app/cli/desktop` is required because their `workspace:*` deps re-resolve through the same regenerated `dist/index.mjs`.

## I19 verification expected post-fix

Pre-rebuild (`bun test packages/app/tests/fidelity/invariant-i19.test.ts` from repo root):
```
8 pass  11 fail  31 expect() calls
```

Post-rebuild (same command, no conditions flag):
```
19 pass  0 fail  2021 expect() calls
```

Both single-line and multi-paragraph `<details>` recognizers fire; `props.{title,defaultOpen,name,id}` populate correctly; PBT round-trips byte-identical across `numRuns: 1000` per property. No remaining I19 failures.

The same rebuild also unsticks any latent breakage in I12 (5-pack pristine-byte-identity for `<Accordion>` MDX form, which depends on `imagePromoterPlugin` correctness for embedded images), `mdx-roundtrip.test.ts` (callouts), and `corpus-gfm.test.ts` (alerts). Worth re-running `bun run test:fidelity` post-rebuild to confirm no other unrelated failures emerge.
