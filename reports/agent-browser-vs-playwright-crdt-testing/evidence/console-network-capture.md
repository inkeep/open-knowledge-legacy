# Evidence: Console/Network Capture During Reproduction

**Dimension:** Console/network capture during reproduction
**Date:** 2026-04-09
**Sources:** Playwright docs, agent-browser docs, Peekaboo README, project codebase

---

## Key files / pages referenced

- https://playwright.dev/docs/api/class-websocketroute — WebSocket interception API
- https://playwright.dev/docs/api/class-websocket — WebSocket monitoring API
- https://playwright.dev/docs/trace-viewer — Trace viewer for post-mortem debugging
- https://github.com/vercel-labs/agent-browser — agent-browser CLI
- https://github.com/steipete/Peekaboo — Peekaboo macOS automation
- `packages/app/tests/stress/crdt-stress.spec.ts` — existing Layer C test with console capture

---

## Findings

### Finding: Playwright provides native console log capture and WebSocket interception
**Confidence:** CONFIRMED
**Evidence:** Playwright docs + existing test code

```typescript
// Already in use in crdt-stress.spec.ts:
page.on('console', (m) => logs.push({ type: m.type(), text: m.text() }));
page.on('pageerror', (e) => logs.push({ type: 'uncaught', text: e.message }));
```

Playwright also provides:
- `page.routeWebSocket()` (since v1.48) — intercept, modify, mock WebSocket frames
- `page.on('websocket')` — listen for WebSocket connections, frames sent/received
- Trace Viewer — full recording of test execution with network, console, DOM snapshots
- `DEBUG=pw:protocol` — verbose CDP protocol logging

**Implications:** All CRDT sync messages flowing through Hocuspocus WebSocket can be captured and inspected. This is critical for diagnosing the Layer C undo timeout — can trace exactly which Y.js sync messages arrive and which observer callbacks fire.

### Finding: agent-browser (Vercel) provides screenshot-based visual verification, not programmatic log capture
**Confidence:** CONFIRMED
**Evidence:** https://github.com/vercel-labs/agent-browser README

agent-browser is a CLI tool that provides:
- Accessibility tree snapshots (compact DOM representation)
- Annotated screenshots with numbered overlays
- `--json` flag for machine-readable output
- Dashboard for live viewport monitoring

It does NOT provide:
- Console log capture APIs
- WebSocket frame interception
- Network monitoring APIs
- Trace recording for post-mortem analysis

**Implications:** For diagnosing CRDT sync issues (like the Layer C undo timeout), agent-browser cannot capture the browser console logs or WebSocket frames that are essential for tracing Y.js document state changes.

### Finding: Peekaboo MCP (macOS desktop automation) provides screenshot capture + AI analysis
**Confidence:** CONFIRMED
**Evidence:** https://github.com/steipete/Peekaboo

Peekaboo provides:
- Screenshot capture with AI-powered question answering
- GUI element interaction (click, type, scroll)
- Application window management

It does NOT provide:
- Browser DevTools access
- Console log capture
- WebSocket inspection
- Network monitoring

**Implications:** Peekaboo is useful for visual verification (screenshot → "does the editor show the expected content?") but cannot capture the internal browser state needed for CRDT debugging.

---

## Gaps / follow-ups

- None — this dimension is clearly decided in Playwright's favor for diagnostic capture.
