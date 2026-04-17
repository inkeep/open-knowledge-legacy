---
dimension: Signal exposure via data-attributes
date: 2026-04-16
sources:
  - https://www.radix-ui.com/primitives/docs/guides/animation
  - https://www.radix-ui.com/primitives/docs/components/accordion
  - https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-busy
  - https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-expanded
  - https://github.com/microsoft/playwright/issues/36233
---

# Evidence: Signal exposure via data-attributes

## Key sources
- [Radix UI Primitives: Animation guide](https://www.radix-ui.com/primitives/docs/guides/animation) — canonical `data-state="open|closed"` convention.
- [Radix UI Primitives: Accordion](https://www.radix-ui.com/primitives/docs/components/accordion) — complete per-part attribute tables.
- [MDN: aria-busy](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-busy)
- [MDN: aria-expanded](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-expanded)
- [Playwright issue #36233: add busy option to getByRole](https://github.com/microsoft/playwright/issues/36233)

---

## Findings

### Finding: Radix UI defines the de-facto React headless-component `data-state` convention
**Confidence:** CONFIRMED
**Evidence:** https://www.radix-ui.com/primitives/docs/guides/animation

Radix Primitives docs: "Most of our components... provide data-state attributes that reflect their current state." The open/closed pair is canonical:

```css
.DialogOverlay[data-state="open"],
.DialogContent[data-state="open"] {
  animation: fadeIn 300ms ease-out;
}

.DialogOverlay[data-state="closed"],
.DialogContent[data-state="closed"] {
  animation: fadeOut 300ms ease-in;
}
```

**Implications:** The `data-state` attribute is load-bearing for the library's animation story — CSS styles animations off of it, and Radix's `Presence` internal keeps the element mounted through `data-state="closed"` so the unmount animation can play out. The attribute is updated *before* the animation starts, making it the lead indicator ("will animate"), not the trail indicator ("animation done"). For tests, this means: `data-state="open"` is reached as soon as the state machine flips, not after the animation.

---

### Finding: Radix Accordion exposes `data-state`, `data-disabled`, `data-orientation` on every part
**Confidence:** CONFIRMED
**Evidence:** https://www.radix-ui.com/primitives/docs/components/accordion

Per the component's attribute reference table:

| Part     | Attributes                                                             |
| -------- | ---------------------------------------------------------------------- |
| Root     | `[data-orientation]: "vertical" \| "horizontal"`                       |
| Item     | `[data-state]: "open" \| "closed"`, `[data-disabled]`, `[data-orientation]` |
| Header   | `[data-state]: "open" \| "closed"`, `[data-disabled]`, `[data-orientation]` |
| Trigger  | `[data-state]: "open" \| "closed"`, `[data-disabled]`, `[data-orientation]` |
| Content  | `[data-state]: "open" \| "closed"`, `[data-disabled]`, `[data-orientation]` |

CSS custom properties on Content expose computed dimensions: `--radix-accordion-content-width`, `--radix-accordion-content-height`.

**Implications:** Every stateful part of the primitive exposes the state attribute. Tests can target the element closest to the user-observable effect (e.g., `Trigger` has `data-state="open"` when content is expanded) without walking the tree. The `--radix-*` CSS variables are an additional data channel but aren't directly readable via Playwright's `toHaveCSS` without a `getComputedStyle` `getPropertyValue` evaluate.

---

### Finding: `aria-*` attributes are the accessibility-native prior art that `data-state` mirrors
**Confidence:** CONFIRMED
**Evidence:** https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-expanded, https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-busy

`aria-expanded="true|false"` is the W3C-sanctioned attribute for disclosure-style components (accordion, combobox, menu). `aria-busy="true|false"` is the W3C-sanctioned attribute for "subtree being updated." Both are readable via Playwright's `toHaveAttribute`.

`aria-expanded` semantic role: on the trigger, not the content; reflects "is the controlled region expanded." Does not distinguish the orientation, disabled-ness, or sub-state that `data-state` packs into a single attribute.

**Implications:** Tests generally should prefer `aria-*` attributes (accessibility-first, cross-library stable, W3C-standardized) where they apply. `data-state` is the library-specific extension for cases the ARIA vocabulary doesn't cover (e.g., "indeterminate," "loading," "error") or when the library wants a single attribute driving its CSS animation selectors.

---

### Finding: Testing Library's ByRole supports `busy` as a first-class filter; Playwright does not (yet)
**Confidence:** CONFIRMED
**Evidence:** https://testing-library.com/docs/queries/byrole/, https://github.com/microsoft/playwright/issues/36233

Testing Library: `getByRole('alert', { busy: false })` filters elements by their `aria-busy` state. Playwright's `getByRole` supports `expanded`, `pressed`, `selected`, `checked`, `disabled`, `level`, but not `busy` as of issue #36233 (open, P3-collecting-feedback, opened June 2025). Workaround:

```javascript
await expect(page.getByRole('region').and(page.locator('[aria-busy="false"]')))
  .toBeVisible();
// or simply:
await expect(region).toHaveAttribute('aria-busy', 'false');
```

**Implications:** For Playwright today, "wait for busy to clear" is an explicit attribute assertion, not a role-filter. Tests can read this as a signal that the library considers `aria-busy` tests viable but hasn't surfaced the filter yet.

---

### Finding: No single convention covers `data-state="ready"` vs `data-loading="true"` vs `aria-busy`
**Confidence:** INFERRED (absence of a single documented authority)
**Evidence:** survey of Radix, React-Aria, Reakit/Ariakit, Headless UI public docs

Radix uses `data-state` restrictively — mostly `"open"|"closed"` or `"checked"|"unchecked"|"indeterminate"` per component. It does *not* define a cross-library "ready/loading/error" state-machine convention. React-Aria exposes attributes like `data-focused`, `data-hovered`, `data-disabled`, `data-pressed` but not a `data-state="ready"`. Headless UI (Tailwind Labs) uses `data-headlessui-state="open"` and `data-open`, `data-closed` per component.

Practical community patterns observed in bug reports and guides:
- `data-ready` / `data-loaded` — ad-hoc per-app
- `data-busy="true"` — ad-hoc mirror of `aria-busy`
- `data-state="loading"` / `data-state="idle"` / `data-state="error"` — xstate-influenced state machines
- `aria-busy="true"` — the W3C-standardized option, readable by all tooling

**Implications:** For e2e determinism, teams typically bless *one* convention per app (often mirroring Radix's `data-state`) rather than relying on cross-library consistency. The most portable signal remains `aria-busy`, even though Playwright's native filter is still a feature request.

---

## Negative searches

- Searched Radix, React-Aria, Reakit public docs for a cross-component "loading" or "ready" data-attribute standard. **NOT FOUND** — each library defines its own per-component state vocabulary.
- Searched for `data-debounce-state` or `data-input-settled` conventions in search/autocomplete libraries (Algolia InstantSearch, Kbar, cmdk). **NOT FOUND** in primary docs reached this pass.

## Gaps / follow-ups

- cmdk (shadcn/ui's command menu) data-attribute surface — whether it exposes a "filter idle" marker distinct from the list's item count.
- Whether the growing adoption of xstate-style UI state machines is pushing a `data-state` vocabulary beyond "open/closed" into "loading/ready/error" in noticeable OSS projects.
