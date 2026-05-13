import { randomUUID } from 'node:crypto';
import { statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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
import { startKeepalive } from './keepalive.ts';
import { parseSpawnTimeoutEnv, resolveMcpHttpUrl, resolveMcpKeepaliveWsUrl } from './shim.ts';

interface StartGlobalMcpServerOptions {
  startupCwd: string;
  startupConfig: Config;
  spawnTimeoutMs?: number;
  envAutoStart?: string;
}

interface StartGlobalMcpServerHandle {
  close: () => Promise<void>;
}

interface KeepaliveHandle {
  close: () => void;
  isConnected: () => boolean;
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

export function rootUriToFsPath(uri: string): string | undefined {
  try {
    const parsed = new URL(uri);
    if (parsed.protocol !== 'file:') return undefined;
    return fileURLToPath(parsed);
  } catch {
    return undefined;
  }
}

export async function tryListRootsFallback(opts: {
  getClientCapabilities: () => { roots?: unknown } | undefined;
  listRoots: () => Promise<{ roots: { uri: string }[] }>;
  log?: (msg: string) => void;
}): Promise<string | undefined> {
  const caps = opts.getClientCapabilities();
  if (!caps?.roots) return undefined;
  let result: { roots: { uri: string }[] };
  try {
    result = await opts.listRoots();
  } catch (err) {
    opts.log?.(`listRoots fallback failed: ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
  }
  const roots = result.roots ?? [];
  if (roots.length !== 1) return undefined;
  const fsPath = rootUriToFsPath(roots[0].uri);
  if (fsPath === undefined) {
    opts.log?.(`single root URI not usable as fs path: ${roots[0].uri}`);
  }
  return fsPath;
}

export async function resolveCwdWithFallback(
  explicit: string | undefined,
  fallback: () => Promise<string | undefined>,
): Promise<string> {
  if (explicit !== undefined) return findProjectDir(explicit);
  const fromRoots = await fallback();
  if (fromRoots !== undefined) return findProjectDir(fromRoots);
  throw new Error(
    '`cwd` is required for tool calls against the global MCP server. Pass an absolute path inside an Open Knowledge project, or have the MCP client advertise a single root.',
  );
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

  const keepalivesByProject = new Map<string, KeepaliveHandle>();

  const ensureKeepaliveForProject = (projectDir: string): void => {
    if (keepalivesByProject.has(projectDir)) return;
    const lockDir = getLocalDir(projectDir);
    const id = identityRef.current;
    const handle = startKeepalive({
      connectionId,
      displayName: id.displayName,
      clientName: id.clientInfo?.name ?? id.displayName,
      colorSeed: id.colorSeed,
      resolveWsUrl: async () => resolveMcpKeepaliveWsUrl({ lockDir, contentDir: projectDir }, ''),
      log: (msg) => stderr.write(`[mcp] keepalive[${projectDir}]: ${msg}\n`),
    });
    keepalivesByProject.set(projectDir, handle);
  };

  const rootsFallback = (): Promise<string | undefined> =>
    tryListRootsFallback({
      getClientCapabilities: () => server.server.getClientCapabilities(),
      listRoots: () => server.server.listRoots() as Promise<{ roots: { uri: string }[] }>,
      log: (msg) => stderr.write(`[mcp] ${msg}\n`),
    });

  const resolveCwd = (explicit?: string): Promise<string> =>
    resolveCwdWithFallback(explicit, rootsFallback);

  const resolveServerUrlForCwd = async (cwd?: string): Promise<string | undefined> => {
    let projectDir: string;
    if (cwd === undefined) {
      const fromRoots = await rootsFallback();
      if (fromRoots === undefined) return undefined;
      projectDir = findProjectDir(fromRoots);
    } else {
      projectDir = findProjectDir(cwd);
    }
    const config = await resolveConfigForCwd(projectDir);
    const mcpUrl = await resolveMcpHttpUrl({
      lockDir: getLocalDir(projectDir),
      contentDir: resolveContentDir(config, projectDir),
      envAutoStart,
      ...(spawnTimeoutMs !== undefined ? { timeoutMs: spawnTimeoutMs } : {}),
    });
    ensureKeepaliveForProject(projectDir);
    return mcpUrl.replace(/\/mcp$/, '');
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
    for (const handle of keepalivesByProject.values()) {
      try {
        handle.close();
      } catch (err) {
        stderr.write(
          `[mcp] keepalive close error: ${err instanceof Error ? err.message : String(err)}\n`,
        );
      }
    }
    keepalivesByProject.clear();
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
