/**
 * Drift catcher for the user-facing labels duplicated across desktop and
 * app packages — `packages/desktop/src/shared/labels.ts` and
 * `packages/app/src/lib/desktop-labels.ts` carry the same string constants
 * because the app package does not import from desktop.
 *
 * Same shape as the M1 invariant `OkDesktopBridge` drift test: read both
 * files, extract the named constant values, assert equality.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DESKTOP_LABELS = join(__dirname, '..', '..', 'src', 'shared', 'labels.ts');
const APP_LABELS = join(__dirname, '..', '..', '..', 'app', 'src', 'lib', 'desktop-labels.ts');

/**
 * Only the with-ellipsis form is mirrored across both packages — it shows up
 * in the File menu (desktop main) AND the ProjectSwitcher dropdown (app
 * renderer). The CommandPalette's no-ellipsis form lives only in the app
 * mirror because main never references it.
 */
const NAMES = ['SWITCH_PROJECT_LABEL_WITH_ELLIPSIS'] as const;

function extractStringConst(src: string, name: string): string | undefined {
  const re = new RegExp(`export\\s+const\\s+${name}\\s*=\\s*(['"])([^'"]*)\\1\\s*;`);
  const m = src.match(re);
  return m?.[2];
}

describe('labels-drift', () => {
  test('desktop + app declare the same Switch-Project label values', () => {
    const desktopSrc = readFileSync(DESKTOP_LABELS, 'utf-8');
    const appSrc = readFileSync(APP_LABELS, 'utf-8');

    for (const name of NAMES) {
      const desktopVal = extractStringConst(desktopSrc, name);
      const appVal = extractStringConst(appSrc, name);
      expect(desktopVal, `${name} missing or unparseable in desktop labels.ts`).toBeDefined();
      expect(appVal, `${name} missing or unparseable in app desktop-labels.ts`).toBeDefined();
      expect(appVal).toBe(desktopVal as string);
    }
  });
});
