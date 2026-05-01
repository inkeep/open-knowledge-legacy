import type { TargetData } from '@inkeep/open-knowledge-core';

export const KNOWN_TARGETS = [
  {
    id: 'claude-cowork',
    displayName: 'Claude Cowork',
    appBrandName: 'Claude Desktop',
    schemes: ['claude:'],
    installUrl: 'https://claude.com/download',
    hasWebFallback: true,
  },
  {
    id: 'claude-code',
    displayName: 'Claude Code',
    appBrandName: 'Claude Desktop',
    schemes: ['claude:'],
    installUrl: 'https://claude.com/download',
    hasWebFallback: true,
  },
  {
    id: 'codex',
    displayName: 'Codex',
    appBrandName: 'Codex Desktop',
    schemes: ['codex:'],
    installUrl: 'https://openai.com/codex',
  },
  {
    id: 'cursor',
    displayName: 'Cursor',
    schemes: ['cursor:'],
    installUrl: 'https://cursor.com/',
  },
] as const satisfies ReadonlyArray<TargetData>;
