/**
 * Editor MCP target registry.
 *
 * Each editor has a different location and config format for MCP server
 * configuration. This module encodes those differences declaratively so that
 * `init.ts` can loop over targets without per-editor branching.
 */
import { homedir } from 'node:os';
import { basename, dirname, join, posix, resolve, sep, win32 } from 'node:path';
import { MCP_SERVER_NAME } from '../constants.ts';
import { isObject } from '../utils/is-object.ts';

export type EditorId = 'claude' | 'claude-desktop' | 'cursor' | 'vscode' | 'windsurf' | 'codex';

export const ALL_EDITOR_IDS: EditorId[] = [
  'claude',
  'claude-desktop',
  'cursor',
  'vscode',
  'windsurf',
  'codex',
];

const PUBLISHED_MCP_SERVER_COMMAND = 'npx';
const PUBLISHED_MCP_SERVER_ARGS = ['@inkeep/open-knowledge', 'mcp'];
const DEV_MCP_SERVER_COMMAND = 'node';
const DEV_MCP_ENV = {
  MCP_DEBUG: '1',
  OK_LOG_FILE: '/tmp/ok-mcp.log',
} as const;

export type McpInstallMode = 'published' | 'dev';

export interface McpInstallOptions {
  mode?: McpInstallMode;
  cliEntryPath?: string;
}

export function resolveDevCliDistPath(cliEntryPath = process.argv[1]): string {
  if (!cliEntryPath) {
    throw new Error(
      'Cannot infer the local CLI entry for --dev-mcp because process.argv[1] is empty.',
    );
  }

  const resolvedEntry = resolve(cliEntryPath);
  if (basename(resolvedEntry) === 'cli.mjs' && basename(dirname(resolvedEntry)) === 'dist') {
    return resolvedEntry;
  }

  const pathParts = resolvedEntry.split(sep);
  const packagesIndex = pathParts.lastIndexOf('packages');
  if (packagesIndex === -1 || pathParts[packagesIndex + 1] !== 'cli') {
    throw new Error(
      `Cannot infer the repo root for --dev-mcp from ${resolvedEntry}. Run the local CLI from this repo so the built dist path can be derived.`,
    );
  }

  const rootParts = pathParts.slice(0, packagesIndex);
  const repoRoot = rootParts.length === 0 ? sep : rootParts.join(sep);
  return join(repoRoot, 'packages', 'cli', 'dist', 'cli.mjs');
}

function buildManagedServerEntry(options: McpInstallOptions = {}): Record<string, unknown> {
  if (options.mode === 'dev') {
    return {
      command: DEV_MCP_SERVER_COMMAND,
      args: [resolveDevCliDistPath(options.cliEntryPath), 'mcp'],
      env: { ...DEV_MCP_ENV },
    };
  }

  return {
    command: PUBLISHED_MCP_SERVER_COMMAND,
    args: [...PUBLISHED_MCP_SERVER_ARGS],
  };
}

interface AppSupportOptions {
  home?: string;
  platformName?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
}

function pathApiForPlatform(platformName: NodeJS.Platform) {
  return platformName === 'win32' ? win32 : posix;
}

export function resolveAppSupportPath(options: AppSupportOptions = {}): string {
  const platformName = options.platformName ?? process.platform;
  const home = options.home ?? homedir();
  const env = options.env ?? process.env;
  const pathApi = pathApiForPlatform(platformName);

  if (platformName === 'darwin') {
    return pathApi.join(home, 'Library', 'Application Support');
  }

  if (platformName === 'win32') {
    return env.APPDATA ?? pathApi.join(home, 'AppData', 'Roaming');
  }

  return env.XDG_CONFIG_HOME ?? pathApi.join(home, '.config');
}

export function resolveClaudeCodeConfigPath(options: AppSupportOptions = {}): string {
  const platformName = options.platformName ?? process.platform;
  const home = options.home ?? homedir();
  return pathApiForPlatform(platformName).join(home, '.claude.json');
}

export function resolveClaudeDesktopConfigPath(options: AppSupportOptions = {}): string {
  const platformName = options.platformName ?? process.platform;
  const home = options.home ?? homedir();
  const env = options.env ?? process.env;

  if (platformName === 'darwin') {
    return posix.join(
      home,
      'Library',
      'Application Support',
      'Claude',
      'claude_desktop_config.json',
    );
  }

  if (platformName === 'win32') {
    const appData = env.APPDATA ?? win32.join(home, 'AppData', 'Roaming');
    return win32.join(appData, 'Claude', 'claude_desktop_config.json');
  }

  throw new Error(`Claude Desktop is not available on ${platformName}. Supported: macOS, Windows.`);
}

