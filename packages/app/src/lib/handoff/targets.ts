/**
 * `KNOWN_TARGETS` — pure data constant describing each Open-in-Agent target.
 *
 * Governing spec: `specs/2026-04-21-open-in-agent-desktop/SPEC.md` §6.1.5.
 *
 * Per E1-b DIRECTED (2026-04-21): this is a plain `ReadonlyArray<TargetData>`
 * with NO function fields. Dispatch logic lives in a hand-rolled switch in
 * `packages/app/src/lib/handoff/dispatch.ts` (US-007) with TypeScript `never`
 * exhaustiveness — not a registry with function callbacks.
 *
 * Adding a 5th target is a 5-file change:
 *   (1) add to `HandoffTarget` union in `packages/core/src/handoff/types.ts`
 *   (2) append an entry here
 *   (3) add a switch case in `dispatch.ts`
 *   (4) create a URL builder in `packages/core/src/handoff/<name>-url.ts`
 *   (5) add its scheme to `ALLOWED_SCHEMES` in
 *       `packages/desktop/src/main/shell-allowlist.ts`
 * The exhaustiveness check in `dispatch.ts` + the drift-detector test in
 * `shell-allowlist.test.ts` enforce completeness.
 *
 * Install URLs intentionally target vendor download pages (stable) per
 * SPEC §10 OQ-B DIRECTED. Revisit only if a tooltip link rots post-ship.
 */

import type { TargetData } from '@inkeep/open-knowledge-core';

export const KNOWN_TARGETS = [
  {
    id: 'claude-cowork',
    displayName: 'Claude Cowork',
    schemes: ['claude:'],
    icon: 'Sparkles',
    installUrl: 'https://claude.com/download',
    hasWebFallback: true,
  },
  {
    id: 'claude-code',
    displayName: 'Claude Code',
    schemes: ['claude:'],
    icon: 'Terminal',
    installUrl: 'https://claude.com/download',
    hasWebFallback: true,
  },
  {
    id: 'codex',
    displayName: 'Codex',
    schemes: ['codex:'],
    icon: 'Bot',
    installUrl: 'https://openai.com/codex',
  },
  {
    id: 'cursor',
    displayName: 'Cursor',
    schemes: ['cursor:'],
    icon: 'Code2',
    installUrl: 'https://cursor.com/',
  },
] as const satisfies ReadonlyArray<TargetData>;
