/**
 * `mountMcpAndApi` — single canonical wiring for `/mcp` + `/api/*` + WS upgrade.
 *
 * Three consumers compose the same four ingredients on top of an `http.Server`:
 *   1. `bootServer()` (CLI `ok start`, Electron utility, Vite dev plugin via the
 *      shared boot path).
 *   2. The integration test harness's `createTestServer()`.
 *   3. The integration test harness's `createRestartableServer()` (no `/mcp` —
 *      passes `mcpHttpHandler: undefined`).
 *
 * Before this extraction every consumer reimplemented the request handler, the
 * `WebSocketServer({ noServer: true })`, the `/collab/keepalive` short-circuit,
 * the keepalive-grace timer map, and the per-`connectionId` cleanup cascade
 * (`closeAllForAgent` + `clearFocus` + `clearPresence`). The duplication had
 * already drifted: `boot.ts` validated `connectionId` via `validateAgentId` to
 * defend against log-injection / `clearPresence` cross-eviction; the harness
 * accepted any `connectionId` query param. Centralizing in one helper closes
 * that drift class permanently — every consumer gets the production-grade
 * validation path.
 *
 * The helper attaches both `'request'` and `'upgrade'` listeners to the
 * supplied `httpServer`. Callers therefore MUST `createHttpServer()` with no
 * constructor callback — passing a `(req, res) => {…}` arg would install a
 * second `'request'` listener and double-handle every inbound HTTP request.
 *
 * `shutdown()` cancels pending grace timers + awaits in-flight cleanups so
 * caller `destroy()` paths do not race a still-firing grace callback into
 * a torn-down `sessionManager` / broadcaster.
 */

import type { Server as HttpServer, IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import type { Hocuspocus } from '@hocuspocus/server';
import { WebSocketServer } from 'ws';
import type { AgentFocusBroadcaster } from './agent-focus.ts';
import { toBroadcasterKey, validateAgentId } from './agent-id.ts';
import type { AgentPresenceBroadcaster } from './agent-presence.ts';
import type { AgentSessionManager } from './agent-sessions.ts';
import { isAllowedApiOrigin } from './api-origin.ts';
import type { PinoLogger } from './logger.ts';
import { isAllowedWorkspaceHostHeader, isLoopbackAddress } from './loopback.ts';
import type { McpHttpHandler } from './mcp-http.ts';
import { handleCollabSocketError } from './metrics.ts';

const DEFAULT_KEEPALIVE_GRACE_MS = 10_000;
const MCP_CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, traceparent, tracestate, baggage, mcp-session-id, mcp-protocol-version',
  // 24 h preflight cache — prevents a round-trip OPTIONS on every sequential tool call.
  'Access-Control-Max-Age': '86400',
};

export interface MountMcpAndApiOptions {
  /** HTTP server constructed with no constructor callback (the helper installs `'request'` + `'upgrade'` listeners). */
  httpServer: HttpServer;
  /** Hocuspocus instance whose `onRequest` extensions answer `/api/*` and whose `handleConnection` answers `/collab`. */
  hocuspocus: Hocuspocus;
  /**
   * MCP Streamable HTTP handler. When omitted, `/mcp` is NOT mounted — the
   * `createRestartableServer` test helper takes this path because its
   * fast-restart contract has no MCP component.
   */
  mcpHttpHandler?: McpHttpHandler;
  /** Logger for upgrade / request errors. */
  log: PinoLogger;
  /**
   * Agent session manager. Used inside the `/collab/keepalive` grace-timer
   * callback to evict the connection's sessions on disconnect. Optional —
   * `createRestartableServer` does not wire keepalive cleanup because the
   * killNetwork path tears down the underlying `srv` directly.
   */
  sessionManager?: AgentSessionManager;
  /** Agent focus broadcaster. Cleared per-`connectionId` on grace expiry. */
  agentFocusBroadcaster?: AgentFocusBroadcaster | null;
  /**
   * Agent presence broadcaster. Used both for the 3 s `bumpPresenceTs` heartbeat
   * (under the keyed `agent-<id>` map key via `toBroadcasterKey`) and for
   * `clearPresence` on grace expiry.
   */
  agentPresenceBroadcaster?: AgentPresenceBroadcaster | null;
  /**
   * Grace period (ms) before keepalive-close triggers session cleanup. Default 10 000.
   * Tests pass smaller values (e.g. 100–150) for fast teardown.
   */
  keepaliveGraceMs?: number;
}

export interface MountMcpAndApiHandle {
  /**
   * The shared `WebSocketServer({ noServer: true })`. Caller is responsible
   * for `wss.close()` AFTER `shutdown()` resolves — once destroy of the
   * underlying server has flushed any in-flight observer work.
   */
  wss: WebSocketServer;
  /**
   * Cancel pending keepalive grace timers and await any in-flight cleanup
   * promises so the caller's destroy path does not race a still-firing
   * callback into a torn-down `sessionManager` / broadcaster. Idempotent.
   */
  shutdown: () => Promise<void>;
}

