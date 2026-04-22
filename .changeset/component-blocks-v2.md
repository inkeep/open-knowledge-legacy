---
"@inkeep/open-knowledge-core": minor
"@inkeep/open-knowledge-server": minor
"@inkeep/open-knowledge": minor
---

feat: Component Blocks v2 — typed props + editable children + block UX

Widens `jsxComponent` from atom to a block-container node (`atom: false, content: 'block*'`, `isolating: true`) with runtime descriptor dispatch for 17 built-in components (fumadocs callouts, cards, tabs, steps, accordions, files, image-zoom, banner, TypeTable, inline-TOC, Audio). Rewrites `jsxInline` to a thin `content: 'text*'` shape whose text content IS the source — inline JSX renders as editable source text in WYSIWYG (per SPEC NG14). Adds:

- Floating PropPanel with auto-generated controls (string/boolean/enum/number) from TypeScript interfaces via `react-docgen-typescript`
- Slash-command insertion with default-prop fallbacks and auto-open popover
- Hover-revealed SideMenu chrome: move up/down, delete, settings gear, add-child pill
- Keyboard navigation (Esc/arrow/Enter with suggestion + popover priority coordination)
- Typed-children guard for container components (Steps/Cards/Tabs/Files), CRDT-sync-safe
- Embedded CodeMirror nested editor for `rawMdxFallback` (parse-failure surface) with unified undo via PM transaction dispatch (no y-codemirror.next)
- Observer B flipped to `parseWithFallback` and ancestor-chain-local `findFallbackRegion` — broken nodes degrade only their tightest structural region
- Source-dirty tracking for hybrid serialization (byte-identical sourceRaw passthrough for pristine, `mdxJsxFlowElement` reconstruction for edited)
- Fumadocs CSS variable bridge so built-in components render with production styling inside the editor

Migration: existing `<Mermaid />` (and the former `<AudioPlaceholder />` stub) content falls through to the wildcard descriptor and auto-converts to an editable `rawMdxFallback` (nested CodeMirror) on first open — file bytes are preserved. Rename `<AudioPlaceholder />` → `<Audio />` to pick up the built-in descriptor chrome.

Schema note (per SPEC §FR-4, NG14): `jsxInline` narrows from `inline*`+attrs to `text*`+zero-attrs. The change is greenfield-authorized by the spec's user directive; the prior shape shipped in PR #136 (two days earlier) and is explicitly replaced with no migration. The `y-prosemirror@1.3.7` patch is the schema-throw safety net for **block**-context mismatches — it substitutes `rawMdxFallback` so content is preserved. For **inline**-context mismatches the patch logs + skips (inline Y.Items are NOT destructively deleted — a pre-existing-but-never-applied destructive delete was replaced with a no-op delete-from-mapping), so stale-schema inline content would render empty rather than corrupt the Y.Doc. Greenfield clears this for external consumers; mid-flight collab pairs should upgrade together.
