/**
 * MCP ↔ collab keep-alive WebSocket (D-034).
 *
 * `ok mcp` holds a single persistent WebSocket to `/collab/keepalive` for the
 * lifetime of the MCP stdio process. The WS carries no traffic — its sole
 * purpose is to register as an `/collab*` upgrade on the collab server so the
 * idle-shutdown primitive (`packages/server/src/idle-shutdown.ts`) counts it
 * as an active client. As long as MCP is alive, the server's WS-client count
 * stays ≥ 1 and the 30-min idle timer cannot fire.
 *
 * Without this channel, MCP tool calls transit HTTP `fetch()` only — which
 * doesn't touch `httpServer.on('upgrade')` — so a live MCP session is
 * invisible to idle-shutdown. Observed 2026-04-16: idle-shutdown killed the
 * collab server while MCP was mid-session; every subsequent tool call
 * returned `Server unreachable: fetch failed` until user manually `/mcp`
 * reconnected. See SPEC D-034.
 *
 * Server-side intercept: `packages/cli/src/commands/start.ts` routes
 * `/collab/keepalive` upgrades to a bare WS handshake (no Hocuspocus, no
 * Y.Doc) — the socket exists purely as an idle-shutdown signal.
 *
 * Reconnect semantics: on close (including server restart) we retry with
 * exponential backoff (1s → 2s → 4s → … max 30s), re-reading `server.lock`
 * on each attempt so a server that respawned on a different port is picked
 * up transparently.
 */

export interface KeepaliveScheduler {
  setTimeout: (cb: () => void, ms: number) => ReturnType<typeof globalThis.setTimeout>;
  clearTimeout: (handle: ReturnType<typeof globalThis.setTimeout>) => void;
}

/**
 * Minimal shape of what the keep-alive needs from a WebSocket. We accept this
 * instead of the full DOM WebSocket type so tests can pass a fake without
 * needing to satisfy every method/event in the spec.
 */
export interface MinimalWebSocket {
  readyState: number;
  close: () => void;
  addEventListener: (type: 'open' | 'close' | 'error', listener: () => void) => void;
}

interface KeepaliveOptions {
  /**
   * Called on each connect attempt. Returns a WebSocket base URL
   * (`ws://localhost:<port>`) or `undefined` if the server is not yet
   * reachable (in which case the keep-alive schedules a retry with
   * backoff rather than failing outright).
   *
   * Typically wired to the same `server.lock`-reading resolver the rest
   * of MCP uses — but the keep-alive needs the `ws://` form, not the
   * `http://` form returned by `resolveServerUrlForTools`. Callers pass
   * a small adapter.
   */
  resolveWsUrl: () => Promise<string | undefined>;
  /**
   * Structured logger. When provided, lifecycle events emit JSON with
   * url, backoff, and error context. Falls back to `log` callback.
   */
  logger?: import('./logger.ts').McpLogger;
  /**
   * Legacy log callback. Used when `logger` is not provided.
   */
  log?: (msg: string) => void;
  /** Injectable scheduler for deterministic tests (precedent #13b). */
  scheduler?: KeepaliveScheduler;
  /** Override the initial backoff (default 1000ms). Tests pass a small value. */
  initialBackoffMs?: number;
  /** Override the max backoff (default 30000ms). */
  maxBackoffMs?: number;
  /**
   * Override the WebSocket constructor. Defaults to Node 22+ `globalThis.WebSocket`.
   * Tests pass a factory that returns a controllable fake.
   */
  createWebSocket?: (url: string) => MinimalWebSocket;
}

interface KeepaliveHandle {
  /** Stop reconnect attempts and close the underlying WS. Idempotent. */
  close: () => void;
  /** For tests — `true` while the WS is open and in `OPEN` state. */
  isConnected: () => boolean;
}

const DEFAULT_INITIAL_BACKOFF_MS = 1000;
const DEFAULT_MAX_BACKOFF_MS = 30_000;

export function startKeepalive(opts: KeepaliveOptions): KeepaliveHandle {
  const scheduler: KeepaliveScheduler = opts.scheduler ?? {
    setTimeout: (cb, ms) => globalThis.setTimeout(cb, ms),
    clearTimeout: (h) => globalThis.clearTimeout(h),
  };
  const initialBackoffMs = opts.initialBackoffMs ?? DEFAULT_INITIAL_BACKOFF_MS;
  const maxBackoffMs = opts.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;

  const createWebSocket: (url: string) => MinimalWebSocket =
    opts.createWebSocket ?? ((url: string) => new WebSocket(url));
  const log = opts.logger ?? null;
  const legacyLog = opts.log;
  let ws: MinimalWebSocket | null = null;
  let reconnectTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  let stopped = false;
  let backoffMs = initialBackoffMs;

  function emit(
    level: 'info' | 'warn' | 'error' | 'debug',
    msg: string,
    ctx?: Record<string, unknown>,
  ): void {
    try {
      if (log) {
        log[level](msg, ctx);
      } else {
        legacyLog?.(msg);
      }
    } catch {
      // best-effort observer
    }
  }

  function scheduleReconnect(): void {
    if (stopped) return;
    if (reconnectTimer !== null) {
      scheduler.clearTimeout(reconnectTimer);
    }
    const wait = backoffMs;
    backoffMs = Math.min(backoffMs * 2, maxBackoffMs);
    emit('debug', 'scheduling reconnect', { backoffMs: wait });
    reconnectTimer = scheduler.setTimeout(() => {
      reconnectTimer = null;
      connect().catch((err) => emit('warn', 'reconnect failed', { error: String(err) }));
    }, wait);
  }

  async function connect(): Promise<void> {
    if (stopped) return;
    let baseUrl: string | undefined;
    try {
      baseUrl = await opts.resolveWsUrl();
    } catch (err) {
      emit('warn', 'resolveWsUrl threw', { error: String(err) });
      scheduleReconnect();
      return;
    }
    if (!baseUrl) {
      scheduleReconnect();
      return;
    }

    const url = `${baseUrl}/collab/keepalive?pid=${process.pid}`;
    try {
      ws = createWebSocket(url);
    } catch (err) {
      emit('warn', 'WebSocket constructor failed', { url, error: String(err) });
      ws = null;
      scheduleReconnect();
      return;
    }

    ws.addEventListener('open', () => {
      emit('info', 'connected', { url: baseUrl });
      backoffMs = initialBackoffMs;
    });

    ws.addEventListener('close', () => {
      if (stopped) return;
      emit('info', 'disconnected', { url: baseUrl });
      ws = null;
      scheduleReconnect();
    });

    ws.addEventListener('error', () => {
      // `close` fires after every error that kills the socket; reconnect
      // logic lives there. Emit a debug breadcrumb first so operators can
      // correlate the close/retry with the socket that faulted.
      emit('debug', 'websocket error observed', {
        url: baseUrl,
        readyState: ws?.readyState,
        reason: 'error-event',
      });
    });
  }

  // Fire the first connect on a microtask to let the caller finish wiring.
  queueMicrotask(() => {
    connect().catch((err) => emit('warn', 'initial connect failed', { error: String(err) }));
  });

  return {
    close: () => {
      if (stopped) return;
      stopped = true;
      if (reconnectTimer !== null) {
        scheduler.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (ws) {
        try {
          ws.close();
        } catch {
          // best-effort
        }
        ws = null;
      }
    },
    isConnected: () => ws !== null && ws.readyState === 1 /* OPEN */,
  };
}
