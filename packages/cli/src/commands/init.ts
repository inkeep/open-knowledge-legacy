/**
 * `open-knowledge init` — one-shot terminal setup command.
 *
 * Does two things:
 *   1. Scaffolds `.open-knowledge/` in the current directory via initContent()
 *      (same logic the MCP server's init flow used to call — now factored out).
 *   2. Writes MCP server entries for `open-knowledge` into each selected
 *      editor's config file, preserving any existing entries. Idempotent: skips
 *      if an `open-knowledge` entry is already present, unless `--force`.
 *
 * Supports Claude Code, Cursor, VS Code, and Windsurf. When run interactively
 * (TTY) without `--editor`, prompts the user to select which editors to
 * configure. When `--editor` is passed or stdin is not a TTY, uses the flag
 * value directly (defaults to `claude`).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { Command } from 'commander';
import { MCP_SERVER_NAME, OK_DIR } from '../constants.ts';
import {
  initContent,
  type RootInstructionResult,
  upsertRootInstructions,
} from '../content/init.ts';
import { formatPreviewBlock, type PreviewResult } from '../content/preview.ts';
import { isObject } from '../utils/is-object.ts';
import {
  ALL_EDITOR_IDS,
  EDITOR_TARGETS,
  type EditorId,
  type EditorMcpTarget,
  resolveEditorTargets,
} from './editors.ts';

// ---------------------------------------------------------------------------
// Config I/O — generic across all editors
// ---------------------------------------------------------------------------

/**
 * Read an existing MCP config file (if any) and return its parsed shape.
 * Returns an empty object if the file doesn't exist or is empty.
 * Throws on invalid JSON or permission errors.
 */
function readMcpConfig(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, 'utf-8');
  const trimmed = raw.trim();
  if (trimmed === '') return {};
  try {
    const parsed = JSON.parse(trimmed);
    if (isObject(parsed)) {
      return parsed;
    }
    throw new Error(`${path} root must be a JSON object`);
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error(`${path} contains invalid JSON: ${err.message}`);
    }
    throw err;
  }
}

/**
 * Write the config to disk as pretty-printed JSON with a trailing newline.
 * Creates parent directories if missing.
 */
