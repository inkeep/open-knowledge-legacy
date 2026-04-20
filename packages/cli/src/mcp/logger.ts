/**
 * Structured MCP logger — JSON lines on stderr for Claude Desktop logs.
 *
 * Every log entry carries:
 *   sessionId  — stable for one MCP stdio process lifetime
 *   corrId     — rotated per logical operation (tool call, startup phase)
 *   component  — 'mcp' by default; callers can narrow
 *
 * All output goes to stderr (stdout is the MCP JSON-RPC wire).
 * Debug-level output is gated behind MCP_DEBUG=1 or DEBUG containing 'mcp'.
 */

import { randomUUID } from 'node:crypto';
import { appendFileSync } from 'node:fs';

export interface McpLogEntry {
  ts: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  sessionId: string;
  corrId: string;
  component: string;
  msg: string;
  [key: string]: unknown;
}

export class McpLogger {
  readonly sessionId: string;
  private corrId: string;
  private readonly component: string;

  constructor(component = 'mcp', sessionId?: string) {
    this.sessionId = sessionId ?? randomUUID().slice(0, 12);
    this.corrId = randomUUID().slice(0, 8);
    this.component = component;
  }

  // ── public API ───────────────────────────────────────────────────────

  info(msg: string, ctx: Record<string, unknown> = {}): void {
    this.emit('info', msg, ctx);
  }

  warn(msg: string, ctx: Record<string, unknown> = {}): void {
    this.emit('warn', msg, ctx);
  }

  error(msg: string, err?: unknown, ctx: Record<string, unknown> = {}): void {
    const errCtx = err ? { error: err instanceof Error ? err.message : String(err), ...ctx } : ctx;
    this.emit('error', msg, errCtx);
  }

  debug(msg: string, ctx: Record<string, unknown> = {}): void {
    if (process.env.MCP_DEBUG === '1' || process.env.DEBUG?.includes('mcp')) {
      this.emit('debug', msg, ctx);
    }
  }

  /**
   * Return a child logger that shares sessionId but has a fresh corrId.
   * Use at the start of each tool call or startup phase.
   */
  child(component?: string): McpLogger {
    const c = new McpLogger(component ?? this.component, this.sessionId);
    return c;
  }

  /** Adapter for call sites that still pass `(msg: string) => void`. */
  asCallback(): (msg: string) => void {
    return (msg: string) => this.info(msg);
  }

  // ── internals ────────────────────────────────────────────────────────

  private emit(
    level: 'debug' | 'info' | 'warn' | 'error',
    msg: string,
    ctx: Record<string, unknown>,
  ): void {
    const entry: McpLogEntry = {
      ts: new Date().toISOString(),
      level,
      sessionId: this.sessionId,
      corrId: this.corrId,
      component: this.component,
      msg,
      ...ctx,
    };
    const line = `${JSON.stringify(entry)}\n`;
    process.stderr.write(line);
    const logFile = process.env.OK_LOG_FILE;
    if (logFile) {
      try {
        appendFileSync(logFile, line);
      } catch {
        // best-effort
      }
    }
  }
}

/** Convenience factory. */
export function createMcpLogger(component = 'mcp'): McpLogger {
  return new McpLogger(component);
}
