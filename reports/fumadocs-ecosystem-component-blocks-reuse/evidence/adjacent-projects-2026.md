# Evidence: Adjacent Open-Source Projects (2026 Status)

**Dimension:** D5 — Adjacent projects building on fumadocs conceptually
**Date:** 2026-04-14
**Sources:** npm registry, GitHub repos, project documentation sites

---

## Key pages referenced

- MDXEditor: npmjs.com/package/@mdxeditor/editor (v3.54.0, ~493K/wk)
- TinaCMS: npmjs.com/package/tinacms (v3.7.2)
- Keystatic: npmjs.com/package/@keystatic/core (v0.5.50)
- Plate: platejs.org/docs/changelog (v48+)
- BlockNote: npmjs.com/package/@blocknote/core (v0.47.3)
- fuma-editor: github.com/fuma-nama/fuma-editor
- Contentlayer: npmjs.com/package/contentlayer (unmaintained)
- Velite: npmjs.com/package/velite (v0.3.1)

---

## Findings

### Finding: MDXEditor is actively maintained but architecturally divergent from our approach
**Confidence:** CONFIRMED
**Evidence:** npm, GitHub, mdxeditor.dev

- Version: 3.54.0 (April 11, 2026). ~493K weekly downloads.
- Architecture: Lexical-based (not ProseMirror). Plugin system.
- JSX: `JsxComponentDescriptor` with `GenericJsxEditor`. 3-type prop model (string/number/expression).
- Error recovery: Since v2.3.3, parse failures trigger source-editor fallback. Binary: parses or source mode.
- No CRDT/Yjs support.
- No source fidelity preservation.
- No TypeScript prop introspection.
- No 2026 additions relevant to our spec (checked changelog).

**Implications:** Closest direct competitor for MDX editing. Different foundation (Lexical), different philosophy (delegated Editor components, not auto-generated controls). No source fidelity means no gamma analogue.

### Finding: TinaCMS active but no CRDT, CVE in 2026
**Confidence:** CONFIRMED
**Evidence:** npm, GitHub, tina.io/roadmap

- Version: 3.7.2 (April 9, 2026). Active development.
- MDX: Template-based component support with rich-text editor toggle.
- Collaboration: Git-based branching only. No CRDT or real-time.
- Security: CVE-2026-28792 (critical drive-by attack vulnerability).
- 2026 additions: Better branch operations, `@tinacms/schema-tools`, media dashboard telemetry.
- Not a collaboration competitor. Different architectural direction (Git CMS).

### Finding: Keystatic's content-components API is the closest ProseMirror-based prior art
**Confidence:** CONFIRMED
**Evidence:** keystatic.com/docs/content-components, GitHub

- Version: @keystatic/core 0.5.50 (March 27, 2026). ~2K GitHub stars.
- Architecture: ProseMirror-based for rich text fields.
- Five component kinds: wrapper (with children), block (self-closing), inline, mark, repeating.
- Schema-based prop definitions using Keystatic field types.
- Output: MDX or Markdoc.
- No CRDT/collaboration.
- No source fidelity or dirty tracking.

**Implications:** The content-components API taxonomy (wrapper/block/inline/mark/repeating) maps cleanly to our PM schema. The `repeating` kind is directly relevant to container components. Worth studying for API ergonomics.

### Finding: Plate (Slate+Yjs) is the closest competitor for MDX + collaboration
**Confidence:** CONFIRMED
**Evidence:** platejs.org/docs/markdown, platejs.org/docs/yjs

- Version: v48+ era (March 2026). Actively maintained.
- MDX: `@platejs/markdown` with `remarkMdx`. Custom serialize/deserialize rules.
- `memoize` option adds raw markdown to nodes for fidelity.
- Collaboration: Yjs via `@udecode/plate-yjs` + slate-yjs. Multiple providers.
- Custom blocks: `withComponent` method. Multi-part plugin support.
- March 2026: inline-combobox Yjs support.

**Implications:** Plate is the closest competitor combining MDX + Yjs collaboration. Different foundation (Slate vs ProseMirror). The `memoize` option is the closest thing to our gamma dirty-tracking found in any tool (stores raw markdown on nodes for serialization fidelity). Does not target source-level fidelity or dual-representation CRDT model.

### Finding: BlockNote has strong Yjs but no MDX
**Confidence:** CONFIRMED
**Evidence:** blocknotejs.org, npm

- Version: @blocknote/core 0.47.3 (April 12, 2026).
- Architecture: ProseMirror + TipTap, Notion-style blocks.
- Collaboration: First-class Yjs with Liveblocks, PartyKit, Y-Sweet.
- MDX: No native support. `blocksToMarkdownLossy()` — explicitly lossy.
- Custom blocks: `createReactBlockSpec()` — schema-based.

**Implications:** Good Yjs/collaboration patterns. No MDX means no component story for our needs.

### Finding: Contentlayer is effectively dead; Content Collections is the successor
**Confidence:** CONFIRMED
**Evidence:** npm, wisp.blog analysis

- Contentlayer: Last npm publish >12 months ago. Stackbit (sponsor) acquired by Netlify. Maintainer allocates ~1 day/month. 22K weekly downloads (inertia). Community fork `contentlayer2` exists.
- Content Collections: Active successor by Sebastian Sdorra. `@fumadocs/content-collections` v1.2.2 (published April 14, 2026 — same day as this research).
- Velite: v0.3.1 (January 2026). Active but low-cadence. No fumadocs adapter. Separate community.

### Finding: fuma-editor validates TipTap+Hocuspocus for editor building
**Confidence:** CONFIRMED
**Evidence:** github.com/fuma-nama/fuma-editor (7 commits, WIP)

Created March 29, 2026 by the fumadocs author. Uses TipTap + Hocuspocus + Yjs — same stack as Open Knowledge. Confirms the tech stack choice. Does NOT reuse fumadocs-ui, does NOT support MDX. Uses Base UI (not Radix).

---

## Negative searches

* No CRDT-based MDX component editor found in any framework
* No fumadocs-specific visual editor found
* No Keystatic CRDT/collaboration features found
* No MDXEditor Yjs/CRDT support found or planned
