/**
 * `open-knowledge init` — one-shot terminal setup command.
 *
 * Does two things:
 *   1. Scaffolds `.open-knowledge/` in the current directory via initContent()
 *      (same logic the MCP server's init flow used to call — now factored out).
 *   2. Writes Open Knowledge MCP server entries into each selected editor's
 *      config file, preserving any existing entries. Idempotent: skips when
 *      the target entry already matches; if an existing entry differs, reports
 *      that drift and tells the user to re-run with `--force`.
 *
 * Supports Claude Code, Claude Desktop, Cursor, VS Code, Windsurf, and Codex.
 * When run interactively (TTY) without `--editor`, prompts the user to select
 * which editors to configure. When `--editor` is passed or stdin is not a TTY,
 * uses the flag value directly (defaults to `claude`).
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
import { warning } from '../ui/colors.ts';
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

export interface EditorMcpResult {
  editorId: EditorId;
  label: string;
  action:
    | 'written'
    | 'skipped-existing'
    | 'skipped-conflict'
    | 'overwritten'
    | 'skipped-flag'
    | 'failed';
  configPath: string;
  serverName: string;
  error?: string;
}

export interface LegacyProjectConfigResult {
  editorId: EditorId;
  label: string;
  path: string;
}

export interface InitCommandOptions {
  cwd?: string;
  mcp?: boolean;
  force?: boolean;
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

export interface InitCommandResult {
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
  mcpAction:
    | 'written'
    | 'skipped-existing'
    | 'skipped-conflict'
    | 'overwritten'
    | 'skipped-flag'
    | 'failed';
  mcpPath: string;
  mcpError?: string;
  previewWarning?: string;
}

// ---------------------------------------------------------------------------
// Claude Code launch.json scaffolding
// ---------------------------------------------------------------------------

const LAUNCH_JSON_VERSION = '0.0.1';
const LAUNCH_CONFIG_NAME = 'open-knowledge-ui';

export type LaunchJsonAction =
  | 'created'
  | 'merged'
  | 'skipped-existing'
  | 'skipped-stale'
  | 'failed';

export interface LaunchJsonResult {
  action: LaunchJsonAction;
  configPath: string;
  error?: string;
  /**
   * When `action === 'skipped-stale'`: fields that differ between the existing
   * entry and the target entry. Surfaced to the user so they know to re-run
   * with `--force` to pick up the new defaults.
   */
  staleFields?: string[];
}

/**
 * Compare an existing launch-json entry against the current target shape and
 * return the names of fields that differ. Empty array ⇒ entries match (safe
 * to skip). Non-empty ⇒ user has an outdated entry (typically from a prior
 * `ok init` before Zero-Ceremony Resume) and should re-run with `--force`.
 *
 * Only the fields we actively manage are compared — `name` is intentionally
 * excluded because it's the identity key, and any user-added fields (env,
 * cwd, etc.) are ignored so hand-edits are not flagged as stale.
 */
