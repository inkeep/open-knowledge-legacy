---
name: pr-context
description: Local review context generated from git state.
---

# PR Review Context

(!IMPORTANT)

Use this context to:
1. Get an initial sense of the purpose and scope of the local changes
2. Review the current branch against the target branch without relying on GitHub APIs
3. Identify what needs attention before the changes are pushed

---

## PR Metadata

| Field | Value |
|---|---|
| **PR** | Local review — worktree-typed-component-nodes vs main |
| **Author** | Nick Gomez |
| **Base** | `main` |
| **Repo** | inkeep/open-knowledge |
| **Head SHA** | `0b6cf91f43bb4e9be9dd478137aa99f44fdcbc48` |
| **Size** | 35 commits · +6884/-748 · 55 files |
| **Labels** | _None — local review._ |
| **Review state** | LOCAL |
| **Diff mode** | `summary` — reviewers must read tracked file diffs on-demand |
| **Event** | `local:manual` |
| **Trigger command** | `local-review` |
| **Review scope** | `delta` — scoped to changes since last review (delta from 0b6cf91f43) |

## Description

Local review — no PR description is available.

## Linked Issues

_No linked issues in local review mode._

## Commit History

Commits reachable from HEAD and not in the target branch (oldest → newest). Local staged and unstaged changes may also be present in the diff below.

```
d453ebb spec: finalize typed-component-nodes — built-ins only, .d.ts extraction
4219eb8 Merge remote-tracking branch 'origin/main' into worktree-typed-component-nodes
6f6e183 spec: integrate post-PR-#8 local-only observer model
12f49c9 Merge branch 'main' of https://github.com/inkeep/open-knowledge into worktree-typed-component-nodes
3f4d7b1 working favicon
0a14ba3 chore: upgrade CLI package from zod 3 to zod 4 (#11)
513d060 docs: add Bun module resolution file extensions research report
1ec2e23 chore: update changeset config for monorepo workspaces
3725319 spec(typed-component-nodes): adapt to post-PR-#10 monorepo restructure
e04f916 add shadcn skills (#14)
c798a95 fix: clear error message when content directory is missing
9a3b08b fix: resolve all biome lint warnings across packages
278832b ignore worktrees
36d2073 [US-001] Wire jsxTokenizerB into JsxComponent for raw JSX serialization
802ce47 [US-002] Install registry dependencies, create types, and BUILT_INS manifest
15a928f [US-003] Add Mermaid and Audio shadcn components
ad11c67 [US-004] Create build-registry dev script and generate components.ts manifest
ebe958f [US-005] Create jsx-component-factory and per-built-in extraction tests
7fccb7c [US-006] Centralize factory call in shared.ts (R12 schema-construction refactor)
4e9107e [US-007] Add acorn JSX parser and wire into factory parseMarkdown
86babef [US-008] Structured-attribute renderMarkdown with round-trip tests
5789732 [US-009] Create componentMap, PropPanel, and ComponentToolbar
487d3cb [US-010] Registry-driven JsxComponentView, split void view, delete Callout stub
ebeb2d7 [US-011] Add slash commands for component insertion from manifest
7dd2c7c [US-012] Enable inline rich-text children (Layer 3) with marked.lexer + renderChild
837d02b [US-013] Unregistered component fallback + collision preserve-and-render policy
9e9669d [US-014] Agent-discoverable manifest, AGENTS.md, CLAUDE.md, CI drift check
6d1b9a0 [US-015] E2E test suite, test-fixture.md with 15 built-ins, real corpus fixtures
8edda05 docs: update docs for typed-component-nodes (Layers 2-3 shipped)
9f17264 fixup! local-review: baseline (pre-review state)
8bd35bb fixup! local-review: address findings (pass 1)
b6ec247 fix: use cross-runtime __ownDir instead of Bun-only import.meta.dir
740f6c2 fix: remove BUILT_INS from barrel exports to fix Vite browser bundle
3271adb fixup! local-review: baseline (pre-review state)
0b6cf91 fixup! local-review: address findings (pass 1)
```

