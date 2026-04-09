---
name: test-infrastructure
description: Current test infrastructure — harness patterns, helpers, runners, port config, isolation mechanisms
type: factual
sources:
  - packages/app/src/editor/observers.test.ts
  - packages/app/tests/stress/observers.stress.test.ts
  - packages/app/tests/stress/observers.fuzz.test.ts
  - packages/app/tests/stress/crdt-stress.spec.ts
  - packages/app/playwright.config.ts
---

# Test Infrastructure

## Helpers (shared across test files)

| Helper | File | Purpose |
|--------|------|---------|
| `wait(ms = 400)` | observers.test.ts:25-27 | Timer-based debounce settling |
| `applyMarkdown(doc, frag, md)` | observers.test.ts:30-35 | Populate XmlFragment from markdown |
| `createObservedDoc()` | observer-sync.test.ts:36-42 | Factory: Y.Doc + fragment + ytext + setupObservers |
| `stripTrailingWhitespace(s)` | observers.stress.test.ts:41-47 | Normalize for bridge invariant comparison |
| `serializeFragment(fragment)` | observers.stress.test.ts:56-58 | XmlFragment → markdown string |
| `stabilize(md)` | observers.stress.test.ts:66-68 | Round-trip through parse→serialize |
| `assertBridgeInvariant(ytext, frag, label)` | observers.stress.test.ts:71-98 | Two-tier equality + diagnostic |
| `markUserTyping()` | observers.ts:66-68 | Exported: simulate user typing |
| `__resetCoordinationState()` | observers.ts:71-73 | Exported: reset module-level timing state |
| `generateMarkdown(lines, variant)` | synthetic.ts:130-183 | Deterministic markdown generator |

## Runner Configuration

- Unit tests: `bun test` (all `*.test.ts`)
- App excludes stress: `bun test --path-ignore-patterns 'tests/stress'`
- Stress: `bun run test:stress` (observers.stress + fuzz)
- HTTP stress: `bun run test:stress:api` (needs running dev server)
- E2E: `bun run test:stress:e2e` (Playwright, auto-starts via webServer)

## Port Configuration (CURRENT — PROBLEMATIC)

- Dev server: hardcoded port 5173 (Vite default)
- E2E tests: `STRESS_BASE_URL` env var, defaults to `http://localhost:5173`
- WebSocket: `/collab` path
- API: `/api/*` path
- **Problem:** `reuseExistingServer: true` in playwright.config.ts picks up ANY server on port 5173 — including stale servers from other worktrees

## Test Isolation (CURRENT)

`/api/test-reset` endpoint:
1. `sessionManager.closeAll()` — disconnect agent sessions
2. `hocuspocus.closeConnections('test-doc')` — disconnect WS clients
3. Flush pending debouncer (D18 fix)
4. `hocuspocus.unloadDocument(doc)` — evict Y.Doc
5. Write empty file to disk

**Known gaps:**
- Does NOT disconnect browser tabs (other HocuspocusProvider clients)
- Port collision with other worktree dev servers
- No cleanup of file watcher state