function diffLaunchEntry(
  existing: Record<string, unknown>,
  target: {
    runtimeExecutable: string;
    runtimeArgs: string[];
    port: number;
  },
): string[] {
  const stale: string[] = [];
  if (existing.runtimeExecutable !== target.runtimeExecutable) {
    stale.push('runtimeExecutable');
  }
  const existingArgs = existing.runtimeArgs;
  const argsMatch =
    Array.isArray(existingArgs) &&
    existingArgs.length === target.runtimeArgs.length &&
    existingArgs.every((a, i) => a === target.runtimeArgs[i]);
  if (!argsMatch) stale.push('runtimeArgs');
  if (existing.port !== target.port) stale.push('port');
  return stale;
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
 * - File exists, has OK → skip (unless force)
 */
function scaffoldLaunchJson(
  cwd: string,
  force: boolean,
  installOptions: McpInstallOptions = {},
): LaunchJsonResult {
  const configPath = join(cwd, '.claude', 'launch.json');
  const allowModeOverwrite = installOptions.mode === 'dev';
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

    if (existingIdx >= 0 && !force) {
      const existingEntry = configs[existingIdx] as Record<string, unknown>;
      const staleFields = diffLaunchEntry(existingEntry, entry);
      if (staleFields.length > 0) {
        if (!allowModeOverwrite) {
          return { action: 'skipped-stale', configPath, staleFields };
        }
      } else {
        return { action: 'skipped-existing', configPath };
      }
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
  const allowModeOverwrite = installOptions.mode === 'dev';
  let targetEntry: Record<string, unknown>;

  try {
    if (existing !== undefined && !force) {
      if (isObject(existing) && target.isCompatible(existing, cwd, installOptions)) {
        return {
          editorId: target.id,
          label: target.label,
          action: 'skipped-existing',
          configPath,
          serverName,
        };
      }

      if (!allowModeOverwrite) {
        return {
          editorId: target.id,
          label: target.label,
          action: 'skipped-conflict',
          configPath,
          serverName,
        };
      }
    }

    targetEntry =
      isObject(existing) && (force || allowModeOverwrite)
        ? target.mergeManagedFields(existing, cwd, installOptions)
        : target.buildEntry(cwd, installOptions);
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
  const editorIds = options.editors ?? ['claude'];
  const targets = resolveEditorTargets(editorIds as EditorId[]);

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
    editorResults.push(
      writeEditorMcpConfig(target, cwd, options.force ?? false, installOptions, options.home),
    );
  }
  const legacyProjectConfigs =
    options.mcp === false
      ? []
      : targets
          .map((target) => collectLegacyProjectConfig(target, cwd))
          .filter((result): result is LegacyProjectConfigResult => result !== undefined);

  // 3. Scaffold .claude/launch.json when Claude Code is a selected editor
  const hasClaude = editorIds.includes('claude');
  const launchJson =
    hasClaude && options.mcp !== false
      ? scaffoldLaunchJson(cwd, options.force ?? false, installOptions)
      : undefined;

  // 4. Append/replace the Open Knowledge section in AGENTS.md + per-editor instruction files
  const extraInstructionFiles = targets
    .map((t) => t.instructionsPath?.(cwd))
    .filter((p): p is string => p !== undefined)
    .map((p) => (isAbsolute(p) ? relative(cwd, p) : p));
  const rootInstructions =
    options.rootInstructions === false
      ? []
      : upsertRootInstructions(cwd, options.force ?? false, extraInstructionFiles);

  // Derive backward-compat fields from the Claude entry (preferred) or first result
  const primary = editorResults.find((r) => r.editorId === 'claude') ??
    editorResults[0] ?? {
      action: 'skipped-flag' as const,
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
        const serverNameNote =
          editor.serverName === MCP_SERVER_NAME ? '' : ` (${editor.serverName})`;
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
          case 'skipped-existing':
            lines.push(
              `  ${editor.label}${pad}${displayPath}  already configured${serverNameNote}`,
            );
            break;
          case 'skipped-conflict':
            lines.push(
              `  ${editor.label}${pad}${displayPath}  managed MCP fields differ from current defaults${serverNameNote}; re-run with --force to update`,
            );
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

    // Claude Code launch.json summary
    if (result.launchJson) {
      const lj = result.launchJson;
      const displayPath = lj.configPath.startsWith(cwd)
        ? relative(cwd, lj.configPath)
        : lj.configPath;
      switch (lj.action) {
        case 'created':
          lines.push(
            `  launch.json   ${displayPath}  created (preview_start("${LAUNCH_CONFIG_NAME}") ready)`,
          );
          break;
        case 'merged':
          lines.push(`  launch.json   ${displayPath}  merged open-knowledge entry`);
          break;
        case 'skipped-existing':
          lines.push(`  launch.json   ${displayPath}  already has open-knowledge entry`);
          break;
        case 'skipped-stale':
          lines.push(
            `  launch.json   ${displayPath}  ${warning('\u26a0 existing open-knowledge entry is out of date')}`,
          );
          if (lj.staleFields && lj.staleFields.length > 0) {
            lines.push(
              `                ${warning(`${lj.staleFields.join(', ')} differ from current defaults`)}`,
            );
          }
          lines.push(`                ${warning('re-run with --force to update')}`);
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

function normalizeEditorToken(token: string): EditorId {
  switch (token) {
    case 'claude_desktop':
      return 'claude-desktop';
    default:
      return token as EditorId;
  }
}

export function parseEditorFlag(value: string): EditorId[] {
  if (value === 'all') return [...ALL_EDITOR_IDS];
  const ids = value
    .split(',')
    .map((s) => s.trim())
    .map(normalizeEditorToken);
  // Validate — resolveEditorTargets throws on unknown IDs
  resolveEditorTargets(ids);
  return ids;
}

/**
 * Detect every editor whose global config surface already exists. Each target
 * can override the probe path when the config file itself is a poor signal
 * (for example Claude Code writes `~/.claude.json`, but installation is better
 * inferred from the presence of `~/.claude/`).
 *
 * Used by the Commander action to default to all detected editors in both
 * TTY (pre-select) and non-TTY (fallback) branches — US-013 / FR-3.1 /
 * D-013.
 */
export function detectInstalledEditors(cwd: string, home?: string): EditorId[] {
  const detected: EditorId[] = [];
  for (const id of ALL_EDITOR_IDS) {
    const target = EDITOR_TARGETS[id];
    let probePath: string;
    try {
      probePath = target.detectPath?.(cwd, home) ?? dirname(target.configPath(cwd, home));
    } catch {
      continue;
    }
    if (existsSync(probePath)) {
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
    .option('--force', 'Overwrite existing open-knowledge MCP entries (default: skip)')
    .option(
      '--dev-mcp',
      'Register a local dev MCP entry using node + packages/cli/dist/cli.mjs with debug logging',
    )
    .option(
      '--editor <editors>',
      `Target editor(s): ${ALL_EDITOR_IDS.join(', ')}, all (comma-separated) — default: all detected editors (non-TTY) / preselects detected editors (TTY)`,
    )
    .action(async (opts: { mcp?: boolean; force?: boolean; devMcp?: boolean; editor?: string }) => {
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
        // Interactive prompt — pre-select every detected editor regardless of
        // scope. Empty detection set shows every supported editor unselected
        // alongside a hint (D-019) so the user can still pick manually or
        // cancel and use --editor.
        const { multiselect, isCancel } = await import('@clack/prompts');

        const detected = new Set(detectInstalledEditors(cwd));
        if (detected.size === 0) {
          process.stdout.write(
            `No MCP-capable editors detected — select manually, or cancel and use --editor <all|${ALL_EDITOR_IDS.join('|')}>.\n`,
          );
        }

        const editorChoices = ALL_EDITOR_IDS.flatMap((id) => {
          const target = EDITOR_TARGETS[id];
          try {
            const configPath = target.configPath(cwd);
            const hint =
              target.scope === 'global'
                ? configPath.replace(/^\/Users\/[^/]+/, '~')
                : relative(cwd, configPath);
            return [
              {
                value: id,
                label: target.label,
                hint,
                initialValue: detected.has(id),
              },
            ];
          } catch {
            return [];
          }
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
        // Non-interactive fallback — default to every detected editor.
        // Zero detected: exit 1 with a helpful hint (D-019).
        editors = detectInstalledEditors(cwd);
        if (editors.length === 0) {
          process.stderr.write(
            `No MCP-capable editors detected. Use --editor <all|${ALL_EDITOR_IDS.join('|')}> to force.\n`,
          );
          process.exitCode = 1;
          return;
        }
      }

      const result = runInit({
        cwd,
        mcp: opts.mcp,
        force: opts.force,
        devMcp: opts.devMcp,
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