## Changed Files

Per-file diff stats (for prioritizing review effort). Untracked files are listed below but are not converted into synthetic patch text by this generator:

```
 .claude/skills/pr-context/SKILL.md                 | 380 ----------
 ARCHITECTURE.md                                    |   8 +-
 CLAUDE.md                                          |  18 +-
 docs/content/architecture.mdx                      |  17 +-
 package.json                                       |   4 +-
 packages/app/components.json                       |  17 +
 packages/app/content/test-fixture.md               | 151 ++--
 packages/app/package.json                          |   3 +
 packages/app/playwright.config.ts                  |  26 +
 packages/app/src/components/ui/audio.tsx           |  26 +
 packages/app/src/components/ui/mermaid.tsx         |  31 +
 packages/app/src/editor/Callout.tsx                |  26 -
 .../src/editor/components/ComponentToolbar.test.ts |  17 +
 .../app/src/editor/components/ComponentToolbar.tsx |  65 ++
 .../app/src/editor/components/PropPanel.test.ts    | 179 +++++
 packages/app/src/editor/components/PropPanel.tsx   | 295 ++++++++
 .../app/src/editor/components/SlashCommandMenu.tsx | 156 ++++
 .../src/editor/components/UnregisteredFallback.tsx |  48 ++
 packages/app/src/editor/components/componentMap.ts |  44 ++
 .../app/src/editor/extensions/JsxComponentView.tsx | 164 ++++-
 .../src/editor/extensions/JsxComponentVoidView.tsx |  17 +
 .../app/src/editor/extensions/jsx-component.ts     |  18 +-
 packages/app/src/editor/extensions/shared.ts       |  19 +-
 .../src/editor/extensions/slash-commands.test.ts   |  77 ++
 .../app/src/editor/extensions/slash-commands.tsx   | 162 +++++
 packages/app/src/editor/observer-sync.test.ts      |  37 +-
 packages/app/tests/e2e/concurrent-editing.e2e.ts   |  51 ++
 packages/app/tests/e2e/fixtures/mixed-corpus.md    |  51 ++
 packages/app/tests/e2e/real-corpus.e2e.ts          |  97 +++
 packages/app/tests/e2e/typed-components.e2e.ts     |  79 ++
 packages/core/AGENTS.md                            |  33 +
 packages/core/package.json                         |   9 +
 packages/core/scripts/build-registry.ts            | 142 ++++
 packages/core/src/extensions/jsx-component.test.ts | 797 +++++++++++++++++++--
 packages/core/src/extensions/jsx-component.ts      |  32 +-
 packages/core/src/extensions/shared.test.ts        |  80 +++
 packages/core/src/extensions/shared.ts             |  21 +-
 packages/core/src/generated/components.test.ts     | 177 +++++
 packages/core/src/generated/components.ts          | 460 ++++++++++++
 packages/core/src/index.ts                         |  10 +-
 packages/core/src/registry/built-ins.ts            | 194 +++++
 packages/core/src/registry/index.ts                |  11 +
 .../core/src/registry/jsx-component-factory.ts     | 394 ++++++++++
 packages/core/src/registry/jsx-parser.test.ts      | 126 ++++
 packages/core/src/registry/jsx-parser.ts           | 117 +++
 packages/core/src/registry/registry.test.ts        |  99 +++
 packages/core/src/registry/types.ts                |  45 ++
 specs/2026-04-08-typed-component-nodes/SPEC.md     | 568 +++++++++++----
 .../evidence/component-inventory-and-gaps.md       |  27 +-
 .../react-docgen-typescript-dts-extraction.md      | 267 +++++++
 .../meta/_changelog.md                             | 232 ++++++
 .../meta/audit-findings-v2.md                      | 422 +++++++++++
 .../meta/audit-monorepo-restructure.md             | 412 +++++++++++
 .../meta/design-challenge-v2.md                    | 389 ++++++++++
 .../meta/post-merge-audit.md                       | 285 ++++++++
 55 files changed, 6884 insertions(+), 748 deletions(-)
```

