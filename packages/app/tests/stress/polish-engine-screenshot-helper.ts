/**
 * Polish Engine screenshot capture helper (SPEC §10.7b)
 *
 * Captures tightly-cropped per-construct screenshots for human review — NOT
 * pass/fail grading. An LLM looking at a screenshot and calling it "subtle
 * enough" is noise, not signal (§10.8). The goal is to produce an indexed
 * directory a human can flip through to catch anything the R-row assertions
 * missed.
 *
 * Output layout (per SPEC §10.7b):
 *   tmp/qa-screenshots/<YYYY-MM-DD>-phase-<N>/<construct>/<variant>-<theme>.png
 * with a flat MANIFEST.md alongside indexing every image by one-line desc.
 *
 * Usage: see polish-engine-screenshots.e2e.ts.
 */

import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Locator } from '@playwright/test';

export type Theme = 'light' | 'dark';

export interface CaptureOptions {
  /** Construct family key — e.g. 'blockquote', 'table', 'fenced-code'. */
  construct: string;
  /** Visual state/variant within the construct — e.g. 'tier-1-row', 'depth-2', 'language-badge'. */
  variant: string;
  /** 'light' | 'dark'. */
  theme: Theme;
  /** One-line human-readable description for the manifest entry. */
  description: string;
}

/**
 * Resolve the session-scoped output directory.
 *
 * Layout: `tmp/qa-screenshots/YYYY-MM-DD-phase-N/`.
 *
 * - `POLISH_SCREENSHOT_PHASE` env var lets the caller mark the phase (1..5);
 *   defaults to `N` for ad-hoc runs.
 * - Date is the local calendar date (YYYY-MM-DD). Multiple runs on the same
 *   day overwrite files with matching (construct, variant, theme) keys —
 *   §10.7b prescribes that layout, not per-run subdirectories.
 */
export function resolveOutputDir(
  repoRoot: string,
  date: Date = new Date(),
  phase = process.env.POLISH_SCREENSHOT_PHASE ?? 'N',
): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return join(repoRoot, 'tmp', 'qa-screenshots', `${yyyy}-${mm}-${dd}-phase-${phase}`);
}

/**
 * Capture a cropped screenshot of a single decorated DOM element and append
 * its manifest entry.
 *
 * `locator.screenshot({ path })` clips to the element's bounding box — NOT
 * `page.screenshot` (which captures viewport chrome) and NOT full-page
 * screenshots (which lose the tight-crop property §10.7b requires).
 *
 * The manifest is a flat markdown list — humans review in order.
 */
export async function captureConstructScreenshot(
  locator: Locator,
  options: CaptureOptions,
  outputDir: string,
): Promise<string> {
  const { construct, variant, theme, description } = options;
  const relPath = join(construct, `${variant}-${theme}.png`);
  const absPath = join(outputDir, relPath);

  mkdirSync(dirname(absPath), { recursive: true });

  // Element-scoped screenshot: §10.7b prescribes locator.screenshot, not page.screenshot.
  await locator.screenshot({ path: absPath, animations: 'disabled' });

  const manifestPath = join(outputDir, 'MANIFEST.md');
  if (!existsSync(manifestPath)) {
    const header = [
      '# Polish Engine — screenshot capture manifest',
      '',
      `Generated ${new Date().toISOString()}`,
      '',
      'Human reviewer: flip through each image below. Flag anything that feels wrong.',
      'Agents MUST NOT grade these (SPEC §10.8). This is capture-only.',
      '',
      '## Images',
      '',
    ].join('\n');
    writeFileSync(manifestPath, header, 'utf-8');
  }

  // One line per image: relative path + description.
  appendFileSync(manifestPath, `- \`${relPath}\` — ${description}\n`, 'utf-8');

  return absPath;
}

/** Set `html.classList` to force a specific theme without triggering the app's toggle UI. */
export async function applyTheme(
  page: import('@playwright/test').Page,
  theme: Theme,
): Promise<void> {
  await page.evaluate((t) => {
    const root = document.documentElement;
    if (t === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, theme);
  // One animation frame so CSS custom-property overrides settle before the capture.
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => r())));
}
