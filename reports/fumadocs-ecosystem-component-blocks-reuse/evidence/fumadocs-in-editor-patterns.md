# Evidence: Fumadocs Components in Editor Contexts

**Dimension:** D4 — fumadocs-in-editor patterns and concrete problems
**Date:** 2026-04-14
**Sources:** fumadocs-ui compiled source (node_modules/fumadocs-ui@16.1.0/dist/components/), fuma-editor source (github.com/fuma-nama/fuma-editor), MDXEditor issues, Milkdown discussions, Plate docs

---

## Key files / pages referenced

- fumadocs-ui/dist/components/callout.js — Server component, pure JSX
- fumadocs-ui/dist/components/tabs.js — Client component, Radix Tabs + complex state
- fumadocs-ui/dist/components/accordion.js — Client component, Radix Accordion
- fumadocs-ui/dist/components/steps.js — Server component, trivial CSS
- fumadocs-ui/dist/components/card.js — Server component, imports fumadocs-core/link
- fumadocs-ui/dist/components/codeblock.js — Client component, DOM queries
- fumadocs-ui/dist/components/files.js — Client component, Collapsible
- fuma-editor: github.com/fuma-nama/fuma-editor (WIP, March 2026)
- Milkdown MDX discussion: github.com/orgs/Milkdown/discussions/772
- MDXEditor nested content issue: github.com/mdx-editor/editor/issues/430

---

## Findings

### Finding: The fumadocs author built a separate editor (fuma-editor) without reusing fumadocs-ui components
**Confidence:** CONFIRMED
**Evidence:** fuma-editor GitHub repo (created March 29, 2026)

