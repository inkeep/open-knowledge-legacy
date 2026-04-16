---
title: "agent-browser vs Playwright for CRDT Integration Testing"
description: "Comparative analysis of Playwright, Vercel agent-browser, and Peekaboo MCP for browser-based integration testing of a dual-representation CRDT editor (Y.XmlFragment + Y.Text). Evaluates console/network capture, determinism, CI compatibility, WebSocket inspection, port isolation, speed, ProseMirror interaction, and concurrent execution across the three tools."
createdAt: 2026-04-09
updatedAt: 2026-04-09
subjects:
  - Playwright
  - Vercel agent-browser
  - Peekaboo MCP
  - Hocuspocus
  - Yjs
topics:
  - CRDT integration testing
  - browser automation comparison
  - ProseMirror testing
---
# agent-browser vs Playwright for CRDT Integration Testing

**Purpose:** Determine which browser automation tool is best suited for Tier 2 (browser-based) CRDT integration tests in a dual-representation editor, and whether agent-browser or Peekaboo could complement Playwright for debugging and diagnosis.

---

## Executive Summary

Playwright is the clear choice for the automated CRDT integration test suite across all eight evaluation dimensions. The comparison is not close -- Playwright is the only tool that provides console log capture, WebSocket frame interception, deterministic assertion execution, CI-ready headless operation on Linux, and direct CRDT document state verification via `page.evaluate()`. These are not "nice to have" capabilities for CRDT testing -- they are prerequisites.

agent-browser (Vercel) is a capable browser automation CLI designed for AI agents, but it occupies a fundamentally different niche: token-efficient interaction during AI coding sessions, not deterministic test suites. It lacks console/network capture APIs, introduces AI non-determinism for assertions, and provides no mechanism to inspect Y.Doc state directly. It can run on Linux CI but has rougher edges than Playwright's first-class CI integration.

Peekaboo MCP is disqualified for this use case. It is macOS-only, requires Screen Recording and Accessibility permissions, cannot run in GitHub Actions, and operates at the OS GUI level rather than the browser level -- making it unable to access browser console logs, WebSocket frames, or JavaScript execution contexts.

The division of labor is narrow: Playwright handles everything in the automated test suite (both Tier 1 programmatic tests and Tier 2 browser E2E tests). agent-browser can optionally be used during interactive AI development sessions for quick visual verification, but should not be part of the committed test infrastructure.

**Key Findings:**

- **Playwright is the only tool that can capture console logs and WebSocket frames** during CRDT sync -- essential for diagnosing the Layer C undo timeout
- **Deterministic execution requires scripted assertions, not AI interpretation** -- Playwright's `page.evaluate()` + `expect()` pattern checks Y.Doc state directly, while agent-browser and Peekaboo rely on visual/accessibility-tree interpretation
- **CI compatibility is decisive** -- Playwright runs on standard `ubuntu-latest` GitHub Actions runners with zero friction; Peekaboo cannot run in CI at all; agent-browser works but needs additional setup
- **ProseMirror interaction patterns are already proven** in the existing `crdt-stress.spec.ts` using Playwright -- `page.keyboard.type()` for input, `page.evaluate()` for CRDT state verification
- **The spec's two-tier architecture is well-designed** -- Tier 1 (programmatic) handles 12 propagation paths without a browser; Tier 2 (Playwright) handles the critical UX interactions that require real browser rendering

---

## Research Rubric

| # | Dimension                                          | Depth    | Priority |
| - | -------------------------------------------------- | -------- | -------- |
| 1 | Console/network capture during reproduction        | Deep     | P0       |
| 2 | Deterministic test execution (10/10 reliability)   | Deep     | P0       |
| 3 | CI compatibility (GitHub Actions, Linux, headless) | Deep     | P0       |
| 4 | WebSocket inspection (Hocuspocus CRDT sync)        | Deep     | P0       |
| 5 | Port isolation and dynamic allocation              | Moderate | P0       |
| 6 | Speed (< 2 min for Tier 2 tests)                   | Moderate | P1       |
| 7 | ProseMirror interaction (contenteditable)          | Deep     | P0       |
| 8 | Concurrent execution (multiple worktrees)          | Moderate | P1       |

**Stance:** Comparative Analysis -- "Which tool should we use for Tier 2 CRDT integration tests?"

**Non-goals:** Evaluating tools as general-purpose browser automation (this is specifically about CRDT integration test infrastructure); pricing or licensing analysis; evaluating Playwright MCP (the MCP server wrapper) vs Playwright Test (the test framework).

---

## Detailed Findings

### 1. Console/Network Capture During Reproduction

**Finding:** Playwright is the only tool that provides programmatic console log capture and WebSocket frame interception -- both essential for diagnosing CRDT sync issues like the Layer C undo timeout.

**Evidence:** [evidence/console-network-capture.md](evidence/console-network-capture.md)

