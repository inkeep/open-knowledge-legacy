export type MissingOkConfigKind = 'okdir' | 'config';

export const MISSING_OK_CONFIG_MESSAGE =
  'Open Knowledge config not found at .ok/config.yml. Run ok init to scaffold OK in this directory.';

export class MissingOkConfigError extends Error {
  readonly kind: MissingOkConfigKind;
  readonly contentDir: string;
  constructor(kind: MissingOkConfigKind, contentDir: string, options?: { cause?: unknown }) {
    super(MISSING_OK_CONFIG_MESSAGE, options);
    this.name = 'MissingOkConfigError';
    this.kind = kind;
    this.contentDir = contentDir;
  }
}
