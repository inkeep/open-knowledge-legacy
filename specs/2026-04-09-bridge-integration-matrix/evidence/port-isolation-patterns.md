---
name: port-isolation-patterns
description: Port allocation and test isolation patterns from ~/agents, adapted for Vite + Playwright + HocuspocusProvider
type: factual
sources:
  - /Users/edwingomezcuellar/agents/scripts/isolated-env.sh
  - /Users/edwingomezcuellar/agents/agents-api/vite.config.ts
  - /Users/edwingomezcuellar/agents/scripts/setup-dev.js
---

# Port Isolation Patterns (from ~/agents)

## Pattern 1: Dynamic port allocation via Node.js net.createServer

```typescript
function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = require('net').createServer();
    s.listen(0, () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => resolve(port));
    });
    s.on('error', reject);
  });
}
```

Equivalent to the Python socket pattern in `isolated-env.sh:139-140`. OS kernel allocates a guaranteed-free port.

## Pattern 2: Vite env var + strictPort

From `agents-api/vite.config.ts:36-44`:
```typescript
server: {
  port: (() => {
    const p = parseInt(process.env.AGENTS_API_PORT || '3002', 10);
    if (Number.isNaN(p)) throw new Error(`Invalid port`);
    return p;
  })(),
  strictPort: true,  // fail fast if port taken
}
```

Key: `strictPort: true` prevents Vite from silently falling back to another port.

## Pattern 3: Warmup plugin captures actual port

From `agents-api/vite.config.ts:12-24`:
```typescript
function warmup(): Plugin {
  return {
    name: 'warmup',
    configureServer(server) {
      server.httpServer?.once('listening', () => {
        const addr = server.httpServer?.address();
        if (addr && typeof addr === 'object') {
          // addr.port is the actual port Vite bound to
        }
      });
    },
  };
}
```

## Recommended architecture for our setup

```
playwright.config.ts
├─ webServer.command: VITE_PORT=<random> bun run dev
├─ webServer.url: http://localhost:<random>
├─ reuseExistingServer: false (never reuse!)
└─ env: { STRESS_BASE_URL: http://localhost:<random> }

vite.config.ts
├─ server.port: parseInt(process.env.VITE_PORT || '5173')
├─ server.strictPort: true
└─ HocuspocusProvider WebSocket on same port at /collab

Test files
├─ Read STRESS_BASE_URL from process.env (already supported)
├─ HTTP API: ${STRESS_BASE_URL}/api/agent-write-md
└─ WebSocket: ws://localhost:${port}/collab
```

Key change from current setup: `reuseExistingServer: false` — NEVER reuse a server that might be from another worktree. Combined with `strictPort: true`, this guarantees the test server is ours.
