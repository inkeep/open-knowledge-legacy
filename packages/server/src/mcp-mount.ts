import type { Server as HttpServer, IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import type { Hocuspocus } from '@hocuspocus/server';
import { WebSocketServer } from 'ws';
import type { AgentFocusBroadcaster } from './agent-focus.ts';
import { toBroadcasterKey, validateAgentId } from './agent-id.ts';
import type { AgentPresenceBroadcaster } from './agent-presence.ts';
import type { AgentSessionManager } from './agent-sessions.ts';
import { isAllowedApiOrigin } from './api-origin.ts';
import { errorResponse } from './http/error-response.ts';
import type { PinoLogger } from './logger.ts';
import { isAllowedWorkspaceHostHeader, isLoopbackAddress } from './loopback.ts';
import type { McpHttpHandler } from './mcp-http.ts';
import { handleCollabSocketError, incrementCollabMessageTooLarge } from './metrics.ts';

const DEFAULT_KEEPALIVE_GRACE_MS = 10_000;
const MAX_COLLAB_MESSAGE_BYTES = 1024 * 1024;
const MCP_CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, traceparent, tracestate, baggage, mcp-session-id, mcp-protocol-version',
  'Access-Control-Max-Age': '86400',
};

export interface MountMcpAndApiOptions {
  httpServer: HttpServer;
  hocuspocus: Hocuspocus;
  mcpHttpHandler?: McpHttpHandler;
  log: PinoLogger;
  sessionManager?: AgentSessionManager;
  agentFocusBroadcaster?: AgentFocusBroadcaster | null;
  agentPresenceBroadcaster?: AgentPresenceBroadcaster | null;
  keepaliveGraceMs?: number;
}

export interface MountMcpAndApiHandle {
  wss: WebSocketServer;
  shutdown: () => Promise<void>;
}

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

  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_COLLAB_MESSAGE_BYTES });
  wss.on('error', (err) => {
    log.error({ err }, 'WebSocketServer error');
  });

  const keepaliveGraceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const keepaliveGraceInflight = new Set<Promise<void>>();
  let shuttingDown = false;

  const onRequest = (req: IncomingMessage, res: ServerResponse): void => {
    const url = req.url?.split('?')[0];
    if (mcpHttpHandler !== undefined && url === '/mcp') {
      const origin = req.headers.origin;
      const sessionId = Array.isArray(req.headers['mcp-session-id'])
        ? req.headers['mcp-session-id'][0]
        : req.headers['mcp-session-id'];
      if (!isLoopbackAddress(req.socket.remoteAddress)) {
        errorResponse(res, 403, 'urn:ok:error:loopback-required', 'Loopback access required.', {
          handler: 'mcp',
        });
        return;
      }
      if (!isAllowedWorkspaceHostHeader(req.headers.host)) {
        errorResponse(res, 403, 'urn:ok:error:host-not-allowed', 'Host header not allowed.', {
          handler: 'mcp',
        });
        return;
      }
      if (origin !== undefined && !isAllowedApiOrigin(origin)) {
        errorResponse(res, 403, 'urn:ok:error:invalid-origin', 'Origin not allowed.', {
          handler: 'mcp',
        });
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
          errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Internal server error.', {
            handler: 'mcp',
            cause: err,
          });
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
          errorResponse(res, 404, 'urn:ok:error:not-found', 'API endpoint not found.', {
            handler: 'mcp-mount',
            detail: `No handler for ${req.method ?? 'GET'} ${url}`,
          });
        })
        .catch((err) => {
          log.error({ err }, 'Unhandled onRequest error');
          if (!res.writableEnded && !res.headersSent) {
            errorResponse(
              res,
              500,
              'urn:ok:error:internal-server-error',
              'Internal server error.',
              { handler: 'mcp-mount', cause: err },
            );
          } else if (!res.writableEnded) {
            res.end();
          }
        });
      return;
    }
    errorResponse(res, 404, 'urn:ok:error:not-found', 'Not found.', {
      handler: 'mcp-mount',
      detail: `The React UI is served by \`ok ui\` (default port 3000). No handler for ${url ?? '/'}`,
    });
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
        const connectionId = parseKeepaliveConnectionId(req.url);

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
          } catch {}
        }, 30_000);
        pingTimer.unref?.();

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
        let closedByPolicy = false;
        ws.on('message', (data: ArrayBuffer | Buffer) => {
          if (closedByPolicy) return;
          const bytes = data.byteLength;
          if (bytes > MAX_COLLAB_MESSAGE_BYTES) {
            closedByPolicy = true;
            incrementCollabMessageTooLarge();
            log.warn(
              { event: 'collab-message-too-large', bytes, limit: MAX_COLLAB_MESSAGE_BYTES },
              'Collab WebSocket message rejected before Yjs processing',
            );
            ws.close(1009, 'Message Too Big');
            return;
          }
          clientConnection.handleMessage(new Uint8Array(data as Buffer));
        });
        ws.on('close', (code: number, reason: Buffer) => {
          clientConnection.handleClose({ code, reason: reason.toString() });
        });
        ws.on('error', (err: NodeJS.ErrnoException) => {
          if (err.code === 'WS_ERR_UNSUPPORTED_MESSAGE_LENGTH') {
            incrementCollabMessageTooLarge();
            log.warn(
              { event: 'collab-message-too-large', limit: MAX_COLLAB_MESSAGE_BYTES },
              'Collab WebSocket frame rejected by ws maxPayload before Yjs processing',
            );
            ws.terminate();
            return;
          }
          if (!handleCollabSocketError(err)) {
            log.error({ err }, 'WebSocket error');
          }
          ws.terminate();
        });
      });
      return;
    }

    socket.destroy();
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

export function parseKeepaliveConnectionId(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url, 'http://localhost');
    const connectionId = parsed.searchParams.get('connectionId');
    return validateAgentId(connectionId);
  } catch {
    return null;
  }
}
