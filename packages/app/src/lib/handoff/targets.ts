/**
 * `KNOWN_TARGETS` — pure data describing each Open-in-Agent target. No
 * function fields; dispatch is a hand-rolled switch in `dispatch.ts` with
 * `never` exhaustiveness (not a registry with callbacks).
 *
 * Adding a 5th target is a 5-file change:
 *   (1) `HandoffTarget` union in `packages/core/src/handoff/types.ts`
 *   (2) append an entry here
 *   (3) switch case in `dispatch.ts`
 *   (4) URL builder in `packages/core/src/handoff/<name>-url.ts`
 *   (5) `ALLOWED_SCHEMES` in `packages/desktop/src/main/shell-allowlist.ts`
 * The exhaustiveness check in `dispatch.ts` + the drift-detector test in
 * `shell-allowlist.test.ts` enforce completeness.
 */

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