Full file list (including untracked files when present):

```
.claude/skills/pr-context/SKILL.md
ARCHITECTURE.md
CLAUDE.md
docs/content/architecture.mdx
package.json
packages/app/components.json
packages/app/content/test-fixture.md
packages/app/package.json
packages/app/playwright.config.ts
packages/app/src/components/ui/audio.tsx
packages/app/src/components/ui/mermaid.tsx
packages/app/src/editor/Callout.tsx
packages/app/src/editor/components/ComponentToolbar.test.ts
packages/app/src/editor/components/ComponentToolbar.tsx
packages/app/src/editor/components/PropPanel.test.ts
packages/app/src/editor/components/PropPanel.tsx
packages/app/src/editor/components/SlashCommandMenu.tsx
packages/app/src/editor/components/UnregisteredFallback.tsx
packages/app/src/editor/components/componentMap.ts
packages/app/src/editor/extensions/JsxComponentView.tsx
packages/app/src/editor/extensions/JsxComponentVoidView.tsx
packages/app/src/editor/extensions/jsx-component.ts
packages/app/src/editor/extensions/shared.ts
packages/app/src/editor/extensions/slash-commands.test.ts
packages/app/src/editor/extensions/slash-commands.tsx
packages/app/src/editor/observer-sync.test.ts
packages/app/tests/e2e/concurrent-editing.e2e.ts
packages/app/tests/e2e/fixtures/mixed-corpus.md
packages/app/tests/e2e/real-corpus.e2e.ts
packages/app/tests/e2e/typed-components.e2e.ts
packages/core/AGENTS.md
packages/core/package.json
packages/core/scripts/build-registry.ts
packages/core/src/extensions/jsx-component.test.ts
packages/core/src/extensions/jsx-component.ts
packages/core/src/extensions/shared.test.ts
packages/core/src/extensions/shared.ts
packages/core/src/generated/components.test.ts
packages/core/src/generated/components.ts
packages/core/src/index.ts
packages/core/src/registry/built-ins.ts
packages/core/src/registry/index.ts
packages/core/src/registry/jsx-component-factory.ts
packages/core/src/registry/jsx-parser.test.ts
packages/core/src/registry/jsx-parser.ts
packages/core/src/registry/registry.test.ts
packages/core/src/registry/types.ts
specs/2026-04-08-typed-component-nodes/SPEC.md
specs/2026-04-08-typed-component-nodes/evidence/component-inventory-and-gaps.md
specs/2026-04-08-typed-component-nodes/evidence/react-docgen-typescript-dts-extraction.md
specs/2026-04-08-typed-component-nodes/meta/_changelog.md
specs/2026-04-08-typed-component-nodes/meta/audit-findings-v2.md
specs/2026-04-08-typed-component-nodes/meta/audit-monorepo-restructure.md
specs/2026-04-08-typed-component-nodes/meta/design-challenge-v2.md
specs/2026-04-08-typed-component-nodes/meta/post-merge-audit.md
```

## Diff

> **⚠️ LARGE LOCAL REVIEW (summary mode)** — The diff (~488646 bytes across ~55 files) exceeds the inline threshold (~100KB).
> The full diff is written to `.claude/pr-diff/full.diff`.
>
> **How to read diffs on-demand:**
> - Specific file: `git diff 8971f7c8a0e872a2e459055bfb8d14e982565977 -- path/to/file.ts`
> - Full diff: read `.claude/pr-diff/full.diff`
> - Untracked files: inspect the file directly in the working tree

## Changes Since Last Review

### Delta Files

```
_No files changed in delta._
```

### Delta Stats

```
_No stats available._
```

### Delta Diff

