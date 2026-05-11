export type EditorId = 'claude' | 'claude-desktop' | 'cursor' | 'codex';

export const ALL_EDITOR_IDS = [
  'claude',
  'claude-desktop',
  'cursor',
  'codex',
] as const satisfies readonly EditorId[];

export const EDITOR_LABELS = {
  claude: 'Claude Code',
  'claude-desktop': 'Claude Desktop',
  cursor: 'Cursor',
  codex: 'Codex',
} as const satisfies Record<EditorId, string>;
