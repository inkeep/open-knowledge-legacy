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
| **Head SHA** | `8bd35bb7b06e22bad15a8e49468c255b51b25617` |
| **Size** | 31 commits · +6779/-739 · 54 files |
| **Labels** | _None — local review._ |
| **Review state** | LOCAL |
| **Diff mode** | `summary` — reviewers must read tracked file diffs on-demand |
| **Event** | `local:manual` |
| **Trigger command** | `local-review` |
| **Review scope** | `delta` — scoped to changes since last review (delta from 8bd35bb7b0) |

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
 packages/app/src/editor/components/PropPanel.tsx   | 290 ++++++++
 .../app/src/editor/components/SlashCommandMenu.tsx | 156 ++++
 .../src/editor/components/UnregisteredFallback.tsx |  48 ++
 packages/app/src/editor/components/componentMap.ts |  44 ++
 .../app/src/editor/extensions/JsxComponentView.tsx | 112 ++-
 .../src/editor/extensions/JsxComponentVoidView.tsx |  17 +
 .../app/src/editor/extensions/jsx-component.ts     |  18 +-
 packages/app/src/editor/extensions/shared.ts       |  19 +-
 .../src/editor/extensions/slash-commands.test.ts   |  77 ++
 .../app/src/editor/extensions/slash-commands.tsx   | 162 +++++
 packages/app/tests/e2e/concurrent-editing.e2e.ts   |  51 ++
 packages/app/tests/e2e/fixtures/mixed-corpus.md    |  51 ++
 packages/app/tests/e2e/real-corpus.e2e.ts          |  97 +++
 packages/app/tests/e2e/typed-components.e2e.ts     |  79 ++
 packages/core/AGENTS.md                            |  33 +
 packages/core/package.json                         |   9 +
 packages/core/scripts/build-registry.ts            | 135 ++++
 packages/core/src/extensions/jsx-component.test.ts | 797 +++++++++++++++++++--
 packages/core/src/extensions/jsx-component.ts      |  32 +-
 packages/core/src/extensions/shared.test.ts        |  80 +++
 packages/core/src/extensions/shared.ts             |  21 +-
 packages/core/src/generated/components.test.ts     | 177 +++++
 packages/core/src/generated/components.ts          | 460 ++++++++++++
 packages/core/src/index.ts                         |  10 +-
 packages/core/src/registry/built-ins.ts            | 188 +++++
 packages/core/src/registry/index.ts                |   9 +
 .../core/src/registry/jsx-component-factory.ts     | 391 ++++++++++
 packages/core/src/registry/jsx-parser.test.ts      | 126 ++++
 packages/core/src/registry/jsx-parser.ts           | 115 +++
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
 54 files changed, 6779 insertions(+), 739 deletions(-)
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

> **⚠️ LARGE LOCAL REVIEW (summary mode)** — The diff (~483514 bytes across ~54 files) exceeds the inline threshold (~100KB).
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

> **Review Focus:** This is a re-review scoped to changes since the last review pass (`8bd35bb7b0`). Focus your review on the delta — the changes made to address prior findings. The full branch diff is still available above for context, but your review should prioritize the delta changes.

## Review Iteration History

# Review Iteration Log

---

## Review Pass 0
**Recommendation: **🚫 REQUEST CHANGES**** | **Risk: **Medium**** | **Blocking:** 1 Critical, 2 Major

<details>
<summary>Full review</summary>

## PR Review Summary

**(8) Total Issues** | Risk: **Medium** | Recommendation: **🚫 REQUEST CHANGES**

### 🔴 Critical (1)

🔴 1) `packages/core/src/registry/jsx-component-factory.ts:109 || unescaped-quotes-in-serialized-props` **String props containing double quotes break JSX serialization**