export function resolveCursorConfigPath(options: AppSupportOptions = {}): string {
  const platformName = options.platformName ?? process.platform;
  const home = options.home ?? homedir();
  return pathApiForPlatform(platformName).join(home, '.cursor', 'mcp.json');
}

export function resolveVsCodeConfigPath(options: AppSupportOptions = {}): string {
  const platformName = options.platformName ?? process.platform;
  return pathApiForPlatform(platformName).join(
    resolveAppSupportPath(options),
    'Code',
    'User',
    'mcp.json',
  );
}

export function resolveWindsurfConfigPath(options: AppSupportOptions = {}): string {
  const platformName = options.platformName ?? process.platform;
  const home = options.home ?? homedir();
  return pathApiForPlatform(platformName).join(home, '.codeium', 'windsurf', 'mcp_config.json');
}

export function resolveCodexHomePath(options: AppSupportOptions = {}): string {
  const platformName = options.platformName ?? process.platform;
  const home = options.home ?? homedir();
  const env = options.env ?? process.env;
  return env.CODEX_HOME ?? pathApiForPlatform(platformName).join(home, '.codex');
}

export function resolveCodexConfigPath(options: AppSupportOptions = {}): string {
  const platformName = options.platformName ?? process.platform;
  return pathApiForPlatform(platformName).join(resolveCodexHomePath(options), 'config.toml');
}

export interface EditorMcpTarget {
  id: EditorId;
  /** Human-friendly name for CLI output. */
  label: string;
  /** Resolve the absolute path to the MCP config file. */
  configPath: (cwd: string, home?: string) => string;
  /** On-disk config format for this editor. */
  format: 'json' | 'toml';
  /** Top-level key that holds the server map. */
  topLevelKey: 'mcpServers' | 'servers' | 'mcp_servers';
  /** Config key used for this project's MCP server entry. */
  serverName: (cwd: string) => string;
  /** Build the server entry object for this editor. */
  buildEntry: (cwd: string, options?: McpInstallOptions) => Record<string, unknown>;
  /** True when the managed MCP fields already match the target entry. */
  isCompatible: (
    existing: Record<string, unknown>,
    cwd: string,
    options?: McpInstallOptions,
  ) => boolean;
  /** Merge only the managed MCP fields into an existing entry. */
  mergeManagedFields: (
    existing: Record<string, unknown>,
    cwd: string,
    options?: McpInstallOptions,
  ) => Record<string, unknown>;
  /** Whether the config is project-local or user-global. */
  scope: 'project' | 'global';
  /** Filesystem path whose existence implies the editor is installed. */
  detectPath?: (cwd: string, home?: string) => string;
  /** Legacy project-local MCP config path from pre-global installs, if any. */
  legacyProjectConfigPath?: (cwd: string) => string;
  /**
   * Project-local agent instruction file to inject the Open Knowledge section
   * into, if any. Claude reads CLAUDE.md; every other editor picks up the
   * tool-agnostic root AGENTS.md which `open-knowledge init` always writes.
   * Only declared for editors that can't read AGENTS.md directly.
   */
  instructionsPath?: (cwd: string) => string;
}

function managedFieldEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, index) => managedFieldEquals(value, b[index]));
  }
  if (isObject(a) && isObject(b)) {
    const aKeys = Object.keys(a).sort();
    const bKeys = Object.keys(b).sort();
    return (
      aKeys.length === bKeys.length &&
      aKeys.every((key, index) => key === bKeys[index]) &&
      aKeys.every((key) => managedFieldEquals(a[key], b[key]))
    );
  }
  return false;
}

function hasMatchingManagedFields(
  existing: Record<string, unknown>,
  managed: Record<string, unknown>,
): boolean {
  return Object.entries(managed).every(([key, value]) => managedFieldEquals(existing[key], value));
}

function mergeManagedFields(
  existing: Record<string, unknown>,
  managed: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...existing,
    ...managed,
  };
}

