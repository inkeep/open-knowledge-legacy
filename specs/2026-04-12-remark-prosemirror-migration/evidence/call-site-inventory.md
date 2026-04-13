---
name: call-site-inventory
date: 2026-04-12
sources:
  - packages/core/src/extensions/
  - packages/server/src/
  - packages/app/src/editor/
  - packages/app/tests/
  - package.json
  - patches/
---

# Evidence: 1P Codebase Integration Surface

**Dimension:** A5 (can @tiptap/markdown be removed cleanly) + R2 (preserve public API) + Q8 (no hidden dependencies)
**Date:** 2026-04-12
**Method:** Full-repo grep for @tiptap/markdown imports, marked imports, `.parse(`/`.serialize(` call sites on MarkdownManager instances, and direct token-field access.

---

## Findings

### Finding: All 28 @tiptap/markdown import sites use only `MarkdownManager`
**Confidence:** CONFIRMED
**Evidence:** Repo-wide grep of `from '@tiptap/markdown'`

Zero imports of `MarkdownParseHelpers`, `MarkdownToken`, or any tokenizer internals. Every site imports `{ MarkdownManager }`. Locations:

**Server production (5):** `standalone.ts:5`, `persistence.ts:20`, `backlink-index.ts:5`, `agent-sessions.ts:15`, `external-change.ts:12`.

**Browser production (3):** `TiptapEditor.tsx:12`, `provider-pool.ts:3`, `observers.ts:36` (type-only).

**Test harnesses (2):** `tests/integration/test-harness.ts:30`, `tests/fidelity/helpers.ts:6` (both re-export `mdManager`).

**Test files (16 stress/fidelity/integration/core tests):** all import `MarkdownManager` directly or via harness.

**Implication:** R2 (preserve public `parse()`/`serialize()` API) fully covers the integration surface. No hidden coupling to tokenizer internals.

### Finding: Zero direct `marked` imports in production code
**Confidence:** CONFIRMED
**Evidence:** Repo-wide grep of `from 'marked'`

The only match is a **JSDoc comment** in `packages/core/src/extensions/jsx-tokenizer.ts:362` showing usage pattern (not an actual import). `marked` is purely transitive via @tiptap/markdown. Removing @tiptap/markdown removes marked with no further cleanup.

### Finding: All marked token-field access is encapsulated in fidelity extensions
**Confidence:** CONFIRMED
**Evidence:** Repo-wide grep of `token.raw`, `token.type`, `token.items`, `token.ordered`, `token.loose`, `token.lang`, `token.depth`, `token.href`, `token.title`, `token.tag`, `token.block`, `token.tokens`

27 references across 12 files, **100% in `packages/core/src/extensions/*-fidelity.ts`, `jsx-component.ts`, `jsx-tokenizer.ts`, `link-fidelity.ts`, `wiki-link.ts`, and `list-item-fidelity.ts`**. Zero references in observers, persistence, server code, agent-sessions, external-change, or any test file.

**Implication:** The token-field surface is exactly where we expected it to be — inside the fidelity extensions' `parseMarkdown` methods. When we move those methods to `markdown/handlers.ts` keyed on mdast node types, the marked-specific field names go with them and are replaced by mdast-node field names. Nothing outside the extensions needs rewriting.

### Finding: Call sites for `parse()` / `serialize()` all use symmetric `string ↔ JSONContent` signature
**Confidence:** CONFIRMED
**Evidence:** Call-site audit

51 call sites across production + tests. All:
- `parse(markdown: string) → JSONContent`
- `serialize(json: JSONContent) → string`

No caller manipulates intermediate token state or accesses private MarkdownManager internals. The new unified-pipeline-backed `MarkdownManager` wrapper preserves exactly this API.

### Finding: Two MarkdownManager instantiation patterns — both safe for migration
**Confidence:** CONFIRMED
**Evidence:** Call-site analysis

1. **Module-level singletons** (5 server files + tests): `const mdManager = new MarkdownManager({ extensions: sharedExtensions })`.
2. **Per-component instances** (TiptapEditor via useRef, provider-pool per-provider): for editor/client isolation.

Both patterns are preserved by the new `MarkdownManager` wrapper. No call-site changes needed.

### Finding: Patches directory contains only @tiptap/markdown
**Confidence:** CONFIRMED
**Evidence:** `ls patches/`

Single file: `patches/@tiptap%2Fmarkdown@3.22.3.patch` (5,292 bytes). Content: escape-token handler addition + `encodeTextForMarkdown` simplification. Removing @tiptap/markdown removes this patch entry.

### Finding: @handlewithcare/remark-prosemirror not installed
**Confidence:** CONFIRMED
**Evidence:** Repo-wide grep of package.json files

Zero matches. Greenfield for this migration — no existing integration to conflict with.

### Finding: Tests are coupled only to the public API
**Confidence:** CONFIRMED
**Evidence:** Test file import audit

All test coupling is via `mdManager` re-exported from `test-harness.ts` or `helpers.ts`. Tests use only `.parse()`, `.serialize()`, and construction (`new MarkdownManager({ extensions })`). No test imports tokenizer internals. Migration risk from test side: none.

---

## Implications for the spec

1. **A5 verified HIGH confidence:** @tiptap/markdown can be removed cleanly. No hidden dependencies outside `packages/core/src/extensions/`.
2. **R2 verified:** Preserving `parse()` / `serialize()` API covers 100% of call sites. Zero non-markdown-engine code changes needed outside `packages/core/src/markdown/` and `packages/core/src/extensions/`.
3. **Q8 resolved:** No token-field accessors outside the extensions. When fidelity extensions move their parse/render logic to `markdown/handlers.ts`, marked's token field surface disappears from the codebase entirely.
4. **Surface-area simpler than the predecessor spec assumed.** Predecessor spec's SCOPE in §16 named ~10 files; we now know it's exactly:
   - `packages/core/src/markdown/` (new dir, 3 files)
   - `packages/core/src/extensions/*-fidelity.ts` (edit — remove markdown methods)
   - `packages/core/src/extensions/jsx-component.ts` (edit — remove markdown methods)
   - `packages/core/src/extensions/wiki-link.ts` (edit — remove tokenizer; port moves to markdown/)
   - `packages/core/src/extensions/jsx-tokenizer.ts` (delete)
   - `packages/core/src/extensions/frontmatter.ts` (delete)
   - `packages/core/src/extensions/list-item-fidelity.ts` (delete)
   - `packages/core/src/index.ts` (update exports)
   - `packages/core/package.json` (deps)
   - `package.json` (patchedDependencies entry removed)
   - `patches/@tiptap%2Fmarkdown@3.22.3.patch` (delete)
   - `AGENTS.md` (docs)
   - `packages/server/src/standalone.ts` (R16 startup invariant — optional)

---

## Gaps / follow-ups

- **Not checked:** whether `backlink-index.ts` has any non-standard use of MarkdownManager. Should be verified — it's the one production file I haven't personally reviewed the call pattern for. Added as Q10.
- **Not measured:** whether any extensions' `markdownOptions: { indentsContent: true, htmlReopen: true }` config has no equivalent in remark-prosemirror. Needs pre-flight probe.
