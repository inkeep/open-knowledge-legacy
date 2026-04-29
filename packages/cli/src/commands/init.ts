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
import { dirname, join, relative, resolve } from 'node:path';
import {
  detectClaudeDesktopPresence,
  ensureProjectGit,
  type InstallUserSkillOptions,
  type InstallUserSkillResult,
  installUserSkill,
  MCP_SERVER_NAME,
  ProjectGitInitError,
} from '@inkeep/open-knowledge-server';
import checkbox from '@inquirer/checkbox';
import { Command, Option } from 'commander';
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
import { OK_DIR } from '../constants.ts';
import { initContent } from '../content/init.ts';
import { formatPreviewBlock, type PreviewResult } from '../content/preview.ts';
import { accent, warning } from '../ui/colors.ts';
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
// Scope types + helpers
// ---------------------------------------------------------------------------

type McpScope = 'user' | 'project' | 'both';

const writesUser = (s: McpScope) => s !== 'project';
const writesProject = (s: McpScope) => s !== 'user';

/**
 * Prompt the user interactively to select MCP scope via a checkbox multi-select.
 * Both 'user' and 'project' are pre-selected (default answer: 'both').
 * Returns null when the user clears both checkboxes (equivalent to --no-mcp).
 */
async function promptMcpScope(): Promise<McpScope | null> {
  const choices = await checkbox({
    message: 'Where should the MCP server be configured?\n',
    required: false,
    theme: {
      icon: {
        checked: '[x]',
        unchecked: '[ ]',
      },
    },
    choices: [
      {
        name: 'User-level  (~/.claude.json, ~/.cursor/mcp.json, …)',
        value: 'user' as const,
        checked: true,
      },
      {
        name: 'Project-level  (.mcp.json, .cursor/mcp.json, …)',
        value: 'project' as const,
        checked: true,
      },
    ],
  });

  if (choices.includes('user') && choices.includes('project')) return 'both';
  if (choices.includes('user')) return 'user';
  if (choices.includes('project')) return 'project';
  return null; // neither selected → skip MCP (equivalent to --no-mcp)
}