fuma-editor uses TipTap ^3.22.0 + Hocuspocus ^3.4.4 + Yjs ^13.6.30. Same stack as Open Knowledge. But:
- Uses Base UI ^1.3.0 (NOT Radix — different from fumadocs-ui's Radix foundation)
- Has its own design system (`fe-*` CSS classes)
- No MDX support visible — no custom component blocks, no JSX node types
- No attempt to embed fumadocs-ui components in the editor

**Implications:** The fumadocs author himself treats fumadocs-ui as docs-rendering-only. When building an editor, he started fresh. This validates that fumadocs-ui components are not designed for editor embedding.

### Finding: Callout and Steps are trivially embeddable in a NodeView
**Confidence:** CONFIRMED
**Evidence:** Source analysis of compiled component files

`callout.js`: Pure JSX function. No hooks, no state, no browser APIs. Uses `cn()` for className merging and lucide-react icons. Only dependencies: class-variance-authority, lucide-react. Returns `<div>` wrappers with children.

`steps.js`: Trivially simple: `<div className="fd-steps">` and `<div className="fd-step">`. Pure CSS-driven counter/before-pseudo styling. Zero JavaScript complexity.

Both work identically as client components despite being marked as server components — they contain no server-only APIs (`cache()`, `headers()`, async bodies).

### Finding: Tabs is the hardest fumadocs component to embed in a NodeView
**Confidence:** CONFIRMED
**Evidence:** Source analysis of tabs.js + tabs.unstyled.js

Complex state management:
- Uses `@radix-ui/react-tabs`
- React context: `createContext`/`useContext`
- `useId()` for render-order collection tracking (Headless UI pattern)
- `useLayoutEffect`, `useEffectEvent`, `useState`, `useMemo`
- Module-level `listeners` Map for cross-tab `groupId` synchronization
- `sessionStorage`/`localStorage` persistence
- URL hash anchor sync

The `useCollectionIndex()` function uses `useId()` for render-order collection. In a ProseMirror NodeView using React portals, this works (portals are in the React tree). With `ReactDOM.createRoot()` on a disconnected node, it breaks.

**NodeView-specific problem:** Module-level `listeners` Map is shared across ALL Tab instances in the editor. Two NodeViews rendering `<Tabs groupId="package-manager">` would synchronize — intended in docs, surprising in editor where each block should be independent.

### Finding: React.Children filtering is NOT used by fumadocs — collection pattern instead
**Confidence:** CONFIRMED
**Evidence:** tabs.js source analysis

Fumadocs Tabs does NOT use `React.Children.forEach/map` to filter Tab children. Instead:
- Each `<Tab>` self-registers into a context collection array via `useCollectionIndex()`
- Uses `useId()` for order-stable registration
- This is the Headless UI collection pattern

**Implications:** More compatible with NodeView portals than `React.Children` filtering would be, since portal-mounted children participate in React's tree.

### Finding: CSS variable dependency chain is required for all fumadocs-ui components
**Confidence:** CONFIRMED
**Evidence:** Component source analysis

All fumadocs-ui components use `fd-` prefixed CSS variables:
- `--color-fd-primary`, `--color-fd-card`, `--color-fd-border`, etc.
- Tailwind utility classes reference these variables
- Without fumadocs-ui's `style.css`, components render with broken colors

Need either: (a) load fumadocs CSS globally alongside editor, or (b) create a CSS variable bridge mapping editor theme → `fd-*` variables.

Conflict risk with editor Tailwind is moderate — the `fd-` namespace prevents direct class collisions but both systems share base Tailwind utilities. The `.prose-no-margin` and `.not-prose` classes assume Tailwind Typography context.

### Finding: Card component has fumadocs-core/link dependency requiring a shim
**Confidence:** CONFIRMED
**Evidence:** card.js source

`Card` imports `Link` from `fumadocs-core/link`, which wraps Next.js `next/link`. In a non-Next.js editor context, this import fails at module resolution time.

Required shim: alias `fumadocs-core/link` to a plain `<a>` wrapper in the editor's bundler config.

### Finding: CodeBlock assumes pre-highlighted HTML from build pipeline
**Confidence:** CONFIRMED
**Evidence:** codeblock.js source

The `<Pre>` wrapper assumes children contain pre-highlighted HTML from Shiki (applied during fumadocs-mdx's rehypeCode plugin at build time). In an editor context:
- No build-time Shiki highlighting available
- DOM queries: `getElementsByTagName`, `querySelectorAll` for tab content
- `navigator.clipboard.writeText()` for copy
- `use()` (React 19) for context consumption

Would need: either runtime Shiki (heavy — the dynamic-codeblock.js variant does this) or a simpler code display fallback.

### Finding: Milkdown + MDX integration is fundamentally broken
**Confidence:** CONFIRMED
**Evidence:** github.com/orgs/Milkdown/discussions/772

Key problems documented:
- `preset-commonmark` has `filterHTMLPlugin` that strips HTML/JSX
- Converting `mdxJsxFlowElement` mdast → ProseMirror fails: "Create prosemirror node from remark failed in parser"
- Workaround of rendering as paragraphs loses semantic meaning on round-trip
- Maintainer acknowledged HTML/MDX support was "still far from complete" (2022, no resolution since)

### Finding: Plate has the most mature MDX story among editor frameworks
**Confidence:** CONFIRMED
**Evidence:** Plate docs (platejs.org/docs/markdown)

- `@platejs/markdown` with `remarkMdx` plugin
- Custom `serialize`/`deserialize` rules per component
- Round-trip preserves custom elements through MDX tags
- `memoize` option adds raw markdown to nodes for additional fidelity
- Yjs collaboration works alongside MDX serialization

No fumadocs-specific integration exists.

---

## Negative searches

* "fumadocs tiptap" in GitHub: 0 results for fumadocs components in TipTap
* "fumadocs editor" in fumadocs repo issues: 0 relevant issues
* "fumadocs slate" / "fumadocs lexical": 0 results
* No documented component adapter layer for docs-site → editor-context in any framework

---

## Gaps / follow-ups

* Deeper source analysis of fuma-editor's TipTap configuration could reveal patterns for our editor setup
* The Plate `memoize` option for raw markdown preservation warrants deeper investigation as a partial gamma analogue
* The CSS variable bridge pattern needs concrete implementation research
