# Evidence: Sidebar/Panel Form

**Dimension:** Sidebar/panel form pattern (TinaCMS, Sanity, Front Matter CMS, WordPress, Ghost)
**Date:** 2026-04-24
**Sources:** TinaCMS docs, Sanity Studio, Front Matter CMS (VS Code extension), WordPress Gutenberg, Ghost editor

---

## Key products referenced

- TinaCMS — schema-driven sidebar with `isBody` separation
- Sanity Studio — "everything is a form field" approach (no sidebar/canvas split)
- Front Matter CMS — VS Code sidebar panel for markdown frontmatter
- WordPress Gutenberg — right sidebar with Block/Post tabs
- Ghost — slide-in drawer triggered by gear icon

---

## Findings

### Finding: TinaCMS establishes the canonical schema-driven sidebar pattern
**Confidence:** CONFIRMED
**Evidence:** TinaCMS documentation (tina.io)

Persistent sidebar alongside the editor canvas. Schema defined in `tina/config.ts` — `fields` array with `name`, `type`, `label`, `description`. The `isBody: true` field renders as main canvas editor; all others render as sidebar form controls.

- Field types: `string`, `number`, `boolean`, `datetime`, `image`, `rich-text`, `reference`, `object` (nested/template blocks)
- `ui.component` — swap any field's renderer with a custom React component
- `wrapFieldsWithMeta` HOC — provides consistent chrome (label, description, error, required indicator) for custom fields
- Validation via `ui.validate` function (returns error string or undefined)
- Lists via `list: true` on any scalar type

**Implications:** The `isBody` / sidebar split with extensible field components is the most composable architecture for a collaborative editor.

### Finding: Sanity eliminates the sidebar entirely — body is one field among many
**Confidence:** CONFIRMED
**Evidence:** Sanity Studio documentation, schema system

No separate "canvas" and "sidebar." The entire editing experience is a single scrollable form. The Portable Text editor is one field among many in a vertical form layout. Schema order determines render order.

- Complex nested objects: `object` type renders as collapsible fieldsets; arrays of objects render as reorderable card lists
- "Desk structure" panes: customizable split views (list + form, form + preview)
- Body content has no privileged position

**Implications:** Powerful for structured content but eliminates the canvas/sidebar duality that writers expect. Not suitable for a writing-first editor where body content is primary.

### Finding: Front Matter CMS maps YAML keys directly to VS Code sidebar form fields
**Confidence:** CONFIRMED
**Evidence:** Front Matter CMS documentation (frontmatter.codes)

Dedicated webview panel in VS Code sidebar. Schema defined in `frontmatter.json` with content types and field definitions.

- Auto-populates form from file's YAML frontmatter when opened
- Field types: `string`, `boolean`, `number`, `datetime`, `image`, `taxonomy` (tag input with autocomplete), `choice` (dropdown), `slug`, `list`, `block` (nested groups), `dataFile` (reference)
- Tags: autocomplete from known values + inline creation of new values ("unknown value creation" pattern)
- Writes changes back to YAML frontmatter in the open file

### Finding: WordPress Gutenberg uses tabbed sidebar — Block settings + Post metadata
**Confidence:** CONFIRMED
**Evidence:** WordPress Gutenberg documentation, plugin API

Right-hand sidebar with two tabs: "Block" (selected block's settings) and "Post" (document-level metadata). Toggleable via gear icon, defaults to visible.

- Post tab: Categories (hierarchical checkboxes + "Add new"), Tags (comma input + autocomplete), Featured Image, Excerpt, Permalink, Discussion settings, Page Attributes
- Plugin extensibility: `registerPlugin` + `PluginDocumentSettingPanel` slot injects custom panels into the Post tab
- Custom meta via `useEntityProp('postType', 'post', 'meta')` + `register_post_meta` PHP

**Implications:** The tabbed Block/Post sidebar prevents the two concerns from competing for space. The SlotFill plugin architecture for injecting custom panels is the most extensible registration mechanism among the products surveyed.

### Finding: Ghost uses an on-demand drawer — content-first, metadata-second
**Confidence:** CONFIRMED
**Evidence:** Ghost editor product behavior

"Post settings" drawer slides in from right, triggered by gear icon. NOT persistently visible — overlays or pushes the editor canvas. Demands focus — no simultaneous editing of both surfaces.

- Fields: Pub date, Tags (multi-select + autocomplete + inline creation), Authors, Excerpt, Feature image, URL slug, Meta title/description (with character count + Google preview), Twitter/Facebook card overrides, Code injection
- Content-first philosophy: writing surface stays distraction-free

**Implications:** The drawer-on-demand pattern works for publish-oriented workflows where metadata is reviewed periodically rather than maintained continuously.

---

## Cross-product comparison

| Dimension | TinaCMS | Sanity Studio | Front Matter CMS | Gutenberg | Ghost |
|-----------|---------|---------------|------------------|-----------|-------|
| Panel position | Persistent sidebar | Inline (no sidebar) | VS Code sidebar panel | Right sidebar, tabbed | Slide-in drawer |
| Visibility | Always visible | Always visible | Always visible | Toggle, default on | On-demand toggle |
| Schema source | `tina/config.ts` | Studio schema files | `frontmatter.json` | PHP + JS plugin API | Hardcoded |
| Body/metadata relationship | Separated | Peers | Separated | Separated | Separated |
| Custom field extensibility | High | Very high | Moderate | High (SlotFills) | Low |
| Nested objects | `object` type | Native, deeply nestable | `block` type | Via plugin | Not supported |

---

## Gaps / follow-ups

- Performance implications of persistent sidebar with many fields (re-renders on every keystroke)
- Mobile/responsive sidebar behavior (most collapse to bottom sheet)
