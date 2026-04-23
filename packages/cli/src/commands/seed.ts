/**
 * `ok seed` — scaffold the Karpathy three-layer knowledge-base structure.
 *
 * Creates `external-sources/`, `research/`, `articles/`, an optional
 * `log.md`, and populates `config.yml` `folders:` entries with per-folder
 * descriptions that surface as agent guidance via `exec("ls <folder>")`.
 *
 * Replaces the former `init-content` MCP tool with a deterministic CLI.
 * See `specs/2026-04-23-ok-seed-scaffold/SPEC.md`.
 */

import { relative, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import {
  applySeed,
  planSeed,
  type ScaffoldPlan,
  SeedPrerequisiteError,
} from '@inkeep/open-knowledge-server';
import { Command } from 'commander';
import { accent, dim, error as errorColor, info, success, warning } from '../ui/colors.ts';

export interface SeedCommandOptions {
  cwd?: string;
  /** Skip the Y/n confirmation prompt. */
  yes?: boolean;
  /** Print the plan and exit without writing. */
  dryRun?: boolean;
  /** Test-only: override stdin for confirmation. */
  confirmStream?: NodeJS.ReadableStream;
}

export interface SeedCommandResult {
  /** 'applied' (writes happened) | 'dry-run' | 'no-op' (already seeded) | 'cancelled' | 'prerequisite-missing' | 'failed' */
  status: 'applied' | 'dry-run' | 'no-op' | 'cancelled' | 'prerequisite-missing' | 'failed';
  message: string;
  plan?: ScaffoldPlan;
  /** Non-zero on prerequisite-missing or failed. */
  exitCode: number;
}

/**
 * Programmatic entry point. Thin wrapper around planSeed + applySeed that
 * owns confirmation prompting and output formatting. Called by both the
 * Commander action and integration tests.
 */
export async function runSeed(opts: SeedCommandOptions = {}): Promise<SeedCommandResult> {
  const cwd = resolve(opts.cwd ?? process.cwd());

  let plan: ScaffoldPlan;
  try {
    plan = await planSeed({ projectDir: cwd });
  } catch (err) {
    if (err instanceof SeedPrerequisiteError) {
      return {
        status: 'prerequisite-missing',
        message: `${errorColor('Error:')} ${err.message}`,
        exitCode: 1,
      };
    }
    return {
      status: 'failed',
      message: `${errorColor('Error:')} ${err instanceof Error ? err.message : String(err)}`,
      exitCode: 1,
    };
  }

  if (plan.created.length === 0 && plan.configEdits.length === 0) {
    return {
      status: 'no-op',
      message: `${success('Your knowledge base is already seeded.')}\n${dim('Nothing to do.')}`,
      plan,
      exitCode: 0,
    };
  }

  if (opts.dryRun) {
    return {
      status: 'dry-run',
      message: `${accent('Plan (dry-run — no changes made):')}\n\n${formatPlanBody(plan, cwd)}`,
      plan,
      exitCode: 0,
    };
  }

  if (!opts.yes) {
    const confirmed = await confirm(
      `${accent('Plan:')}\n\n${formatPlanBody(plan, cwd)}\n\n${accent('Apply?')} ${dim('[Y/n] ')}`,
      opts.confirmStream,
    );
    if (!confirmed) {
      return {
        status: 'cancelled',
        message: dim('Cancelled.'),
        plan,
        exitCode: 0,
      };
    }
  }

  const applyResult = await applySeed(plan, { projectDir: cwd });

  if (applyResult.errors.length > 0) {
    const errorLines = applyResult.errors.map((e) => `  ${errorColor('✗')} ${e.path}: ${e.error}`);
    return {
      status: 'failed',
      message: [
        `${warning('Applied')} ${applyResult.applied} entries, ${warning(String(applyResult.errors.length))} error(s):`,
        ...errorLines,
      ].join('\n'),
      plan,
      exitCode: 1,
    };
  }

  return {
    status: 'applied',
    message: `${success(`✓ Seeded knowledge base`)} ${dim(`(${applyResult.applied} entries, ${applyResult.durationMs}ms)`)}`,
    plan,
    exitCode: 0,
  };
}

/** Format a ScaffoldPlan as a plain colored list for CLI output. */
function formatPlanBody(plan: ScaffoldPlan, cwd: string): string {
  const lines: string[] = [];

  const folders = plan.created.filter((e) => e.kind === 'folder');
  const files = plan.created.filter((e) => e.kind === 'file');

  if (folders.length > 0) {
    lines.push(accent('Folders to create:'));
    for (const f of folders) {
      lines.push(
        `  ${success('+')} ${info(relative(cwd, resolve(cwd, f.path)) || f.path)}${dim('/')}`,
      );
    }
  }

  if (files.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push(accent('Files to create:'));
    for (const f of files) {
      lines.push(`  ${success('+')} ${info(relative(cwd, resolve(cwd, f.path)) || f.path)}`);
    }
  }

  if (plan.configEdits.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push(accent('config.yml folders: entries to add:'));
    for (const edit of plan.configEdits) {
      lines.push(
        `  ${success('+')} ${info(edit.folderMatch)} ${dim('—')} ${edit.entry.frontmatter.title ?? ''}`,
      );
    }
  }

  if (plan.skipped.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push(dim('Already present (skipped):'));
    for (const s of plan.skipped) {
      lines.push(`  ${dim(`· ${s.path} (${s.reason})`)}`);
    }
  }

  if (plan.warnings.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push(warning('Warnings:'));
    for (const w of plan.warnings) {
      lines.push(`  ${warning('!')} ${w}`);
    }
  }

  return lines.join('\n');
}

async function confirm(prompt: string, input?: NodeJS.ReadableStream): Promise<boolean> {
  const rl = createInterface({ input: input ?? process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(prompt)).trim().toLowerCase();
    // Default Y on empty input
    return answer === '' || answer === 'y' || answer === 'yes';
  } finally {
    rl.close();
  }
}

/** Commander subcommand factory. Registered in cli.ts alongside init/start/mcp. */
export function seedCommand(): Command {
  return new Command('seed')
    .description(
      'Scaffold the Karpathy three-layer knowledge-base structure (external-sources/, research/, articles/) + log.md + config.yml folders: entries',
    )
    .argument('[path]', 'Project directory (defaults to cwd)')
    .option('-y, --yes', 'Skip confirmation prompt')
    .option('--dry-run', 'Print the plan and exit without writing')
    .action(async (pathArg: string | undefined, opts: { yes?: boolean; dryRun?: boolean }) => {
      const result = await runSeed({
        cwd: pathArg ?? process.cwd(),
        yes: opts.yes,
        dryRun: opts.dryRun,
      });
      process.stdout.write(`${result.message}\n`);
      if (result.exitCode !== 0) {
        process.exitCode = result.exitCode;
      }
    });
}