function writeMcpConfig(path: string, config: Record<string, unknown>): void {
  mkdirSync(dirname(path), { recursive: true });
  const serialized = `${JSON.stringify(config, null, 2)}\n`;
  writeFileSync(path, serialized, 'utf-8');
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EditorMcpResult {
  editorId: EditorId;
  label: string;
  action: 'written' | 'skipped-existing' | 'overwritten' | 'skipped-flag' | 'failed';
  configPath: string;
  error?: string;
}

export interface InitCommandOptions {
  cwd?: string;
  mcp?: boolean;
  force?: boolean;
  editors?: EditorId[];
  /** Append/replace the Open Knowledge section in root AGENTS.md (default: true). */
  rootInstructions?: boolean;
  /** Override home directory (test-only, for Windsurf global path). */
  home?: string;
}

export interface InitCommandResult {
  contentCreated: string[];
  contentSkipped: string[];
  /** Per-editor MCP config results. Empty when `--no-mcp`. */
  editors: EditorMcpResult[];
  /** Per-file root-instructions (AGENTS.md) results. Empty when `--no-root-instructions`. */
  rootInstructions: RootInstructionResult[];
  /** Content preview result (undefined if preview failed or was not run). */
  preview?: PreviewResult;
  /** Claude Code launch.json result (undefined when Claude is not a selected editor). */
  launchJson?: LaunchJsonResult;
  // Backward-compat fields (derived from the Claude entry or first editor):
  mcpAction: 'written' | 'skipped-existing' | 'overwritten' | 'skipped-flag' | 'failed';
  mcpPath: string;
  mcpError?: string;
  previewWarning?: string;
}

// ---------------------------------------------------------------------------
// Claude Code launch.json scaffolding
// ---------------------------------------------------------------------------

const LAUNCH_JSON_VERSION = '0.0.1';
const LAUNCH_CONFIG_NAME = 'open-knowledge';

export type LaunchJsonAction = 'created' | 'merged' | 'skipped-existing' | 'failed';

export interface LaunchJsonResult {
  action: LaunchJsonAction;
  configPath: string;
  error?: string;
}

/**
 * Scaffold or merge a `.claude/launch.json` entry so that Claude Code's
 * built-in preview browser can start the Open Knowledge dev server via
 * `preview_start("open-knowledge")`.
 *
 * D-020 / D-031: `runtimeArgs` launches `ok ui` (not `ok start`). The UI
 * sibling-process is what the preview pane actually renders; collab runs
 * in a separate `ok start` process auto-spawned by `ok ui` via the MCP
 * stdio path. `autoPort: true` lets Claude Code reroute to a free port
 * when 3000 is busy — our `ok ui` lock-collision handler then enters
 * proxy mode (D-022 revised / D-032) so the preview pane always reaches
 * a live UI regardless of which process bound the port first.
 *
 * - File missing        → create with the OK entry
 * - File exists, no OK  → merge the entry into configurations
 * - File exists, has OK → skip (unless force)
 */
function scaffoldLaunchJson(cwd: string, force: boolean): LaunchJsonResult {
  const configPath = join(cwd, '.claude', 'launch.json');
  const entry = {
    name: LAUNCH_CONFIG_NAME,
    runtimeExecutable: 'npx',
    runtimeArgs: ['@inkeep/open-knowledge', 'ui'],
    port: 3000,
    autoPort: true,
  };

  try {
    if (!existsSync(configPath)) {
      mkdirSync(dirname(configPath), { recursive: true });
      const content = { version: LAUNCH_JSON_VERSION, configurations: [entry] };
      writeFileSync(configPath, `${JSON.stringify(content, null, 2)}\n`, 'utf-8');
      return { action: 'created', configPath };
    }

    const raw = readFileSync(configPath, 'utf-8').trim();
    const parsed = raw ? JSON.parse(raw) : {};
    if (!isObject(parsed)) {
      return { action: 'failed', configPath, error: 'launch.json root is not an object' };
    }

    const configs: unknown[] = Array.isArray(parsed.configurations) ? parsed.configurations : [];
    const existingIdx = configs.findIndex(
      (c) => isObject(c) && (c as Record<string, unknown>).name === LAUNCH_CONFIG_NAME,
    );

    if (existingIdx >= 0 && !force) {
      return { action: 'skipped-existing', configPath };
    }

    if (existingIdx >= 0) {
      configs[existingIdx] = entry;
    } else {
      configs.push(entry);
    }

    const updated = {
      ...parsed,
      version: parsed.version ?? LAUNCH_JSON_VERSION,
      configurations: configs,
    };
    writeFileSync(configPath, `${JSON.stringify(updated, null, 2)}\n`, 'utf-8');
    return { action: existingIdx >= 0 ? 'merged' : 'merged', configPath };
  } catch (err) {
    return {
      action: 'failed',
      configPath,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// Per-editor write logic
// ---------------------------------------------------------------------------

function writeEditorMcpConfig(
  target: EditorMcpTarget,
  cwd: string,
  force: boolean,
  home?: string,
): EditorMcpResult {
  const configPath = target.configPath(cwd, home);

  let config: Record<string, unknown>;
  try {
    config = readMcpConfig(configPath);
  } catch (err) {
    return {
      editorId: target.id,
      label: target.label,
      action: 'failed',
      configPath,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const servers = (config[target.topLevelKey] as Record<string, unknown> | undefined) ?? {};
  const existing = servers[MCP_SERVER_NAME];

  if (existing && !force) {
    return {
      editorId: target.id,
      label: target.label,
      action: 'skipped-existing',
      configPath,
    };
  }

  const nextConfig: Record<string, unknown> = {
    ...config,
    [target.topLevelKey]: {
      ...servers,
      [MCP_SERVER_NAME]: target.buildEntry(),
    },
  };

  try {
    writeMcpConfig(configPath, nextConfig);
  } catch (err) {
    return {
      editorId: target.id,
      label: target.label,
      action: 'failed',
      configPath,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  return {
    editorId: target.id,
    label: target.label,
    action: existing ? 'overwritten' : 'written',
    configPath,
  };
}

// ---------------------------------------------------------------------------
// Core init logic
// ---------------------------------------------------------------------------

export function runInit(options: InitCommandOptions = {}): InitCommandResult {
  const cwd = resolve(options.cwd ?? process.cwd());

  // 1. Scaffold .open-knowledge/
  let contentResult: ReturnType<typeof initContent>;
  try {
    contentResult = initContent(cwd);
  } catch (err) {
    const fallbackPath = join(cwd, '.mcp.json');
    return {
      contentCreated: [],
      contentSkipped: [],
      editors: [],
      rootInstructions: [],
      mcpAction: 'failed',
      mcpPath: fallbackPath,
      mcpError: `Content scaffolding failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // 2. Wire MCP config per editor (unless --no-mcp)
  const editorIds = options.editors ?? ['claude'];
  const targets = resolveEditorTargets(editorIds as EditorId[]);

  const editorResults: EditorMcpResult[] = [];
  for (const target of targets) {
    if (options.mcp === false) {
      editorResults.push({
        editorId: target.id,
        label: target.label,
        action: 'skipped-flag',
        configPath: target.configPath(cwd, options.home),
      });
      continue;
    }
    editorResults.push(writeEditorMcpConfig(target, cwd, options.force ?? false, options.home));
  }

  // 3. Scaffold .claude/launch.json when Claude Code is a selected editor
  const hasClaude = editorIds.includes('claude');
  const launchJson =
    hasClaude && options.mcp !== false
      ? scaffoldLaunchJson(cwd, options.force ?? false)
      : undefined;

  // 4. Append/replace the Open Knowledge section in root AGENTS.md
  const rootInstructions =
    options.rootInstructions === false ? [] : upsertRootInstructions(cwd, options.force ?? false);

  // Derive backward-compat fields from the Claude entry (preferred) or first result
  const primary = editorResults.find((r) => r.editorId === 'claude') ??
    editorResults[0] ?? {
      action: 'skipped-flag' as const,
      configPath: join(cwd, '.mcp.json'),
    };

  return {
    contentCreated: contentResult.created,
    contentSkipped: contentResult.skipped,
    editors: editorResults,
    rootInstructions,
    launchJson,
    mcpAction: primary.action,
    mcpPath: primary.configPath,
    mcpError: 'error' in primary ? (primary as EditorMcpResult).error : undefined,
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * Format a user-facing summary of an init run.
 */
export function formatInitResult(result: InitCommandResult, cwd: string): string {
  const lines: string[] = [];

  // Content scaffolding summary
  const okDir = join(cwd, OK_DIR);
  if (result.contentCreated.length > 0) {
    lines.push(`Content scaffolded at ${okDir}/`);
    lines.push(`  Created: ${result.contentCreated.join(', ')}`);
  } else {
    lines.push(`Content already present at ${okDir}/`);
  }
  if (result.contentSkipped.length > 0) {
    lines.push(`  Skipped (already exist): ${result.contentSkipped.join(', ')}`);
  }

  lines.push('');

  // MCP config summary — per-editor
  if (result.editors.length === 0) {
    // Content scaffolding failed before we got to MCP config
    if (result.mcpError) {
      lines.push(`Warning: ${result.mcpError}`);
    }
  } else {
    const anyWritten = result.editors.some(
      (e) => e.action === 'written' || e.action === 'overwritten',
    );
    const anyFailed = result.editors.some((e) => e.action === 'failed');
    const allSkippedFlag = result.editors.every((e) => e.action === 'skipped-flag');

    if (allSkippedFlag) {
      lines.push('MCP config not written — use without --no-mcp to configure editors');
    } else {
      lines.push('MCP server configuration:');
      for (const editor of result.editors) {
        const displayPath = editor.configPath.startsWith(cwd)
          ? relative(cwd, editor.configPath)
          : editor.configPath.replace(/^\/Users\/[^/]+/, '~');
        const pad = ' '.repeat(Math.max(1, 14 - editor.label.length));
        switch (editor.action) {
          case 'written':
            lines.push(`  ${editor.label}${pad}${displayPath}  registered`);
            break;
          case 'overwritten':
            lines.push(`  ${editor.label}${pad}${displayPath}  overwritten (--force)`);
            break;
          case 'skipped-existing':
            lines.push(`  ${editor.label}${pad}${displayPath}  already configured`);
            break;
          case 'failed':
            lines.push(`  ${editor.label}${pad}${displayPath}  FAILED: ${editor.error}`);
            break;
          case 'skipped-flag':
            break;
        }
      }
    }

    // Show manual config hint for any failures
    if (anyFailed) {
      lines.push('');
      lines.push('For failed editors, add the MCP server entry manually. See:');
      lines.push('  https://github.com/inkeep/open-knowledge#mcp-setup');
    }

    // Claude Code launch.json summary
    if (result.launchJson) {
      const lj = result.launchJson;
      const displayPath = lj.configPath.startsWith(cwd)
        ? relative(cwd, lj.configPath)
        : lj.configPath;
      switch (lj.action) {
        case 'created':
          lines.push(
            `  launch.json   ${displayPath}  created (preview_start("open-knowledge") ready)`,
          );
          break;
        case 'merged':
          lines.push(`  launch.json   ${displayPath}  merged open-knowledge entry`);
          break;
        case 'skipped-existing':
          lines.push(`  launch.json   ${displayPath}  already has open-knowledge entry`);
          break;
        case 'failed':
          lines.push(`  launch.json   ${displayPath}  FAILED: ${lj.error}`);
          break;
      }
    }

    // Root instructions (AGENTS.md) summary
    if (result.rootInstructions.length > 0) {
      const visible = result.rootInstructions.filter((r) => r.action !== 'skipped-symlink');
      if (visible.length > 0) {
        lines.push('');
        lines.push('Root instructions:');
        for (const r of visible) {
          const rel = r.path.startsWith(cwd) ? relative(cwd, r.path) : r.path;
          const pad = ' '.repeat(Math.max(1, 14 - r.file.length));
          switch (r.action) {
            case 'created':
              lines.push(`  ${r.file}${pad}${rel}  created`);
              break;
            case 'appended':
              lines.push(`  ${r.file}${pad}${rel}  appended Open Knowledge section`);
              break;
            case 'replaced':
              lines.push(`  ${r.file}${pad}${rel}  replaced Open Knowledge section (--force)`);
              break;
            case 'skipped-existing':
              lines.push(`  ${r.file}${pad}${rel}  already has Open Knowledge section`);
              break;
          }
        }
      }
    }

    // Content preview block (between MCP and Next steps)
    if (result.preview) {
      lines.push('');
      lines.push(formatPreviewBlock(result.preview, cwd));
    } else if (result.previewWarning) {
      lines.push('');
      lines.push(`Content preview unavailable: ${result.previewWarning}`);
    }

    // Next steps (only if something was written)
    if (anyWritten) {
      const configuredLabels = result.editors
        .filter((e) => e.action === 'written' || e.action === 'overwritten')
        .map((e) => e.label);

      lines.push('');
      lines.push('Next steps:');
      lines.push(`  1. Open your editor (${configuredLabels.join(' / ')})`);
      lines.push('  2. Approve the MCP server when prompted');
      lines.push('  3. The knowledge base is ready — use the three workflow tools:');
      lines.push(
        '     - mcp__open-knowledge__init-content  — bootstrap articles from the codebase',
      );
      lines.push('     - mcp__open-knowledge__ingest     — capture an external source');
      lines.push('     - mcp__open-knowledge__research   — gather sources and write findings');
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Commander wiring
// ---------------------------------------------------------------------------

function parseEditorFlag(value: string): EditorId[] {
  if (value === 'all') return [...ALL_EDITOR_IDS];
  const ids = value.split(',').map((s) => s.trim()) as EditorId[];
  // Validate — resolveEditorTargets throws on unknown IDs
  resolveEditorTargets(ids);
  return ids;
}

export function initCommand(): Command {
  return new Command('init')
    .description(
      `Scaffold ${OK_DIR}/ in the current directory and register the MCP server for your editor(s)`,
    )
    .option('--mcp', 'Register the MCP server for selected editors (default: true)', true)
    .option('--no-mcp', `Scaffold the ${OK_DIR}/ directory but do not touch MCP config`)
    .option('--force', 'Overwrite existing open-knowledge MCP entries (default: skip)')
    .option(
      '--editor <editors>',
      'Target editor(s): claude, cursor, vscode, windsurf, all (comma-separated)',
    )
    .action(async (opts: { mcp?: boolean; force?: boolean; editor?: string }) => {
      const cwd = process.cwd();

      let editors: EditorId[];

      if (opts.editor) {
        // Explicit flag — use directly
        try {
          editors = parseEditorFlag(opts.editor);
        } catch (err) {
          process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
          process.exitCode = 1;
          return;
        }
      } else if (opts.mcp !== false && process.stdin.isTTY) {
        // Interactive prompt
        const { multiselect, isCancel } = await import('@clack/prompts');

        const editorChoices = ALL_EDITOR_IDS.map((id) => {
          const target = EDITOR_TARGETS[id];
          const hint =
            target.scope === 'global'
              ? target.configPath(cwd).replace(/^\/Users\/[^/]+/, '~')
              : relative(cwd, target.configPath(cwd));
          // Pre-select editors whose config directory already exists
          const dirExists =
            target.scope === 'project' && existsSync(dirname(target.configPath(cwd)));
          return {
            value: id,
            label: target.label,
            hint,
            initialValue: dirExists || id === 'claude',
          };
        });

        const selected = await multiselect({
          message: 'Which tools do you use? (space to toggle, enter to confirm)',
          options: editorChoices,
          required: true,
        });

        if (isCancel(selected)) {
          process.stdout.write('Init cancelled.\n');
          return;
        }

        editors = selected as EditorId[];
      } else {
        // Non-interactive fallback
        editors = ['claude'];
      }

      const result = runInit({
        cwd,
        mcp: opts.mcp,
        force: opts.force,
        editors,
      });

      try {
        const { previewContent } = await import('../content/preview.ts');
        const { loadConfig } = await import('../config/loader.ts');
        const { resolveContentDir } = await import('../config/paths.ts');
        const { config } = loadConfig(cwd);
        const contentDir = resolveContentDir(config, cwd);
        result.preview = previewContent({
          projectDir: cwd,
          contentDir,
          include: config.content.include,
          exclude: config.content.exclude,
        });
      } catch (e) {
        result.previewWarning = e instanceof Error ? e.message : String(e);
      }

      process.stdout.write(`${formatInitResult(result, cwd)}\n`);

      if (result.editors.some((e) => e.action === 'failed') || result.mcpAction === 'failed') {
        process.exitCode = 1;
      }
    });
}
