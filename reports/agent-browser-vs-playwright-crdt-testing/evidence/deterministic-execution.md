# Evidence: Deterministic Test Execution

**Dimension:** Deterministic test execution (10/10 pass locally, no flakiness)
**Date:** 2026-04-09
**Sources:** Playwright docs, agent-browser docs, web research, project codebase

---

## Key files / pages referenced

- https://playwright.dev/docs/test-configuration — test configuration reference
- https://playwright.dev/ — Playwright auto-waiting mechanism
- https://github.com/vercel-labs/agent-browser — agent-browser README
- `packages/app/tests/stress/crdt-stress.spec.ts` — existing Playwright test

---

## Findings

### Finding: Playwright provides deterministic, script-based execution with auto-waiting
**Confidence:** CONFIRMED
**Evidence:** Playwright docs + existing test code

Playwright's determinism mechanisms:
- **Auto-waiting:** Every action automatically waits for the element to be actionable before performing the action
- **Web-first assertions:** Built-in retry with configurable timeout (`expect(locator).toContainText('X', { timeout: 30_000 })`)
- **Condition-based waits:** `page.waitForFunction()` for custom predicates (used in crdt-stress.spec.ts for CRDT state checks)
- **No AI in the loop:** Test execution is deterministic — same input produces same output every run
- **Retry on failure:** `retries: N` in config for transient issues (currently set to 0)

The existing crdt-stress.spec.ts uses `page.waitForFunction()` with explicit predicates to check Y.Doc state — this is a deterministic, condition-based pattern that either passes when the state matches or times out.

**Implications:** For CRDT testing, deterministic execution is critical. Observer propagation has timing characteristics — content-based polling with timeouts (the pattern already in use) is the right approach.

### Finding: agent-browser introduces AI non-determinism by design
**Confidence:** CONFIRMED
**Evidence:** agent-browser architecture documentation

agent-browser is designed for AI-driven browser interaction:
- The agent interprets accessibility tree snapshots to decide what to click/type
- Element targeting uses ref-based IDs from snapshots (deterministic within a snapshot)
- But the agent's interpretation of "what to do next" involves LLM reasoning
- Token efficiency (~1,400 tokens per test vs ~7,800 for Playwright MCP) is optimized for AI agents, not deterministic test suites

The `--json` flag provides structured output, but the interaction model is "AI agent reasons about UI" rather than "script asserts exact state."

**Implications:** For a test that needs to verify `ytext.toString().includes('Section 1') === false` (the undo assertion), a scripted Playwright assertion is deterministic. An AI agent interpreting a screenshot is not — it could pass 9/10 times and fail on the 10th due to visual interpretation variance.

### Finding: Peekaboo MCP relies on AI vision for assertions
**Confidence:** CONFIRMED
**Evidence:** Peekaboo architecture

Peekaboo's `analyze` tool sends screenshots to an AI model for question-answering. Assertions like "does the editor contain this text?" would be non-deterministic because they depend on AI model interpretation of the rendered screenshot.

**Implications:** Not suitable for the 10/10 reliability requirement.

---

## Gaps / follow-ups

- agent-browser's `snapshot` command provides deterministic accessibility tree data (not AI-dependent), which could theoretically be parsed for assertions. But this isn't a test framework — it's an automation primitive that would need wrapping.
