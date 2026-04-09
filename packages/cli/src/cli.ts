#!/usr/bin/env node

// Propagate --no-color/--color argv flags to env vars for libraries in the
// dependency tree that check NO_COLOR/FORCE_COLOR. picocolors itself checks
// argv directly at module evaluation time, but other libraries may only
// read env vars. --no-color always wins when both flags are present,
// matching picocolors' own precedence and no-color.org convention.
if (process.argv.includes('--no-color')) {
  process.env.NO_COLOR = '1';
  delete process.env.FORCE_COLOR;
} else if (process.argv.includes('--color')) {
  process.env.FORCE_COLOR = '1';
  delete process.env.NO_COLOR;
}

/**
 * CLI entry point for @inkeep/open-knowledge.
 *
 * Commander.js v14 with `start` as the default command.
 * Config loaded via preAction hook: CLI > ENV > workspace > user > Zod defaults.
 */
import { Command } from 'commander';
import { mcpCommand } from './commands/mcp.ts';
import { startCommand } from './commands/start.ts';
import { type Config, loadConfig } from './index.ts';

const program = new Command();

// Shared state populated by preAction hook
let resolvedConfig: Config;

program
  .name('open-knowledge')
  .description('Local-first knowledge base with CRDT collaboration')
  .version('0.0.1')
  .option('--cwd <path>', 'Working directory')
  .option('--log-level <level>', 'Log level', 'info')
  .option('--no-color', 'Disable color output')
  .option('--color', 'Force color output')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts();
    const cwd = opts.cwd as string | undefined;
    const { config } = loadConfig(cwd);

    // CLI flags override config
    const startOpts =
      thisCommand.args.length === 0 ? opts : (thisCommand.commands[0]?.opts() ?? {});
    if (startOpts.port !== undefined) {
      config.server.port = Number(startOpts.port);
    }
    if (startOpts.host !== undefined) {
      config.server.host = startOpts.host as string;
    }

    // ENV overrides
    if (process.env.PORT) {
      config.server.port = Number(process.env.PORT);
    }
    if (process.env.HOST) {
      config.server.host = process.env.HOST;
    }

    resolvedConfig = config;
  });

// Start command (default)
const start = startCommand(() => resolvedConfig);
program.addCommand(start, { isDefault: true });

// MCP command
const mcp = mcpCommand(() => resolvedConfig);
program.addCommand(mcp);

await program.parseAsync();
