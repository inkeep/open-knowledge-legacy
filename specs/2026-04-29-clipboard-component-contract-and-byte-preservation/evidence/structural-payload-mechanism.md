---
name: Structural-payload mechanism — data-attr-on-HTML vs sync-event MIME
description: Two viable mechanisms for OK→OK structural-payload signaling. Precedent #19(b) eliminates one; this evidence captures the comparison and the design implications of the surviving mechanism.
date: 2026-04-29
sources:
  - "PRECEDENTS.md #19(b) (DOM-level handleDOMEvents prohibited on WYSIWYG)"
  - "specs/2026-04-16-clipboard-mdast-canonical/SPEC.md §10 D14 LOCKED (PM hooks for WYSIWYG)"
  - "Code: packages/app/src/editor/clipboard/serialize.ts:71-103 (clipboardSerializer.serializeFragment current implementation)"
  - "Code: packages/app/src/editor/clipboard/handle-paste.ts:96-104 (Branch C data-pm-slice detection)"
  - "BlockNote OSS: ~/.claude/oss-repos/blocknote/packages/core/src/api/clipboard/toClipboard/copyExtension.ts (DOM-level handleDOMEvents.copy pattern, prohibited in OK)"
  - "ProseMirror: prosemirror-view/src/clipboard.ts:32-34 (data-pm-slice auto-attach behavior)"
type: meta
---

# Structural-payload mechanism

## The decision

OK→OK clipboard round-trips need a marker that says "this clipboard payload originated in OK; route through the canonical markdown path, not PM-native parseFromClipboard." Two viable mechanisms:

### Mechanism A: sync-event custom MIME

**Shape.** Write a third MIME (e.g., `vnd.open-knowledge/slice` or `text/x-ok-slice`) on copy via `event.clipboardData.setData('vnd.open-knowledge/slice', payload)`. Read on paste via `clipboardData.getData('vnd.open-knowledge/slice')` in a new dispatcher Branch 0.

**Mechanism requirement.** The only PM-hook-compatible way to call `clipboardData.setData` for a non-`text/plain`/`text/html` MIME is from a DOM-level event handler (`handleDOMEvents.copy` / `handleDOMEvents.cut` / `handleDOMEvents.dragstart`). PM's documented hooks (`clipboardTextSerializer`, `clipboardSerializer`) only emit text/plain and text/html — there's no slot for a third MIME.

**Precedent conflict.** Precedent #19(b) **prohibits** DOM-level `handleDOMEvents.copy/cut/dragstart` on WYSIWYG. Reason given verbatim: "would re-introduce the drag-and-drop coupling problem that caused D14 to flip to PM hooks."

The drag-and-drop coupling: PM's default dragstart fires the same hook chain as copy/cut, but ALSO sets `view.dragging.slice` for the internal-drag fast path (within-editor drag-and-drop). If we override at the DOM level for any of the three events, we either:
- preventDefault + write our own data → break `view.dragging.slice` (internal drag loses the slice).
- run our handler before PM's default → write happens in our handler; PM's default still runs. But our handler can't add MIMEs without preventDefault, because PM's `dataTransfer.setData('text/html', ...)` overwrites or coexists with ours unpredictably across browsers.

The 2026-04-16 SPEC's D14 evaluated this at length and chose PM hooks specifically to preserve internal drag-and-drop without re-implementing PM's internal state.

**OS-clipboard-manager survival.** Sync MIMEs that aren't `text/plain` or `text/html` are stripped by Maccy, Raycast clipboard, Alfred clipboard, etc. Survival rate near zero through clipboard managers.

**Cross-browser survival.** Sync `setData` works on Chrome/Firefox/Safari for custom MIMEs (BlockNote uses this pattern). Survives same-machine cross-browser within Chromium-Chromium and Safari-Safari; cross-vendor (Chrome→Safari paste) is unverified — Chromium's web-prefix pickling is documented as Chromium-only, but `text/x-*` plain-MIME forms are SUPPOSED to be cross-vendor. Empirical verification not done.

### Mechanism B: data-attr-on-HTML

**Shape.** Inject `data-ok-slice="<base64-or-flag>"` on the first element of the DocumentFragment returned from `clipboardSerializer.serializeFragment`. PM's `serializeForClipboard` (`prosemirror-view/src/clipboard.ts:32-34`) auto-attaches `data-pm-slice` to the same first element with its own value. Both attributes coexist on the same element. The text/html MIME contains both. New dispatcher Branch 0 detects `data-ok-slice` via the same regex/`querySelector` pattern Branch C uses for `data-pm-slice`.

**Mechanism requirement.** Modify `MdastClipboardSerializer.serializeFragment` to inject the attribute before returning. Stays entirely within `clipboardSerializer.serializeFragment`; no DOM-level event handlers.

