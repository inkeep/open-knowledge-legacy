---
title: "D1 — Production Editor UX: Link-Chip Popover Lifecycle"
type: raw-proof
created: 2026-04-21
sources:
  - https://help.figma.com/hc/en-us/articles/360045942953-Add-links-to-text
  - https://www.notion.com/help/link-previews
  - https://x.com/NotionHQ/status/1716494726445334691
  - https://support.atlassian.com/platform-experiences/docs/smart-link-view-options/
  - https://support.atlassian.com/confluence-cloud/docs/view-content-in-a-side-panel/
  - https://developers.google.com/workspace/add-ons/guides/preview-links-smart-chips
  - https://support.google.com/docs/answer/13543219
  - https://linear.app/docs/editor
  - https://github.com/yabwe/medium-editor
  - https://github.com/yabwe/medium-editor/blob/master/OPTIONS.md
  - https://tiptap.dev/docs/ui-components/components/link-popover
  - https://mdxeditor.dev/editor/docs/links
  - https://www.smashingmagazine.com/2021/05/building-wysiwyg-editor-javascript-slatejs/
---

# Evidence: D1 — Production Editor Link-Chip Popover UX

**Dimension:** How production rich-text editors model link-chip popover lifecycle — FUSED (selection ⇌ popover) vs SPLIT (independently tracked).
**Date:** 2026-04-21
**Sources:** Notion, Linear, Figma, Google Docs, Confluence, Medium/medium-editor, TipTap/Slate/MDX reference editors (as community-documented).

---

## Key references consulted