_No delta diff available._

> **Review Focus:** This is a re-review scoped to changes since the last review pass (`0b6cf91f43`). Focus your review on the delta — the changes made to address prior findings. The full branch diff is still available above for context, but your review should prioritize the delta changes.

## Review Iteration History

# Review Iteration Log

---

## Review Pass 0
**Recommendation: **🚫 REQUEST CHANGES**** | **Risk: **Medium**** | **Blocking:** 1 Critical, 4 Major

<details>
<summary>Full review</summary>

## PR Review Summary

**(10) Total Issues** | Risk: **Medium** | Recommendation: **🚫 REQUEST CHANGES**

### 🔴 Critical (1)

🔴 1) `packages/app/src/editor/observer-sync.test.ts:199-225 || stale-observer-test-t61` **Existing observer test T61 uses old fenced format that new schema no longer parses**

**Issue:** Test T61 ("void node (jsx-component) survives observer cycle") writes `` ```jsx-component\n<Callout type="warning">\n  Test content\n</Callout>\n``` `` and asserts the output contains `'jsx-component'`. The new schema replaces the fenced `jsx-component` code block format with raw JSX (`<Callout>...</Callout>`) parsed by the `jsxBlock` tokenizer. The old fenced format will be intercepted by StarterKit's `codeBlock` extension instead, meaning T61 either: (a) passes trivially because the string `'jsx-component'` appears as literal text inside a code block, or (b) silently validates the wrong behavior — the component is now a code block, not a jsxComponent node.

**Why:** This test is the *only* observer-sync coverage for JSX component round-trips. If it passes vacuously, there is zero verified coverage that `jsxComponentEditable` or `jsxComponentVoid` nodes survive the Observer A→B→A cycle. The observer sync layer is the most critical correctness boundary in the editor — a failure here means silent data corruption during WYSIWYG↔Source mode switching.

**Fix:** Update T61 to use the new raw JSX format and verify both `jsxComponentEditable` (registered) and `jsxComponentVoid` (unregistered) nodes:
```typescript
// Registered component (new format)
const jsxMd = '<Callout type="warning">\nTest content\n</Callout>\n';
// ... apply and round-trip ...
expect(md).toContain('<Callout type="warning">');
expect(md).not.toContain('```'); // should NOT be a fenced code block
```

**Refs:**
- `packages/app/src/editor/observer-sync.test.ts:199-225 — T61 test body`
- `packages/core/src/registry/jsx-component-factory.ts:195-206 — new jsxBlock tokenizer (only handles raw JSX, not fenced)`

---

### 🟠 Major (4)

🟠 1) `packages/app/src/editor/extensions/JsxComponentView.tsx:89-106 || missing-error-boundary` **No React error boundary around third-party component rendering**

**Issue:** The `<Component {...primitiveProps}>` render at line 89-106 directly renders one of 20 third-party React components (fumadocs-ui, docskit, shadcn) with no error boundary. If any component throws during render — due to corrupted props from a CRDT merge, incompatible types, or an upstream library bug — the error propagates and crashes the entire TipTap editor for all connected users.

**Why:** In a collaborative CRDT editor, component attribute values can be mutated by concurrent operations. A single malformed node crashes every connected session with a React white screen. There are 20 external components whose render behavior is not controlled by this codebase.

**Fix:** Wrap the component render in a class-based error boundary that catches render errors per-component and shows a descriptive fallback:
```tsx
<ComponentErrorBoundary componentName={componentName}>
  <Component {...primitiveProps}>
    <NodeViewContent className="component-children" />
  </Component>
