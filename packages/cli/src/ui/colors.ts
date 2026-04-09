/**
 * Semantic color helpers wrapping picocolors.
 *
 * picocolors reads NO_COLOR/FORCE_COLOR at require() time, so we lazy-load
 * it via createRequire. This guarantees cli.ts's argv detection
 * (--no-color / --color) has already set env vars before picocolors evaluates.
 */
import { createRequire } from 'node:module';

const _require = createRequire(import.meta.url);

interface PicoColors {
  isColorSupported: boolean;
  red: (s: string | number) => string;
  yellow: (s: string | number) => string;
  green: (s: string | number) => string;
  cyan: (s: string | number) => string;
  gray: (s: string | number) => string;
  bold: (s: string | number) => string;
}

let _pc: PicoColors | undefined;

function pc(): PicoColors {
  if (!_pc) {
    _pc = _require('picocolors') as PicoColors;
  }
  return _pc;
}

/** Red — errors and failures */
export const error = (s: string): string => pc().red(s);

/** Yellow — warnings */
export const warning = (s: string): string => pc().yellow(s);

/** Green — success messages */
export const success = (s: string): string => pc().green(s);

/** Cyan — informational highlights and paths */
export const info = (s: string): string => pc().cyan(s);

/** Gray — secondary/dim text */
export const dim = (s: string): string => pc().gray(s);

/** Bold — emphasis and accents */
export const accent = (s: string): string => pc().bold(s);

/** Whether color output is currently supported/enabled */
export const isColorEnabled = (): boolean => pc().isColorSupported;

/** Wrap text in an OSC 8 clickable hyperlink (supported by most modern terminals) */
export function link(text: string, url: string): string {
  if (!pc().isColorSupported) return text;
  return `\u001B]8;;${url}\u0007${text}\u001B]8;;\u0007`;
}

/**
 * Reset cached picocolors instance — forces re-evaluation on next use.
 * Exported for testing only.
 */
export function _resetForTesting(): void {
  _pc = undefined;
}