Playwright provides three layers of diagnostic capture:

1. **Console logs** via `page.on('console')` and `page.on('pageerror')` -- already in use in `crdt-stress.spec.ts`
2. **WebSocket interception** via `page.routeWebSocket()` (since v1.48) and `page.on('websocket')` -- can capture every Y.js sync message flowing through Hocuspocus
3. **Trace Viewer** -- full post-mortem recording with DOM snapshots, network timeline, console log timeline, and action screenshots

agent-browser provides accessibility tree snapshots and annotated screenshots but has no APIs for console logs, WebSocket frames, or network monitoring. Peekaboo captures screenshots with AI analysis but cannot access browser internals at all.

**Implications:** The Layer C undo timeout (OQ1 in the spec) requires tracing which Y.js sync messages arrive at the browser after `POST /api/agent-undo`, which observer callbacks fire, and whether the ProseMirror transaction re-inserts undone content. Only Playwright can capture this data.

**Decision triggers:**

- If Layer C diagnosis reveals the issue is in ProseMirror rendering (not CRDT sync), Playwright's Trace Viewer becomes essential for inspecting the DOM mutation sequence
- If the issue is in the WebSocket sync protocol, `page.on('websocket')` frame logging isolates it

---

### 2. Deterministic Test Execution

**Finding:** Playwright provides fully deterministic, script-based test execution. agent-browser and Peekaboo introduce AI non-determinism that is incompatible with the 10/10 reliability requirement.

**Evidence:** [evidence/deterministic-execution.md](evidence/deterministic-execution.md)

CRDT integration tests assert exact document state:

```typescript
// This is deterministic -- same input always produces same output
expect(finalState.ytext).toContain(marker);
expect(finalState.ytext).not.toContain('Section 1'); // after undo
```

Playwright assertions are boolean predicates evaluated in the browser context via `page.evaluate()`. They pass or fail based on the Y.Doc state, not on visual interpretation.

agent-browser's interaction model involves an AI agent reasoning about an accessibility tree snapshot to decide what to interact with. This is deterministic within a single snapshot (ref IDs are stable), but the AI's interpretation of "is the content correct?" is inherently non-deterministic -- the same visual state could produce different AI assessments on different runs.

Peekaboo's `analyze` tool sends screenshots to an AI model for question-answering. The assertion "does the editor contain 'USER-E2E-MARK-1'?" would be an AI vision task, not a boolean predicate.

**Implications:** The spec requires "Tests must pass 10/10 times locally, not flaky." AI-in-the-loop assertions violate this requirement by definition.

---

### 3. CI Compatibility

**Finding:** Playwright has first-class GitHub Actions support with official Docker images and zero-configuration headless operation. Peekaboo is fundamentally incompatible with CI. agent-browser works but requires additional setup.

**Evidence:** [evidence/ci-compatibility.md](evidence/ci-compatibility.md)