</ComponentErrorBoundary>
```

---

🟠 2) `packages/core/scripts/build-registry.ts:68-109 || silent-extraction-failure` **Build-registry silently produces empty props when .d.ts extraction fails**

**Issue:** When `allDocs.find()` fails to match a BUILT_INS entry (stale `.d.ts` path, renamed component, react-docgen-typescript parse failure), the script creates a manifest entry with `props: []` and no warning. The `drift-check` CI gate only validates that the generated file matches build output — it does not validate correctness. A broken extraction produces a broken manifest, CI passes, and the component renders with no prop panel controls.

**Why:** `.d.ts` file paths in `built-ins.ts` are derived from `node_modules` resolution. Package upgrades that move declaration files will silently break extraction for affected components. The only visible symptom is the prop panel disappearing for that component.

**Fix:** Emit an explicit warning when a BUILT_INS entry has no matching doc, and consider a `--strict` mode for CI:
```typescript
if (!doc) {
  console.warn(
    `WARNING: No react-docgen-typescript output for "${entry.name}" from ${entry.sourceFile}. ` +
    `Component will have zero props in manifest.`
  );
}
```

---

🟠 3) `packages/core/src/registry/jsx-parser.ts:34-36 || bare-catch-swallows-all` **parseJsx catch block swallows all exception types, not just SyntaxError**

**Issue:** The bare `catch {}` at line 34 catches ALL exceptions from `acorn.Parser.parse` and returns `null` — including `TypeError`, `RangeError`, out-of-memory, or bugs in acorn-jsx itself. The null return routes the component to the void fallback with zero logging.

**Why:** If acorn-jsx has a regression or encounters an unexpected input edge case, every affected registered component silently degrades to raw monospace display with no diagnostic trail. The developer sees components "stop working" with no error to debug.

**Fix:** Catch `SyntaxError` specifically (what acorn throws for parse failures) and log unexpected errors:
```typescript
catch (err) {
  if (err instanceof SyntaxError) return null;
  console.error('[parseJsx] Unexpected parser error:', err);
  return null;
}
```

---

🟠 4) `packages/core/src/registry/jsx-component-factory.ts:300-307 || silent-unknownattrs-data-loss` **Silent catch on _unknownAttrs JSON.parse drops collision-preserved attributes without logging**

**Issue:** The empty `catch {}` at line 305-307 silently swallows `JSON.parse` failures on `_unknownAttrs`. This attribute stores collision-policy preserved props per §3.8. If the JSON becomes corrupted (CRDT merge conflict, concurrent edit race), the unknown attributes are permanently dropped from the serialized markdown on the next save cycle.

**Why:** This runs in `renderMarkdown` — the persistence path. Silent data loss here means attributes vanish from disk with zero diagnostic trail. In a collaborative editor, JSON attribute corruption is not theoretical.

**Fix:** Log the malformed JSON for diagnostics while preserving graceful degradation:
```typescript
catch (err) {
  console.warn(
    `[JsxComponent] Malformed _unknownAttrs on <${componentName}>, attributes dropped:`,
    unknownRaw
  );
}
```

---

### 🟡 Minor (2)

🟡 1) `packages/core/src/registry/types.ts:6-15 || propdef-optional-fields` **PropDef uses optional fields for mutually exclusive state instead of a discriminated union**

**Issue:** When `type` is `'enum'`, `enumValues` is required for correctness but typed as `enumValues?: string[]`. Two consumer sites defensively handle missing enum values: `PropPanel.tsx:108` falls back to `prop.enumValues || []` (empty select dropdown), and `slash-commands.tsx:30` guards with `prop.enumValues?.length > 0`. These fallbacks hide malformed manifest data at runtime.

**Why:** A future build-registry change or user-contributed component could produce an enum PropDef without enumValues. The UI would silently show a broken control.

**Fix:** Replace the flat interface with a discriminated union on `type`. Each variant carries only its applicable fields. All current consumers already branch on `prop.type`, so migration is mechanical. At minimum, make `enumValues` required when `type: 'enum'`.

---

🟡 2) `packages/app/src/editor/components/PropPanel.tsx:274-276 || number-empty-treated-as-zero` **NumberControl treats empty input as 0, preventing users from clearing optional number props**

**Issue:** When the user clears a number input, `Number('')` evaluates to `0`, which passes the `!Number.isNaN(n)` guard. This calls `onChange(0)` instead of clearing the prop. For optional number props, the user cannot unset the value — clearing always produces `0`.

**Why:** Serialized output shows `defaultIndex={0}` instead of omitting the prop entirely. Minor UX issue but observable in the markdown output.

**Fix:** Treat empty string as a signal to clear: `if (raw === '') { onChange(undefined); return; }`

---

### 💭 Consider (2)

💭 1) `packages/core/src/registry/jsx-component-factory.ts:317-345` **renderMarkdown fallback from renderChild to stale _childrenString has no warning**

If `helpers.renderChild` becomes unavailable (e.g., a TipTap version upgrade changes the helper contract), the system silently falls back to stale parse-time `_childrenString`. Any user edits to component children would be silently discarded on save. Consider adding a diagnostic log when this fallback engages with live content present.

💭 2) `packages/core/src/extensions/jsx-component.ts || dead-legacy-extension` **Legacy JsxComponent extension is orphaned dead code**

The old `JsxComponent` extension is no longer exported from the barrel, not included in `sharedExtensions`, and has no consumers. CLAUDE.md says "still exported for backwards compat" but the export was removed. Either delete the file or add a deprecation comment. Currently it could confuse contributors into thinking there are two competing patterns.

---

### 🧹 While You're Here (1)

🧹 1) `packages/app/src/editor/observer-sync.test.ts:199-225` **Additional observer tests for new node types needed**

Beyond fixing T61, the observer-sync test suite lacks coverage for `jsxComponentEditable` nodes (registered components with structured attributes and rich children). The existing test only covers the void/fenced format. Adding a test that verifies a registered component with props and children survives the Observer A→B→A cycle would strengthen the most critical correctness boundary.

---

## 🚫 REQUEST CHANGES

**Summary:** The stale observer test T61 is a critical gap — it's the only observer-sync coverage for JSX components, and it validates the old fenced format that the new schema no longer handles. This must be updated before merge to ensure the WYSIWYG↔Source sync path is verified. The missing error boundary on third-party component rendering is a high-impact reliability risk in a collaborative editor. The silent failure patterns in parseJsx and _unknownAttrs are data-loss vectors that need at minimum diagnostic logging. The core architecture is well-designed with clean separation of concerns, and the serialization/parsing pipeline is thorough — these are targeted fixes, not structural issues.

<details>
<summary>Discarded (14)</summary>

| Location | Issue | Reason Discarded |
|----------|-------|------------------|
| `jsx-component-factory.ts:57-71` | Flat attribute union across 20 components | Acknowledged architectural tradeoff with correct per-component filtering at parse/serialize boundaries. Not actionable within scope. |
| `shared.ts:23-28` | CRDT schema migration (jsxComponent → jsxComponentEditable) | No binary Y.Doc persistence — documents rebuild from markdown on server restart. Risk is limited to active sessions during upgrade; acceptable for pre-production. |
| `index.ts:11` | Breaking change: JsxComponent/fenceFor removed from barrel | Package is `private: true` with no external consumers. Internal consumers updated. |
| `jsx-component-factory.ts:21-46` | Global marked singleton mutation | Inherent to how marked works — no per-instance API available. Current code correctly ensures registration before MarkdownManager construction. |
| `componentMap.ts + componentManifest` | Dual sources of truth with no sync guard | Valid concern but PropPanel.test.ts already asserts count match. A stronger compile-time guard is a nice-to-have, not a blocker. |
| `built-ins.ts` | Uses node:module, coupling core to monorepo layout | Correctly excluded from barrel exports. Build-only code in a build-only context. |
| `jsx-component-factory.ts:74` | Module-level mutable state (_warnedComponents) | Warning deduplication Set, not request-scoped state. Acceptable pattern. |
| `package.json` | New marked dependency version conflict | Verified: marked@17.0.6 is deduplicated via bun's module resolution. Same instance as @tiptap/markdown. No conflict. |
| `jsx-component-factory.ts:289` | Cross-bleed filtering untested | Valid test gap but the serialization is covered by round-trip tests. Not a blocker. |
| `E2E concurrent-editing.e2e.ts` | Tests are page-load stubs, not concurrency tests | Valid observation but these are scaffolding for future tests. Not a regression. |
| `E2E typed-components.e2e.ts` | Conditional assertions silently skip | Valid test quality concern but E2E is scaffolding stage. Not a blocker. |
| `PropPanel.test.ts:106-137` | Tautological prop-type-to-control tests | Valid but low-impact. Tests verify data contracts, not rendering. |
| `ComponentToolbar.test.ts` | Only verifies exports exist | Minimal value but not harmful. |
| `registry.test.ts` naming | File named registry.test.ts instead of jsx-component-factory.test.ts | Naming convention nit, not a blocker. |

</details>

<details>
<summary>Reviewer Stats</summary>

| Reviewer | Returned | Kept |
|----------|----------|------|
| `pr-review-standards` | 2 | 2 |
| `pr-review-architecture` | 8 | 2 |
| `pr-review-types` | 5 | 1 |
| `pr-review-tests` | 7 | 1 |
| `pr-review-precision` | 9 | 2 |
| `pr-review-errors` | 7 | 3 |
| `pr-review-breaking-changes` | 6 | 1 |
| `pr-review-consistency` | 10 | 0 |

</details>

</details>

---

## Fix Response 1

### Addressed

- 🔴 **stale-observer-test-t61** (`packages/app/src/editor/observer-sync.test.ts:199-225`): Rewrote T61 to use raw JSX format (`<Callout type="warning">`) instead of fenced `\`\`\`jsx-component` blocks. Added explicit `expect(md).not.toContain('\`\`\`')` assertions to verify no fenced code block leakage. Added new T61b test for unregistered `jsxComponentVoid` round-trip through observers. Both tests pass.

