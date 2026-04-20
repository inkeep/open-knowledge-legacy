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
 * Supports Claude Code, Cursor, VS Code, Codex, and Windsurf. When run interactively
 * (TTY) without `--editor`, prompts the user to select which editors to
 * configure. When `--editor` is passed or stdin is not a TTY, uses the flag
 * value directly (defaults to `claude`).
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
  action: 'written' | 'skipped-existing' | 'overwritten' | 'skipped-flag' | 'failed';
  configPath: string;
  error?: string;
  /** Server key under which the entry was written / matched (defaults to MCP_SERVER_NAME). */
  serverKey?: string;
  /**
   * Set when auto-disambiguation fired (global-scope targets only): the default
   * key that conflicted with an existing entry bound to a different `--cwd`.
   */
  disambiguatedFrom?: string;
  /**
   * Set when a legacy entry was rewritten to the project-qualified form
   * (Windsurf only — Claude Desktop has no legacy state). Carries the old key
   * so the formatter can emit a migration line.
   */
  migratedFromKey?: string;
}

interface InitCommandOptions {
  cwd?: string;
  mcp?: boolean;
  force?: boolean;
  editors?: EditorId[];
  /** Append/replace the Open Knowledge section in root AGENTS.md (default: true). */
  rootInstructions?: boolean;
  /** Override home directory (test-only, for Windsurf global path). */
  home?: string;
}

