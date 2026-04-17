---
dimension: Composed-event settling
date: 2026-04-16
sources:
  - https://playwright.dev/docs/test-assertions
  - https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-activedescendant
  - https://sarahmhigley.com/writing/activedescendant/
  - https://www.w3.org/WAI/ARIA/apg/patterns/combobox/
  - https://tiptap.dev/docs/editor/api/utilities/suggestion
  - https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-busy
---

# Evidence: Composed-event settling

Context: a single user event (e.g., typing `/h1`) cascades through multiple synchronous and async subscribers: open menu → filter list → reposition floating element → update `aria-activedescendant` → mark highlighted item. The test must wait for all these effects to settle, not just the first.

## Key sources
- [Playwright: Assertions (web-first auto-retry)](https://playwright.dev/docs/test-assertions)
- [MDN: aria-activedescendant](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-activedescendant)
- [Sarah Higley: "aria-activedescendant is not focus"](https://sarahmhigley.com/writing/activedescendant/) — authoritative ARIA practice commentary.
- [W3C WAI ARIA Authoring Practices: Combobox](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/)
- [TipTap: Suggestion utility docs](https://tiptap.dev/docs/editor/api/utilities/suggestion)
- [MDN: aria-busy](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-busy)

---

## Findings

### Finding: The dominant pattern is "assert the terminal observable only"
**Confidence:** CONFIRMED (inferred from Playwright docs' auto-retry semantics + Checkly guidance)
**Evidence:** https://playwright.dev/docs/test-assertions, https://www.checklyhq.com/docs/learn/playwright/assertions/

Playwright's web-first assertions retry until a condition holds. When multiple subscribers settle sequentially, tests do not enumerate each step — they assert on the *last* effect to land and let the auto-retry absorb the intermediate cascade. Example for a slash menu:

```javascript
// DO
await input.pressSequentially('/h1');
await expect(page.getByRole('listbox')).toHaveAttribute('data-state', 'open');
await expect(page.getByRole('option', { name: 'Heading 1' }))
  .toHaveAttribute('aria-selected', 'true');

// DON'T (overspecifies intermediate state)
await page.waitForTimeout(50); // menu open
await page.waitForTimeout(100); // filter run
await page.waitForTimeout(50); // selection move
```

**Implications:** The composed-event problem is usually solved by choosing the *right* terminal observable — something guaranteed to be the last thing that changes. `aria-activedescendant`, `data-state="open"`, and the filtered listbox's child count are all common terminal observables.

---

### Finding: `aria-activedescendant` is the standard terminal observable for combobox/menu selection settling
**Confidence:** CONFIRMED
**Evidence:** https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-activedescendant, https://www.w3.org/WAI/ARIA/apg/patterns/combobox/

MDN: `aria-activedescendant` "identifies the currently active element when focus is on a composite widget, combobox, textbox, group, or application." The W3C combobox pattern mandates that when the popup is open and a suggestion is highlighted, `aria-activedescendant` on the input (or role=combobox) element must reference the highlighted option's `id`. When the selection moves or the filter narrows the list, `aria-activedescendant` updates.

Playwright assertion:

```javascript
await expect(combobox).toHaveAttribute('aria-activedescendant', 'option-heading-1');
```

Or roll the predicate through the option itself:

```javascript
await expect(page.getByRole('option', { name: 'Heading 1' })).toHaveAttribute('aria-selected', 'true');
```

**Implications:** For any keyboard-filtered menu that follows the combobox APG pattern — BlockNote slash menu, TipTap suggestion, Radix Command, etc. — `aria-activedescendant` is a terminal observable that settles *after* filter + reposition + highlight. Waiting on it subsumes the cascade.

---

### Finding: `aria-busy` is the documented convention for "subtree being updated, assistive tech should wait"
**Confidence:** CONFIRMED
**Evidence:** https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-busy

MDN: aria-busy "indicates whether an element is currently being modified" so that assistive technologies "may want to wait before informing users of the update." The attribute is `true` during mid-update and reverts to `false` (or is removed) when the subtree is stable.

In Playwright, the pattern is an auto-retrying attribute assertion:

```javascript
await expect(region).toHaveAttribute('aria-busy', 'false');
```

Testing Library's ByRole supports a first-class `busy: false` filter; a Playwright feature request ([#36233](https://github.com/microsoft/playwright/issues/36233), June 2025) proposes the same for `getByRole({ busy: false })` but is currently P3-collecting-feedback with no maintainer-recommended workaround beyond the explicit attribute assertion.

**Implications:** `aria-busy` is the accessibility-native signal for "composed update complete." Applications that set `aria-busy="true"` during a cascade and flip to `false` at the end give tests a clean terminal observable without needing a custom data-attribute.

---

### Finding: `requestIdleCallback` / `queueMicrotask` flush as a general "all pending work done" signal is not documented by Playwright
**Confidence:** NOT FOUND
**Evidence:** https://playwright.dev/docs/api/class-clock (clock.install mocks requestIdleCallback — testing use, not signalling)

Playwright's Clock API mocks `requestIdleCallback` for deterministic advance, but neither the Playwright docs nor the major community guides surveyed (BrowserStack, Checkly, Sauce Labs) recommend waiting on rIC/microtask flush as a generic settling primitive. The consensus signal is the DOM state itself, not the event-loop queue state.

**Implications:** There is no community pattern of "await flush then assert." Tests either (a) wait on a terminal DOM observable, or (b) when a DOM observable does not exist, expose one (see data-attribute evidence).

---

### Finding: `expect.poll` with a composite predicate handles genuinely multi-dimensional settlement
**Confidence:** INFERRED
**Evidence:** https://playwright.dev/docs/test-assertions (expect.poll definition)

When no single DOM attribute captures the full composed state, `expect.poll` can evaluate a composite:

```javascript
await expect.poll(async () => {
  const [open, active, count] = await Promise.all([
    menu.getAttribute('data-state'),
    combobox.getAttribute('aria-activedescendant'),
    options.count(),
  ]);
  return { open, active, count };
}).toEqual({ open: 'open', active: 'option-h1', count: 3 });
```

**Implications:** Reserved for genuine compound conditions where no terminal observable dominates. Most slash-menu tests don't need this — a single `aria-activedescendant` or `aria-selected` assertion suffices — but it's the documented fallback.

---

### Finding: TipTap's Suggestion extension exposes decoration classes but no dedicated test-state marker
**Confidence:** CONFIRMED
**Evidence:** https://tiptap.dev/docs/editor/api/utilities/suggestion

TipTap Suggestion docs describe:
- Trigger character (`char`, default `@`)
- `allow` and `shouldShow` gating functions
- `decorationTag` (default `span`) and `decorationClass` / `decorationEmptyClass` CSS classes
- `exitSuggestion()` for programmatic closing

No documented data-attribute convention ("data-suggestion-state", "aria-expanded" on the decoration, etc.) — the rendered popup is consumer-owned (TipTap renders only the decoration span; the dropdown UI is whatever the integrator builds, often Tippy.js).

**Implications:** TipTap slash-menu E2E tests must rely on the consumer's DOM shape (Tippy's `data-state` attribute on the popper, the integrator's option `aria-selected`, etc.), not on a TipTap-provided test marker. This pushes the "terminal observable" decision down to the integration surface.

---

## Negative searches

- Searched BlockNote, Milkdown, Plate, Novel.sh for a documented "slash menu ready" DOM signal. **NOT FOUND** in the sources reached during this pass — BlockNote's suggestion-menu docs describe a `SuggestionMenuController` React component but no test-state DOM marker.
- Searched Ariakit (Reakit) for `aria-busy` / `data-state` conventions on its Combobox. Ariakit uses `aria-expanded` on the trigger and `aria-activedescendant` on the combobox per the W3C APG; no custom data-attribute.

## Gaps / follow-ups

- Specific DOM markers in editor slash-menu integrations with Tippy.js / Floating UI — whether Tippy's `data-state="visible"` is a reliable terminal observable across versions.
- Whether React-Aria's `useComboBox` / `useListBox` hooks expose additional `data-*` attributes that serve as terminal observables.