- 🟠 **missing-error-boundary** (`packages/app/src/editor/extensions/JsxComponentView.tsx:89-106`): Added `ComponentErrorBoundary` class component wrapping the third-party component render. On crash, shows a red-bordered fallback with the component name and error message. Logs the error + component stack to console for diagnostics. Isolates per-node failures so one corrupted component doesn't crash the entire editor.

- 🟠 **silent-extraction-failure** (`packages/core/scripts/build-registry.ts:68-109`): Added explicit `console.warn()` when `allDocs.find()` returns no match for a BUILT_INS entry. Warning names the component and source file so developers can diagnose stale `.d.ts` paths immediately.

- 🟠 **bare-catch-swallows-all** (`packages/core/src/registry/jsx-parser.ts:34-36`): Changed bare `catch {}` to catch `SyntaxError` specifically (what acorn throws for parse failures) and return `null`. All other exception types now log via `console.error` before returning `null`, preserving graceful degradation while providing a diagnostic trail.

- 🟠 **silent-unknownattrs-data-loss** (`packages/core/src/registry/jsx-component-factory.ts:300-307`): Replaced empty `catch {}` with `console.warn` that logs the component name and the malformed `_unknownAttrs` JSON string. Graceful degradation preserved — attributes are still dropped on parse failure — but now with a diagnostic trail for debugging.

