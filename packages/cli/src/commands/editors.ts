/**
 * Editor MCP target registry.
 *
 * Each editor has a different location and JSON structure for MCP server
 * configuration. This module encodes those differences declaratively so that
 * `init.ts` can loop over targets without per-editor branching.
 */
import { homedir } from 'node:os';
import { join, posix, win32 } from 'node:path';
import { MCP_SERVER_NAME } from '../constants.ts';

export type EditorId = 'claude' | 'claude-desktop' | 'cursor' | 'vscode' | 'windsurf';

export const ALL_EDITOR_IDS: EditorId[] = [
  'claude',
  'claude-desktop',
  'cursor',
  'vscode',
  'windsurf',
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
  const pathApi = pathApiForPlatform(platformName);
  return pathApi.join(resolveAppSupportPath(options), 'Claude', 'claude_desktop_config.json');
}

export interface EditorMcpTarget {
  id: EditorId;
  /** Human-friendly name for CLI output. */
  label: string;
  /** Resolve the absolute path to the MCP config file. */
  configPath: (cwd: string, home?: string) => string;
  /** Top-level JSON key that holds the server map. */
  topLevelKey: 'mcpServers' | 'servers';
  /** Config key used for this project's MCP server entry. */
  serverName: (cwd: string) => string;
  /** Build the server entry object for this editor. */
  buildEntry: (cwd: string) => Record<string, unknown>;
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

export const EDITOR_TARGETS: Record<EditorId, EditorMcpTarget> = {
  claude: {
    id: 'claude',
    label: 'Claude Code',
    configPath: (cwd) => join(cwd, '.mcp.json'),
    topLevelKey: 'mcpServers',
    serverName: () => MCP_SERVER_NAME,
    buildEntry: () => ({ command: MCP_SERVER_COMMAND, args: MCP_SERVER_ARGS }),
    scope: 'project',
    instructionsPath: (cwd) => join(cwd, 'CLAUDE.md'),
  },
  'claude-desktop': {
    id: 'claude-desktop',
    label: 'Claude Desktop',
    configPath: (_cwd, home) => resolveClaudeDesktopConfigPath({ home }),
    topLevelKey: 'mcpServers',
    serverName: () => MCP_SERVER_NAME,
    buildEntry: () => ({ command: MCP_SERVER_COMMAND, args: MCP_SERVER_ARGS }),
    scope: 'global',
  },
  cursor: {
    id: 'cursor',
    label: 'Cursor',
    configPath: (cwd) => join(cwd, '.cursor', 'mcp.json'),
    topLevelKey: 'mcpServers',
    serverName: () => MCP_SERVER_NAME,
    buildEntry: () => ({ command: MCP_SERVER_COMMAND, args: MCP_SERVER_ARGS }),
    scope: 'project',
  },
  vscode: {
    id: 'vscode',
    label: 'VS Code',
    configPath: (cwd) => join(cwd, '.vscode', 'mcp.json'),
    topLevelKey: 'servers',
    serverName: () => MCP_SERVER_NAME,
    buildEntry: () => ({ type: 'stdio', command: MCP_SERVER_COMMAND, args: MCP_SERVER_ARGS }),
    scope: 'project',
  },
  windsurf: {
    id: 'windsurf',
    label: 'Windsurf',
    configPath: (_cwd, home) => join(home ?? homedir(), '.codeium', 'windsurf', 'mcp_config.json'),
    topLevelKey: 'mcpServers',
    serverName: () => MCP_SERVER_NAME,
    buildEntry: () => ({ command: MCP_SERVER_COMMAND, args: MCP_SERVER_ARGS }),
    scope: 'global',
  },
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
