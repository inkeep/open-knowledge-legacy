---
"@inkeep/open-knowledge-core": minor
"@inkeep/open-knowledge-server": minor
"@inkeep/open-knowledge": minor
---

feat: Component Blocks v2 — 5-pack foundation (Callout + Image + Video + Audio + Accordion)

The editor now ships five built-in component primitives — `Callout`, `Image`,
`Video`, `Audio`, and `Accordion` — each with a WYSIWYG settings panel, a
slash-command insertion menu, and lossless on-disk round-trip for both the
MDX form and the markdown form (where one exists). Every primitive is a
DIY React component on Open Knowledge's own brand (shadcn / Tailwind); the
editor bundle no longer pulls in `fumadocs-ui`'s React surface or its CSS
variable bridge.

What you get out of the box:

- **Callout** — five GFM alert types (`note` / `tip` / `important` /
  `warning` / `caution`) plus optional `title` / `icon` / `color` / and
  Obsidian-style foldable chrome (`> [!NOTE]+` / `-`). Authoring works in
  any of three forms: GFM alert blockquote, foldable Obsidian opener, or
  `<Callout type="…">…</Callout>` MDX JSX. Common alias tokens
  (`success` → `tip`, `danger` → `caution`, etc.) fold to the GFM 5
  on disk.
- **Image** — `<Image src=… alt=… width=… caption=… />` MDX, plus
  standard CommonMark `![alt](src)`. Both forms render through the same
  descriptor with click-to-zoom on by default; the MDX form additionally
  exposes `caption` (renders as `<figure>` + `<figcaption>`), explicit
  dimensions, and `loading` / `zoom` toggles.
- **Video** — pure HTML5 `<video>` wrapper with native controls. No
  YouTube / Vimeo URL sniffing — embed services with a raw `<iframe>` in
  MDX (matches Mintlify's pattern). `<track>` and `<source>` children
  round-trip.
- **Audio** — pure HTML5 `<audio>` wrapper with native controls always
  on. `<source>` and `<track>` children round-trip.
- **Accordion** — standalone HTML5 `<details>` / `<summary>` substrate,
  no wrapper component required. Cross-browser exclusive grouping via
  HTML5 `<details name="…">` (Chrome 120+, Safari 17.2+, Firefox 130+).
  Authors can write either `<details><summary>X</summary>Y</details>` or
  `<Accordion title="X">Y</Accordion>` — both render the same descriptor.

Other improvements:

- Auto-generated settings panel from each component's prop types
  (string / boolean / number / enum) — no separate component prop docs
  required.
- Slash-command insertion with sensible defaults; the settings panel
  auto-opens on insertion so required fields are filled in before you
  move on.
- Hover chrome with move-up / move-down / delete / settings buttons.
- Keyboard navigation throughout (Tab / Esc / arrow keys with
  context-aware handling).
- Broken or unrecognized MDX components automatically open in an
  embedded source-code editor so authored content stays editable —
  nothing silently disappears.
- Both pristine and dirty save paths preserve the on-disk shape:
  unedited blocks round-trip byte-for-byte; edited blocks canonicalize
  to the MDX JSX form.

Breaking changes:

- Both the inline MDX element node (`jsxInline`) and the block MDX
  component node (`jsxComponent`) changed PM-schema shape in this
  release. `jsxInline` drops its `attributes` and `sourceRaw` attrs —
  its text content IS the source of truth. `jsxComponent` widens from
  an atom with a raw-content attr to a non-atom block with `block*`
  children and new structured attrs (`componentName`, `kind`,
  `attributes`, `sourceRaw`, `sourceDirty`, `props`). This is a
  load-bearing change for collaborative editing — older clients
  coexisting with this version in the same live session substitute
  both nodes to `rawMdxFallback` (raw source preserved as editable
  text) via the y-tiptap schema-throw substitution patch. Upgrade all
  clients in a session together — both inline JSX authoring and
  component-block authoring are affected, not just inline. Persisted
  documents are unaffected; the on-disk MDX is preserved.
- Content using component names that are no longer built in
  (`Tabs`, `Card`, `CardGroup`, `Steps`, `Banner`, `Files`,
  `TypeTable`, `InlineTOC`, `Mermaid`, `AudioPlaceholder`, `ImageZoom`)
  opens as an editable raw-source block. Content is preserved
  verbatim. Rename `<AudioPlaceholder />` → `<Audio />` and
  `<ImageZoom>` → `<Image>` to pick up the new descriptors.

The compound-component tier (Tabs + Tab grouping, Accordion grouping
with shared chrome, Steps + Step) is not built in today; it returns
when concrete dev-docs / help-center authoring demand surfaces. No
public API will change for existing 5-pack consumers when that
happens.

Bundle size:

- Main app bundle stays flat (~210 kB gzipped) — the `fumadocs-ui`
  drop and 12-descriptor cut offset the 5-pack prop-surface widening
  and new selection-chrome plugins.
- Total JS across lazy-loaded chunks grows ~100 kB gzipped (~978 kB →
  ~1.08 MB) to accommodate CB-v2 feature surface (descriptor-dispatch
  registry, V2 editor cache, SelectionStatePlugin + Breadcrumb +
  SelectionAnnouncer + BlockDragHandle, nested CodeMirror for
  `rawMdxFallback`, slash-command menu, canonical/compat descriptor
  split with three additional read-only source-form descriptors
  (GFMCallout, CommonMarkImage, HtmlDetailsAccordion) for round-trip
  preservation). The `all JS chunks combined` size-limit ceiling is
  raised 1050 → 1100 kB (~2% headroom) to match. Delivered via
  on-demand chunk loading — users don't pay the full bill on first
  paint.
