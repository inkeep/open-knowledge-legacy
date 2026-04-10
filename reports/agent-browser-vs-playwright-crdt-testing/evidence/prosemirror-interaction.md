# Evidence: ProseMirror Interaction

**Dimension:** ProseMirror interaction — typing into contenteditable, clicking buttons, verifying state
**Date:** 2026-04-09
**Sources:** Playwright docs, ProseMirror community, agent-browser docs, project codebase

---

## Key files / pages referenced

- https://dev.to/builtbyzac/why-playwright-fill-silently-fails-on-prosemirror-editors-and-how-to-fix-it-46bi
- https://playwright.dev/docs/input — Playwright input actions
- `packages/app/tests/stress/crdt-stress.spec.ts` — existing test with ProseMirror interaction
- https://github.com/vercel-labs/agent-browser — agent-browser CLI

---

## Findings

### Finding: Playwright has proven ProseMirror interaction patterns (already in use)
**Confidence:** CONFIRMED
**Evidence:** Existing test code + community guidance

The crdt-stress.spec.ts already demonstrates the correct pattern:
```typescript
// Focus ProseMirror via click (not JS focus — CDP internal focus state matters)
await page.locator('.ProseMirror').focus();
// Use page.keyboard.type() — NOT fill(), NOT pressSequentially()
await page.keyboard.type(marker, { delay: 5 });
```

Key ProseMirror + Playwright rules (well-documented in community):
1. Never use `fill()` — ProseMirror listens to keyboard events, not DOM value changes
2. Use `page.keyboard.type()` — sends key events that ProseMirror processes
3. Focus with `.click()` or `.focus()` locator (not `element.focus()` via evaluate)
4. Avoid `pressSequentially()` — routes through different event path
5. Use accessible names for targeting, not CSS selectors that drift

The existing Layer C test proves these patterns work for CRDT integration testing.

### Finding: Playwright provides direct CRDT state verification via evaluate()
**Confidence:** CONFIRMED
**Evidence:** crdt-stress.spec.ts

```typescript
// Direct Y.Doc state access from test code:
const finalState = await page.evaluate(() => {
  const provider = (window as any).__hocuspocusProvider;
  return {
    ytext: provider.document.getText('source').toString(),
  };
});
expect(finalState.ytext).toContain(marker);
```

This bypasses visual rendering entirely — assertions check the CRDT document state directly, not what's rendered on screen. For bridge integration testing, this is exactly right: verify that Y.Text and XmlFragment have the expected content after observer propagation.

### Finding: agent-browser would interact with ProseMirror via accessibility tree
**Confidence:** INFERRED
**Evidence:** agent-browser architecture

agent-browser's interaction model:
1. Take accessibility tree snapshot
2. AI agent identifies the editor element (role="textbox")
3. Click on the element ref to focus
4. Type text via keyboard simulation

This would work for simple typing but has limitations:
- No way to verify Y.Doc state directly (no `evaluate()` equivalent)
- Assertions would rely on visual inspection (screenshot) or accessibility tree text content
- Cannot distinguish between "text visible in DOM" and "text synced to Y.Text CRDT"
- The critical test assertion (`ytext.toString()` vs `serialize(xmlFragment)`) is not accessible via accessibility tree

### Finding: Peekaboo cannot interact with ProseMirror at the browser level
**Confidence:** CONFIRMED
**Evidence:** Peekaboo architecture

Peekaboo operates at the macOS GUI level:
- Click coordinates on screen (not browser-internal elements)
- Type via macOS keyboard events (not browser keyboard API)
- Cannot access browser DevTools, JavaScript context, or DOM

For ProseMirror interaction, this means:
- Typing would work (macOS keyboard events reach the browser)
- But verification requires visual screenshot analysis — cannot check Y.Doc state
- Element targeting is coordinate-based, not selector-based — fragile

---

## Gaps / follow-ups

- None — Playwright's ProseMirror interaction patterns are already proven in the project.
