/**
 * `.okignore` appender — used by the consent dialog's "Ignore patterns"
 * field. Three cases for joining new patterns onto whatever's already there:
 *   (a) file absent / empty   → no separator (avoid a leading blank line
 *                                in a fresh file)
 *   (b) ends with newline     → single `\n` separator (existing trailing
 *                                newline + this `\n` = one blank line gap
 *                                visually)
 *   (c) no trailing newline   → `\n\n` separator (close the prior line +
 *                                one blank line gap)
 *
 * Idempotency on duplicate patterns is the caller's concern; we just append.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function appendOkIgnoreSync(projectDir: string, patterns: string): void {
  const path = join(projectDir, '.okignore');
  const trimmed = patterns.trim();
  if (trimmed.length === 0) return;
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const sep = existing.length === 0 ? '' : !existing.endsWith('\n') ? '\n\n' : '\n';
  writeFileSync(path, `${existing + sep + trimmed}\n`, 'utf8');
}