function createEditorTarget(
  target: Omit<EditorMcpTarget, 'isCompatible' | 'mergeManagedFields'>,
): EditorMcpTarget {
  return {
    ...target,
    isCompatible(existing, cwd, options) {
      return hasMatchingManagedFields(existing, target.buildEntry(cwd, options));
    },
    mergeManagedFields(existing, cwd, options) {
      return mergeManagedFields(existing, target.buildEntry(cwd, options));
    },
  };
}

export const EDITOR_TARGETS: Record<EditorId, EditorMcpTarget> = {
  claude: createEditorTarget({
    id: 'claude',
    label: 'Claude Code',
    configPath: (_cwd, home) => resolveClaudeCodeConfigPath({ home }),
    format: 'json',
    topLevelKey: 'mcpServers',
    serverName: () => MCP_SERVER_NAME,
    buildEntry: (_cwd, options) => buildManagedServerEntry(options),
    scope: 'global',
    detectPath: (_cwd, home) => join(home ?? homedir(), '.claude'),
    legacyProjectConfigPath: (cwd) => join(cwd, '.mcp.json'),
    instructionsPath: (cwd) => join(cwd, 'CLAUDE.md'),
  }),
  'claude-desktop': createEditorTarget({
    id: 'claude-desktop',
    label: 'Claude Desktop',
    configPath: (_cwd, home) => resolveClaudeDesktopConfigPath({ home }),
    format: 'json',
    topLevelKey: 'mcpServers',
    serverName: () => MCP_SERVER_NAME,
    buildEntry: (_cwd, options) => buildManagedServerEntry(options),
    scope: 'global',
    detectPath: (_cwd, home) => dirname(resolveClaudeDesktopConfigPath({ home })),
  }),
  cursor: createEditorTarget({
    id: 'cursor',
    label: 'Cursor',
    configPath: (_cwd, home) => resolveCursorConfigPath({ home }),
    format: 'json',
    topLevelKey: 'mcpServers',
    serverName: () => MCP_SERVER_NAME,
    buildEntry: (_cwd, options) => buildManagedServerEntry(options),
    scope: 'global',
    detectPath: (_cwd, home) => dirname(resolveCursorConfigPath({ home })),
    legacyProjectConfigPath: (cwd) => join(cwd, '.cursor', 'mcp.json'),
  }),
  vscode: createEditorTarget({
    id: 'vscode',
    label: 'VS Code',
    configPath: (_cwd, home) => resolveVsCodeConfigPath({ home }),
    format: 'json',
    topLevelKey: 'servers',
    serverName: () => MCP_SERVER_NAME,
    buildEntry: (_cwd, options) => ({ type: 'stdio', ...buildManagedServerEntry(options) }),
    scope: 'global',
    detectPath: (_cwd, home) => dirname(resolveVsCodeConfigPath({ home })),
    legacyProjectConfigPath: (cwd) => join(cwd, '.vscode', 'mcp.json'),
  }),
  windsurf: createEditorTarget({
    id: 'windsurf',
    label: 'Windsurf',
    configPath: (_cwd, home) => resolveWindsurfConfigPath({ home }),
    format: 'json',
    topLevelKey: 'mcpServers',
    serverName: () => MCP_SERVER_NAME,
    buildEntry: (_cwd, options) => buildManagedServerEntry(options),
    scope: 'global',
    detectPath: (_cwd, home) => dirname(resolveWindsurfConfigPath({ home })),
  }),
  codex: createEditorTarget({
    id: 'codex',
    label: 'Codex',
    configPath: (_cwd, home) => resolveCodexConfigPath({ home }),
    format: 'toml',
    topLevelKey: 'mcp_servers',
    serverName: () => MCP_SERVER_NAME,
    buildEntry: (_cwd, options) => buildManagedServerEntry(options),
    scope: 'global',
    detectPath: (_cwd, home) => dirname(resolveCodexConfigPath({ home })),
    legacyProjectConfigPath: (cwd) => join(cwd, '.codex', 'config.toml'),
  }),
};

/** Validate and resolve editor IDs to targets. Throws on unknown IDs. */
export function resolveEditorTargets(ids: EditorId[]): EditorMcpTarget[] {
  const unknown = ids.filter((id) => !(id in EDITOR_TARGETS));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown editor(s): ${unknown.join(', ')}. Valid options: ${ALL_EDITOR_IDS.join(', ')}`,
    );
  }
  return ids.map((id) => EDITOR_TARGETS[id]);
}
