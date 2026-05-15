export type HandoffTarget = 'claude-cowork' | 'claude-code' | 'codex' | 'cursor';

export interface HandoffPayload {
  readonly target: HandoffTarget;
  readonly projectDir: string;
  /** Absolute path to the current doc (OS-native separator).
   *  `''` ⇒ project-scoped handoff (URL builders emit prompt + folder).
   *  non-`''` ⇒ doc-scoped handoff (URL builders emit a cwd-only URL per
   *  precedent #25 — no `file=` attach, no prompt prefill; the agent grounds
   *  via OK MCP). The docPath bytes are NOT threaded into the URL. */
  readonly docPath: string;
  /** OK-composed prompt; stays under a 1 KB hard cap.
   *  Project-scoped: `composeProjectPrompt()` — threaded into the URL.
   *  Doc-scoped: `composePrompt(docContext)` — discarded by the native URL
   *  builders (precedent #25 — cwd-only). The same `composePrompt` output IS
   *  still live on the Claude web-fallback path (`OpenInAgentMenu` and
   *  `OpenInAgentContextSubmenu` → `dispatchClaudeWebFallback` →
   *  `buildClaudeAiWebUrl`), which is consumed by a different code path that
   *  does NOT read `HandoffPayload.prompt`. The field's dead-computation status
   *  is limited to the dispatch path; the prompt-composition function itself
   *  stays live.
   *  `''` is honored defensively (URL builders skip the prompt query param)
   *  but no production caller emits it. */
  readonly prompt: string;
}

export type HandoffFailureReason =
  | 'not-installed'
  | 'scheme-blocked'
  | 'web-endpoint-error'
  | 'invalid-payload'
  | 'dispatch-error'
  | 'web-host-cursor-unsupported';

export type HandoffOutcome =
  | { ok: true; degradedFeatures?: ReadonlyArray<'prompt' | 'folder' | 'file'> }
  | { ok: false; reason: HandoffFailureReason; detail?: string };

export interface InstallState {
  readonly installed: boolean | null;
  readonly displayName?: string;
  readonly lastChecked?: number;
}

export interface DocContext {
  readonly relativePath: string;
}

export interface TargetData {
  readonly id: HandoffTarget;
  readonly displayName: string;
  readonly appBrandName?: string;
  readonly schemes: ReadonlyArray<string>;
  readonly installUrl: string;
  readonly hasWebFallback?: boolean;
  readonly tagline?: string;
}