**Precedent conflict.** None. Precedent #19(b) is satisfied. PM's hook chain is unchanged. Internal drag-and-drop is preserved (PM's default dragstart still calls `serializeForClipboard` → our `serializeFragment` → returns DocumentFragment with `data-ok-slice` → goes onto drag dataTransfer's text/html). Symmetric with how `data-pm-slice` already works.

**OS-clipboard-manager survival.** Clipboard managers preserve text/html as a recognized MIME. They generally preserve the HTML content unchanged, including `data-*` attributes. (Maccy preserves text/html; Raycast preserves text/html; Alfred preserves text/html.) Cross-app paste destinations strip `data-*` attributes for sanitization (Slack, Notion, Gmail, GitHub all strip them) — this is GOOD because it means OK metadata doesn't leak into external destinations.

**Cross-browser survival.** text/html is W3C-mandatory. Survives every cross-browser clipboard transfer.

**Inbound detection cost.** Trivial — already-paid pattern, sister to Branch C's `data-pm-slice` regex check at `handle-paste.ts:96-104`.

**Payload contents.** Three options for what `data-ok-slice` actually carries:
1. **Empty marker** (`data-ok-slice=""` or `data-ok-slice="1"`) — presence-only flag. text/plain carries the canonical bytes. Branch 0: marker present → route to `mdManager.parse(text/plain)` instead of PM-native parseFromClipboard.
2. **Markdown source bytes** (base64-encoded text/plain) — redundant with text/plain, but carrying it on text/html means even paste destinations that drop text/plain (rare) preserve it. Costs the byte size in the HTML.
3. **PM JSON snapshot** (base64 of `slice.content.toJSON()`) — losslessly preserves PM tree state including descriptor identity. Branch 0 hydrates the slice directly without re-parsing markdown. More byte cost; richest fidelity.

The minimal correct design is **option 1 (presence flag)** because text/plain already carries canonical markdown. The richer options are progressive — can be added later without breaking earlier consumers.

## Comparison matrix

| Property | A: sync-event MIME | B: data-attr-on-HTML |
|---|---|---|
| Precedent #19(b) compatibility | **Violates** | Satisfies |
| Mechanism location | DOM event handler | clipboardSerializer.serializeFragment |
| Drag-and-drop coupling | Re-introduces D14 problem | Unchanged |
| OS clipboard manager survival | ~0% (unknown MIMEs stripped) | ~100% (data-attrs survive on text/html) |
| Cross-browser portability | Chromium-Chromium ✓ Safari-Safari ✓ Cross-vendor unverified | Universal (text/html W3C-mandatory) |
| Cross-app destination behavior | Stripped (good — no leakage) | Stripped (good — no leakage) |
| Sister-pattern in codebase | None | `data-pm-slice` (PM auto-attach) |
| Sister-pattern in OSS | BlockNote `blocknote/html` (uses prohibited mechanism) | None directly; `data-pm-slice` is conceptual sibling |
| Implementation surface | New DOM handler + new MIME registry entry | ~5 LoC in serialize.ts + ~3 LoC in handle-paste.ts |
| Reversibility if abandoned | Low (rip out DOM handler, deal with drag-and-drop fallout) | High (delete attribute injection) |

## Decision

**Mechanism B (data-attr-on-HTML) is the precedent-conformant choice.** Mechanism A's contradiction with #19(b) is load-bearing — adopting it requires reopening the predecessor's D14 with new evidence that overrides the drag-and-drop coupling rationale, and the only "new evidence" is "we want to" — not sufficient.

The user-asked question "how would the OK MIME be different from the plain MIME, if at all" surfaces a deeper insight: **there should be no separate MIME**. The text/plain already IS the canonical OK form. The text/html with `data-ok-slice` is a discriminator, not a payload. Two MIMEs (`text/plain` + `text/html`) cover the OK→OK lossless round-trip case; the `data-ok-slice` attribute on text/html merely tells the inbound dispatcher to prefer text/plain's markdown over PM-native HTML reconstruction.

## What this resolves in the open-question backlog

- **Q2** (wire format for clipboard structural payload) — collapses to "presence flag on text/html via `data-ok-slice` attribute; canonical bytes live in text/plain."
- **Q3** (MIME-write strategy: sync-event vs Chromium pickling vs both) — moot. No new MIME is written.
- **Q4** (toClipboardHast contract shape) — independent of Q2/Q3; resolves on its own through the descriptor sister-method pattern.

## What stays open

- The Branch 0 detection logic — should it require the `data-ok-slice` attribute be on the first element specifically (for symmetry with `data-pm-slice`), or any element? Symmetric with #19(b)'s pattern says first element; using `querySelector('[data-ok-slice]')` like Branch C does for `data-pm-slice` is the precedent-conformant pick.
- The attribute value semantics — pure presence flag (option 1) vs richer payload (option 3 PM JSON for opaque non-markdown nodes). Likely a P0 decision in iterate phase.
- Cross-machine D4 — `data-ok-slice` survives `text/html`; doesn't survive email-as-text. The is-markdown.ts JSX signals direction handles the email-as-text case independently.