| Tool                                                          | GitHub Actions (Linux)                                              | Setup complexity | Headless support                                                                               |
| ------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------- |
| [Playwright](https://playwright.dev/docs/ci)                  | Official Docker image, `npx playwright install --with-deps`         | Minimal          | Default mode                                                                                   |
| [agent-browser](https://github.com/vercel-labs/agent-browser) | Works with headless Chrome, needs explicit config                   | Moderate         | Default mode, [known issues on Linux](https://github.com/vercel-labs/agent-browser/issues/743) |
| [Peekaboo](https://github.com/steipete/Peekaboo)              | Cannot run -- macOS 15+ only, requires display server + permissions | N/A              | Not supported                                                                                  |

The project already uses `@playwright/test: ^1.59.1`. The same test files and configuration run identically on `ubuntu-latest` GitHub Actions runners and local macOS development machines.

**Decision triggers:**

- If CI ever moves to macOS self-hosted runners, Peekaboo becomes technically feasible (but still inferior to Playwright for testing)
- agent-browser's CI story may improve as the tool matures

---

### 4. WebSocket Inspection

**Finding:** Playwright provides full WebSocket frame inspection and interception via `page.routeWebSocket()` -- the only tool that can observe Hocuspocus CRDT sync messages in transit.

**Evidence:** [evidence/websocket-port-speed.md](evidence/websocket-port-speed.md)

Since [Playwright 1.48](https://github.com/microsoft/playwright/releases/tag/v1.48.0), WebSocket interception is a first-class capability:

```typescript
// Passive monitoring -- capture all Hocuspocus sync frames
page.on('websocket', ws => {
  ws.on('framesent', frame => console.log('sent', frame.payload));
  ws.on('framereceived', frame => console.log('recv', frame.payload));
});

// Active interception -- modify or delay frames for testing
await page.routeWebSocket('/collab', ws => {
  const server = ws.connectToServer();
  ws.onMessage(message => {
    // Can inspect Y.js sync protocol messages here
    server.send(message);
  });
});
```

This is directly applicable to diagnosing the Layer C undo issue: capture the sync messages after `POST /api/agent-undo` to see whether the server sends the correct undo state, and whether the browser's observer chain correctly processes it.

Neither agent-browser nor Peekaboo provide any WebSocket visibility.

---

### 5. Port Isolation and Dynamic Allocation

**Finding:** Both Playwright and agent-browser support dynamic port allocation, but Playwright's `webServer` configuration is purpose-built for test infrastructure. The spec's design (Tier 1: `listen(0)`, Tier 2: `VITE_PORT` env var) is sound.

**Evidence:** [evidence/websocket-port-speed.md](evidence/websocket-port-speed.md)

The spec defines two port isolation strategies:

| Tier                  | Strategy                                                                | Mechanism                                             |
| --------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------- |
| Tier 1 (programmatic) | `hocuspocus.listen(0)`                                                  | OS kernel assigns random port -- guaranteed isolation |
| Tier 2 (Playwright)   | `VITE_PORT` env var + `strictPort: true` + `reuseExistingServer: false` | Explicit port, fail-fast on collision                 |

[Playwright 1.57](https://playwright.dev/docs/api/class-testconfig) added `webServer.wait` with named capture groups for dynamic port detection from stdout. However, the spec's approach of pre-allocating a port via env var is simpler and more explicit -- both work.

agent-browser's daemon architecture binds to a configurable port, but has no equivalent of Playwright's `webServer` configuration that manages server lifecycle around test execution.

**Implications:** The current spec design handles port isolation correctly for both tiers. No tool switch needed.

---

### 6. Speed

**Finding:** Playwright test execution is fast enough for the < 2 minute Tier 2 target. agent-browser adds overhead from daemon startup and snapshot processing that would increase test execution time.

**Evidence:** [evidence/websocket-port-speed.md](evidence/websocket-port-speed.md)

Playwright overhead per test:

- Browser launch (cached, headless): \~1-3s
- Navigation + initial load: \~1-2s
- Per-assertion: < 100ms (in-process evaluate())
- With 3-5 Tier 2 tests: < 30s total

agent-browser adds:

- Daemon startup (if not already running): several seconds
- Accessibility tree snapshot per interaction: variable
- If AI agent is reasoning: seconds per step (LLM latency)

The spec's Tier 2 scope is narrow: WYSIWYG typing propagation, source mode toggle, undo button click, multi-turn stress. This is 3-5 tests, not a large suite. Playwright handles this comfortably under 2 minutes.

---

### 7. ProseMirror Interaction

**Finding:** Playwright has proven ProseMirror interaction patterns already in use in the project. The critical capability is not interaction (all tools can type into an editor) but CRDT state verification via `page.evaluate()`.

**Evidence:** [evidence/prosemirror-interaction.md](evidence/prosemirror-interaction.md)

The existing `crdt-stress.spec.ts` demonstrates the correct patterns:

```typescript
// Input: keyboard events (ProseMirror requirement)
await page.locator('.ProseMirror').focus();
await page.keyboard.type(marker, { delay: 5 });

// Verification: direct CRDT state access (not visual)
const finalState = await page.evaluate(() => {
  const provider = (window as any).__hocuspocusProvider;
  return { ytext: provider.document.getText('source').toString() };
});
expect(finalState.ytext).toContain(marker);
```

[ProseMirror requires keyboard events, not DOM value changes](https://dev.to/builtbyzac/why-playwright-fill-silently-fails-on-prosemirror-editors-and-how-to-fix-it-46bi) -- `fill()` silently fails because ProseMirror's input handling bypasses DOM value attributes. This is a well-documented pattern.

The critical distinction for CRDT testing: agent-browser and Peekaboo can type text into ProseMirror (keyboard events work at all levels), but they cannot verify that the text propagated through the observer chain to Y.Text and back to XmlFragment. Only Playwright's `page.evaluate()` can access the Y.Doc in-browser to check CRDT state directly.

---

### 8. Concurrent Execution

**Finding:** Playwright's worker-based parallelism model is mature and well-suited for concurrent worktree execution. agent-browser's daemon architecture is less suited for this scenario.

**Evidence:** [evidence/websocket-port-speed.md](evidence/websocket-port-speed.md)

Playwright parallelism:

- `workers: N` in config for test-level parallelism
- Each worker gets its own browser context and webServer instance
- Sharding for CI-level parallelism (`--shard=1/3`)
- The spec's `VITE_PORT` env var approach ensures each worktree's Playwright run uses a different port

agent-browser parallelism:

- Single daemon per port (configurable)
- Can run multiple browser sessions
- Less mature model for test isolation

The spec's Tier 1 tests already achieve perfect concurrent isolation via `hocuspocus.listen(0)`. Tier 2 tests achieve isolation via `VITE_PORT` + `reuseExistingServer: false`.

---

## Division of Labor Recommendation

**Evidence:** [evidence/division-of-labor.md](evidence/division-of-labor.md)

### Automated test suite: Playwright only

Everything in the test suite -- Tier 1 programmatic tests and Tier 2 browser E2E tests -- should use Playwright. The test infrastructure is committed to the repository, runs in CI, and must be deterministic.

### Interactive debugging: agent-browser (optional, not committed)

During AI-agent-driven development sessions (e.g., Claude Code working in a worktree), agent-browser can provide quick visual verification: "take a screenshot of the editor after the undo." This is useful for development but is not test infrastructure -- it is not committed to the repo, not run in CI, and not part of the regression suite.

### Peekaboo MCP: not applicable

Peekaboo does not add value for this use case. Everything it does (screenshots, GUI interaction) can be done better by agent-browser (which understands browser structure) or Playwright (which has direct browser internals access). Its macOS-only requirement makes it unsuitable for any CI-integrated workflow.

### Summary matrix

| Concern                 | Playwright                | agent-browser             | Peekaboo           |
| ----------------------- | ------------------------- | ------------------------- | ------------------ |
| Automated test suite    | **Primary tool**          | Not suitable              | Not suitable       |
| CI execution            | First-class               | Possible, rougher         | Impossible         |
| CRDT state verification | Direct Y.Doc access       | No access                 | No access          |
| Console/WS capture      | Full APIs                 | None                      | None               |
| ProseMirror typing      | Proven patterns           | Would work                | Would work         |
| Visual debugging (dev)  | Trace Viewer, headed mode | Token-efficient snapshots | macOS screenshots  |
| Determinism             | 10/10 deterministic       | AI non-determinism        | AI non-determinism |
| Maintenance overhead    | Already integrated        | New dependency            | New dependency     |

---

## Limitations & Open Questions

### Dimensions Not Fully Covered

- **agent-browser's **`snapshot`** command for deterministic DOM inspection:** agent-browser provides accessibility tree snapshots that are deterministic (not AI-dependent). In theory, these could be parsed for text content assertions. But this would require building a custom assertion framework on top of agent-browser's output -- far more work than Playwright's built-in `expect()` + `evaluate()`. Not worth investigating further given the clear Playwright advantage.

### Out of Scope (per Rubric)

- General-purpose browser automation comparison (this report is specific to CRDT integration testing)
- Playwright MCP (the MCP server for AI agents) vs Playwright Test (the test framework) -- the report evaluates Playwright Test, which is what `@playwright/test` provides
- Pricing or licensing analysis

---

## References

### Evidence Files

- [evidence/console-network-capture.md](evidence/console-network-capture.md) - Console log capture, WebSocket interception, trace recording capabilities
- [evidence/deterministic-execution.md](evidence/deterministic-execution.md) - Determinism analysis: scripted assertions vs AI interpretation
- [evidence/ci-compatibility.md](evidence/ci-compatibility.md) - GitHub Actions support, Linux headless, system requirements
- [evidence/websocket-port-speed.md](evidence/websocket-port-speed.md) - WebSocket APIs, port isolation, dynamic allocation, speed, parallelism
- [evidence/prosemirror-interaction.md](evidence/prosemirror-interaction.md) - ProseMirror contenteditable patterns, CRDT state verification
- [evidence/division-of-labor.md](evidence/division-of-labor.md) - Tool role separation analysis

### External Sources

- [Playwright Documentation](https://playwright.dev/) - Official docs for test configuration, WebSocket APIs, CI setup
- [Playwright WebSocketRoute API](https://playwright.dev/docs/api/class-websocketroute) - WebSocket interception and mocking
- [Playwright v1.57 Release Notes](https://playwright.dev/docs/release-notes) - webServer.wait dynamic port capture feature
- [Vercel agent-browser](https://github.com/vercel-labs/agent-browser) - CLI documentation and architecture
- [Peekaboo MCP](https://github.com/steipete/Peekaboo) - macOS automation tool documentation
- [ProseMirror + Playwright: Why fill() Fails](https://dev.to/builtbyzac/why-playwright-fill-silently-fails-on-prosemirror-editors-and-how-to-fix-it-46bi) - Community guidance on contenteditable testing

### Related Research

- [reports/ai-browser-testing-tools/](../ai-browser-testing-tools/) - Broader AI browser testing landscape (millionco/expect, Playwright Test Agents, Stagehand, ZeroStep, Meticulous)
- [reports/browser-mcps-devtools-visual-tooling/](../browser-mcps-devtools-visual-tooling/) - Survey of browser MCP tools including Vercel agent-browser and Playwright MCP
- [reports/playwright-cli-assessment/](../playwright-cli-assessment/) - Playwright CLI token efficiency analysis

