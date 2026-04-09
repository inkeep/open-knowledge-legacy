/**
 * `open-knowledge init` — one-shot terminal setup command.
 *
 * Does two things:
 *   1. Scaffolds `.open-knowledge/` in the current directory via initWiki()
 *      (same logic the MCP server's init flow used to call — now factored out).
 *   2. Writes an MCP server entry for `openknowledge` into `./.mcp.json`,
 *      preserving any existing entries. Idempotent: skips if an `openknowledge`
 *      entry is already present, unless `--force` is passed.
 *
 * Why this is a CLI subcommand instead of an MCP tool:
 * - Scaffolding has to happen *before* any MCP server is running, otherwise
 *   first-time users hit a chicken-and-egg problem: they'd need MCP wired up
 *   to call the scaffolding tool, but the tool is what wires MCP up.
 * - It's a one-shot setup action, not a runtime operation. Belongs in the CLI.
 * - Client-agnostic: works whether the user is on Claude Code, Cursor, or any
 *   other MCP-compatible editor. The output (`.mcp.json`) is the standard
 *   project-scoped MCP config that every major client reads.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { Command } from 'commander';
import { initWiki } from '../wiki/init.ts';

const MCP_SERVER_NAME = 'openknowledge';
const MCP_SERVER_COMMAND = 'npx';
const MCP_SERVER_ARGS = ['@inkeep/open-knowledge', 'mcp'];

interface McpServerEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

interface McpConfigShape {
  mcpServers?: Record<string, McpServerEntry>;
  [key: string]: unknown;
}

export interface InitCommandOptions {
  cwd?: string;
  skipMcp?: boolean;
  force?: boolean;
}

export interface InitCommandResult {
  wikiCreated: string[];
  wikiSkipped: string[];
  mcpAction: 'written' | 'skipped-existing' | 'overwritten' | 'skipped-flag' | 'failed';
  mcpPath: string;
  mcpError?: string;
}

/**
 * Read an existing .mcp.json file (if any) and return its parsed shape.
 * Returns an empty shape if the file doesn't exist or is unreadable.
 * Throws if the file exists but contains invalid JSON — that's a real error
 * the user should see, not something to silently paper over.
 */
function readMcpConfig(path: string): McpConfigShape {
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, 'utf-8');
  const trimmed = raw.trim();
  if (trimmed === '') return {};
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as McpConfigShape;
    }
    throw new Error('.mcp.json root must be a JSON object');
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error(`.mcp.json exists but contains invalid JSON: ${err.message}`);
    }
    throw err;
  }
}

/**
 * Write the MCP config to disk as pretty-printed JSON with a trailing newline.
 * Creates the parent directory if missing (rare — .mcp.json usually lives at
 * the repo root).
 */
function writeMcpConfig(path: string, config: McpConfigShape): void {
  mkdirSync(dirname(path), { recursive: true });
  const serialized = `${JSON.stringify(config, null, 2)}\n`;
  writeFileSync(path, serialized, 'utf-8');
}

/**
 * Core logic: scaffold wiki + wire MCP config. Exported for testing so the
 * Commander wrapper stays a thin shell around this function.
 */
export function runInit(options: InitCommandOptions = {}): InitCommandResult {
  const cwd = resolve(options.cwd ?? process.cwd());
  const mcpPath = join(cwd, '.mcp.json');

  // 1. Scaffold .open-knowledge/
  const wikiResult = initWiki(cwd);

  // 2. Wire MCP config (unless --skip-mcp)
  if (options.skipMcp) {
    return {
      wikiCreated: wikiResult.created,
      wikiSkipped: wikiResult.skipped,
      mcpAction: 'skipped-flag',
      mcpPath,
    };
  }

  let config: McpConfigShape;
  try {
    config = readMcpConfig(mcpPath);
  } catch (err) {
    return {
      wikiCreated: wikiResult.created,
      wikiSkipped: wikiResult.skipped,
      mcpAction: 'failed',
      mcpPath,
      mcpError: err instanceof Error ? err.message : String(err),
    };
  }

  const servers = config.mcpServers ?? {};
  const existing = servers[MCP_SERVER_NAME];

  if (existing && !options.force) {
    return {
      wikiCreated: wikiResult.created,
      wikiSkipped: wikiResult.skipped,
      mcpAction: 'skipped-existing',
      mcpPath,
    };
  }

  const newEntry: McpServerEntry = {
    command: MCP_SERVER_COMMAND,
    args: MCP_SERVER_ARGS,
  };

  const nextConfig: McpConfigShape = {
    ...config,
    mcpServers: {
      ...servers,
      [MCP_SERVER_NAME]: newEntry,
    },
  };

  try {
    writeMcpConfig(mcpPath, nextConfig);
  } catch (err) {
    return {
      wikiCreated: wikiResult.created,
      wikiSkipped: wikiResult.skipped,
      mcpAction: 'failed',
      mcpPath,
      mcpError: err instanceof Error ? err.message : String(err),
    };
  }

  return {
    wikiCreated: wikiResult.created,
    wikiSkipped: wikiResult.skipped,
    mcpAction: existing ? 'overwritten' : 'written',
    mcpPath,
  };
}

