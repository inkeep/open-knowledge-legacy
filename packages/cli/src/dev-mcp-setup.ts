/**
 * dev-mcp-setup.ts — rewrites MCP configs so editors talk to a local dev server.
 *
 * Invoked by the root `dev:mcp` script (which is run by `bun dev` before
 * `packages/app`'s Vite server starts). For each editor we touch — global
 * Cursor (`~/.cursor/mcp.json`), project-local Cursor (`.cursor/mcp.json`),
 * and Claude Code (`.mcp.json`) — we replace the `open-knowledge` entry with:
 *
 *   1. `command`: the resolved `bun` binary (portable across machines)
 *   2. `args[0]`: this checkout's `packages/cli/src/cli.ts` (not the published package)
 *   3. Vite dev port (default 5173)
 *
 * Only the `open-knowledge` entry is overwritten; other `mcpServers` entries
 * are preserved. Safe to re-run.
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isObject } from './utils/is-object.ts';

/**
 * Robust project root detection that works regardless of how the script is invoked.
 * Handles:
 * - Direct execution from packages/cli/src/
 * - Execution via bun run from workspace root
 * - Nested worktrees
 */
function getProjectRoot(): string {
  const scriptPath = fileURLToPath(import.meta.url);
  const scriptDir = dirname(scriptPath);

  // Strategy 1: If we're in the packages/cli/src directory structure
  if (scriptDir.includes('packages/cli')) {
    // From packages/cli/src/ -> packages/cli/ (../) -> workspace root (../../)
    return resolve(scriptDir, '../../..');
  }

  // Strategy 2: Walk up from CWD looking for workspace root (has "workspaces" field)
  let current = process.cwd();
  while (current !== '/') {
    const pkgPath = resolve(current, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        // The workspace root has name "open-knowledge" AND a workspaces field
        if (pkg.name === 'open-knowledge' && Array.isArray(pkg.workspaces)) {
          return current;
        }
      } catch {
        // continue walking
      }
    }
    const parent = resolve(current, '..');
    if (parent === current) break;
    current = parent;
  }

  // Final fallback: assume we're in the workspace root or one level down
  return resolve(scriptDir, '../../..');
}

const PROJECT_ROOT = getProjectRoot();

function getBunPath(): string {
  // Resolve the absolute `bun` path so the MCP config works from any cwd the
  // editor spawns us in. `where` on Windows, `which` everywhere else; the
  // try/catch keeps the bare `'bun'` fallback if the probe fails.
  try {
    const cmd = process.platform === 'win32' ? 'where bun' : 'which bun';
    const resolved = execSync(cmd, { encoding: 'utf8' }).trim();
    // `where` on Windows may return multiple newline-separated lines.
    const first = resolved.split(/\r?\n/)[0]?.trim();
    if (first) return first;
  } catch {
    // Fall through to default
  }
  return 'bun';
}

interface McpConfig {
  mcpServers?: Record<
    string,
    {
      command: string;
      args: string[];
    }
  >;
  [key: string]: unknown;
}

function readMcpConfig(path: string): McpConfig {
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, 'utf-8');
  const trimmed = raw.trim();
  if (trimmed === '') return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    // Refuse to touch a file we can't parse — silently overwriting would
    // destroy the user's other MCP server entries. Matches init.ts behavior.
    const msg = err instanceof Error ? err.message : 'invalid JSON';
    throw new Error(`${path} contains invalid JSON: ${msg}`);
  }
  if (!isObject(parsed)) {
    throw new Error(`${path} root must be a JSON object`);
  }
  return parsed as McpConfig;
}

function writeMcpConfig(path: string, config: McpConfig): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
}

function updateMcpConfigAtPath(
  configPath: string,
  bunPath: string,
  cliPath: string,
  port: number,
  label: string,
): void {
  let config = readMcpConfig(configPath);

  const devEntry = {
    command: bunPath,
    args: [cliPath, 'mcp', '--port', port.toString()],
  };

  config = {
    ...config,
    mcpServers: {
      ...(config.mcpServers as Record<string, unknown> | undefined),
      'open-knowledge': devEntry,
    },
  };

  writeMcpConfig(configPath, config);
  console.log(`✅ Updated ${label} MCP config`);
}

interface SetupDevMcpOptions {
  port?: number;
  cwd?: string;
  home?: string;
}

/**
 * Set up MCP configuration for all supported editors to point at the local dev server.
 * Updates:
 * - ~/.cursor/mcp.json (global Cursor config)
 * - .cursor/mcp.json (project-local Cursor config)
 * - .mcp.json (Claude Code config)
 */
export function setupDevMcp(options: SetupDevMcpOptions = {}): void {
  const port = options.port ?? 5173;
  const cwd = options.cwd ?? process.cwd();
  // `'~'` is a shell construct — Node's fs APIs do not expand it, so we must
  // resolve the real home directory. Fall back to os.homedir() when $HOME
  // isn't set (e.g. sandboxed CI, some container runtimes).
  const home = options.home ?? process.env.HOME ?? homedir();

  const bunPath = getBunPath();
  const cliPath = resolve(PROJECT_ROOT, 'packages/cli/src/cli.ts');

  console.log(`🔧 Setting up MCP configs for dev server on port ${port}...`);
  console.log(`   bun: ${bunPath}`);
  console.log(`   cli: ${cliPath}`);

  // Global Cursor config (~/.cursor/mcp.json)
  const globalCursorPath = join(home, '.cursor', 'mcp.json');
  updateMcpConfigAtPath(globalCursorPath, bunPath, cliPath, port, 'global Cursor');

  // Project-local Cursor config (.cursor/mcp.json)
  const localCursorPath = join(cwd, '.cursor', 'mcp.json');
  updateMcpConfigAtPath(localCursorPath, bunPath, cliPath, port, 'project-local Cursor');

  // Claude Code config (.mcp.json)
  const claudeMcpPath = join(cwd, '.mcp.json');
  updateMcpConfigAtPath(claudeMcpPath, bunPath, cliPath, port, 'Claude Code');

  console.log(`\n✅ MCP tools configured to use local development server on port ${port}`);
  console.log(`💡 Run \`open-knowledge mcp\` in your editor to connect`);
}

export { getBunPath, getProjectRoot };
export default setupDevMcp;

// Direct-execution entrypoint: `bun packages/cli/src/dev-mcp-setup.ts [port]`
// The root `dev:mcp` script in package.json invokes this shape.
if (import.meta.main) {
  const portArg = process.argv[2];
  let port = 5173;
  if (portArg !== undefined) {
    const parsed = Number(portArg);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
      console.error(`Invalid port: ${portArg} (must be an integer 1..65535)`);
      process.exit(1);
    }
    port = parsed;
  }
  setupDevMcp({ port });
}
