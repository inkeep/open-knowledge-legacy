/**
 * Editor MCP target registry.
 *
 * Each editor has a different location and JSON structure for MCP server
 * configuration. This module encodes those differences declaratively so that
 * `init.ts` can loop over targets without per-editor branching.
 */
import { homedir } from 'node:os';
import { join } from 'node:path';

export type EditorId = 'claude' | 'cursor' | 'vscode' | 'windsurf';

export const ALL_EDITOR_IDS: EditorId[] = ['claude', 'cursor', 'vscode', 'windsurf'];

const MCP_SERVER_COMMAND = 'npx';
const MCP_SERVER_ARGS = ['@inkeep/open-knowledge', 'mcp'];

export interface EditorMcpTarget {
  id: EditorId;
  /** Human-friendly name for CLI output. */
  label: string;
  /** Resolve the absolute path to the MCP config file. */
  configPath: (cwd: string, home?: string) => string;
  /** Top-level JSON key that holds the server map. */
  topLevelKey: 'mcpServers' | 'servers';
  /** Build the server entry object for this editor. */
  buildEntry: () => Record<string, unknown>;
  /** Whether the config is project-local or user-global. */
  scope: 'project' | 'global';
  /** Project-local agent instruction file to inject the Open Knowledge section into, if any. */
  instructionsPath?: (cwd: string) => string;
}

export const EDITOR_TARGETS: Record<EditorId, EditorMcpTarget> = {
  claude: {
    id: 'claude',
    label: 'Claude Code',
    configPath: (cwd) => join(cwd, '.mcp.json'),
    topLevelKey: 'mcpServers',
    buildEntry: () => ({ command: MCP_SERVER_COMMAND, args: MCP_SERVER_ARGS }),
    scope: 'project',
    instructionsPath: (cwd) => join(cwd, 'CLAUDE.md'),
  },
  cursor: {
    id: 'cursor',
    label: 'Cursor',
    configPath: (cwd) => join(cwd, '.cursor', 'mcp.json'),
    topLevelKey: 'mcpServers',
    buildEntry: () => ({ command: MCP_SERVER_COMMAND, args: MCP_SERVER_ARGS }),
    scope: 'project',
    instructionsPath: (cwd) => join(cwd, '.cursorrules'),
  },
  vscode: {
    id: 'vscode',
    label: 'VS Code',
    configPath: (cwd) => join(cwd, '.vscode', 'mcp.json'),
    topLevelKey: 'servers',
    buildEntry: () => ({ type: 'stdio', command: MCP_SERVER_COMMAND, args: MCP_SERVER_ARGS }),
    scope: 'project',
  },
  windsurf: {
    id: 'windsurf',
    label: 'Windsurf',
    configPath: (_cwd, home) => join(home ?? homedir(), '.codeium', 'windsurf', 'mcp_config.json'),
    topLevelKey: 'mcpServers',
    buildEntry: () => ({ command: MCP_SERVER_COMMAND, args: MCP_SERVER_ARGS }),
    scope: 'global',
    instructionsPath: (cwd) => join(cwd, '.windsurfrules'),
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