/**
 * Wire `/mcp` + `/api/*` + the `/collab` + `/collab/keepalive` WS upgrade onto
 * the supplied `httpServer`. See module doc-block for the full contract.
 */
export function mountMcpAndApi(opts: MountMcpAndApiOptions): MountMcpAndApiHandle {
  const {
    httpServer,
    hocuspocus,
    mcpHttpHandler,
    log,
    sessionManager,
    agentFocusBroadcaster,
    agentPresenceBroadcaster,
  } = opts;
  const keepaliveGraceMs = opts.keepaliveGraceMs ?? DEFAULT_KEEPALIVE_GRACE_MS;

  const wss = new WebSocketServer({ noServer: true });
  wss.on('error', (err) => {
    log.error({ err }, 'WebSocketServer error');
  });

  // connectionId → pending grace timer handle.
  const keepaliveGraceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  // In-flight grace-timer callbacks so `shutdown()` can await them rather than
  // racing against the sessionManager / agentFocusBroadcaster teardown.
  const keepaliveGraceInflight = new Set<Promise<void>>();
  // Set when `shutdown()` runs so any callback that fired just before the
  // timer was cleared can short-circuit instead of touching disposed resources.
  let shuttingDown = false;

  const onRequest = (req: IncomingMessage, res: ServerResponse): void => {
    const url = req.url?.split('?')[0];
    if (mcpHttpHandler !== undefined && url === '/mcp') {
      const origin = req.headers.origin;
      const sessionId = Array.isArray(req.headers['mcp-session-id'])
        ? req.headers['mcp-session-id'][0]
        : req.headers['mcp-session-id'];
      if (!isLoopbackAddress(req.socket.remoteAddress)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'loopback-required' }));
        return;
      }
      if (!isAllowedWorkspaceHostHeader(req.headers.host)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'host-header-not-allowed' }));
        return;
      }
      if (origin !== undefined && !isAllowedApiOrigin(origin)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'origin-not-allowed' }));
        return;
      }
      if (origin !== undefined) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
      }
      for (const [header, value] of Object.entries(MCP_CORS_HEADERS)) {
        res.setHeader(header, value);
      }
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
      mcpHttpHandler.handle(req, res).catch((err) => {
        log.error({ err, sessionId }, 'Unhandled MCP HTTP error');
        if (!res.writableEnded && !res.headersSent) {
          res.writeHead(500);
          res.end('Internal server error');
        } else if (!res.writableEnded) {
          res.end();
        }
      });
      return;
    }
    if (url?.startsWith('/api/')) {
      hocuspocus
        // biome-ignore lint/suspicious/noExplicitAny: Hocuspocus `hooks()` has no exported payload type for onRequest
        .hooks('onRequest', { request: req, response: res } as any)
        .then(() => {
          if (res.writableEnded || res.headersSent) return;
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'API route not found', path: url }));
        })
        .catch((err) => {
          log.error({ err }, 'Unhandled onRequest error');
          if (!res.writableEnded && !res.headersSent) {
            res.writeHead(500);
            res.end('Internal server error');
          } else if (!res.writableEnded) {
            res.end();
          }
        });
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: 'Not found. The React UI is served by `ok ui` (default port 3000).',
        path: url ?? '/',
      }),
    );
  };

  const onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer): void => {
    if (req.url?.startsWith('/collab/keepalive')) {
      if (
        !isLoopbackAddress(req.socket.remoteAddress) ||
        !isAllowedWorkspaceHostHeader(req.headers.host)
      ) {
        socket.destroy();
        return;
      }
      socket.on('error', (err: NodeJS.ErrnoException) => {
        if (handleCollabSocketError(err)) return;
        log.error({ err }, 'MCP keepalive socket error');
      });
      wss.handleUpgrade(req, socket, head, (ws) => {
        // Per-session connectionId from the URL. Validated through the same
        // regex as the HTTP write path (`extractAgentIdentity` in
        // `api-extension.ts`) so the keepalive cleanup surface and the write
        // surface share one contract — without it a caller who can reach the
        // keepalive WS could force-evict another agent's presence by
        // crafting `connectionId=<victim>` on close.
        const connectionId = parseKeepaliveConnectionId(req.url);

        // Reconnect within the grace window cancels the pending eviction.
        if (connectionId) {
          const existing = keepaliveGraceTimers.get(connectionId);
          if (existing !== undefined) {
            clearTimeout(existing);
            keepaliveGraceTimers.delete(connectionId);
            log.info({ connectionId }, '[keepalive] reconnect during grace — timer cancelled');
          }
        }

        const pingTimer = setInterval(() => {
          try {
            ws.ping();
          } catch {
            // Dead socket fires 'close' + 'error' which clean up below.
          }
        }, 30_000);
        pingTimer.unref?.();

        // Presence-ts heartbeat — beats the client-side 5 s TTL filter when
        // an agent sits idle between tool calls (LLM "thinking" 10–30 s).
        // `toBroadcasterKey(connectionId)` translates the raw URL id into
        // the `agent-<id>` map key used by HTTP write handlers via
        // `extractAgentIdentity`; without the prefix `bumpPresenceTs` no-ops
        // because no entry lives under the bare key.
        const tsRefreshTimer = connectionId
          ? setInterval(() => {
              agentPresenceBroadcaster?.bumpPresenceTs(toBroadcasterKey(connectionId));
            }, 3_000)
          : null;
        tsRefreshTimer?.unref?.();

        ws.on('close', () => {
          clearInterval(pingTimer);
          if (tsRefreshTimer !== null) clearInterval(tsRefreshTimer);
          if (!connectionId) return;
          const timer = setTimeout(() => {
            keepaliveGraceTimers.delete(connectionId);
            // If `shutdown()` already ran, the sessionManager + broadcasters
            // may be mid-teardown — racing them is worse than skipping
            // cleanup (TOCTOU between our clearTimeout loop and the timer
            // firing).
            if (shuttingDown) return;
            const work = (async () => {
              log.info({ connectionId }, '[keepalive] grace expired — cleaning up sessions');
              try {
                await sessionManager?.closeAllForAgent(connectionId);
              } catch (err) {
                log.error({ err, connectionId }, '[keepalive] closeAllForAgent failed');
              }
              try {
                agentFocusBroadcaster?.clearFocus(connectionId);
              } catch (err) {
                log.error({ err, connectionId }, '[keepalive] clearFocus failed');
              }
              try {
                agentPresenceBroadcaster?.clearPresence(toBroadcasterKey(connectionId));
              } catch (err) {
                log.error({ err, connectionId }, '[keepalive] clearPresence failed');
              }
            })();
            keepaliveGraceInflight.add(work);
            work.finally(() => keepaliveGraceInflight.delete(work));
          }, keepaliveGraceMs);
          timer.unref?.();
          keepaliveGraceTimers.set(connectionId, timer);
          log.info(
            { connectionId, graceMs: keepaliveGraceMs },
            '[keepalive] disconnected — grace timer started',
          );
        });
        ws.on('error', (err: NodeJS.ErrnoException) => {
          if (!handleCollabSocketError(err)) {
            log.error({ err }, 'MCP keepalive WS error');
          }
          ws.terminate();
        });
      });
      return;
    }

    if (req.url?.startsWith('/collab')) {
      socket.on('error', (err: NodeJS.ErrnoException) => {
        if (handleCollabSocketError(err)) return;
        log.error({ err }, 'Upgrade socket error');
      });
      wss.handleUpgrade(req, socket, head, (ws) => {
        const clientConnection = hocuspocus.handleConnection(
          ws as unknown as WebSocket,
          req as unknown as Request,
        );
        ws.on('message', (data: ArrayBuffer | Buffer) => {
          clientConnection.handleMessage(
            data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data),
          );
        });
        ws.on('close', (code: number, reason: Buffer) => {
          clientConnection.handleClose({ code, reason: reason.toString() });
        });
        ws.on('error', (err: NodeJS.ErrnoException) => {
          if (!handleCollabSocketError(err)) {
            log.error({ err }, 'WebSocket error');
          }
          ws.terminate();
        });
      });
    }
  };

  httpServer.on('request', onRequest);
  httpServer.on('upgrade', onUpgrade);

  return {
    wss,
    shutdown: async (): Promise<void> => {
      if (shuttingDown) return;
      shuttingDown = true;
      for (const timer of keepaliveGraceTimers.values()) {
        clearTimeout(timer);
      }
      keepaliveGraceTimers.clear();
      if (keepaliveGraceInflight.size > 0) {
        await Promise.allSettled([...keepaliveGraceInflight]);
      }
    },
  };
}

