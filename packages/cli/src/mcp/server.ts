import { randomUUID } from 'node:crypto';
import { statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  type AgentIdentity,
  buildInstructions,
  type Config,
  getLocalDir,
  MCP_SERVER_NAME,
  RUNTIME_VERSION,
  registerAllTools,
  resolveContentDir,
  sanitizeClientName,
} from '@inkeep/open-knowledge-server';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createProjectConfigResolver } from '../config/loader.ts';
import { OK_DIR } from '../constants.ts';
import { parseSpawnTimeoutEnv, resolveMcpHttpUrl } from './shim.ts';

interface StartGlobalMcpServerOptions {
  startupCwd: string;
  startupConfig: Config;
  spawnTimeoutMs?: number;
  envAutoStart?: string;
}

interface StartGlobalMcpServerHandle {
  close: () => Promise<void>;
}

export function findProjectDir(startCwd: string): string {
  let dir = resolve(startCwd);
  while (true) {
    if (isOkMarkerDir(join(dir, OK_DIR))) return dir;
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(
        `No Open Knowledge project found at or above ${startCwd}. Pass an explicit \`cwd\` argument that points inside an OK project (a directory with a \`${OK_DIR}/\`).`,
      );
    }
    dir = parent;
  }
}

function isOkMarkerDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return false;
    throw err;
  }
}

export async function startGlobalMcpServer(
  opts: StartGlobalMcpServerOptions,
): Promise<StartGlobalMcpServerHandle> {
  const stderr = process.stderr;
  const spawnTimeoutMs =
    opts.spawnTimeoutMs ?? parseSpawnTimeoutEnv(process.env.OK_MCP_SPAWN_TIMEOUT_MS);
  const envAutoStart = opts.envAutoStart ?? process.env.OK_MCP_AUTOSTART;

  const resolveConfigForCwd = createProjectConfigResolver({
    startupCwd: opts.startupCwd,
    startupConfig: opts.startupConfig,
  });

  const resolveCwd = async (explicit?: string): Promise<string> => {
    if (explicit === undefined) {
      throw new Error(
        '`cwd` is required for tool calls against the global MCP server. Pass an absolute path inside an Open Knowledge project.',
      );
    }
    return findProjectDir(explicit);
  };

  const resolveServerUrlForCwd = async (cwd?: string): Promise<string | undefined> => {
    if (cwd === undefined) return undefined;
    const projectDir = findProjectDir(cwd);
    const config = await resolveConfigForCwd(projectDir);
    const mcpUrl = await resolveMcpHttpUrl({
      lockDir: getLocalDir(projectDir),
      contentDir: resolveContentDir(config, projectDir),
      envAutoStart,
      ...(spawnTimeoutMs !== undefined ? { timeoutMs: spawnTimeoutMs } : {}),
    });
    return mcpUrl.replace(/\/mcp$/, '');
  };

  const server = new McpServer(
    {
      name: MCP_SERVER_NAME,
      version: RUNTIME_VERSION,
    },
    {
      instructions: buildInstructions({ dir: '.' }),
    },
  );

  const connectionId = randomUUID();
  const identityRef: { current: AgentIdentity } = {
    current: {
      connectionId,
      displayName: connectionId,
      colorSeed: connectionId,
    },
  };

  server.server.oninitialized = () => {
    const clientInfo = server.server.getClientVersion();
    const name = sanitizeClientName(clientInfo?.name, connectionId);
    identityRef.current = {
      connectionId,
      clientInfo: clientInfo ? { name, version: clientInfo.version } : undefined,
      displayName: name,
      colorSeed: name,
    };
  };

  registerAllTools(server, {
    serverUrl: resolveServerUrlForCwd,
    resolveCwd,
    config: resolveConfigForCwd,
    identityRef,
  });

  const transport = new StdioServerTransport();
  let closed = false;

  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    const results = await Promise.allSettled([server.close(), transport.close()]);
    for (const result of results) {
      if (result.status === 'rejected') {
        const err = result.reason;
        stderr.write(
          `[mcp] shutdown close error: ${err instanceof Error ? err.message : String(err)}\n`,
        );
      }
    }
  };

  await server.connect(transport);
  stderr.write('[mcp] global stdio server ready (per-call project routing)\n');

  const shutdown = (): void => {
    void close().finally(() => {
      process.exit(0);
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  return { close };
}