export async function resolveMcpScope(opts: {
  scope?: McpScope;
  mcp?: boolean;
  isTTY?: boolean;
  promptFn?: () => Promise<McpScope | null>;
}): Promise<McpScope | null> {
  if (opts.mcp === false) return null; // sentinel — --no-mcp short-circuits before this scope is read
  if (opts.scope) return opts.scope;
  const tty = opts.isTTY ?? process.stdout.isTTY;
  if (!tty) return 'both';
  const prompt = opts.promptFn ?? promptMcpScope;
  return prompt();
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EditorMcpResult {
  editorId: EditorId;
  label: string;
  action: 'written' | 'overwritten' | 'skipped-missing' | 'skipped-flag' | 'failed';
  configPath: string;
  serverName: string;
  error?: string;
  /** Set to 'project' when the result came from a project-scope write. */
  configScope?: 'project';
}

interface ProjectConfigResult {
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
  /** Override home directory (test-only, for global editor config paths). */
  home?: string;
  /**
   * Inject a pre-fabricated `installUserSkill` implementation (test hook).
   * Production callers omit this and hit the real `installUserSkill` from
   * `@inkeep/open-knowledge-server`. Introduced per SPEC 2026-04-22 FR6.
   */
  installUserSkill?: (opts?: InstallUserSkillOptions) => Promise<InstallUserSkillResult>;
  /** MCP scope: user-level only, project-level only, or both. */
  scope?: McpScope;
  /** Test hook: override isTTY detection for the interactive scope prompt. */
  isTTY?: boolean;
  /** Test hook: inject a custom promptFn for the interactive scope prompt. */
  promptFn?: () => Promise<McpScope | null>;
}

interface InitCommandResult {
  contentCreated: string[];
  contentUpdated: string[];
  contentSkipped: string[];
  /** Per-editor MCP config results. Empty when `--no-mcp`. */
  editors: EditorMcpResult[];
  /** Project-local MCP configs detected (excluding ones we just wrote). */
  legacyProjectConfigs: ProjectConfigResult[];
  /**
   * Result of the user-global Agent Skill install step (SPEC 2026-04-22 FR6).
   * `undefined` only when `content` scaffolding failed before the install
   * step could run.
   */
  skillInstall?: InstallUserSkillResult;
  /** Content preview result (undefined if preview failed or was not run). */
  preview?: PreviewResult;
  /** Claude Code launch.json result (undefined when Claude is not a selected editor). */
  launchJson?: LaunchJsonResult;
  /** `true` if `ensureProjectGit` ran `git init` during this invocation (SPEC R2 / D9). */
  didGitInit: boolean;
  /**
   * `true` when Claude Desktop's config directory is present on this machine.
   * Used to decide whether to append the Cowork install hint to the summary.
   * Detection reuses `detectClaudeDesktopPresence` from
   * `@inkeep/open-knowledge-server`; returns false on Linux (unsupported).
   */
  claudeDesktopDetected: boolean;
  // Backward-compat fields (derived from the Claude entry or first editor):
  mcpAction: 'written' | 'overwritten' | 'skipped-missing' | 'skipped-flag' | 'failed';
  mcpPath: string;
  mcpError?: string;
  previewWarning?: string;
  /**
   * Labels of editors that were skipped during a project-scope write because
   * they have no standardized project-local config format (e.g. Windsurf,
   * Claude Desktop). Only populated when scope=project|both and at least one
   * editor was skipped for this reason.
   */
  projectScopeUnsupportedLabels?: string[];
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
          runtimeArgs: [resolveDevCliDistPath(), 'ui'],
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
    // Main's #282 refactor fixed the dead ternary my review-fix also targeted
    // (W1) by distinguishing 'merged' (existing entry updated) from 'created'
    // (new entry). Main's version is strictly more informative — keep it.
    return { action: existingIdx >= 0 ? 'merged' : 'created', configPath };
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

/**
 * Per-editor MCP config writer. Exported (US-006) so `@inkeep/open-knowledge`
 * consumers — specifically Electron main's M6b first-launch consent flow via
 * `writeUserMcpConfigs` — can invoke the same write logic that the terminal-
 * origin `ok init` command uses. The `installOptions.skipAvailabilityCheck`
 * flag distinguishes the two call sites: `ok init` enforces
 * `isEditorTargetAvailable` so users don't get empty config dirs for editors
 * they haven't installed; the M6b consent flow bypasses the check because
 * the user explicitly toggled the editor checkbox in the dialog.
 */
export function writeEditorMcpConfig(
  target: EditorMcpTarget,
  cwd: string,
  installOptions: McpInstallOptions,
  home?: string,
  configPathOverride?: string,
): EditorMcpResult {
  const serverName = target.serverName(cwd);
  let configPath: string;
  try {
    configPath = configPathOverride ?? target.configPath(cwd, home);
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

  // M6b bypass (US-006): the consent dialog showed the editor's checkbox and
  // the user explicitly toggled it. Skipping on `isEditorTargetAvailable` would
  // silently drop their choice — treat the click as the consent.
  // Also skip the check for project-scope writes (configPathOverride set) — the
  // project directory always exists by definition.
  if (
    !configPathOverride &&
    !installOptions.skipAvailabilityCheck &&
    !isEditorTargetAvailable(target, cwd, home)
  ) {
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
    ...(configPathOverride !== undefined ? { configScope: 'project' as const } : {}),
  };
}

function collectProjectConfig(
  target: EditorMcpTarget,
  cwd: string,
): ProjectConfigResult | undefined {
  const projectPath = target.projectConfigPath?.(cwd);
  if (!projectPath || !existsSync(projectPath)) return undefined;
  return {
    editorId: target.id,
    label: target.label,
    path: projectPath,
  };
}

// ---------------------------------------------------------------------------
// User-scoped MCP config writer (Electron main entry, NOT CLI `ok init`)
// ---------------------------------------------------------------------------

export interface UserMcpConfigsOptions {
  /**
   * Editors whose MCP config to write. Caller (mcp-wiring.ts confirmHandler)
   * is responsible for filtering out editors whose existing entry is a
   * customized shape that should be preserved — those are classified via
   * `readExistingMcpEntry` + `isPublishedCanonical` and excluded from this
   * array BEFORE the call. This function unconditionally overwrites every
   * editor it receives (aligning with `writeEditorMcpConfig`'s always-rewrite
   * semantic — installs stay aligned with current defaults).
   */
  editors: EditorId[];
  /**
   * Absolute path to the MCP-spawning CLI binary. Written into every editor's
   * entry as `{ command: cliPath, args: ['mcp'] }`. When unset, falls back to
   * the canonical `{command:'npx', args:['@inkeep/open-knowledge','mcp']}` shape.
   */
  cliPath?: string;
  /** Override `$HOME` for resolving user-scoped config paths (test hook). */
  home?: string;
}

/**
 * Write MCP config entries for a set of editors without any of `runInit`'s
 * project-scoped side effects.
 *
 * Specifically does NOT run:
 *   - `ensureProjectGit` — would `git init` wherever `cwd` is (packaged Electron
 *     apps have `process.cwd() === '/'` by default)
 *   - `initContent` — scaffolds `.open-knowledge/` in a project
 *   - `scaffoldLaunchJson` — writes `.claude/launch.json`
 *   - `upsertRootInstructions` — mutates `AGENTS.md` / `CLAUDE.md`
 *   - `collectLegacyProjectConfig` — scans for `.mcp.json` / `.cursor/mcp.json`
 *
 * Per D-M6-R8, this is the entry point Electron main's first-launch MCP
 * consent flow calls after the user clicks Add. The terminal-invoked `ok init`
 * path still uses `runInit` and never sets `cliPath`, so backward compatibility
 * of the `{command:'npx',...}` shape is preserved.
 *
 * Bypasses `isEditorTargetAvailable` via `skipAvailabilityCheck: true` — the
 * user explicitly toggled the editor checkbox; their click IS the consent,
 * so skip-on-missing would silently drop their selection.
 */
export async function writeUserMcpConfigs(opts: UserMcpConfigsOptions): Promise<EditorMcpResult[]> {
  const targets = resolveEditorTargets(opts.editors);
  const installOptions: McpInstallOptions = {
    mode: 'published',
    cliPath: opts.cliPath,
    skipAvailabilityCheck: true,
  };
  // `cwd` is empty — every user-scoped target ignores it (each editor's
  // `configPath` + `serverName` resolves from `home` or a constant).
  return targets.map((target) => writeEditorMcpConfig(target, '', installOptions, opts.home));
}

/**
 * Read a single editor's existing MCP server entry for use with the
 * desktop confirm-flow's canonical-shape classification. Reads the
 * user-scoped config (format-aware — JSON or TOML), looks up
 * `config[topLevelKey][serverName]`, and returns it as a plain object.
 * Returns `null` when the config file is absent, unreadable,
 * unparseable, or has no entry for this editor's server name.
 *
 * **Never-throws contract (load-bearing):** the first-launch consent flow
 * MUST be able to classify every selected editor without aborting on one
 * malformed config. A corrupt user config (e.g., stale
 * `~/.codex/config.toml` from a half-completed third-party edit) on ANY
 * selected editor would otherwise crash `confirmHandler`, leave the
 * marker absent, and create an infinite dialog re-fire loop on the user's
 * machine. Every reachable failure path here returns `null`:
 *   - configPath() throws → null (platform-mismatched target, e.g.
 *     Claude Desktop on Linux)
 *   - readJson/readToml throws → null (unparseable config)
 *   - top-level mcpServers/servers/mcp_servers key absent → null
 *   - top-level key value not a plain object → null (e.g., array)
 *   - server entry value not a plain object → null (e.g., bare string)
 *
 * Note: `null` deliberately conflates "absent" with "malformed" — both mean
 * "no compatible existing entry to merge into" from the desktop classifier's
 * perspective. The downstream `writeEditorMcpConfig` re-reads via the same
 * format-aware parser and would itself throw on truly corrupt files; that
 * write-side error path is what surfaces the corruption to the user via
 * the `mcp-wiring-write-failed` event in `mcp-wiring.ts`.
 */
export function readExistingMcpEntry(
  target: EditorMcpTarget,
  cwd: string,
  home?: string,
): Record<string, unknown> | null {
  let configPath: string;
  try {
    configPath = target.configPath(cwd, home);
  } catch {
    return null;
  }
  let config: Record<string, unknown>;
  try {
    config = target.format === 'toml' ? readTomlConfig(configPath) : readJsonConfig(configPath);
  } catch {
    return null;
  }
  const servers = config[target.topLevelKey];
  if (!isObject(servers)) return null;
  const existing = servers[target.serverName(cwd)];
  if (!isObject(existing)) return null;
  return existing;
}

// ---------------------------------------------------------------------------
// Core init logic
// ---------------------------------------------------------------------------

export async function runInit(options: InitCommandOptions = {}): Promise<InitCommandResult> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const installOptions: McpInstallOptions = {
    mode: options.devMcp ? 'dev' : 'published',
  };

  // 0. Ensure the project has a `.git/` (SPEC D9 — `ok init` is the explicit
  // "set this project up" verb, so it does the heavier side-effect too).
  // Propagates `ProjectGitInitError` on git-missing — caller exits non-zero.
  const gitResult = await ensureProjectGit(cwd);

  // 1. Scaffold .open-knowledge/
  let contentResult: ReturnType<typeof initContent>;
  try {
    contentResult = initContent(cwd);
  } catch (err) {
    const fallbackPath = EDITOR_TARGETS.claude.configPath(cwd, options.home);
    return {
      contentCreated: [],
      contentUpdated: [],
      contentSkipped: [],
      editors: [],
      legacyProjectConfigs: [],
      didGitInit: gitResult.didInit,
      claudeDesktopDetected: false,
      mcpAction: 'failed',
      mcpPath: fallbackPath,
      mcpError: `Content scaffolding failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const scope = await resolveMcpScope({
    scope: options.scope,
    mcp: options.mcp,
    isTTY: options.isTTY,
    promptFn: options.promptFn,
  });

  // 2. Wire MCP config per editor (unless --no-mcp). Defaults are scope-aware:
  // user-level writes stay limited to editors detected on this machine, while
  // project-level writes create all standardized project config files so a repo
  // can be prepared for teammates who use different editors.
  const userEditorIds = options.editors ?? detectInstalledEditors(cwd, options.home);
  const projectEditorIds =
    options.editors ??
    ALL_EDITOR_IDS.filter((id) => EDITOR_TARGETS[id].projectConfigPath !== undefined);
  const userTargets = resolveEditorTargets(userEditorIds as EditorId[]);
  const projectTargets = resolveEditorTargets(projectEditorIds as EditorId[]);
  const skipMcp = options.mcp === false || scope === null;
  const selectedTargets = Array.from(
    new Map(
      [...userTargets, ...(skipMcp ? [] : projectTargets)].map((target) => [target.id, target]),
    ).values(),
  );
  const availableTargets = userTargets.filter((target) =>
    isEditorTargetAvailable(target, cwd, options.home),
  );

  const editorResults: EditorMcpResult[] = [];
  // Track project-scope paths we wrote so we can suppress them from the notice.
  const writtenProjectPaths = new Set<string>();

  for (const target of selectedTargets) {
    if (skipMcp) {
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

    if (writesUser(scope) && userTargets.includes(target)) {
      editorResults.push(writeEditorMcpConfig(target, cwd, installOptions, options.home));
    }
    if (writesProject(scope) && projectTargets.includes(target) && target.projectConfigPath) {
      const projPath = target.projectConfigPath(cwd);
      const projResult = writeEditorMcpConfig(target, cwd, installOptions, options.home, projPath);
      editorResults.push(projResult);
      if (projResult.action === 'written' || projResult.action === 'overwritten') {
        writtenProjectPaths.add(projPath);
      }
    }
  }

  // Editors skipped for project-scope because they have no project-local config format.
  const projectScopeUnsupportedLabels =
    !skipMcp && scope !== null && writesProject(scope)
      ? projectTargets.filter((t) => !t.projectConfigPath).map((t) => t.label)
      : undefined;

  const legacyProjectConfigs = skipMcp
    ? []
    : availableTargets
        .map((target) => collectProjectConfig(target, cwd))
        .filter((result): result is ProjectConfigResult => result !== undefined)
        // Suppress paths we just wrote during project-scope install.
        .filter((result) => !writtenProjectPaths.has(result.path));

  // 3. Scaffold .claude/launch.json when Claude Code is a selected editor.
  // hasClaude checks availableTargets (existence of ~/.claude/), not the full
  // targets list, so scope=project writes .mcp.json but skips launch.json when
  // ~/.claude/ is absent (e.g. CI). This is intentional: launch.json targets a
  // running editor instance, not a committed project artifact.
  const hasClaude = availableTargets.some((target) => target.id === 'claude');
  const launchJson = hasClaude && !skipMcp ? scaffoldLaunchJson(cwd, installOptions) : undefined;

  // Per SPEC 2026-04-22 (D2 LOCKED / FR1): `ok init` no longer writes
  // to root AGENTS.md / CLAUDE.md. Behavioral guidance ships via (1)
  // compressed MCP instructions handshake, (2) per-tool MCP tool
  // descriptions, and (3) the user-global Agent Skill installed via
  // `installUserSkill` from @inkeep/open-knowledge-server.

  // 4. Install the user-global Agent Skill (SPEC FR6 / D17). Non-fatal per
  // D6 — init exits 0 even on install failure; users see a warning + a
  // manual-install hint in the summary.
  const installSkill = options.installUserSkill ?? installUserSkill;
  const skillInstall = await installSkill({ home: options.home });

  // 5. Detect Claude Desktop for the Cowork install hint (SPEC 2026-04-24
  // D12 / FR5). Non-fatal — just controls whether the summary surfaces the
  // hint line. Linux returns false (Anthropic doesn't ship a Linux build).
  const claudeDesktopDetected = detectClaudeDesktopPresence({ home: options.home });

  // Derive backward-compat fields from the Claude entry (preferred) or first result
  const defaultAction: EditorMcpResult['action'] = skipMcp ? 'skipped-flag' : 'skipped-missing';
  const primary = editorResults.find((r) => r.editorId === 'claude') ??
    editorResults[0] ?? {
      action: defaultAction,
      configPath: EDITOR_TARGETS.claude.configPath(cwd, options.home),
    };

  return {
    contentCreated: contentResult.created,
    contentUpdated: contentResult.updated,
    contentSkipped: contentResult.skipped,
    editors: editorResults,
    legacyProjectConfigs,
    launchJson,
    skillInstall,
    didGitInit: gitResult.didInit,
    claudeDesktopDetected,
    mcpAction: primary.action,
    mcpPath: primary.configPath,
    mcpError: 'error' in primary ? (primary as EditorMcpResult).error : undefined,
    projectScopeUnsupportedLabels,
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

  // Auto-git-init disclosure (SPEC R5 / D9) — surfaced when ensureProjectGit
  // ran `git init` during this invocation. Silent when the project already
  // had `.git/`.
  if (result.didGitInit) {
    lines.push(`Initialized git repo at ${cwd}/.git/ (default branch: main)`);
  }

  // Content scaffolding summary
  const okDir = join(cwd, OK_DIR);
  if (result.contentCreated.length > 0 || result.contentUpdated.length > 0) {
    lines.push(`Content scaffolded at ${okDir}/`);
    if (result.contentCreated.length > 0) {
      lines.push(`  Created: ${result.contentCreated.join(', ')}`);
    }
    if (result.contentUpdated.length > 0) {
      lines.push(`  Updated: ${result.contentUpdated.join(', ')}`);
    }
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
    if (result.mcpAction === 'skipped-flag') {
      lines.push('  MCP config not written — use without --no-mcp to configure editors');
    } else if (
      result.projectScopeUnsupportedLabels &&
      result.projectScopeUnsupportedLabels.length > 0
    ) {
      const names = result.projectScopeUnsupportedLabels.join(', ');
      const verb = result.projectScopeUnsupportedLabels.length === 1 ? 'does' : 'do';
      lines.push(`  ${names} ${verb} not support project-level config; skipped`);
    } else {
      lines.push('  No supported editor config directories detected; skipped MCP registration');
    }
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
      const scopeTag = editor.configScope === 'project' ? ' (project)' : '';
      const labelWithScope = `${editor.label}${scopeTag}`;
      const pad = ' '.repeat(Math.max(1, 20 - labelWithScope.length));
      const restartHint =
        editor.editorId === 'claude-desktop' &&
        (editor.action === 'written' || editor.action === 'overwritten')
          ? ' — quit and relaunch Claude Desktop to activate'
          : '';
      switch (editor.action) {
        case 'written':
          lines.push(
            `  ${labelWithScope}${pad}${displayPath}  registered${serverNameNote}${restartHint}`,
          );
          break;
        case 'overwritten':
          lines.push(
            `  ${labelWithScope}${pad}${displayPath}  updated${serverNameNote}${restartHint}`,
          );
          break;
        case 'skipped-missing':
          lines.push(`  ${labelWithScope}${pad}${displayPath}  config root missing; skipped`);
          break;
        case 'failed':
          lines.push(`  ${labelWithScope}${pad}${displayPath}  FAILED: ${editor.error}`);
          break;
        case 'skipped-flag':
          break;
      }
      if (editor.editorId === 'claude' && result.launchJson) {
        lines.push(formatLaunchJsonSummary(result.launchJson));
      }
    }
    if (result.projectScopeUnsupportedLabels && result.projectScopeUnsupportedLabels.length > 0) {
      const names = result.projectScopeUnsupportedLabels.join(', ');
      const verb = result.projectScopeUnsupportedLabels.length === 1 ? 'does' : 'do';
      lines.push(`  ${names} ${verb} not support project-level config; skipped`);
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
    lines.push('Project MCP configs found:');
    for (const proj of result.legacyProjectConfigs) {
      lines.push(`  ${proj.label}  ${relative(cwd, proj.path)}`);
    }
    lines.push(
      '  These project-local files may override the global config. Remove them if you want fully user-scoped MCP setup in this project.',
    );
  }

  // Root instructions (AGENTS.md) summary — removed per SPEC 2026-04-22
  // (D2 LOCKED / FR1). `runInit` no longer writes to root AGENTS.md /
  // CLAUDE.md; skill-install replaces it. Output block deleted along with
  // the upstream behavior.

  // User-global skill install summary (SPEC 2026-04-22 FR6 / D17)
  if (result.skillInstall) {
    lines.push('');
    lines.push('User-global skill:');
    switch (result.skillInstall) {
      case 'installed':
        lines.push('  open-knowledge  installed to detected agent hosts via `npx skills`');
        break;
      case 'skip-current':
        lines.push('  open-knowledge  already installed at current version');
        break;
      case 'failed':
        lines.push(
          `  ${warning('open-knowledge  install failed — MCP still configured; run manually:')}`,
        );
        lines.push(
          `  ${warning("  npx skills@~1.5.0 add <bundled-path> --agent '*' -g -y --copy")}`,
        );
        break;
    }
  }

  // Chat & Cowork install hint (SPEC 2026-04-24 FR5 / D12). Surfaced only
  // when the Claude Desktop App's config dir exists on this machine.
  // `npx skills` covers Claude Code (including the Code tab inside the
  // Desktop App) but not Claude Chat or Claude Cowork modes — those read
  // from a separate, isolated Skills list and need a manual `.skill`
  // install via `ok install-skill`.
  if (result.claudeDesktopDetected) {
    lines.push('');
    lines.push(
      `Claude Desktop App detected. To enable in Claude Chat & Cowork, run: ${accent('ok install-skill')}`,
    );
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
    // Deduplicate by editorId: scope=both produces two entries per editor
    // (user-scope + project-scope) with the same label.
    const seen = new Set<EditorId>();
    const configuredLabels = result.editors
      .filter((e) => e.action === 'written' || e.action === 'overwritten')
      .filter((e) => !seen.has(e.editorId) && seen.add(e.editorId))
      .map((e) => e.label);

    lines.push('');
    lines.push('Next steps:');
    lines.push(`  1. Open your editor (${configuredLabels.join(' / ')})`);
    lines.push('  2. Approve the MCP server when prompted');
    lines.push('  3. (Optional) scaffold the starter knowledge-base structure:');
    lines.push('     - ok seed');
    lines.push('  4. Use the three MCP workflow tools as you build the wiki:');
    lines.push('     - mcp__open-knowledge__ingest      — capture an external source');
    lines.push('     - mcp__open-knowledge__research    — gather sources and write findings');
    lines.push('     - mcp__open-knowledge__consolidate — promote research to canonical articles');
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
    .addOption(
      new Option(
        '--scope <scope>',
        'Write MCP config at user level, project level, or both',
      ).choices(['user', 'project', 'both']),
    )
    .action(async (opts: { mcp?: boolean; devMcp?: boolean; scope?: McpScope }) => {
      const cwd = process.cwd();

      let result: InitCommandResult;
      try {
        result = await runInit({
          cwd,
          mcp: opts.mcp,
          devMcp: opts.devMcp,
          scope: opts.scope,
        });
      } catch (err) {
        if (err instanceof ProjectGitInitError) {
          process.stderr.write(
            "open-knowledge requires git to initialize a parent repo. Install git or run 'git init' yourself, then re-run.\n",
          );
          if (err.stderr) process.stderr.write(`${err.stderr.trim()}\n`);
          process.exitCode = 1;
          return;
        }
        throw err;
      }

      try {
        const { previewContent } = await import('../content/preview.ts');
        const { loadConfig } = await import('../config/loader.ts');
        const { resolveContentDir } = await import('@inkeep/open-knowledge-server');
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