/**
 * Extract + validate the `connectionId` query param from a `/collab/keepalive`
 * upgrade URL. Tolerant of: missing URL (`undefined`), unparseable URL,
 * missing/empty `connectionId`. Values that do not match `AGENT_ID_RE`
 * (`[a-zA-Z0-9_-]+`) return `null` — the close handler then falls through
 * to TTL-only cleanup rather than firing `clearPresence` /
 * `closeAllForAgent` / `clearFocus` with attacker-controlled bytes.
 *
 * The validation is intentionally identical to the HTTP write path
 * (`extractAgentIdentity` in `api-extension.ts`) so the write surface and
 * the cleanup surface share one contract. Without it, a caller who can
 * reach the keepalive WS (e.g. an unauthenticated peer when the user has
 * bound to `0.0.0.0`) could force-evict another agent's presence entry
 * by passing a crafted `connectionId=<victim>` on WS close. The shared
 * regex also prevents CR/LF bytes in query-string values from reaching
 * the structured `[keepalive] disconnected` log line (log-injection
 * defense-in-depth — pino escapes these but some transports strip the
 * escaping after egress).
 *
 * Exported for unit testing. Never throws.
 */
export function parseKeepaliveConnectionId(url: string | undefined): string | null {
  if (!url) return null;
  try {
    // The second arg is a dummy base so `new URL` accepts path-only inputs.
    const parsed = new URL(url, 'http://localhost');
    const connectionId = parsed.searchParams.get('connectionId');
    return validateAgentId(connectionId);
  } catch {
    return null;
  }
}
