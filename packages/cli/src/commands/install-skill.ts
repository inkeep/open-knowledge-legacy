/**
 * `ok install-skill` — build + install the Open Knowledge Agent Skill into
 * Claude Desktop / Cowork via the `.skill` file association.
 *
 * Default flow (2-click install):
 *   1. Build `openknowledge.skill` from the bundled SKILL.md source.
 *   2. Write to ~/Downloads/openknowledge.skill (or `--out <path>`).
 *   3. Invoke the OS file association via `open` / `start` / `xdg-open` so
 *      Claude Desktop's native install dialog appears.
 *   4. User clicks Install in Claude's dialog. Done.
 *
 * Why this exists: `ok init` installs the skill into Claude Code via
 * `npx skills add`, but that flow doesn't reach Claude Desktop / Cowork
 * (their VM runs an isolated filesystem). Users who installed
 * `@inkeep/open-knowledge` via npm don't have the repo cloned, so
 * `bun run build:skill-zip` isn't available to them. This command packages
 * the build + handoff into a single invocation.
 *
 * Single source of truth: the `buildSkillZip` implementation lives in
 * `@inkeep/open-knowledge-server` and is also used by the CI release
 * workflow. The validation checks (wrapper folder at root, size ceiling,
 * frontmatter `name:` match) run once, in one place.
 *
 * See specs/2026-04-24-skill-dual-track-install/SPEC.md FR8 (the "Could"
 * requirement elevated to Ship 1f), D17 (shared build module), D21 (.skill
 * file association per CFBundleDocumentType).
 */

import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { type BuildSkillZipResult, buildSkillZip } from '@inkeep/open-knowledge-server';
import { Command } from 'commander';
import { accent, dim, error as errorColor, info, success, warning } from '../ui/colors.ts';

interface InstallSkillCommandOptions {
  /** Output file path. Defaults to ~/Downloads/openknowledge.skill. */
  out?: string;
  /** Skip the OS file-association invocation. Just emit the file. */
  noOpen?: boolean;
  /**
   * Test-only: override the spawn function so we can assert the spawn args
   * without actually launching Claude Desktop.
   */
  spawnFn?: typeof spawn;
  /**
   * Test-only: override the platform tag. Same pattern as `editors.ts` tests
   * where `platformName` is overridden via an options hook.
   */
  platformName?: NodeJS.Platform;
}

type InstallSkillStatus =
  | 'installed' // build + file-association invocation both succeeded
  | 'built' // --no-open or unsupported platform; file written, no handoff
  | 'failed';

interface InstallSkillResult {
  status: InstallSkillStatus;
  outputPath?: string;
  size?: number;
  sha256?: string;
  cliVersion?: string;
  skillVersion?: string;
  message: string;
  exitCode: number;
}

function defaultOutputPath(home: string = homedir()): string {
  return join(home, 'Downloads', 'openknowledge.skill');
}

/**
 * Invoke the OS file association for `.skill`. macOS: `open`. Windows:
 * `start` via cmd.exe. Linux: `xdg-open` (though no Claude Desktop build
 * exists for Linux, the command is wired for completeness).
 *
 * Deliberately uses `detached: true` + `unref()` so the CLI exits cleanly
 * while Claude Desktop launches in the background. Without `unref`, the
 * parent process would wait for Claude to close.
 *
 * Returns `{ ok: true }` on spawn success (NOT on install completion —
 * we have no way to observe that from this side of the OS boundary).
 */