- 🟡 **number-empty-treated-as-zero** (`packages/app/src/editor/components/PropPanel.tsx:274-276`): Added empty-string guard before `Number()` conversion. When user clears the input, `onChange(undefined)` is called instead of `onChange(0)`. Updated the type signature to `onChange: (v: number | undefined) => void`.

### Declined

- 🟡 **propdef-optional-fields** (`packages/core/src/registry/types.ts:6-15`): The premise is correct — a discriminated union would be better TypeScript. However, there are only 2 consumer sites that reference `enumValues`, both with working fallbacks (`|| []` and `?.length > 0`). The generated manifest is machine-produced from `build-registry.ts` which always populates `enumValues` when `type === 'enum'` — the only path to malformed data is hand-editing the generated file (which the header comment warns against). The refactor would touch the type definition, all 15 per-built-in tests, both consumer sites, and the build script's output format — disproportionate to the risk for a code path that cannot be reached without manually editing generated code.

- 💭 **renderChild-fallback** (`packages/core/src/registry/jsx-component-factory.ts:317-345`): `helpers.renderChild` is part of TipTap's `@tiptap/markdown` renderMarkdown contract. It would only become unavailable via a breaking TipTap upgrade, which would break far more than this fallback. The `_childrenString` fallback exists specifically for jsxComponentVoid nodes (which have no ProseMirror content). Adding a warning when the fallback engages with live content is a sound defensive idea but requires distinguishing "void node uses fallback correctly" from "editable node lost its helper" — that logic doesn't exist yet and is speculative for a pre-production codebase.

