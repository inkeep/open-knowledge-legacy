export type HandoffTarget = 'claude-cowork' | 'claude-code' | 'codex' | 'cursor';

export interface HandoffPayload {
  readonly target: HandoffTarget;
  readonly projectDir: string;
  /** Absolute path to the current doc (OS-native separator).
   *  `''` ⇒ project-scoped handoff; URL builders that thread `docPath`
   *  (currently only claude) skip the `file=` param. */
  readonly docPath: string;
  /** OK-composed prompt; stays under a 1 KB hard cap.
   *  Doc-scoped: `composePrompt(docContext)`.
   *  Project-scoped: `composeProjectPrompt()`.
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