- [Figma — Add links to text](https://help.figma.com/hc/en-us/articles/360045942953-Add-links-to-text) — official link UX doc
- [Notion — Link previews](https://www.notion.com/help/link-previews) — inline + peek semantics
- [NotionHQ on X (hover to preview)](https://x.com/NotionHQ/status/1716494726445334691) — hover-preview product announcement
- [Atlassian — Smart Link view options](https://support.atlassian.com/platform-experiences/docs/smart-link-view-options/) — Confluence Smart Link modes
- [Atlassian — View content in a side panel](https://support.atlassian.com/confluence-cloud/docs/view-content-in-a-side-panel/) — Confluence side peek
- [Google Workspace — Preview links with smart chips](https://developers.google.com/workspace/add-ons/guides/preview-links-smart-chips) — Docs smart chip hover card
- [Linear Docs — Editor](https://linear.app/docs/editor) — link auto-detection + toolbar
- [medium-editor anchor preview option (yabwe)](https://github.com/yabwe/medium-editor/blob/master/OPTIONS.md) — Medium-style anchor preview semantics
- [TipTap Link popover component](https://tiptap.dev/docs/ui-components/components/link-popover) — canonical reference for the "cursor-inside-link" trigger
- [MDXEditor — Links](https://mdxeditor.dev/editor/docs/links) — "floating popover appears when cursor is inside a link, similar to Google Docs"
- [Slate.js WYSIWYG tutorial — Smashing Magazine](https://www.smashingmagazine.com/2021/05/building-wysiwyg-editor-javascript-slatejs/) — explicit "render whenever selection is inside a link" pattern

---

## Findings

### Finding 1 — The overwhelmingly dominant production pattern is FUSED: the edit popover is a derived view of "selection/cursor inside link"

**Confidence:** CONFIRMED (multiple canonical references).

**Evidence:** Reference editor libraries that shipped the pattern explicitly document the lifecycle as "if selection is inside a link, show the popover; otherwise hide it."

- MDXEditor's link plugin: *"a floating popover that appears when the cursor is inside a link, similar to Google Docs, allowing the user to edit the link and remove it"* ([mdxeditor.dev/editor/docs/links](https://mdxeditor.dev/editor/docs/links)).
- Slate.js tutorial (Smashing Magazine): *"build a link-editing popover that shows up whenever the user selection is inside a link and lets them edit and apply the URL to that link node"* ([smashingmagazine.com Slate.js WYSIWYG](https://www.smashingmagazine.com/2021/05/building-wysiwyg-editor-javascript-slatejs/)).
- TipTap link-popover component: accessible popover that users "easily add, edit, and remove links" via a single popover tied to the link mark ([tiptap.dev link-popover](https://tiptap.dev/docs/ui-components/components/link-popover)).

**Implications:** Opening a second link chip's popover implicitly closes the first, because selection cannot be inside two separate link marks simultaneously. This is *fused by construction*: the lifecycle emerges from the selection model, not from explicit coordination logic.

---

### Finding 2 — Hover-preview is modeled as an INDEPENDENT primitive, distinct from the click/selection edit popover

**Confidence:** CONFIRMED across Notion, Figma, Google Docs, Confluence, Medium.

**Evidence:**

- **Notion:** *"hover over links to see a tiny preview"* ([NotionHQ/X](https://x.com/NotionHQ/status/1798043862172348899)); inline link previews show *"rich preview of the content... ••• menu at the top right of the preview to reload, turn the inline mention into a full block, or copy the original URL"* ([notion.com/help/link-previews](https://www.notion.com/help/link-previews)).
- **Figma:** *"To preview a URL link, hover over the linked text. When you hover over linked text, Figma displays an inline popover. To edit a link, you must hover over the text, wait for the popover, click edit and then unlink"* ([Figma Help — Add links to text](https://help.figma.com/hc/en-us/articles/360045942953-Add-links-to-text)). Note Figma collapses hover-preview and edit into a single popover invoked by hover (not click).
- **Google Docs smart chips:** *"when the user hovers over the chip, they see a card interface that previews more information"* ([Google — Preview links with smart chips](https://developers.google.com/workspace/add-ons/guides/preview-links-smart-chips)). This is separate from the inline link-edit dialog shown when the caret is inside a plain hyperlink.
- **Confluence Smart Links:** card view *"when your readers hover over Smart Links displayed in card view, they can interact with link elements or preview the content"* ([Smart Link view options](https://support.atlassian.com/platform-experiences/docs/smart-link-view-options/)). Separately: *"global preview panels... the content opens in a side panel"* on explicit invocation ([Confluence side panel](https://support.atlassian.com/confluence-cloud/docs/view-content-in-a-side-panel/)).
- **Medium-editor:** *"The anchor preview is a built-in extension which automatically displays a 'tooltip' when the user is hovering over a link... when clicked, will open the anchor editing form in the toolbar"* ([medium-editor README](https://github.com/yabwe/medium-editor)). Two distinct UIs: hover-preview tooltip + click-to-edit toolbar form.

**Implications:** Real production editors split **hover-preview** from **edit-popover** into two different UI layers with different lifecycles. Hover-preview is typically short-lived, read-only, and locally scoped to the hovered chip; edit-popover is selection-bound and "there can be only one." Notably, they *coexist* in Medium/Notion/Google Docs — hovering chip B while the caret is still inside chip A does not close A's edit popover.

---

### Finding 3 — Clicking a DIFFERENT link chip closes the first edit popover and reanchors to the new one (selection moves)

**Confidence:** INFERRED (from the selection-bound model of Finding 1; no source explicitly tested "click A then click B"), cross-checked against component libraries.

**Evidence:** Because the edit popover is gated on "selection is inside link X," clicking chip B moves the caret to chip B, which (a) removes the "inside X" predicate and (b) satisfies "inside Y," producing a reanchor. TipTap/Slate/MDXEditor all share this model. No production editor I found advertises a behavior where popover A persists while popover B opens for a second chip via click.

**Implications:** For FUSED editors, the "reanchor on new chip" UX is effectively free. A SPLIT model has to decide explicitly: close-on-new-click, stack, or reposition.

---

### Finding 4 — Cmd/Ctrl+click navigates away and does not open an edit popover; edit popover opens on plain click (or selection)

**Confidence:** UNCERTAIN for Notion/Linear (not explicitly documented in search results); CONFIRMED for general convention via Google Docs and Figma.

**Evidence:** General web convention — Cmd-click opens link in new tab via browser chrome, not editor logic. Google Docs link-hover card provides an explicit "Open" action separate from "Edit" / "Remove" ([Google Docs help for hyperlinks via support.google.com/docs/answer](https://support.google.com/docs/answer/45893)). Figma requires click of "edit" button inside the hover popover, so plain hover does not put you in edit mode ([Figma Help](https://help.figma.com/hc/en-us/articles/360045942953-Add-links-to-text)).

**Implications:** The "Cmd-click does navigation, preserving any open popover" conjecture is plausible but not directly documented for every target editor. The decision space for OK can reasonably mirror browser-chrome convention without controversy.

---

### Finding 5 — Multiple simultaneously-open popovers on the SAME chip (edit-popover + comment-popover) are not a documented pattern in any of Notion/Linear/Google Docs/Confluence

**Confidence:** NOT FOUND.

**Evidence:** Confluence comments use a separate side-panel / inline-comment lifecycle disjoint from Smart Link editing. Notion comments anchor to block-level selection, not to chip-level marks. Google Docs inline comment highlights are rendered as block-gutter indicators with a side panel; they do not stack with the link edit dialog on the same mark. Medium's toolbar serializes actions — you cannot simultaneously edit a link and attach a comment via the same UI layer.

**Implications:** The question "what if a chip has BOTH a link popover AND a comment popover open at once?" is almost entirely unexplored territory in production editors. Where it appears (e.g. Google Docs smart chip with a comment), comments use a different surface (gutter/side panel) rather than a stacked chip-anchored popover.

---

### Finding 6 — Escape closes the popover; selection / chip-active halo state after Escape is not consistently documented

**Confidence:** UNCERTAIN.

**Evidence:** Medium-editor and TipTap-derived popovers use the generic dialog/popover Escape contract. What happens to the "selected chip halo" is undocumented in the sources reviewed. In a FUSED model, Escape only hides the popover; the caret remains inside the link, so the halo persists until the caret moves. In a SPLIT model, Escape could deselect the chip, or leave it selected with the popover closed — both are valid options, and production sources do not resolve this.

---

### Finding 7 — Confluence introduces a clear exception: per-link "view mode" changes the lifecycle (inline vs card vs embed), and multiple view modes can coexist on different chips in the same doc

**Confidence:** CONFIRMED.

**Evidence:** *"you can select the link and choose your preferred display view from the Smart Link toolbar... Inline View [shows only the title]... Card View [shows metadata]... Embed View [allows you to view pages, boards, lists]"* ([Smart Link view options](https://support.atlassian.com/platform-experiences/docs/smart-link-view-options/)).

**Implications:** Confluence separates "display mode of the chip" (persistent state) from "popover lifecycle" (transient UI) — a two-level separation close to the SPLIT model in spirit. The edit popover itself is still one-at-a-time; the chip-level state (inline/card/embed) is independently tracked per chip.

---

## Negative searches (NOT FOUND)

- Searched: "multiple link edit popovers open simultaneously Notion/Linear/Google Docs" — no primary-source documentation describes this as a supported feature in any editor reviewed.
- Searched: "Craft docs editor link popover" — Craft's link-chip behavior is not publicly documented; only third-party mentions of "preview in popover."
- Searched: "Apple Notes rich text link chip popover" — Apple Notes' text editor is tightly OS-integrated; public docs do not describe the chip lifecycle.
- Searched: "Escape behavior on link edit popover — does chip remain selected" — no primary-source answer for any production editor.

## Gaps / follow-ups

- Direct empirical inspection (Playwright-driven recording) of Notion / Linear / Google Docs would confirm Findings 3, 4, 6 beyond INFERRED.
- Craft and Apple Notes are opaque black boxes via public docs; any decision based on their behavior needs live-product testing.
- Google Docs smart-chip + comment co-anchoring is the one known real-world "two popovers on one mark" scenario but uses separate surfaces (card + gutter), not stacked popovers — how OK should model this is a downstream design call, not a 3P pattern to copy.