interface InitCommandResult {
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
const LAUNCH_CONFIG_NAME = 'open-knowledge-ui';

type LaunchJsonAction = 'created' | 'merged' | 'skipped-existing' | 'skipped-stale' | 'failed';

interface LaunchJsonResult {
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
function scaffoldLaunchJson(cwd: string, force: boolean): LaunchJsonResult {
  const configPath = join(cwd, '.claude', 'launch.json');
  const entry = {
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
        return { action: 'skipped-stale', configPath, staleFields };
      }
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
  let configPath: string;
  try {
    configPath = target.configPath(cwd, home);
  } catch (err) {
    return {
      editorId: target.id,
      label: target.label,
      action: 'failed',
      configPath: '',
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
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const servers = (config[target.topLevelKey] as Record<string, unknown> | undefined) ?? {};

  // Per-target key resolution. Project-scoped targets omit `resolveServerKey`,
  // so we fall back to the legacy `MCP_SERVER_NAME` literal — preserves the
  // existing behavior for claude/cursor/vscode (D6 LOCKED).
  let resolved: {
    key: string;
    existingEntry: unknown | undefined;
    disambiguatedFrom?: string;
    migratedFromKey?: string;
  };
  try {
    resolved = target.resolveServerKey?.(servers, cwd) ?? {
      key: MCP_SERVER_NAME,
      existingEntry: servers[MCP_SERVER_NAME],
    };
  } catch (err) {
    return {
      editorId: target.id,
      label: target.label,
      action: 'failed',
      configPath,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const { key, existingEntry, disambiguatedFrom, migratedFromKey } = resolved;

  // A migrated legacy entry is always rewritten — no `--force` required (D17 LOCKED).
  // Otherwise, an entry already at the resolved key short-circuits unless --force.
  if (existingEntry !== undefined && !force && migratedFromKey === undefined) {
    return {
      editorId: target.id,
      label: target.label,
      action: 'skipped-existing',
      configPath,
      serverKey: key,
    };
  }

  // Strip the legacy key so the file ends with exactly one open-knowledge entry
  // for this project (no `open-knowledge` + `open-knowledge-<slug>` duplicate).
  const nextServers: Record<string, unknown> = { ...servers };
  if (migratedFromKey !== undefined && migratedFromKey !== key) {
    delete nextServers[migratedFromKey];
  }
  nextServers[key] = target.buildEntry(cwd);

  const nextConfig: Record<string, unknown> = {
    ...config,
    [target.topLevelKey]: nextServers,
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
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // Disambiguated writes land under a fresh suffix key — `written` (not overwritten),
  // even though `disambiguatedFrom` is set.
  const action: EditorMcpResult['action'] =
    migratedFromKey !== undefined
      ? 'overwritten'
      : existingEntry !== undefined
        ? 'overwritten'
        : 'written';

  return {
    editorId: target.id,
    label: target.label,
    action,
    configPath,
    serverKey: key,
    ...(disambiguatedFrom !== undefined ? { disambiguatedFrom } : {}),
    ...(migratedFromKey !== undefined ? { migratedFromKey } : {}),
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
      let configPath = '';
      try {
        configPath = target.configPath(cwd, options.home);
      } catch {
        // Unsupported-platform throw (e.g. Claude Desktop on Linux) — surface
        // an empty path; --no-mcp explicitly means "don't write" so the path
        // is informational only.
      }
      editorResults.push({
        editorId: target.id,
        label: target.label,
        action: 'skipped-flag',
        configPath,
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
 * Look up the `--cwd` value for a server key by re-reading its config file.
 * Returns `undefined` if the config can't be read or the key/entry/args don't
 * match the expected shape. Used only by the format layer to emit the
 * disambiguation conflict hint; never throws.
 */
function findCwdForKey(editor: EditorMcpResult, key: string): string | undefined {
  try {
    const raw = readFileSync(editor.configPath, 'utf-8').trim();
    if (raw === '') return undefined;
    const parsed = JSON.parse(raw);
    if (!isObject(parsed)) return undefined;
    // All currently-supported editors use `mcpServers`. VS Code uses `servers`
    // but is project-scoped (no disambiguation path).
    const servers = parsed.mcpServers;
    if (!isObject(servers)) return undefined;
    const entry = servers[key];
    if (!isObject(entry)) return undefined;
    const args = entry.args;
    if (!Array.isArray(args)) return undefined;
    const i = args.indexOf('--cwd');
    if (i < 0 || i === args.length - 1) return undefined;
    const value = args[i + 1];
    return typeof value === 'string' ? value : undefined;
  } catch {
    return undefined;
  }
}

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

        // Claude Desktop does not hot-reload MCP config — surface a restart hint
        // on successful writes only. Windsurf hot-reloads (A5) so no hint.
        const restartHint =
          editor.editorId === 'claude-desktop' &&
          (editor.action === 'written' || editor.action === 'overwritten')
            ? ' — quit and relaunch Claude Desktop to activate'
            : '';

        switch (editor.action) {
          case 'written':
            lines.push(`  ${editor.label}${pad}${displayPath}  registered${restartHint}`);
            // Auto-disambiguation fired: surface the conflicting key + its --cwd
            // so the user understands why they got a `-2` suffix.
            if (editor.disambiguatedFrom !== undefined) {
              const conflictCwd = findCwdForKey(editor, editor.disambiguatedFrom);
              const hint = conflictCwd
                ? `(${editor.disambiguatedFrom} is already bound to --cwd ${conflictCwd})`
                : `(${editor.disambiguatedFrom} is already bound to a different project)`;
              lines.push(`  ${' '.repeat(editor.label.length)}${pad}${hint}`);
            }
            break;
          case 'overwritten':
            if (editor.migratedFromKey !== undefined) {
              // Windsurf legacy migration — replace the stock "(--force)" label
              // with the longer form that names both keys.
              lines.push(
                `  ${editor.label}${pad}${displayPath}  overwritten — migrated legacy ${editor.migratedFromKey} → ${editor.serverKey ?? ''}${restartHint}`,
              );
            } else {
              lines.push(
                `  ${editor.label}${pad}${displayPath}  overwritten (--force)${restartHint}`,
              );
            }
            break;
          case 'skipped-existing': {
            // Global-scope targets match by `--cwd`, so the matched key may be
            // a user-chosen suffix (e.g. `open-knowledge-bim-tools`). Surface
            // it in parens when it's not the default `open-knowledge` key.
            const matchedKey = editor.serverKey;
            const keyAnnotation =
              matchedKey !== undefined && matchedKey !== MCP_SERVER_NAME ? ` (${matchedKey})` : '';
            lines.push(`  ${editor.label}${pad}${displayPath}  already configured${keyAnnotation}`);
            break;
          }
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

function parseEditorFlag(value: string): EditorId[] {
  if (value === 'all') return [...ALL_EDITOR_IDS];
  const ids = value.split(',').map((s) => s.trim()) as EditorId[];
  // Validate — resolveEditorTargets throws on unknown IDs
  resolveEditorTargets(ids);
  return ids;
}

/**
 * Detect every editor whose MCP config directory already exists. The parent
 * directory of each editor's `configPath` is the probe location so an empty
 * editor install (no `mcp.json` yet) still counts as detected. Covers both
 * project-scoped editors (Claude `.mcp.json` sibling, Cursor `.cursor/`, VS
 * Code `.vscode/`, Codex `.codex/config.toml`) and Windsurf's user-global
 * `~/.codeium/windsurf/`.
 *
 * Used by the Commander action to default to all detected editors in both
 * TTY (pre-select) and non-TTY (fallback) branches — US-013 / FR-3.1 /
 * D-013.
 */
export function detectInstalledEditors(cwd: string, home?: string): EditorId[] {
  const detected: EditorId[] = [];
  for (const id of ALL_EDITOR_IDS) {
    const target = EDITOR_TARGETS[id];
    let configPath: string;
    try {
      configPath = target.configPath(cwd, home);
    } catch {
      // Unsupported platform (e.g. Claude Desktop on Linux) — skip detection.
      continue;
    }
    if (existsSync(dirname(configPath))) {
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
      '--editor <editors>',
      'Target editor(s): claude, cursor, vscode, codex, windsurf, all (comma-separated) — default: all detected editors (non-TTY) / preselects detected editors (TTY)',
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
        // Interactive prompt — pre-select every detected editor regardless of
        // scope. Empty detection set shows all five unselected alongside a
        // hint (D-019) so the user can still pick manually or cancel and use
        // --editor.
        const { multiselect, isCancel } = await import('@clack/prompts');

        const detected = new Set(detectInstalledEditors(cwd));
        if (detected.size === 0) {
          process.stdout.write(
            'No MCP-capable editors detected — select manually, or cancel and use --editor <all|claude|cursor|vscode|codex|windsurf>.\n',
          );
        }

        const editorChoices = ALL_EDITOR_IDS.flatMap((id) => {
          const target = EDITOR_TARGETS[id];
          let hint: string;
          try {
            hint =
              target.scope === 'global'
                ? target.configPath(cwd).replace(/^\/Users\/[^/]+/, '~')
                : relative(cwd, target.configPath(cwd));
          } catch {
            // Unsupported-platform target (e.g. Claude Desktop on Linux) —
            // omit the entry entirely so the user can't pick something that
            // would later throw on write.
            return [];
          }
          return [
            {
              value: id,
              label: target.label,
              hint,
              initialValue: detected.has(id),
            },
          ];
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
            'No MCP-capable editors detected. Use --editor <all|claude|cursor|vscode|codex|windsurf> to force.\n',
          );
          process.exitCode = 1;
          return;
        }
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
