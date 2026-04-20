/**
 * Editor MCP target registry.
 *
 * Each editor has a different location and JSON structure for MCP server
 * configuration. This module encodes those differences declaratively so that
 * `init.ts` can loop over targets without per-editor branching.
 */
import { homedir } from 'node:os';
import { join } from 'node:path';

export type EditorId = 'claude' | 'cursor' | 'vscode' | 'codex' | 'windsurf' | 'claude-desktop';

export const ALL_EDITOR_IDS: EditorId[] = [
  'claude',
  'cursor',
  'vscode',
  'codex',
  'windsurf',
  'claude-desktop',
];

const MCP_SERVER_COMMAND = 'npx';
const MCP_SERVER_ARGS = ['@inkeep/open-knowledge', 'mcp'];

/** Result shape for the per-target server-key resolution step. */
export interface ResolvedServerKey {
  /** The key under which the server entry should be written. */
  key: string;
  /** Existing entry at that key, if any (used to decide written vs overwritten vs skipped-existing). */
  existingEntry: unknown | undefined;
  /** If auto-disambiguation fired, the key that conflicted with a different cwd. */
  disambiguatedFrom?: string;
  /** If a legacy entry was detected and will be replaced, its old key. */
  migratedFromKey?: string;
}

export interface EditorMcpTarget {
  id: EditorId;
  /** Human-friendly name for CLI output. */
  label: string;
  /** Resolve the absolute path to the MCP config file. */
  configPath: (cwd: string, home?: string) => string;
  /** On-disk config format for this editor. */
  format: 'json' | 'toml';
  /** Top-level JSON key that holds the server map. */
  topLevelKey: 'mcpServers' | 'servers' | 'mcp_servers';
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
  /**
   * Optional hook for global-scope targets that need project-qualified server
   * keys (e.g. Claude Desktop, Windsurf). When absent, the init orchestrator
   * falls back to the default `MCP_SERVER_NAME` key.
   */
  resolveServerKey?: (existingServers: Record<string, unknown>, cwd: string) => ResolvedServerKey;
}

export const EDITOR_TARGETS: Record<EditorId, EditorMcpTarget> = {
  claude: {
    id: 'claude',
    label: 'Claude Code',
    configPath: (cwd) => join(cwd, '.mcp.json'),
    format: 'json',
    topLevelKey: 'mcpServers',
    buildEntry: (_cwd) => ({ command: MCP_SERVER_COMMAND, args: MCP_SERVER_ARGS }),
    scope: 'project',
    instructionsPath: (cwd) => join(cwd, 'CLAUDE.md'),
  },
  cursor: {
    id: 'cursor',
    label: 'Cursor',
    configPath: (cwd) => join(cwd, '.cursor', 'mcp.json'),
    format: 'json',
    topLevelKey: 'mcpServers',
    buildEntry: (_cwd) => ({ command: MCP_SERVER_COMMAND, args: MCP_SERVER_ARGS }),
    scope: 'project',
  },
  vscode: {
    id: 'vscode',
    label: 'VS Code',
    configPath: (cwd) => join(cwd, '.vscode', 'mcp.json'),
    format: 'json',
    topLevelKey: 'servers',
    buildEntry: (_cwd) => ({ type: 'stdio', command: MCP_SERVER_COMMAND, args: MCP_SERVER_ARGS }),
    scope: 'project',
  },
  codex: {
    id: 'codex',
    label: 'Codex',
    configPath: (cwd) => join(cwd, '.codex', 'config.toml'),
    format: 'toml',
    topLevelKey: 'mcp_servers',
    buildEntry: (_cwd) => ({ command: MCP_SERVER_COMMAND, args: MCP_SERVER_ARGS }),
    scope: 'project',
  },
  windsurf: {
    id: 'windsurf',
    label: 'Windsurf',
    configPath: (_cwd, home) => join(home ?? homedir(), '.codeium', 'windsurf', 'mcp_config.json'),
    format: 'json',
    topLevelKey: 'mcpServers',
    buildEntry: (_cwd) => ({ command: MCP_SERVER_COMMAND, args: MCP_SERVER_ARGS }),
    scope: 'global',
  },
  'claude-desktop': {
    id: 'claude-desktop',
    label: 'Claude Desktop',
    // Full wiring (macOS + Windows + unsupported-platform throw) lands in
    // US-003. The stub returns a non-existent sentinel path so the registry
    // is iterable by `detectInstalledEditors` without exercising real init
    // logic — any real attempt to use the target before US-003 will fail at
    // buildEntry.
    configPath: (_cwd, home) =>
      join(
        home ?? homedir(),
        '.open-knowledge-claude-desktop-stub-not-yet-implemented',
        'config.json',
      ),
    format: 'json',
    topLevelKey: 'mcpServers',
    buildEntry: (_cwd) => {
      throw new Error('Claude Desktop target not yet implemented (pending US-003).');
    },
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
