/**
 * Screenshot helper for §10.7b — cropped screenshots for human review.
 *
 * Captures tightly-cropped screenshots of specific decorated DOM elements,
 * writes to tmp/qa-screenshots/<date>-phase-<N>/<construct>/<variant>-<theme>.png,
 * and appends to MANIFEST.md.
 */

import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Locator } from '@playwright/test';

const QA_SCREENSHOTS_DIR = join(process.cwd(), 'tmp', 'qa-screenshots');

function getDatePrefix(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface CaptureOptions {
  fixture: string;
  construct: string;
  variant: string;
  theme: 'light' | 'dark';
  phase: number;
}

export async function captureScreenshot(
  locator: Locator,
  options: CaptureOptions,
): Promise<string> {
  const { construct, variant, theme, phase } = options;
  const datePrefix = getDatePrefix();
  const dir = join(QA_SCREENSHOTS_DIR, `${datePrefix}-phase-${phase}`, construct);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const filename = `${variant}-${theme}.png`;
  const filePath = join(dir, filename);

  await locator.screenshot({ path: filePath });

  // Append to MANIFEST.md
  const manifestPath = join(QA_SCREENSHOTS_DIR, `${datePrefix}-phase-${phase}`, 'MANIFEST.md');
  const line = `- [${construct}/${filename}](${construct}/${filename}) — ${construct} ${variant} in ${theme} theme\n`;
  appendFileSync(manifestPath, line);

  return filePath;
}
