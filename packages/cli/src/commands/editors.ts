/**
 * Editor MCP target registry.
 *
 * Each editor has a different location and config format for MCP server
 * configuration. This module encodes those differences declaratively so that
 * `init.ts` can loop over targets without per-editor branching.
 */
import { homedir } from 'node:os';
import { join, posix, win32 } from 'node:path';
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

const MCP_SERVER_COMMAND = 'npx';
const MCP_SERVER_ARGS = ['@inkeep/open-knowledge', 'mcp'];

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
  buildEntry: (cwd: string) => Record<string, unknown>;
  /** True when the managed MCP fields already match the target entry. */
  isCompatible: (existing: Record<string, unknown>, cwd: string) => boolean;
  /** Merge only the managed MCP fields into an existing entry. */
  mergeManagedFields: (existing: Record<string, unknown>, cwd: string) => Record<string, unknown>;
  /** Whether the config is project-local or user-global. */
  scope: 'project' | 'global';
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
    isCompatible(existing, cwd) {
      return hasMatchingManagedFields(existing, target.buildEntry(cwd));
    },
    mergeManagedFields(existing, cwd) {
      return mergeManagedFields(existing, target.buildEntry(cwd));
    },
  };
}

export const EDITOR_TARGETS: Record<EditorId, EditorMcpTarget> = {
  claude: createEditorTarget({
    id: 'claude',
    label: 'Claude Code',
    configPath: (cwd) => join(cwd, '.mcp.json'),
    format: 'json',
    topLevelKey: 'mcpServers',
    serverName: () => MCP_SERVER_NAME,
    buildEntry: () => ({ command: MCP_SERVER_COMMAND, args: MCP_SERVER_ARGS }),
    scope: 'project',
    instructionsPath: (cwd) => join(cwd, 'CLAUDE.md'),
  }),
  'claude-desktop': createEditorTarget({
    id: 'claude-desktop',
    label: 'Claude Desktop',
    configPath: (_cwd, home) => resolveClaudeDesktopConfigPath({ home }),
    format: 'json',
    topLevelKey: 'mcpServers',
    serverName: () => MCP_SERVER_NAME,
    buildEntry: () => ({ command: MCP_SERVER_COMMAND, args: MCP_SERVER_ARGS }),
    scope: 'global',
  }),
  cursor: createEditorTarget({
    id: 'cursor',
    label: 'Cursor',
    configPath: (cwd) => join(cwd, '.cursor', 'mcp.json'),
    format: 'json',
    topLevelKey: 'mcpServers',
    serverName: () => MCP_SERVER_NAME,
    buildEntry: () => ({ command: MCP_SERVER_COMMAND, args: MCP_SERVER_ARGS }),
    scope: 'project',
  }),
  vscode: createEditorTarget({
    id: 'vscode',
    label: 'VS Code',
    configPath: (cwd) => join(cwd, '.vscode', 'mcp.json'),
    format: 'json',
    topLevelKey: 'servers',
    serverName: () => MCP_SERVER_NAME,
    buildEntry: () => ({ type: 'stdio', command: MCP_SERVER_COMMAND, args: MCP_SERVER_ARGS }),
    scope: 'project',
  }),
  windsurf: createEditorTarget({
    id: 'windsurf',
    label: 'Windsurf',
    configPath: (_cwd, home) => join(home ?? homedir(), '.codeium', 'windsurf', 'mcp_config.json'),
    format: 'json',
    topLevelKey: 'mcpServers',
    serverName: () => MCP_SERVER_NAME,
    buildEntry: () => ({ command: MCP_SERVER_COMMAND, args: MCP_SERVER_ARGS }),
    scope: 'global',
  }),
  codex: createEditorTarget({
    id: 'codex',
    label: 'Codex',
    configPath: (cwd) => join(cwd, '.codex', 'config.toml'),
    format: 'toml',
    topLevelKey: 'mcp_servers',
    serverName: () => MCP_SERVER_NAME,
    buildEntry: () => ({ command: MCP_SERVER_COMMAND, args: MCP_SERVER_ARGS }),
    scope: 'project',
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