/**
 * Format a user-facing summary of an init run. Kept separate from the
 * Commander action so the logic is unit-testable and the shell of the action
 * stays trivial.
 */
export function formatInitResult(result: InitCommandResult, cwd: string): string {
  const lines: string[] = [];

  // Wiki scaffolding summary
  const okDir = join(cwd, '.open-knowledge');
  if (result.wikiCreated.length > 0) {
    lines.push(`Wiki scaffolded at ${okDir}/`);
    lines.push(`  Created: ${result.wikiCreated.join(', ')}`);
  } else {
    lines.push(`Wiki already present at ${okDir}/`);
  }
  if (result.wikiSkipped.length > 0) {
    lines.push(`  Skipped (already exist): ${result.wikiSkipped.join(', ')}`);
  }

  lines.push('');

  // MCP config summary
  switch (result.mcpAction) {
    case 'written':
      lines.push(`MCP server registered in ${result.mcpPath}`);
      lines.push(`  openknowledge → ${MCP_SERVER_COMMAND} ${MCP_SERVER_ARGS.join(' ')}`);
      break;
    case 'overwritten':
      lines.push(`MCP server entry overwritten in ${result.mcpPath} (--force)`);
      lines.push(`  openknowledge → ${MCP_SERVER_COMMAND} ${MCP_SERVER_ARGS.join(' ')}`);
      break;
    case 'skipped-existing':
      lines.push(`MCP server already configured in ${result.mcpPath} — skipped`);
      lines.push('  (use --force to overwrite)');
      break;
    case 'skipped-flag':
      lines.push('MCP config write skipped (--skip-mcp)');
      break;
    case 'failed':
      lines.push(`Warning: MCP config write failed — ${result.mcpError}`);
      lines.push('');
      lines.push('Add this to .mcp.json manually:');
      lines.push('{');
      lines.push('  "mcpServers": {');
      lines.push(`    "${MCP_SERVER_NAME}": {`);
      lines.push(`      "command": "${MCP_SERVER_COMMAND}",`);
      lines.push(`      "args": ${JSON.stringify(MCP_SERVER_ARGS)}`);
      lines.push('    }');
      lines.push('  }');
      lines.push('}');
      break;
  }

  lines.push('');
  lines.push('Next steps:');
  lines.push('  1. Open your editor with Claude Code / Cursor / Windsurf');
  lines.push('  2. Approve the MCP server when prompted');
  lines.push('  3. The wiki is ready — use the three workflow prompts:');
  lines.push('     - mcp__openknowledge__init-wiki  — bootstrap articles from the codebase');
  lines.push('     - mcp__openknowledge__ingest     — capture an external source');
  lines.push('     - mcp__openknowledge__research   — gather sources and write findings');

  return lines.join('\n');
}

export function initCommand(): Command {
  return new Command('init')
    .description(
      'Scaffold .open-knowledge/ in the current directory and register the MCP server in .mcp.json',
    )
    .option('--skip-mcp', 'Scaffold the wiki directory but do not touch .mcp.json')
    .option('--force', 'Overwrite an existing openknowledge MCP entry (default: skip)')
    .action((opts: { skipMcp?: boolean; force?: boolean }) => {
      const cwd = process.cwd();
      const result = runInit({
        cwd,
        skipMcp: opts.skipMcp,
        force: opts.force,
      });
      process.stdout.write(`${formatInitResult(result, cwd)}\n`);
      if (result.mcpAction === 'failed') {
        process.exitCode = 1;
      }
    });
}