function invokeFileAssociation(
  skillPath: string,
  platformName: NodeJS.Platform,
  spawnFn: typeof spawn,
): { ok: true } | { ok: false; reason: 'unsupported-platform' | 'spawn-error'; message: string } {
  try {
    if (platformName === 'darwin') {
      const child = spawnFn('open', [skillPath], { detached: true, stdio: 'ignore' });
      child.unref();
      return { ok: true };
    }
    if (platformName === 'win32') {
      // cmd /c start "" "<path>" — the empty quoted string is the window
      // title arg that `start` requires when the path itself is quoted.
      const child = spawnFn('cmd', ['/c', 'start', '""', skillPath], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      return { ok: true };
    }
    if (platformName === 'linux') {
      const child = spawnFn('xdg-open', [skillPath], { detached: true, stdio: 'ignore' });
      child.unref();
      return { ok: true };
    }
    return {
      ok: false,
      reason: 'unsupported-platform',
      message: `Platform '${platformName}' has no file-association invocation wired. Use --no-open and open the file manually.`,
    };
  } catch (err) {
    return {
      ok: false,
      reason: 'spawn-error',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Programmatic entry point — same shape as `runSeed`: callable from the
 * Commander action or directly from tests. Returns a result object with
 * the human-readable message already composed (including success/error
 * coloring) so the Commander action can just print + exit.
 */
export async function runInstallSkill(
  opts: InstallSkillCommandOptions = {},
): Promise<InstallSkillResult> {
  const outputPath = resolve(opts.out ?? defaultOutputPath());
  const platformName = opts.platformName ?? platform();
  const spawnFn = opts.spawnFn ?? spawn;

  // Ensure parent dir exists (e.g. ~/Downloads may be absent in test homes).
  try {
    await mkdir(dirname(outputPath), { recursive: true });
  } catch (err) {
    return {
      status: 'failed',
      message: `${errorColor('Error:')} could not create output directory: ${err instanceof Error ? err.message : String(err)}`,
      exitCode: 1,
    };
  }

  let build: BuildSkillZipResult;
  try {
    // skipVersionCheck: true during local installs — users on CLI versions
    // that predate Ship 1b's SKILL.md metadata.version would otherwise get
    // blocked here. CI never passes this flag (version alignment required
    // for releases).
    build = await buildSkillZip({ outputPath, skipVersionCheck: true });
  } catch (err) {
    return {
      status: 'failed',
      message: `${errorColor('Error:')} build failed — ${err instanceof Error ? err.message : String(err)}`,
      exitCode: 1,
    };
  }

  if (opts.noOpen) {
    return {
      status: 'built',
      outputPath: build.outputPath,
      size: build.size,
      sha256: build.sha256,
      cliVersion: build.cliVersion,
      skillVersion: build.skillVersion,
      message: [
        success(`Built ${build.outputPath}`),
        dim(`  ${build.size} bytes  •  sha256 ${build.sha256.slice(0, 12)}…`),
        info(`  Double-click the file to install, or right-click → Open With → Claude.`),
      ].join('\n'),
      exitCode: 0,
    };
  }

  const invocation = invokeFileAssociation(build.outputPath, platformName, spawnFn);
  if (!invocation.ok) {
    // Build succeeded but handoff failed. Tell the user what happened + how
    // to complete the install manually.
    return {
      status: 'built',
      outputPath: build.outputPath,
      size: build.size,
      sha256: build.sha256,
      cliVersion: build.cliVersion,
      skillVersion: build.skillVersion,
      message: [
        success(`Built ${build.outputPath}`),
        warning(`  Handoff failed: ${invocation.message}`),
        info(`  Double-click the file to install, or right-click → Open With → Claude.`),
      ].join('\n'),
      exitCode: 0, // build succeeded; don't return non-zero for a soft handoff failure
    };
  }

  return {
    status: 'installed',
    outputPath: build.outputPath,
    size: build.size,
    sha256: build.sha256,
    cliVersion: build.cliVersion,
    skillVersion: build.skillVersion,
    message: [
      success(`Built ${build.outputPath}`),
      dim(
        `  ${build.size} bytes  •  sha256 ${build.sha256.slice(0, 12)}…  •  CLI v${build.cliVersion}`,
      ),
      info(`  Handed off to Claude Desktop. Follow the prompts to complete install.`),
      dim(
        `  If Claude Desktop didn't open, the file association may be missing — double-click ${accent(build.outputPath)} manually.`,
      ),
    ].join('\n'),
    exitCode: 0,
  };
}

/** Commander-style factory. Registered in `cli.ts`. */
export function installSkillCommand(): Command {
  return new Command('install-skill')
    .description(
      'Build the Open Knowledge .skill artifact and install it into Claude Desktop / Cowork',
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
