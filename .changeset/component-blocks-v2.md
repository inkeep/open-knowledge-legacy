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

- The inline MDX element node (`jsxInline`) no longer stores `props`;
  its text content IS the source of truth. This is a load-bearing
  change for collaborative editing — clients on older versions
  coexisting with this version in the same live session will see
  inline MDX render as empty text. Upgrade all clients in a session
  together. Persisted documents are unaffected; the on-disk MDX is
  preserved.
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
