/**
 * `open-knowledge init` — one-shot terminal setup command.
 *
 * Does two things:
 *   1. Scaffolds `.open-knowledge/` in the current directory via initContent()
 *      (same logic the MCP server's init flow used to call — now factored out).
 *   2. Writes Open Knowledge MCP server entries into every detected editor's
 *      config file. The CLI owns the `open-knowledge` / `open-knowledge-ui`
 *      entries and rewrites them to the current defaults on every run.
 *
 * Supports Claude Code, Claude Desktop, Cursor, VS Code, Windsurf, and Codex.
 * Missing editor config roots are skipped so init does not create new user-home
 * directories for tools that are not installed.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { Command } from 'commander';
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
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
  type McpInstallOptions,
  resolveDevCliDistPath,
  resolveEditorTargets,
} from './editors.ts';

// ---------------------------------------------------------------------------
// Config I/O — generic across all editors
// ---------------------------------------------------------------------------

/**
 * Read an existing JSON MCP config file (if any) and return its parsed shape.
 * Returns an empty object if the file doesn't exist or is empty.
 * Throws on invalid JSON or permission errors.
 */
function readJsonConfig(path: string): Record<string, unknown> {
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
 * Read an existing TOML MCP config file (if any) and return its parsed shape.
 * Returns an empty object if the file doesn't exist or is empty.
 * Throws on invalid TOML or permission errors.
 */
function readTomlConfig(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, 'utf-8');
  const trimmed = raw.trim();
  if (trimmed === '') return {};
  try {
    const parsed = parseToml(trimmed);
    if (isObject(parsed)) {
      return parsed;
    }
    throw new Error(`${path} root must be a TOML table`);
  } catch (err) {
    throw new Error(
      `${path} contains invalid TOML: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Write the config to disk as pretty-printed JSON with a trailing newline.
 * Creates parent directories if missing.
 */
function writeJsonConfig(path: string, config: Record<string, unknown>): void {
  mkdirSync(dirname(path), { recursive: true });
  const serialized = `${JSON.stringify(config, null, 2)}\n`;
  writeFileSync(path, serialized, 'utf-8');
}

/**
 * Write the config to disk as TOML with a trailing newline.
 * Creates parent directories if missing.
 */
function writeTomlConfig(path: string, config: Record<string, unknown>): void {
  mkdirSync(dirname(path), { recursive: true });
  const serialized = stringifyToml(config);
  writeFileSync(path, serialized.endsWith('\n') ? serialized : `${serialized}\n`, 'utf-8');
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EditorMcpResult {
  editorId: EditorId;
  label: string;
  action: 'written' | 'overwritten' | 'skipped-missing' | 'skipped-flag' | 'failed';
  configPath: string;
  serverName: string;
  error?: string;
}

interface LegacyProjectConfigResult {
  editorId: EditorId;
  label: string;
  path: string;
}

interface InitCommandOptions {
  cwd?: string;
  mcp?: boolean;
  /** Register a local dev MCP entry using `node` + this repo's built dist CLI. */
  devMcp?: boolean;
  editors?: EditorId[];
  /** Append/replace the Open Knowledge section in root AGENTS.md (default: true). */
  rootInstructions?: boolean;
  /** Override home directory (test-only, for global editor config paths). */
  home?: string;
  /** Override the current CLI entry path (test-only; used by --dev-mcp). */
  cliEntryPath?: string;
}

interface InitCommandResult {
  contentCreated: string[];
  contentSkipped: string[];
  /** Per-editor MCP config results. Empty when `--no-mcp`. */
  editors: EditorMcpResult[];
  /** Legacy project-local MCP configs left in place after global init. */
  legacyProjectConfigs: LegacyProjectConfigResult[];
  /** Per-file root-instructions (AGENTS.md) results. Empty when `--no-root-instructions`. */
  rootInstructions: RootInstructionResult[];
  /** Content preview result (undefined if preview failed or was not run). */
  preview?: PreviewResult;
  /** Claude Code launch.json result (undefined when Claude is not a selected editor). */
  launchJson?: LaunchJsonResult;
  // Backward-compat fields (derived from the Claude entry or first editor):
  mcpAction: 'written' | 'overwritten' | 'skipped-missing' | 'skipped-flag' | 'failed';
  mcpPath: string;
  mcpError?: string;
  previewWarning?: string;
}

// ---------------------------------------------------------------------------
// Claude Code launch.json scaffolding
// ---------------------------------------------------------------------------

const LAUNCH_JSON_VERSION = '0.0.1';
const LAUNCH_CONFIG_NAME = 'open-knowledge-ui';

type LaunchJsonAction = 'created' | 'merged' | 'failed';

interface LaunchJsonResult {
  action: LaunchJsonAction;
  configPath: string;
  error?: string;
}

/**
 * Scaffold or merge a `.claude/launch.json` entry so that Claude Code's
 * built-in preview browser can start the Open Knowledge dev server via
 * `preview_start("open-knowledge-ui")`.
 *
 * `runtimeArgs` launches `open-knowledge ui` (not `open-knowledge start`) —
 * the UI sibling-process is what the preview pane renders; collab runs in a
 * separate `open-knowledge start` process auto-spawned by `ok ui` via the
 * MCP stdio path.
 *
 * - File missing        → create with the OK entry
 * - File exists, no OK  → merge the entry into configurations
 * - File exists, has OK → replace with current defaults
 */
function scaffoldLaunchJson(cwd: string, installOptions: McpInstallOptions = {}): LaunchJsonResult {
  const configPath = join(cwd, '.claude', 'launch.json');
  const entry: {
    name: string;
    runtimeExecutable: string;
    runtimeArgs: string[];
    port: number;
  } =
    installOptions.mode === 'dev'
      ? {
          name: LAUNCH_CONFIG_NAME,
          runtimeExecutable: 'node',
          runtimeArgs: [resolveDevCliDistPath(installOptions.cliEntryPath), 'ui'],
          port: 3000,
        }
      : {
          name: LAUNCH_CONFIG_NAME,
          runtimeExecutable: 'npx',
          // Use the fully-qualified package name so `npx` resolves against the npm
          // registry on a cold cache. `open-knowledge` alone is a bin name that only
          // works if the package is already installed (local or global).
          runtimeArgs: ['@inkeep/open-knowledge', 'ui'],
          port: 3000,
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

function isEditorTargetAvailable(target: EditorMcpTarget, cwd: string, home?: string): boolean {
  try {
    const probePath = target.detectPath?.(cwd, home) ?? dirname(target.configPath(cwd, home));
    return existsSync(probePath);
  } catch {
    return false;
  }
}

function writeEditorMcpConfig(
  target: EditorMcpTarget,
  cwd: string,
  installOptions: McpInstallOptions,
  home?: string,
): EditorMcpResult {
  const serverName = target.serverName(cwd);
  let configPath: string;
  try {
    configPath = target.configPath(cwd, home);
  } catch (err) {
    return {
      editorId: target.id,
      label: target.label,
      action: 'failed',
      configPath: '',
      serverName,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  if (!isEditorTargetAvailable(target, cwd, home)) {
    return {
      editorId: target.id,
      label: target.label,
      action: 'skipped-missing',
      configPath,
      serverName,
    };
  }

  let config: Record<string, unknown>;
  try {
    config = target.format === 'toml' ? readTomlConfig(configPath) : readJsonConfig(configPath);
  } catch (err) {
    return {
      editorId: target.id,
      label: target.label,
      action: 'failed',
      configPath,
      serverName,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const servers = (config[target.topLevelKey] as Record<string, unknown> | undefined) ?? {};
  const existing = servers[serverName];
  let targetEntry: Record<string, unknown>;

  try {
    targetEntry = target.buildEntry(cwd, installOptions);
  } catch (err) {
    return {
      editorId: target.id,
      label: target.label,
      action: 'failed',
      configPath,
      serverName,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const nextConfig: Record<string, unknown> = {
    ...config,
    [target.topLevelKey]: {
      ...servers,
      [serverName]: targetEntry,
    },
  };

  try {
    if (target.format === 'toml') {
      writeTomlConfig(configPath, nextConfig);
    } else {
      writeJsonConfig(configPath, nextConfig);
    }
  } catch (err) {
    return {
      editorId: target.id,
      label: target.label,
      action: 'failed',
      configPath,
      serverName,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  return {
    editorId: target.id,
    label: target.label,
    action: existing !== undefined ? 'overwritten' : 'written',
    configPath,
    serverName,
  };
}

function collectLegacyProjectConfig(
  target: EditorMcpTarget,
  cwd: string,
): LegacyProjectConfigResult | undefined {
  const legacyPath = target.legacyProjectConfigPath?.(cwd);
  if (!legacyPath || !existsSync(legacyPath)) return undefined;
  return {
    editorId: target.id,
    label: target.label,
    path: legacyPath,
  };
}

// ---------------------------------------------------------------------------
// Core init logic
// ---------------------------------------------------------------------------

export function runInit(options: InitCommandOptions = {}): InitCommandResult {
  const cwd = resolve(options.cwd ?? process.cwd());
  const installOptions: McpInstallOptions = {
    mode: options.devMcp ? 'dev' : 'published',
    cliEntryPath: options.cliEntryPath,
  };

  // 1. Scaffold .open-knowledge/
  let contentResult: ReturnType<typeof initContent>;
  try {
    contentResult = initContent(cwd);
  } catch (err) {
    const fallbackPath = EDITOR_TARGETS.claude.configPath(cwd, options.home);
    return {
      contentCreated: [],
      contentSkipped: [],
      editors: [],
      legacyProjectConfigs: [],
      rootInstructions: [],
      mcpAction: 'failed',
      mcpPath: fallbackPath,
      mcpError: `Content scaffolding failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // 2. Wire MCP config per editor (unless --no-mcp)
  const editorIds = options.editors ?? detectInstalledEditors(cwd, options.home);
  const targets = resolveEditorTargets(editorIds as EditorId[]);
  const availableTargets = targets.filter((target) =>
    isEditorTargetAvailable(target, cwd, options.home),
  );

  const editorResults: EditorMcpResult[] = [];
  for (const target of targets) {
    if (options.mcp === false) {
      let configPath = '';
      try {
        configPath = target.configPath(cwd, options.home);
      } catch {
        // Unsupported-platform target (e.g. Claude Desktop on Linux) — --no-mcp
        // explicitly means "don't write", so the path is informational only.
      }
      editorResults.push({
        editorId: target.id,
        label: target.label,
        action: 'skipped-flag',
        configPath,
        serverName: target.serverName(cwd),
      });
      continue;
    }
    editorResults.push(writeEditorMcpConfig(target, cwd, installOptions, options.home));
  }
  const legacyProjectConfigs =
    options.mcp === false
      ? []
      : availableTargets
          .map((target) => collectLegacyProjectConfig(target, cwd))
          .filter((result): result is LegacyProjectConfigResult => result !== undefined);

  // 3. Scaffold .claude/launch.json when Claude Code is a selected editor
  const hasClaude = availableTargets.some((target) => target.id === 'claude');
  const launchJson =
    hasClaude && options.mcp !== false ? scaffoldLaunchJson(cwd, installOptions) : undefined;

  // 4. Append/replace the Open Knowledge section in AGENTS.md + per-editor instruction files
  const extraInstructionFiles = availableTargets
    .map((t) => t.instructionsPath?.(cwd))
    .filter((p): p is string => p !== undefined)
    .map((p) => (isAbsolute(p) ? relative(cwd, p) : p));
  const rootInstructions =
    options.rootInstructions === false
      ? []
      : upsertRootInstructions(cwd, true, extraInstructionFiles);

  // Derive backward-compat fields from the Claude entry (preferred) or first result
  const defaultAction: EditorMcpResult['action'] =
    options.mcp === false ? 'skipped-flag' : 'skipped-missing';
  const primary = editorResults.find((r) => r.editorId === 'claude') ??
    editorResults[0] ?? {
      action: defaultAction,
      configPath: EDITOR_TARGETS.claude.configPath(cwd, options.home),
    };

  return {
    contentCreated: contentResult.created,
    contentSkipped: contentResult.skipped,
    editors: editorResults,
    legacyProjectConfigs,
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
  const anyWritten = result.editors.some(
    (e) => e.action === 'written' || e.action === 'overwritten',
  );
  const anyFailed = result.editors.some((e) => e.action === 'failed');
  const allSkippedFlag =
    result.editors.length > 0 && result.editors.every((e) => e.action === 'skipped-flag');
  const allSkippedMissing =
    result.editors.length > 0 && result.editors.every((e) => e.action === 'skipped-missing');
  const formatLaunchJsonSummary = (launchJson: LaunchJsonResult): string => {
    const displayPath = launchJson.configPath.startsWith(cwd)
      ? relative(cwd, launchJson.configPath)
      : launchJson.configPath;
    switch (launchJson.action) {
      case 'created':
        return `    app preview server   ${displayPath}  configured for Claude Code Desktop embedded browser`;
      case 'merged':
        return `    app preview server   ${displayPath}  updated for Claude Code Desktop embedded browser`;
      case 'failed':
        return `    app preview server   ${displayPath}  FAILED: ${launchJson.error}`;
    }
  };

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
  if (result.mcpError && result.editors.length === 0) {
    lines.push(`Warning: ${result.mcpError}`);
  } else if (result.editors.length === 0) {
    lines.push('MCP server configuration:');
    lines.push(
      result.mcpAction === 'skipped-flag'
        ? '  MCP config not written — use without --no-mcp to configure editors'
        : '  No supported editor config directories detected; skipped MCP registration',
    );
  } else if (allSkippedFlag) {
    lines.push('MCP config not written — use without --no-mcp to configure editors');
  } else if (allSkippedMissing) {
    lines.push('MCP server configuration:');
    lines.push('  No supported editor config directories detected; skipped MCP registration');
  } else {
    lines.push('MCP server configuration:');
    for (const editor of result.editors) {
      const displayPath = editor.configPath.startsWith(cwd)
        ? relative(cwd, editor.configPath)
        : editor.configPath.replace(/^\/Users\/[^/]+/, '~');
      const serverNameNote = editor.serverName === MCP_SERVER_NAME ? '' : ` (${editor.serverName})`;
      const pad = ' '.repeat(Math.max(1, 14 - editor.label.length));
      const restartHint =
        editor.editorId === 'claude-desktop' &&
        (editor.action === 'written' || editor.action === 'overwritten')
          ? ' — quit and relaunch Claude Desktop to activate'
          : '';
      switch (editor.action) {
        case 'written':
          lines.push(
            `  ${editor.label}${pad}${displayPath}  registered${serverNameNote}${restartHint}`,
          );
          break;
        case 'overwritten':
          lines.push(
            `  ${editor.label}${pad}${displayPath}  updated${serverNameNote}${restartHint}`,
          );
          break;
        case 'skipped-missing':
          lines.push(`  ${editor.label}${pad}${displayPath}  config root missing; skipped`);
          break;
        case 'failed':
          lines.push(`  ${editor.label}${pad}${displayPath}  FAILED: ${editor.error}`);
          break;
        case 'skipped-flag':
          break;
      }
      if (editor.editorId === 'claude' && result.launchJson) {
        lines.push(formatLaunchJsonSummary(result.launchJson));
      }
    }
  }

  // Show manual config hint for any failures
  if (anyFailed) {
    lines.push('');
    lines.push('For failed editors, add the MCP server entry manually. See:');
    lines.push('  https://github.com/inkeep/open-knowledge#mcp-setup');
  }

  if (result.legacyProjectConfigs.length > 0) {
    lines.push('');
    lines.push('Legacy project MCP configs detected:');
    for (const legacy of result.legacyProjectConfigs) {
      lines.push(`  ${legacy.label}  ${relative(cwd, legacy.path)}`);
    }
    lines.push(
      '  These project-local files may override the new global config. Remove them if you want fully user-scoped MCP setup in this project.',
    );
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
            lines.push(`  ${r.file}${pad}${rel}  replaced Open Knowledge section`);
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
    lines.push('     - mcp__open-knowledge__init-content  — bootstrap articles from the codebase');
    lines.push('     - mcp__open-knowledge__ingest     — capture an external source');
    lines.push('     - mcp__open-knowledge__research   — gather sources and write findings');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Commander wiring
// ---------------------------------------------------------------------------

/**
 * Detect every editor whose global config surface already exists. Each target
 * can override the probe path when the config file itself is a poor signal
 * (for example Claude Code writes `~/.claude.json`, but installation is better
 * inferred from the presence of `~/.claude/`).
 *
 * Used by `runInit()` and the CLI to install to every editor that already has
 * a config root on disk without creating new user-home directories for tools
 * the user does not have.
 */
export function detectInstalledEditors(cwd: string, home?: string): EditorId[] {
  const detected: EditorId[] = [];
  for (const id of ALL_EDITOR_IDS) {
    if (isEditorTargetAvailable(EDITOR_TARGETS[id], cwd, home)) {
      detected.push(id);
    }
  }
  return detected;
}

export function initCommand(): Command {
  return new Command('init')
    .description(
      `Scaffold ${OK_DIR}/ in the current directory and register the MCP server for your editor(s)`,
    )
    .option('--mcp', 'Register the MCP server for selected editors (default: true)', true)
    .option('--no-mcp', `Scaffold the ${OK_DIR}/ directory but do not touch MCP config`)
    .option(
      '--dev-mcp',
      'Register a local dev MCP entry using node + packages/cli/dist/cli.mjs with debug logging',
    )
    .action(async (opts: { mcp?: boolean; devMcp?: boolean }) => {
      const cwd = process.cwd();

      const result = runInit({
        cwd,
        mcp: opts.mcp,
        devMcp: opts.devMcp,
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