**Issue:** `buildJsxString` emits string props as `prop="${value}"` with no escaping. If a user enters a value containing `"` (e.g., via PropPanel's text input), the serialized markdown produces malformed JSX like `title="Say "hello""`, which fails to re-parse on next load — silently corrupting the document.

**Why:** This is a data-loss path. A user edits a string prop → saves → reloads → the component falls back to `jsxComponentVoid` (unregistered) because `parseJsx` returns null on the malformed JSX. The structured attributes (typed props, children) are lost and replaced by a raw string. The round-trip tests don't cover this because no test uses a prop value containing a quote character.

**Fix:** Escape double quotes in string values before interpolation:
```typescript
// In buildJsxString, replace:
parts.push(`${key}="${value}"`);
// With:
parts.push(`${key}="${String(value).replace(/"/g, '&quot;')}"`);
```
And add a corresponding unescape in `parseJsx` or let acorn handle the HTML entity. Add a round-trip test with `title="She said &quot;hello&quot;"`.

**Refs:**
- `packages/core/src/registry/jsx-parser.ts:66-67` — parser side that receives these values
- `packages/core/src/extensions/jsx-component.test.ts` — test suite (no quote-in-value coverage)

### 🟠 Major (2)

🟠 1) `packages/app/src/editor/components/PropPanel.tsx:34 || prop-panel-null-hides-toolbar` **PropPanel returns `null` for components with only ReactNode props, hiding the toolbar entirely**

**Issue:** When `editableProps.length === 0` (all props are `reactnode`), PropPanel returns `null` at line 34. Since ComponentToolbar is passed as `children` to PropPanel, this drops the toolbar entirely — the user sees no component name badge, no gear icon, and no visual indication that a component node exists. This affects ~5 components: `Cards`, `Steps`, `Accordions`, `Files`, and potentially others with all-reactnode props.

**Why:** These components become invisible containers in the editor. Users can't identify them, select them intentionally, or distinguish them from plain content. This is a meaningful UX regression for components that have children but no primitive props.

**Fix:** When there are no editable props, still render the children (toolbar) without the Popover wrapper:
```typescript
if (editableProps.length === 0) return <>{children}</>;
```

**Refs:**
- `packages/core/src/generated/components.ts` — check which components have all-reactnode props
- `packages/app/src/editor/extensions/JsxComponentView.tsx:78-86` — PropPanel wraps ComponentToolbar

🟠 2) `packages/core/src/registry/jsx-component-factory.ts:269-276 || rendermarkdown-cross-bleed` **renderMarkdown serializes all flat-union attributes, not just the component's own props**

**Issue:** `renderMarkdown` iterates all `node.attrs` entries and emits any non-internal, non-empty attribute as a JSX prop. Because the attribute union is flat across all 21 components, a `<Callout>` node technically has `src`, `autoPlay`, `columns`, etc. as attributes (defaulting to `undefined`). If any code path sets a cross-component attribute to a truthy value (e.g., a bug in slash-command defaults, or programmatic attribute setting by an agent), it serializes foreign props onto the wrong component.

**Why:** While the defaults are `undefined` and normal editing flows won't trigger this, the design provides no guardrails. An agent write, a future bug in default-prop logic, or a manifest collision (two components declaring props with the same name but different semantics) would produce silently incorrect markdown. The manifest already has collisions: `type` exists on both `Callout` (enum: info/warn/error) and `TypeTable` (unrelated enum).

**Fix:** Filter serialized props through the per-component manifest entry at render time:
```typescript
const meta = manifest[componentName];
const allowedProps = meta ? new Set(meta.props.filter(p => p.type !== 'reactnode').map(p => p.name)) : null;
for (const [key, value] of Object.entries(attrs)) {
  if (INTERNAL_ATTRS.has(key)) continue;
  if (allowedProps && !allowedProps.has(key)) continue;
  // ... existing logic
}
```
This is a modest change that makes the serialization layer defensively correct.

**Refs:**
- `packages/core/src/registry/jsx-component-factory.ts:57-70` — `collectPropAttributes` creates the flat union
- `packages/core/src/generated/components.ts` — shows `type` prop on both Callout and TypeTable

### 🟡 Minor (2)

🟡 1) `packages/core/src/registry/jsx-parser.ts:66-67 || literal-value-type-unsafety` **Acorn Literal.value assigned to `string | boolean | number` without type guard**

**Issue:** `attr.value.value` from acorn's `Literal` AST node is typed as `string | boolean | number | null | RegExp | bigint`. The code assigns it directly to `props[name]` which is typed as `Record<string, string | boolean | number>`. A `null` literal (`prop={null}`) or a regex literal would silently produce a `null`/`RegExp` in the props record, violating the type contract.

**Why:** In practice, JSX attributes almost never use `null` or regex literals, but the code makes a type-safety promise it doesn't keep. A `null` value flowing through to `buildJsxString` would produce `prop="null"` (via string coercion) on re-serialization, changing the semantic meaning.

**Fix:** Add a type guard after the literal extraction:
```typescript
if (exprValue.type === 'Literal') {
  const v = exprValue.value;
  if (typeof v === 'string' || typeof v === 'boolean' || typeof v === 'number') {
    props[name] = v;
    continue;
  }
  return null; // non-primitive literal → void fallback
}
```

🟡 2) `packages/app/src/editor/components/PropPanel.tsx:270-273 || number-control-nan` **NumberControl produces NaN on empty or partial input**

**Issue:** `onChange={(e) => onChange(Number(e.target.value))}` — when the user clears the input or types a partial number (e.g., `-`, `.`), `Number('')` returns `0` and `Number('-')` returns `NaN`. The `NaN` is stored as a node attribute, and `buildJsxString` would serialize it as `prop={NaN}` which is not valid JSX and would fail to parse on reload.

**Why:** This is another path to silent data corruption via the serialization layer, though it requires the user to partially edit a number field and then save before completing the input.

**Fix:** Guard against NaN before calling onChange:
```typescript
onChange={(e) => {
  const n = Number(e.target.value);
  if (!Number.isNaN(n)) onChange(n);
}}
```

### 💭 Consider (2)

💭 1) `packages/app/src/editor/components/SlashCommandMenu.tsx:75-83 || mutable-counter-in-render` **Mutable `flatIndex` counter during render body**

The `flatIndex` variable at line 75 is incremented inside the JSX render body (`const idx = flatIndex++` at line 83). This works because the component re-renders on each keystroke, resetting the variable, but it's a subtle pattern that relies on single-pass rendering semantics. React Strict Mode double-invokes render functions, which would cause `flatIndex` to count double. Consider computing a flat array with indices outside the render return, or using `useMemo` to pre-compute the flat index mapping.

💭 2) `packages/app/src/editor/components/componentMap.ts:1-44 || eager-static-imports` **All 21 component implementations are eagerly imported**

`componentMap.ts` statically imports every React component from fumadocs-ui, docskit, and local shadcn modules. These all land in the main bundle regardless of whether the user's document uses them. For the current 21 components this is likely acceptable, but as the registry grows this becomes a bundle-size concern. Consider lazy imports or a dynamic registry pattern if the component count grows significantly.

### 🧹 While You're Here (1)

🧹 1) `packages/core/src/index.ts || dead-legacy-export` **Legacy `JsxComponent` is still exported from core's public API**

The legacy single-attribute `JsxComponent` extension from `jsx-component.ts` is still re-exported from `packages/core/src/index.ts`, but `shared.ts` now uses the factory-produced extensions exclusively. This dead export may confuse consumers or agents that discover it via the public API. Consider removing it or marking it `@deprecated` with a pointer to the new extensions.

---

## 🚫 REQUEST CHANGES

**Summary:** The unescaped-quotes serialization bug is a confirmed data-loss path that should be fixed before merge. The PropPanel null-return hides the toolbar for ~5 components, which is a meaningful UX gap. The renderMarkdown cross-bleed is a correctness hardening issue that's low-risk today but creates a fragile foundation for the flat attribute union design. The remaining items are quality improvements worth addressing but not blocking.

<details>
<summary>Discarded (12)</summary>

| Location | Issue | Reason Discarded |
|----------|-------|------------------|
| `packages/core/src/registry/jsx-component-factory.ts:22-46` | Global marked singleton mutation is unsafe for multi-instance scenarios | By-design for this architecture; single ESM instance guaranteed by module semantics. SPEC D10 documents this explicitly. |
| `packages/app/src/editor/extensions/JsxComponentView.tsx` | Missing React error boundary around component rendering | Pre-existing architectural decision; error boundaries are a general app-level concern, not specific to this changeset. |
| `packages/app/src/editor/components/PropPanel.tsx` | Inline styles instead of Tailwind classes | Consistent with existing editor component patterns in this codebase (e.g., SlashCommandMenu, ComponentToolbar all use inline styles). |
| `packages/app/src/editor/extensions/slash-commands.tsx:89-93` | DOM portal created without defensive cleanup on rapid open/close | The cleanup function at line 147-155 handles unmount correctly; the race condition is theoretical and TipTap's Suggestion lifecycle guarantees sequential calls. |
| `packages/core/src/registry/types.ts` | PropDef should be a discriminated union to prevent illegal states | Valid type design observation but a non-blocking enhancement; the current flat interface is sufficient and consistent with how TipTap types work internally. |
| `packages/app/src/editor/components/PropPanel.tsx` | Form inputs lack accessible labels | Valid accessibility concern but pre-existing pattern across editor UI; not a regression from this changeset specifically. |
| `packages/core/src/registry/jsx-parser.ts:34` | Bare `catch {}` swallows acorn parse errors | Intentional by design — parse failure → null → void fallback. The null return is the error signal. Logging would be noisy for every non-JSX block. |
| `packages/core/src/registry/jsx-component-factory.ts:286` | Silent catch on `_unknownAttrs` JSON.parse | Defensive coding for malformed stored data; appropriate for a carrier attribute. Logging would be noisy. |
| `packages/app/src/editor/extensions/JsxComponentView.tsx:52-57` | Double `markUserTyping()` call (JsxComponentView + PropPanel) | The call in JsxComponentView's `handlePropChange` and PropPanel's `PropControl.handleChange` are the same code path — `handlePropChange` calls `markUserTyping` then `updateAttributes`, while PropPanel calls `markUserTyping` then `onChange` (which IS `handlePropChange`). Verified: this is indeed double-calling. However, `markUserTyping` is idempotent (just sets a timestamp), so double-call has no functional impact. |
| `packages/app/src/editor/components/SlashCommandMenu.tsx:29` | Uses `forwardRef` in React 19 (unnecessary) | Minor API modernization; not a bug and `forwardRef` still works in React 19. |
| `packages/core/src/extensions/shared.ts` | Factory call at module load time blocks startup | The manifest is synchronous committed ESM — no I/O, no async. This is effectively a static initializer. |
| `packages/app/src/editor/extensions/slash-commands.tsx` | Portal container lacks ARIA listbox semantics | Valid accessibility enhancement but not a regression; the existing editor menus follow the same pattern. |

</details>

<details>
<summary>Reviewer Stats</summary>

| Reviewer | Returned | Kept |
|----------|----------|------|
| `pr-review-standards` | 8 | 3 |
| `pr-review-types` | 6 | 1 |
| `pr-review-tests` | 5 | 0 |
| `pr-review-architecture` | 7 | 1 |
| `pr-review-errors` | 6 | 1 |
| `pr-review-frontend` | 8 | 2 |
| `pr-review-precision` | 7 | 1 |
| `pr-review-consistency` | 5 | 1 |

</details>

</details>

## Fix Response 0

### Addressed
- 🔴 **unescaped-quotes-in-serialized-props** (`jsx-component-factory.ts:109`): Added `escapeJsxAttrValue()` that encodes `&` → `&amp;` and `"` → `&quot;` in string prop values before interpolation. Verified via bun test that acorn-jsx automatically decodes HTML entities in JSX string attributes, so the round-trip is correct. Added 4 test cases for quote and ampersand escaping.
- 🟠 **prop-panel-null-hides-toolbar** (`PropPanel.tsx:34`): Changed early return from `return null` to `return <>{children}</>` so the ComponentToolbar (name badge + gear icon) is still rendered for the 7 components with all-reactnode props (Cards, Steps, Step, ImageZoom, Files, TypeTable, CodeGroup).
- 🟠 **rendermarkdown-cross-bleed** (`jsx-component-factory.ts:269-276`): Fixed both parse and render phases. Parse phase now classifies attributes per-component (`declaredProps.has(key) && key in propAttrs`) instead of just checking the flat union — attributes not declared by this component go to `_unknownAttrs` where they're preserved via the collision policy merge. Render phase filters serialized props through the per-component manifest (`meta.props.map(p => p.name)`) so cross-component attributes from the flat union can't bleed through. Both collision policy and cross-bleed prevention work correctly.
- 🟡 **literal-value-type-unsafety** (`jsx-parser.ts:66-67`): Added type guards at both string-literal and expression-literal code paths. `null`, `RegExp`, and `bigint` values now cause `parseJsx` to return `null` (void fallback), matching the existing handling for non-primitive expressions.
- 🟡 **number-control-nan** (`PropPanel.tsx:270-273`): Added `Number.isNaN(n)` guard in NumberControl's onChange handler. NaN values from partial inputs (`-`, `.`) are now silently dropped instead of flowing through to node attributes and breaking JSX serialization.
- 🧹 **dead-legacy-export** (`packages/core/src/index.ts`): Removed the `export { JsxComponent }` line. No code imports it — the factory-produced `jsxComponentEditable`/`jsxComponentVoid` (already exported from `shared.ts`) are the replacements per US-006 acceptance criteria.

### Declined
- 💭 **mutable-counter-in-render** (`SlashCommandMenu.tsx:75-83`): Finding is incorrect. `let flatIndex = 0` is a function-scoped local variable inside the `forwardRef` callback — each render invocation creates a fresh scope, so React Strict Mode's double-invoke resets the counter correctly. The variable is not a ref, state, or external mutable. Each invocation produces the same output, satisfying React's purity requirement.
- 💭 **eager-static-imports** (`componentMap.ts:1-44`): Pre-existing architectural decision per SPEC — 21 components are explicitly hardcoded. The reviewer agrees "for the current 21 components this is likely acceptable." Custom component discovery is explicitly scoped as Future Work.

### Declined Findings Summary

| Finding | Classification | Future-relevant | Evidence |
|---------|---------------|-----------------|----------|
| eager-static-imports | Pre-existing, acceptable for current scale | Yes | SPEC hardcodes 15 built-ins + 6 derivatives; reviewer acknowledges "likely acceptable." When component count grows, lazy imports or dynamic registry pattern should be considered. |


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