- 💭 **dead-legacy-extension** (`packages/core/src/extensions/jsx-component.ts`): Confirmed the legacy `JsxComponent` is not exported from the barrel (`index.ts`) and not in `sharedExtensions`. However, the file IS actively referenced by name in `jsx-component.test.ts` describe blocks and serves as the tokenizer registration point (it registers `jsxTokenizerB` with `markdownTokenizer`). The test describe blocks use "JsxComponent" as a logical grouping name even though they test through `sharedExtensions`. Deleting the file requires updating test imports and confirming no indirect reference. This is cleanup work, not a correctness issue — no functional impact on any consumer. CLAUDE.md text about "backwards compat" is stale and should be updated separately.

- 🧹 **Additional observer tests for new node types**: The T61 rewrite and T61b addition already cover both `jsxComponentEditable` (registered Callout) and `jsxComponentVoid` (unregistered CustomThingy) through the observer cycle. This finding is addressed by the Critical fix.

**Quality gates:**
- `cd packages/core && bunx tsc --noEmit` — ✅ green
- `cd packages/server && bunx tsc --noEmit` — ✅ green
- `cd packages/app && bunx tsc --noEmit` — ✅ green
- `cd packages/cli && bunx tsc --noEmit` — ✅ green
- `cd packages/core && bun test` — ✅ 166 pass, 0 fail
- `cd packages/server && bun test` — ✅ 17 pass, 0 fail
- `cd packages/app && bun test` — ✅ 82 pass, 0 fail
- `bun run lint` — ✅ 15 warnings (baseline), 0 errors

## Declined Findings Summary

| Finding | Classification | Future-relevant | Evidence |
|---------|---------------|-----------------|----------|
| propdef-optional-fields (types.ts:6-15) | Tradeoffs unfavorable | Yes | Correct TypeScript improvement, but only 2 consumer sites with working fallbacks; generated manifest ensures invariant mechanically |
| renderChild-fallback (factory.ts:317-345) | Pre-existing, out of scope | No | Requires TipTap breaking change to trigger; fallback is correct for void nodes |
| dead-legacy-extension (jsx-component.ts) | Pre-existing, out of scope | Yes | Orphaned from barrel but referenced in test describe blocks; cleanup, not correctness |


## Prior Feedback

> **IMPORTANT:** Local review mode does not load prior PR threads or prior review summaries. Treat this as a first-pass review of the current local changes unless the invoker provided additional context elsewhere.

### Automated Review Comments

_None (local review)._

### Human Review Comments

_None (local review)._

### Previous Review Summaries

_None (local review)._

### PR Discussion

_None (local review)._

## GitHub URL Base (for hyperlinks)

No GitHub PR context is available in local review mode.
- For in-repo citations, use repo-relative `path:line` or `path:start-end` references instead of GitHub blob URLs.
- External docs may still use standard markdown hyperlinks.
