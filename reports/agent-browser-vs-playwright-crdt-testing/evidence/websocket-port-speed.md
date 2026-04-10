# Evidence: WebSocket Inspection, Port Isolation, Speed, Concurrent Execution

**Dimension:** WebSocket inspection, port isolation, speed, concurrent execution
**Date:** 2026-04-09
**Sources:** Playwright docs, agent-browser docs, project spec + evidence files

---

## Key files / pages referenced

- https://playwright.dev/docs/api/class-websocketroute — routeWebSocket API
- https://playwright.dev/docs/api/class-websocket — WebSocket monitoring
- https://playwright.dev/docs/api/class-testconfig — webServer.wait configuration
- https://github.com/microsoft/playwright/releases/tag/v1.57.0 — wait feature release
- `specs/2026-04-09-bridge-integration-matrix/evidence/port-isolation-patterns.md`
- `specs/2026-04-09-bridge-integration-matrix/evidence/test-infrastructure.md`

---

## Findings

### Finding: Playwright provides full WebSocket inspection and interception
**Confidence:** CONFIRMED
**Evidence:** Playwright API docs

Since Playwright 1.48:
- `page.routeWebSocket(url, handler)` — intercept, modify, mock WebSocket frames
- `page.on('websocket', ws => { ws.on('framesent', ...); ws.on('framereceived', ...); })` — passive monitoring
- Can inspect Hocuspocus sync messages (Y.js sync protocol frames) in transit
- Can mock server responses for isolation testing

The project uses Playwright 1.59.1 — well past the v1.48 feature gate.

**Implications:** For diagnosing the Layer C undo timeout, Playwright can capture every Hocuspocus WebSocket message — including Y.js sync step 1/2, awareness updates, and document state vectors. This gives complete visibility into CRDT synchronization behavior.

### Finding: Playwright 1.57+ supports dynamic port detection via webServer.wait
**Confidence:** CONFIRMED
**Evidence:** Playwright v1.57.0 release notes

New `wait` field in `testConfig.webServer`:
```typescript
webServer: {
  command: 'bun run dev',
  wait: { stdout: /Listening on port (?<vite_port>\d+)/ },
}
```
Named capture groups stored as environment variables: `process.env.VITE_PORT`.

However, the spec's design uses `VITE_PORT` env var passed to the server command (not stdout capture). Both approaches work. The spec's approach is simpler and more explicit.

### Finding: Tier 1 tests use hocuspocus.listen(0) — kernel-level port isolation
**Confidence:** CONFIRMED
**Evidence:** Spec section 9, D2 decision

Tier 1 programmatic tests call `server.hocuspocus.listen()` with port 0, which the OS kernel assigns a random available port. This provides guaranteed isolation — no coordination needed between concurrent worktrees.

Tier 2 Playwright tests use `VITE_PORT` env var + `strictPort: true` + `reuseExistingServer: false`.

### Finding: Playwright test execution speed is well-characterized
**Confidence:** CONFIRMED
**Evidence:** Playwright docs + spec NFRs

- Playwright browser launch: ~1-3s (cached browser, headless)
- Per-test overhead: ~200-500ms for navigation + wait
- The spec estimates Tier 2 tests at "< 5 minutes total"
- Playwright supports parallel workers (`workers: N`) for test-level parallelism
- Sharding for CI-level parallelism

### Finding: agent-browser adds significant overhead for test-like workflows
**Confidence:** INFERRED
**Evidence:** agent-browser architecture

agent-browser overhead per operation:
- Daemon startup (if not running): several seconds
- Chrome launch: comparable to Playwright
- Snapshot capture: accessibility tree extraction adds latency
- LLM reasoning: if AI agent is in the loop, adds seconds per step
- Dashboard monitoring: additional network overhead

For a 12-path propagation matrix, this overhead compounds. If each test takes 5s extra due to agent-browser overhead, the matrix takes 60s longer than Playwright.

### Finding: Concurrent execution
**Confidence:** CONFIRMED
**Evidence:** Playwright docs, agent-browser docs

Playwright:
- Native worker-level parallelism (`workers: N` in config)
- Each worker gets its own browser context
- webServer per project for multi-project isolation
- Sharding across CI machines

agent-browser:
- Daemon-based architecture — single daemon per port
- Multiple browser sessions supported
- `AGENT_BROWSER_IDLE_TIMEOUT_MS` for ephemeral instances
- Less mature concurrent execution model

---

## Gaps / follow-ups

- Actual Playwright test execution time for the CRDT matrix should be measured empirically after implementation.
