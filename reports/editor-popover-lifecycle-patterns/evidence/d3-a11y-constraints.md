---
title: "D3 — Accessibility + WAI-ARIA Constraints on Chip-Anchored Popovers"
type: raw-proof
created: 2026-04-21
sources:
  - https://www.w3.org/WAI/ARIA/apg/
  - https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
  - https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/
  - https://html.spec.whatwg.org/multipage/popover.html
  - https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/popover
  - https://developer.mozilla.org/en-US/docs/Web/API/Popover_API/Using
  - https://developer.chrome.com/blog/popover-hint
  - https://inclusive-components.design/tooltips-toggletips/
  - https://hidde.blog/dialog-modal-popover-differences/
  - https://www.radix-ui.com/primitives/docs/components/popover
  - https://github.com/radix-ui/primitives/issues/1458
  - https://github.com/radix-ui/primitives/issues/2848
  - https://github.com/radix-ui/primitives/issues/1317
  - https://ariakit.org/reference/popover
  - https://github.com/ariakit/ariakit/discussions/1042
  - https://github.com/ariakit/ariakit/discussions/2566
  - https://react-spectrum.adobe.com/react-aria/usePopover.html
  - https://github.com/adobe/react-spectrum/discussions/7261
  - https://github.com/floating-ui/floating-ui/discussions/2138
  - https://github.com/floating-ui/floating-ui/issues/1795
---

# Evidence: D3 — Accessibility & WAI-ARIA Constraints for Coexisting Chip Popovers

**Dimension:** Does WAI-ARIA APG permit, require, or discourage simultaneously-open popovers in editor contexts? What focus-management patterns apply, and how do the major a11y-conscious popover libraries model the tradeoff?
**Date:** 2026-04-21
**Sources:** W3C WAI-ARIA APG, HTML Living Standard (popover attribute), MDN, Chrome for Developers, Hidde de Vries / CSS-Tricks / Heydon Pickering writing, Radix/Ariakit/React Aria/Floating UI docs + issues.

---

## Key references consulted

