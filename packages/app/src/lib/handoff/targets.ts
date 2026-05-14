import type { TargetData } from '@inkeep/open-knowledge-core';

export const KNOWN_TARGETS = [
  {
    id: 'claude-cowork',
    displayName: 'Claude Cowork',
    appBrandName: 'Claude Desktop',
    schemes: ['claude:'],
    installUrl: 'https://claude.com/download',
    hasWebFallback: true,
    tagline: "Conversational pairing in Claude Desktop's Cowork tab.",
  },
  {
    id: 'claude-code',
    displayName: 'Claude Code',
    appBrandName: 'Claude Desktop',
    schemes: ['claude:'],
    installUrl: 'https://claude.com/download',
    hasWebFallback: true,
    tagline: "Agentic coding in Claude Desktop's Code tab.",
  },
  {
    id: 'codex',
    displayName: 'Codex',
    appBrandName: 'Codex Desktop',
    schemes: ['codex:'],
    installUrl: 'https://openai.com/codex',
    tagline: "OpenAI's coding agent, terminal-native.",
  },
  {
    id: 'cursor',
    displayName: 'Cursor',
    schemes: ['cursor:'],
    installUrl: 'https://cursor.com/',
    tagline: 'AI-first VS Code fork with multi-file edits.',
  },
] as const satisfies ReadonlyArray<TargetData>;
