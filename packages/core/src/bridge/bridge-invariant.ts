export type BridgeInvariantSite = 'observer-b' | 'persistence' | 'test-harness';

export interface BridgeInvariantViolation {
  site: BridgeInvariantSite;
  origin?: unknown;
  docName?: string;
  ytextSnapshot: string;
  fragmentMdSnapshot: string;
  unifiedDiff: string;
  stack: string | undefined;
}

export type InvariantViolation = BridgeInvariantViolation;

export class BridgeInvariantViolationError extends Error {
  readonly violation: BridgeInvariantViolation;
  constructor(info: BridgeInvariantViolation) {
    const originLabel =
      typeof info.origin === 'string'
        ? info.origin
        : ((info.origin as { context?: { origin?: string } })?.context?.origin ?? 'unknown-object');
    const docPart = info.docName ? ` doc='${info.docName}'` : '';
    super(
      `Bridge invariant violated [site='${info.site}'${docPart}, origin='${originLabel}'].\n` +
        `  Y.Text (${info.ytextSnapshot.length} chars): ${info.ytextSnapshot.slice(0, 200)}...\n` +
        `  Fragment (${info.fragmentMdSnapshot.length} chars): ${info.fragmentMdSnapshot.slice(0, 200)}...\n` +
        `  Diff:\n${info.unifiedDiff}`,
    );
    this.name = 'BridgeInvariantViolationError';
    this.violation = info;
  }
}