- [WAI-ARIA Authoring Practices Guide (APG)](https://www.w3.org/WAI/ARIA/apg/) — authoritative reference for ARIA patterns
- [APG — Dialog (Modal) pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) — modal dialog is the only formally specified dialog pattern
- [APG — Tooltip pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/) — non-interactive, no-focus contract
- [HTML Living Standard §6.12 — popover attribute](https://html.spec.whatwg.org/multipage/popover.html) — normative rules for stacking, light-dismiss, ancestry
- [MDN — popover global attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/popover) — summarizes auto / manual / hint semantics
- [Chrome blog — Popover = hint](https://developer.chrome.com/blog/popover-hint) — rationale for the separate hint stack
- [Hidde de Vries — Dialogs and popovers: how are they different?](https://hidde.blog/dialog-modal-popover-differences/) — practitioner synthesis of the WHATWG/APG split
- [Heydon Pickering — Tooltips & Toggletips (Inclusive Components)](https://inclusive-components.design/tooltips-toggletips/) — no-interactive-content rule
- [Radix UI — Popover docs](https://www.radix-ui.com/primitives/docs/components/popover) + [issues #1458](https://github.com/radix-ui/primitives/issues/1458) / [#2848](https://github.com/radix-ui/primitives/issues/2848) / [#1317](https://github.com/radix-ui/primitives/issues/1317) — nesting & stacking pain
- [Ariakit Popover](https://ariakit.org/reference/popover) + [Multiple popovers discussion #1042](https://github.com/ariakit/ariakit/discussions/1042) + [Text-field + popover focusing #2566](https://github.com/ariakit/ariakit/discussions/2566)
- [React Aria usePopover](https://react-spectrum.adobe.com/react-aria/usePopover.html) + [Native popovers discussion #7261](https://github.com/adobe/react-spectrum/discussions/7261)
- [Floating UI — Having multiple popovers/modals/panels close-all discussion #2138](https://github.com/floating-ui/floating-ui/discussions/2138) + [Can't dismiss first popup after second #1795](https://github.com/floating-ui/floating-ui/issues/1795)

---

## Findings

### Finding 1 — WAI-ARIA APG has NO formally specified pattern for multi-open, chip-anchored, non-modal popovers in editor contexts

**Confidence:** CONFIRMED.

**Evidence:** A direct fetch of [APG — Dialog (Modal) pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) returns guidance *exclusively* for modal dialogs: *"Windows under a modal dialog are inert... Tab and Shift+Tab do not move focus outside the dialog... Escape: Closes the dialog."* The page does not discuss non-modal dialogs, stacking, or popovers. APG's pattern index ([www.w3.org/WAI/ARIA/apg](https://www.w3.org/WAI/ARIA/apg/)) has no "Popover" pattern at all — the nearest patterns are Tooltip (non-interactive, non-focusable) and Menu / Menubar (a keyboard-navigation widget, not a general editor-chip popover). There is no APG pattern that maps cleanly to "multiple chip-anchored edit popovers coexisting."

**Implications:** Anything beyond a single modal dialog requires you to synthesize from first principles, the HTML spec, and library conventions. APG will not arbitrate FUSED vs SPLIT for you.

---

### Finding 2 — The HTML popover attribute spec is the *most authoritative* source on multi-open semantics, and it explicitly supports BOTH models via `popover="auto"` vs `popover="manual"`

**Confidence:** CONFIRMED.

**Evidence:** [HTML Living Standard §6.12](https://html.spec.whatwg.org/multipage/popover.html) and [MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/popover):

- `popover="auto"`: *"Auto popovers close other popovers when they are opened."* Hierarchical stack; light-dismiss closes unrelated branches; ancestor chains preserved.
- `popover="manual"`: *"Manual popovers must be manually shown and hidden — they don't automatically close other popovers when they are displayed and they can't be light dismissed. Multiple independent manual popovers can be shown simultaneously."*
- `popover="hint"`: *"Closes other hint popovers when opened, but not other auto popovers; has light dismiss and responds to close requests."* Separate stack for hover-previews. ([Chrome blog](https://developer.chrome.com/blog/popover-hint).)

**Normative nesting rules (HTML spec):** Two relationship paths — DOM nesting OR `popovertarget` triggers. The "topmost popover ancestor" algorithm keeps a well-formed tree from the (possibly cyclic) graph; ancestor chains are preserved when unrelated popovers close; separate *showing lists* for auto and hint popovers.

**Implications:** The platform itself models *both* models as first-class. `auto` = FUSED-like (one-popover-at-a-time with stack), `manual` = SPLIT-like (any number coexist), `hint` = precisely the hover-preview channel we saw in D1. A SPLIT-ready editor mapped onto native `manual` is fully platform-supported, not a hack.

---

### Finding 3 — The tooltip/popover/dialog distinction is sharp: interactive content disqualifies "tooltip"; popovers don't inert the page; dialogs do

**Confidence:** CONFIRMED.

**Evidence:**

- [APG Tooltip pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/): tooltips must *not* contain interactive content, must not receive focus.
- [Heydon Pickering — Tooltips vs Toggletips](https://inclusive-components.design/tooltips-toggletips/): *"Don't put interactive content such as close and confirm buttons or links in tooltips or toggletips. This is the job of more complex menu and dialog components."*
- [Hidde de Vries — Dialogs and popovers](https://hidde.blog/dialog-modal-popover-differences/): a popover is *non-modal* — the rest of the page remains interactive. A dialog with `aria-modal="true"` inerts the rest.

**Implications:** A link edit popover — which contains a URL input, "Edit", "Remove" buttons — is NOT a tooltip. It is a non-modal popover (semantically a lightweight non-modal dialog). Hover-preview of a URL with no interactive buttons inside it IS a tooltip / toggletip / native `hint`. These belong in different plumbing.

---

### Finding 4 — Screen-reader behavior for stacked popovers is under-documented; APG's only focus-management guidance is for modal dialogs

**Confidence:** UNCERTAIN / NOT FOUND (explicit multi-popover screen-reader guidance).

**Evidence:** APG dialog guidance: *"When a dialog closes as a result of an action and another dialog replaces it, the first dialog can pass a reference to the triggering button to the replacement dialog so that it can maintain the user's point of regard when it closes."* ([APG Dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).) That is the *only* explicit "multi-dialog" focus-restoration pattern in APG, and it assumes serialization, not coexistence.

Targeted searches for VoiceOver/NVDA/JAWS behavior on two non-modal popovers open simultaneously returned no authoritative results within the budget. The Deque blog's [WAI-ARIA Modal Alert Dialogs series](https://www.deque.com/blog/aria-modal-alert-dialogs-a11y-support-series-part-2/) only addresses modal cases.

**Implications:** Multi-open popovers are effectively a *gray zone* for screen readers. The safest working assumption: the library you use is on its own to implement focus discipline; no AT standard guarantees a "correct" announcement.

---

### Finding 5 — Radix UI's Popover does not have first-class support for non-nested sibling popovers; nested/stacked popover behavior is an acknowledged source of cross-browser bugs

**Confidence:** CONFIRMED.

**Evidence:**

- [Popover nested in Safari (#1458)](https://github.com/radix-ui/primitives/issues/1458): *"nested popover is not closing by clicking trigger in Safari"* — a multi-year unresolved issue.
- [Nested popovers on Safari + Firefox (#2848)](https://github.com/radix-ui/primitives/issues/2848): *"nested popovers cause problems on Safari and Firefox, with `isPositioned` from `useFloating` only updating to true on Chrome"* (April 2024 report).
- [Z-index issues combining Dialog.Portal with Popover / Dropdown (#1317)](https://github.com/radix-ui/primitives/issues/1317) — affects any attempt to layer multiple floating surfaces.

**Implications:** Any SPLIT strategy using Radix Popover for *sibling* chip popovers inherits this bug surface. Radix implicitly assumes serialization (opening popover B closes A), which is the FUSED model.

---

### Finding 6 — Ariakit acknowledges multi-popover as an edge case, and focus-trap behavior interferes when composing with third-party overlays

**Confidence:** CONFIRMED.

**Evidence:**

- [Ariakit discussion #1042 ("Multiple popovers")](https://github.com/ariakit/ariakit/discussions/1042) — explicit discussion thread acknowledging the use case.
- [Ariakit discussion #2566 ("multi-focusing with text field and Popover list")](https://github.com/ariakit/ariakit/discussions/2566) — shows focus-coordination patterns needed for coexistence.
- Ariakit issue search results confirm *"Ariakit has its own focus trap mechanism... can compete with other focus lock implementations"* and *"composing a Tooltip and a Popover on the same element, both may show up when hovering the anchor element — this behavior depends on the order of the providers."*

**Implications:** Ariakit can be configured for simultaneous popovers but requires careful provider ordering + explicit focus management. It does not default to safe coexistence.

---

### Finding 7 — React Aria's `usePopover` is a focus scope with the FUSED contract baked in; nested stacked use requires native HTML popover interop as an escape hatch

**Confidence:** CONFIRMED.

**Evidence:** [React Aria usePopover](https://react-spectrum.adobe.com/react-aria/usePopover.html) describes: *"usePopover acts as a focus scope, containing focus within the popover and restoring it to the trigger when it unmounts."* Focus-scope per popover + restore-to-trigger implies serialization. The discussion [#7261 "Using Native Popovers with React Aria"](https://github.com/adobe/react-spectrum/discussions/7261) confirms the workaround: *"nest the native popover inside the React Aria one, then show it after the React Aria popover renders. The popover mode has to be set to manual when the popover is nested, otherwise the parent will be dismissed because their contents are within different React Portals."*

**Implications:** The React Aria pattern is FUSED; simultaneous coexistence is a workaround, not a first-class API. Notably, the *recommended* escape hatch is precisely the native HTML `popover="manual"` primitive from Finding 2.

---

### Finding 8 — Floating UI has the richest multi-popover primitives (`FloatingTree` + `useDismiss({bubbles})`), but coexistence still requires explicit configuration and has known footguns

**Confidence:** CONFIRMED.

**Evidence:**

- [Floating UI discussion #2138 ("Having multiple Popovers/Modals/Panels, click-outside closing all")](https://github.com/floating-ui/floating-ui/discussions/2138) — the discussion recommends `useDismiss` with `bubbles` prop and/or `<FloatingOverlay onClick={...}>` per layer.
- [Floating UI issue #1795 ("Can't dismiss first popup after second")](https://github.com/floating-ui/floating-ui/issues/1795) — real bug from multi-open state.
- Known constraint: the `bubbles` property requires focus to be inside the floating element to work properly — breaks when focus remains on the trigger (i.e. the editor-caret scenario).

**Implications:** Floating UI is the most SPLIT-friendly of the React-level libraries, but it needs a coordinating tree + per-layer dismiss config. For an editor where focus lives in the document content (not in the popover), the `bubbles` escape hatch has limitations.

---

### Finding 9 — Escape key + focus-restoration expectations are well-defined for modals and single-layer popovers; they get ambiguous with N>1 coexisting

**Confidence:** INFERRED.

**Evidence:** Every major library (Radix, React Aria, Ariakit, Floating UI) ships Escape=close for a *single* popover and focus-return-to-trigger via focus-scope. For stacked/coexisting popovers, there is no cross-library convention — each library's dismiss propagation is different. APG gives no guidance ([Finding 1](#finding-1)). HTML's native `popover="auto"` has a normative "close topmost" Escape response ([HTML spec §6.12](https://html.spec.whatwg.org/multipage/popover.html)); `popover="manual"` does not respond to Escape at all, leaving it to authors.

**Implications:** A SPLIT editor has to own the Escape semantics explicitly (close topmost? close all chip popovers? close only the one with focus?). FUSED gets this for free from the underlying library.

---

## Negative searches

- Searched APG pattern index ([w3.org/WAI/ARIA/apg/#aria_ex_sdlg](https://www.w3.org/WAI/ARIA/apg/)) for "popover" — no match. Only Tooltip + Dialog(Modal) patterns are formally specified.
- Searched for "VoiceOver / NVDA / JAWS multi popover announcement" — no authoritative a11y-practitioner writeup found within budget. Gap explicitly flagged.
- Searched Adrian Roselli + Heydon Pickering corpus for "multi popover inline editor" — only Heydon's [Tooltips & Toggletips](https://inclusive-components.design/tooltips-toggletips/) appeared, which explicitly defers interactive patterns to "more complex menu and dialog components" but does not address coexistence.

## Gaps / follow-ups

- Empirical AT testing (VO, NVDA, JAWS) of a 2-popover editor scenario would close the biggest remaining gap — authoritative writeups don't exist, but the behavior is testable.
- Deque / WebAIM / Inclusive Components historically publish on emerging patterns; worth re-checking annually as the HTML popover API matures (widely supported as of Chromium 114, Safari 17, Firefox 125+).
- Sara Soueidan's writing on dialog vs popover is strong on modals but light on multi-layer chip-anchored cases — a direct practitioner survey could fill the screen-reader-behavior gap.
- The `popover="hint"` channel maps cleanly onto D1's hover-preview layer; an OK-adjacent follow-up would be "should hover-preview use `hint` state vs a JS tooltip?" — outside this research's scope.
