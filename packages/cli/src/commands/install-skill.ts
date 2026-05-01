/**
 * `ok install-skill` — build + open Claude Desktop to install the Open
 * Knowledge Agent Skill for Claude Chat & Cowork.
 *
 * Flow:
 *   1. Build `openknowledge.skill` from the bundled SKILL.md source.
 *   2. Write to ~/Downloads/openknowledge.skill (or `--out <path>`).
 *   3. Invoke the OS file association (`open` / `start` / `xdg-open`) —
 *      this opens the Claude Desktop App but does NOT auto-install.
 *   4. User completes the manual upload inside the Claude Desktop App:
 *      Customize → Skills → + → Create skill → Upload skill → pick file.
 *
 * Why this exists: `ok init` installs the skill into Claude Code via
 * `npx skills add`, but that flow doesn't reach Claude Chat or Cowork
 * modes (they read from a separate, isolated Skills list inside the
 * Claude Desktop App).
 *
 * Single source of truth: the underlying `buildAndOpenSkill` lives in
 * `@inkeep/open-knowledge-server` (alongside `buildSkillZip` and
 * `installUserSkill`). This command, the `POST /api/install-skill`
 * endpoint, and the Electron main-process skill bridge all delegate to
 * the same primitive — no parallel implementations.
 */

import {
  type BuildAndOpenSkillResult,
  buildAndOpenSkill,
  type SpawnLike,
} from '@inkeep/open-knowledge-server';
import { Command } from 'commander';
import { accent, dim, error as errorColor, info, success, warning } from '../ui/colors.ts';

interface InstallSkillCommandOptions {
  /** Output file path. Defaults to ~/Downloads/openknowledge.skill. */
  out?: string;
  /** Skip the OS file-association invocation. Just emit the file. */
  noOpen?: boolean;
  /** Test seam — override the spawn function so we can assert spawn args. */
  spawnFn?: SpawnLike;
  /** Test seam — override the platform tag. */
  platformName?: NodeJS.Platform;
}

/**
 * CLI return shape — augments the shared `BuildAndOpenSkillResult` with the
 * colored, terminal-ready `message` and `exitCode` the Commander action prints.
 */
interface InstallSkillCliResult extends BuildAndOpenSkillResult {
  message: string;
  exitCode: number;
}

const UPLOAD_STEPS = [
  `    1. ${accent('Customize')} (sidebar) → ${accent('Skills')}`,
  `    2. Click the ${accent('+')} button`,
  `    3. Click ${accent('Create skill')}`,
  `    4. Click ${accent('Upload skill')}`,
  `    5. Pick ${accent('openknowledge.skill')} from Downloads`,
];

const MANUAL_UPLOAD_HINT = info(
  `  Open the Claude Desktop App, then: ${accent('Customize → Skills → + → Create skill → Upload skill')} → pick the file.`,
);

function formatBuiltMessage(result: BuildAndOpenSkillResult): string {
  const lines = [
    success(`Built ${result.outputPath}`),
    dim(`  ${result.size} bytes  •  sha256 ${result.sha256?.slice(0, 12)}…`),
  ];
  if (result.handoffError) {
    lines.push(warning(`  Handoff failed: ${result.handoffError.message}`));
  }
  lines.push(MANUAL_UPLOAD_HINT);
  return lines.join('\n');
}

function formatInstalledMessage(result: BuildAndOpenSkillResult): string {
  return [
    success(`Built ${result.outputPath}`),
    dim(
      `  ${result.size} bytes  •  sha256 ${result.sha256?.slice(0, 12)}…  •  CLI v${result.cliVersion}`,
    ),
    info('  Claude Desktop App opened. Now upload the file manually:'),
    ...UPLOAD_STEPS,
    dim(
      `  If Claude Desktop didn't open, open it and start at step 1. The file is at ${result.outputPath}`,
    ),
  ].join('\n');
}

function formatFailedMessage(result: BuildAndOpenSkillResult): string {
  return `${errorColor('Error:')} ${result.buildError ?? 'unknown build failure'}`;
}

/**
 * Programmatic entry point — same shape as `runSeed`: callable from the
 * Commander action or directly from tests. Delegates the actual build +
 * file-association work to the shared `buildAndOpenSkill` helper; this
 * function only owns the colored-output framing.
 */
export async function runInstallSkill(
  opts: InstallSkillCommandOptions = {},
): Promise<InstallSkillCliResult> {
  const result = await buildAndOpenSkill(opts);

  if (result.status === 'failed') {
    return { ...result, message: formatFailedMessage(result), exitCode: 1 };
  }
  if (result.status === 'installed') {
    return { ...result, message: formatInstalledMessage(result), exitCode: 0 };
  }
  // 'built' — either --no-open, unsupported platform, or soft handoff failure.
  return { ...result, message: formatBuiltMessage(result), exitCode: 0 };
}

/** Commander-style factory. Registered in `cli.ts`. */
export function installSkillCommand(): Command {
  return new Command('install-skill')
    .description(
      'Build openknowledge.skill and open the Claude Desktop App so you can upload it for Claude Chat & Cowork. Not needed for Claude Code — `ok init` covers that separately.',
    )
    .option('--out <path>', 'Custom output path (default: ~/Downloads/openknowledge.skill)')
    .option('--no-open', 'Build the file but skip the OS file-association handoff')
    .action(async (cliOpts: { out?: string; open: boolean }) => {
      const result = await runInstallSkill({
        out: cliOpts.out,
        // Commander's `--no-open` sets `cliOpts.open === false` when the flag is passed.
        noOpen: !cliOpts.open,
      });
      process.stdout.write(`${result.message}\n`);
      if (result.exitCode !== 0) process.exit(result.exitCode);
    });
}
