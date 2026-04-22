/**
 * Public surface of the Open-in-Agent handoff subsystem.
 *
 * Governing spec: `specs/2026-04-21-open-in-agent-desktop/SPEC.md`.
 * Core is "shared, no React, no Node APIs" — this barrel re-exports only
 * pure string I/O and type shapes. Dispatch orchestration, UI, and the
 * `KNOWN_TARGETS` data constant live in `packages/app/src/lib/handoff/`.
 */

export { buildClaudeUrl } from './claude-url.ts';
export { buildCodexUrl } from './codex-url.ts';
export { buildCursorUrl } from './cursor-url.ts';
export { composePrompt } from './prompt-composer.ts';
export type {
  DocContext,
  HandoffFailureReason,
  HandoffOutcome,
  HandoffPayload,
  HandoffTarget,
  InstallState,
  TargetData,
} from './types.ts';
export { buildClaudeAiWebUrl } from './web-fallback-url.ts';
