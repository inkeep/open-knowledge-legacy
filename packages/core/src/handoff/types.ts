/**
 * Shared types for the Open-in-Agent handoff subsystem.
 *
 * Governing spec: `specs/2026-04-21-open-in-agent-desktop/SPEC.md` §6.1.
 * No React, no Node APIs — pure type surface consumable from both the
 * main-process (Electron) and the renderer (app), and from the server
 * (via structural shape compatibility).
 */

/**
 * Supported handoff targets. Four in v0 (PQ2 + PQ3 LOCKED).
 * STORY §Invariants NOT NOW documents out-of-v0 targets (Zed, Windsurf, VS Code).
 */
export type HandoffTarget = 'claude-cowork' | 'claude-code' | 'codex' | 'cursor';

/**
 * Data carried from the UI to the URL builder. Minimal-by-construction per
 * SQ1 DIRECTED: only path + prompt; no title, frontmatter, or excerpt. The
 * target agent reads context via its native attachment parameter
 * (`file=` / `path=` / `workspace=`) + the open-knowledge MCP tool.
 */
export interface HandoffPayload {
  readonly target: HandoffTarget;
  /** Absolute path to the OK project root (OS-native separator). */
  readonly projectDir: string;
  /** Absolute path to the current doc (OS-native separator). */
  readonly docPath: string;
  /** OK-composed prompt; stays under a 1 KB hard cap by AC10. */
  readonly prompt: string;
}

/**
 * Reasons a dispatch may fail. `web-host-cursor-unsupported` is produced by
 * `dispatchCursor` on web host as defense-in-depth — the UI filters the
 * Cursor row as always-disabled on web per E4 DIRECTED, so the reason is
 * never surfaced in normal flow.
 *
 * **DRIFT WARNING — this union is mirrored inline in four places** for
 * IPC-channel / bridge-contract isolation reasons (the bridge surfaces cannot
 * import from `core/handoff/` without pulling the whole handoff package into
 * the Electron preload bundle). When editing this union, the following sites
 * MUST be updated in lockstep; TypeScript catches the drift at call-site
 * boundaries but not at the definitions themselves:
 *
 *   1. `packages/desktop/src/shared/ipc-channels.ts` — `HandoffStatsLine.reason`
 *   2. `packages/desktop/src/shared/bridge-contract.ts` — `OkDesktopBridge.shell.recordHandoff` param
 *   3. `packages/core/src/desktop-bridge.ts` — canonical `OkDesktopBridge.shell.recordHandoff` param
 *   4. `packages/app/src/lib/desktop-bridge-types.ts` — renderer-side augmentation
 *
 * Review Minor #2 follow-up: a compile-time structural-equivalence assertion
 * between this canonical union and each inline mirror would close the gap;
 * for now the breadcrumb keeps future editors from shipping one-of-four.
 */
export type HandoffFailureReason =
  | 'not-installed'
  | 'scheme-blocked'
  | 'web-endpoint-error'
  | 'invalid-payload'
  | 'dispatch-error'
  | 'web-host-cursor-unsupported';

/**
 * Outcome of a dispatch attempt. `ok:true` does NOT guarantee the target app
 * actually launched — `shell.openExternal` resolves on handoff success, not
 * on target-app-visible-to-user. Matches Promise semantics of the underlying
 * Electron API.
 */
export type HandoffOutcome =
  | { ok: true; degradedFeatures?: ReadonlyArray<'prompt' | 'folder' | 'file'> }
  | { ok: false; reason: HandoffFailureReason; detail?: string };

/**
 * Install-detection result. `installed: null` means we haven't checked yet
 * (initial state before the first probe completes). Consumers render as
 * disabled while null.
 */
export interface InstallState {
  readonly installed: boolean | null;
  readonly displayName?: string;
  /** ms since epoch; used by the per-target 10s refresh throttle. */
  readonly lastChecked?: number;
}

/**
 * Context passed to `composePrompt`. Deliberately minimal — see SQ1 DIRECTED.
 */
export interface DocContext {
  /**
   * Path relative to the OK content dir, forward-slash normalized.
   * e.g. `"specs/2026-04-21-open-in-agent-desktop/SPEC.md"`.
   */
  readonly relativePath: string;
}

/**
 * Static metadata for each handoff target. Pure data (no functions) per E1-b
 * DIRECTED — dispatch is a hand-rolled switch in app-layer `dispatch.ts`.
 * `KNOWN_TARGETS: ReadonlyArray<TargetData>` lives in
 * `packages/app/src/lib/handoff/targets.ts` (NOT core, because the data's
 * consumer is app-layer dispatch + UI; the type lives here so both sides
 * agree on shape).
 */
export interface TargetData {
  /** Stable ID — dropdown key, test-matrix key. Kebab-case. */
  readonly id: HandoffTarget;
  /** User-facing display name — fills "Open in <displayName>". */
  readonly displayName: string;
  /**
   * App-brand name shown in disabled-state copy: "Requires <appBrandName>." +
   * "Install <appBrandName> →". Distinct from `displayName` because Cowork and
   * Code are tabs of a single app ("Claude Desktop") — per SPEC §7.3 the
   * disabled message points the user at the installable app, not the tab.
   * Falls back to `displayName` when omitted.
   */
  readonly appBrandName?: string;
  /**
   * URL scheme(s) to probe for install detection. Cowork + Code both list
   * `['claude:']`; install detection dedupes via
   * `new Set(KNOWN_TARGETS.flatMap(t => t.schemes))`.
   */
  readonly schemes: ReadonlyArray<string>;
  /** Download / install page URL — shown in the disabled tooltip. */
  readonly installUrl: string;
  /**
   * True if this target supports a web fallback (claude.ai/new). The actual
   * URL is produced by `buildClaudeAiWebUrl` in `core/handoff/web-fallback-url.ts`.
   * Only `claude-cowork` and `claude-code` set this in v0.
   */
  readonly hasWebFallback?: boolean;
}
