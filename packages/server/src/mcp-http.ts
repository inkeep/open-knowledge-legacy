import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { relative } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Config } from './config/schema.ts';
import { MCP_SERVER_NAME } from './constants.ts';
import type { AgentIdentity } from './mcp/agent-identity.ts';
import { registerAllTools } from './mcp/tools/index.ts';
import { RUNTIME_VERSION } from './version-constants.ts';

const DEFAULT_INCLUDE = ['**/*.md', '**/*.mdx'];

interface McpHttpSession {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
}

export interface McpHttpHandlerOptions {
  contentDir: string;
  projectDir?: string;
  contentRoot?: string;
  includePatterns?: string[];
  excludePatterns?: string[];
  /** Returns the base URL of this running HTTP server, without the `/mcp` suffix. */
  getServerUrl: () => string;
  log?: {
    info?: (obj: object, msg: string) => void;
    warn?: (obj: object, msg: string) => void;
    error?: (obj: object, msg: string) => void;
  };
}

export interface McpHttpHandler {
  handle: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
  close: () => Promise<void>;
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function contentDirForConfig(opts: McpHttpHandlerOptions): string {
  if (opts.contentRoot) return opts.contentRoot;
  const projectDir = opts.projectDir ?? opts.contentDir;
  const rel = relative(projectDir, opts.contentDir);
  if (!rel || rel === '') return '.';
  return rel.startsWith('..') ? opts.contentDir : rel;
}

function buildMcpConfig(opts: McpHttpHandlerOptions): Config {
  return {
    content: {
      dir: contentDirForConfig(opts),
      include: opts.includePatterns ?? DEFAULT_INCLUDE,
      exclude: opts.excludePatterns ?? [],
    },
    github: {
      oauthAppClientId: 'Ov23liqlSd0V1MwR6rhI',
    },
    sync: {
      pushIntervalSeconds: 60,
      pullIntervalSeconds: 30,
      autoCommit: true,
      autoPush: true,
      autoPull: true,
      commitMessage: 'auto',
    },
    server: {
      port: 0,
      host: 'localhost',
      openOnAgentEdit: false,
    },
    persistence: {
      debounceMs: 2000,
      maxDebounceMs: 10000,
    },
    preview: {},
    folders: [],
    mcp: {
      autoStart: true,
      tools: {
        read_document: { historyDepth: 5 },
        search: { maxResults: 50 },
      },
    },
  };
}

function buildInstructions(config: Config): string {
  const includeLine = config.content.include.map((p) => `\`${p}\``).join(', ');
  const excludeLine =
    config.content.exclude.length > 0
      ? config.content.exclude.map((p) => `\`${p}\``).join(', ')
      : '(none)';
  return `# Open Knowledge (OK) — collaborative markdown via MCP

**STOP — native tools on in-scope \`.md\` / \`.mdx\`.** Do NOT use host-native \`Read\`, \`Grep\`, \`Glob\`, \`Edit\`, \`Write\` on markdown inside the content dir. Reads: \`exec\` / \`read_document\` / \`search\`. Writes: \`write_document\` / \`edit_document\` ONLY.

Content dir: ${config.content.dir}. Include: ${includeLine}. Exclude: ${excludeLine}.

This MCP endpoint is served by the running \`ok start\` process. The stdio \`ok mcp\` command is only a transport shim to this HTTP endpoint.
`;
}

function writePlain(res: ServerResponse, statusCode: number, message: string): void {
  if (res.writableEnded) return;
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end(message);
}

function createSessionServer(
  opts: McpHttpHandlerOptions,
  transport: StreamableHTTPServerTransport,
): McpHttpSession {
  const config = buildMcpConfig(opts);
  const server = new McpServer(
    {
      name: MCP_SERVER_NAME,
      version: RUNTIME_VERSION,
    },
    {
      instructions: buildInstructions(config),
    },
  );

  const connectionId = randomUUID();
  const label = process.env.AGENT_LABEL || undefined;
  const identityRef: { current: AgentIdentity } = {
    current: {
      connectionId,
      label,
      displayName: label ?? 'Agent',
      colorSeed: label ?? connectionId,
    },
  };

  server.server.oninitialized = () => {
    const clientInfo = server.server.getClientVersion();
    identityRef.current = {
      connectionId,
      clientInfo: clientInfo ? { name: clientInfo.name, version: clientInfo.version } : undefined,
      label,
      displayName: label ?? clientInfo?.name ?? 'Agent',
      colorSeed: label ?? clientInfo?.name ?? connectionId,
    };
  };

  registerAllTools(server, {
    serverUrl: async () => opts.getServerUrl(),
    resolveCwd: async (explicit?: string) => explicit ?? opts.projectDir ?? opts.contentDir,
    config,
    identityRef,
  });

  return { server, transport };
}

/**
 * Create a stateful Streamable HTTP MCP endpoint handler for `POST/GET/DELETE /mcp`.
 *
 * The MCP implementation lives in the running project server. A stdio `ok mcp`
 * process should only proxy JSON-RPC frames to this endpoint; it should not
 * register tools itself.
 */
export function createMcpHttpHandler(opts: McpHttpHandlerOptions): McpHttpHandler {
  const sessions = new Map<string, McpHttpSession>();

  return {
    async handle(req, res): Promise<void> {
      const sessionId = firstHeader(req.headers['mcp-session-id']);
      if (sessionId) {
        const session = sessions.get(sessionId);
        if (!session) {
          writePlain(res, 404, 'MCP session not found');
          return;
        }
        await session.transport.handleRequest(req, res);
        return;
      }

      if (req.method !== 'POST') {
        writePlain(res, 400, 'Missing MCP session. Initialize with POST /mcp first.');
        return;
      }

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        enableJsonResponse: true,
        onsessioninitialized: async (newSessionId) => {
          const session = createSessionServer(opts, transport);
          sessions.set(newSessionId, session);
          await session.server.connect(transport);
          opts.log?.info?.({ sessionId: newSessionId }, 'MCP HTTP session initialized');
        },
      });

      transport.onerror = (err) => {
        opts.log?.warn?.({ err }, 'MCP HTTP transport error');
      };
      transport.onclose = () => {
        const id = transport.sessionId;
        if (id) sessions.delete(id);
        opts.log?.info?.({ sessionId: id }, 'MCP HTTP session closed');
      };

      await transport.handleRequest(req, res);
    },

    async close(): Promise<void> {
      const active = [...sessions.values()];
      sessions.clear();
      await Promise.allSettled(
        active.map(async (session) => {
          await session.server.close();
        }),
      );
    },
  };
}
