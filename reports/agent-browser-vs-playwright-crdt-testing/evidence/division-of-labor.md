# Evidence: Division of Labor — Debugging vs Automated Test Suite

**Dimension:** Division of labor between agent-browser/Peekaboo (debugging) and Playwright (automated tests)
**Date:** 2026-04-09
**Sources:** Project spec, tool capabilities analysis, existing workflow patterns

---

## Key files / pages referenced

- `specs/2026-04-09-bridge-integration-matrix/SPEC.md` — spec context
- `packages/app/tests/stress/crdt-stress.spec.ts` — existing Playwright test
- https://github.com/vercel-labs/agent-browser — agent-browser capabilities
- https://github.com/steipete/Peekaboo — Peekaboo capabilities

---

## Findings

### Finding: agent-browser/Peekaboo are useful for ad-hoc visual debugging during development
**Confidence:** INFERRED
**Evidence:** Tool capabilities analysis

Use cases where agent-browser or Peekaboo add value:
1. **Visual regression verification:** After fixing the Layer C undo bug, take a screenshot of the editor state before/after undo to verify the UI renders correctly (not just CRDT state)
2. **Quick manual verification:** During development, "what does the editor look like right now?" without opening a browser tab
3. **Accessibility audit:** agent-browser's accessibility tree snapshot can verify the editor's ARIA structure
4. **Dashboard monitoring:** agent-browser's dashboard can show live viewport during manual debugging sessions

But these are **interactive debugging aids**, not test infrastructure. They help a developer or AI agent understand what's happening, but they don't produce deterministic, repeatable test assertions.

### Finding: Playwright is the only viable choice for the automated test suite
**Confidence:** CONFIRMED
**Evidence:** Dimensional analysis across all 8 criteria

For every dimension in the research question, Playwright is equal or superior:
- Console/network capture: Playwright only
- Deterministic execution: Playwright only
- CI compatibility: Playwright far ahead
- WebSocket inspection: Playwright only
- Port isolation: Both can work, but Playwright's webServer config is purpose-built
- Speed: Playwright is faster (no AI/daemon overhead)
- ProseMirror interaction: Playwright proven, with direct CRDT state access
- Concurrent execution: Playwright's worker/sharding model is mature

### Finding: The division of labor is clear and narrow
**Confidence:** CONFIRMED
**Evidence:** Synthesis of all dimensions

**Playwright:** Everything in the automated test suite. Tier 1 (programmatic HocuspocusProvider tests) and Tier 2 (browser E2E tests). CI pipeline. Regression suite.

**agent-browser (optional):** During AI-agent-driven development sessions, for quick visual checks. Not part of the test suite. Not committed to the repo. Used interactively, discarded after the session.

**Peekaboo (not applicable):** macOS-only, no CI support, no browser-level state access. Does not add value beyond what agent-browser provides for visual checks, and is less capable for web application testing.

### Finding: Mixing tools in the test suite would add complexity without benefit
**Confidence:** INFERRED
**Evidence:** Analysis of maintenance overhead

A test suite that uses both Playwright and agent-browser would need:
- Two browser automation dependencies
- Two sets of setup/teardown patterns
- Two Chrome installations in CI
- Different assertion patterns (Playwright: evaluate() + expect(); agent-browser: snapshot + parse)
- Different failure modes to debug

The marginal benefit of agent-browser's token-efficient snapshots or annotated screenshots does not justify this overhead for a CRDT integration test suite.

---

## Gaps / follow-ups

- If a future requirement emerges for "AI agent can run the test suite and understand failures without reading code" (e.g., autonomous CI triage), agent-browser's token-efficient output format could become relevant. But this is speculative.
