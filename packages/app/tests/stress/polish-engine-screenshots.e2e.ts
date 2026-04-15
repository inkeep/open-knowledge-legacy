/**
 * Polish Engine §10.7b — screenshot capture suite
 *
 * Walks every construct family × both themes and emits tightly-cropped
 * per-construct screenshots for human review. Separate from pass/fail
 * R-row tests: this produces capture artifacts only, never asserts an
 * aesthetic verdict (SPEC §10.8 prohibits LLM aesthetic calls).
 *
 * Output: `tmp/qa-screenshots/YYYY-MM-DD-phase-N/<construct>/<variant>-<theme>.png`
 *         plus a flat `MANIFEST.md` indexing every image.
 *
 * Run with:
 *   VITE_PORT=13585 bunx playwright test tests/stress/polish-engine-screenshots.e2e.ts
 * Phase label:
 *   POLISH_SCREENSHOT_PHASE=5 VITE_PORT=13585 bunx playwright test ...
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Page, test } from '@playwright/test';
import {
  applyTheme,
  captureConstructScreenshot,
  resolveOutputDir,
  type Theme,
} from './polish-engine-screenshot-helper';

const port = process.env.VITE_PORT || '5173';
const BASE = `http://localhost:${port}`;

// ESM equivalent of CommonJS __dirname — this test file lives at
// packages/app/tests/stress/, four levels deep from the repo root.
const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(THIS_DIR, '../../../..');
const OUTPUT_DIR = resolveOutputDir(REPO_ROOT);
const THEMES: Theme[] = ['light', 'dark'];

/**
 * The composition fixture covering every construct the engine touches.
 * Mirrors the structure of `tests/fixtures/polish-engine/composition.md`
 * but expanded to exercise every decoration class that `/polish-engine/`
 * emits, so the per-construct locators below resolve reliably.
 */
const FIXTURE = [
  '---',
  'title: Screenshot Fixture',
  '---',
  '',
  '# Heading 1',
  '## Heading 2',
  '### Heading 3',
  '',
  'Plain paragraph with *emphasis*, **strong**, ~~delete~~, and `inline code`.',
  '',
  '> Depth-1 blockquote.',
  '>',
  '> > Depth-2 nested quote.',
  '>',
  '> > > Depth-3 nested quote.',
  '',
  '- Bullet list item',
  '- Second bullet',
  '  - Nested bullet',
  '- [ ] Unchecked task',
  '- [x] Checked task',
  '',
  '1. Ordered first',
  '2. Ordered second',
  '',
  '| A | B | C |',
  '|---|---|---|',
  '| alpha | beta | gamma |',
  '| 1 | 2 | 3 |',
  '',
  '```typescript',
  'const polish = (engine: string) => engine.trim();',
  'function compose<T>(fn: (x: T) => T, g: (x: T) => T) { return (x: T) => fn(g(x)); }',
  '```',
  '',
  'Inline [a link](https://example.com) and an image ![alt text](https://example.com/x.png) and a reference [to something][ref].',
  '',
  '[ref]: https://example.com "Reference definition"',
  '',
  '[broken][missing-label]',
  '',
  '---',
  '',
  '<div class="html-block" data-demo="yes">',
  '  <span>HTML block content</span>',
  '</div>',
  '',
  'Wikilink: [[Screenshot Fixture]] and broken [[Nonexistent Target]].',
].join('\n');

/**
 * Seed the editor with the screenshot fixture and navigate to source mode.
 */
async function seedAndOpenSource(page: Page): Promise<void> {
  const reset = await fetch(`${BASE}/api/test-reset?docName=test-doc`, { method: 'POST' });
  if (!reset.ok) throw new Error(`test-reset failed: ${reset.status}`);

  const write = await fetch(`${BASE}/api/agent-write-md`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ markdown: FIXTURE, position: 'replace', docName: 'test-doc' }),
  });
  if (!write.ok) throw new Error(`agent-write-md failed: ${write.status}`);

  await page.goto(BASE);
  await page.getByRole('button', { name: 'test-doc.md', exact: true }).click({ timeout: 10_000 });
  await page.waitForFunction(() => Boolean(window.__activeProvider?.isSynced), { timeout: 15_000 });

  const sourceToggle = page.getByRole('radio', { name: 'Markdown source' });
  await sourceToggle.click();
  await page.waitForSelector('.cm-editor');
  // Give Y.Text replace + polish-engine ViewPlugin a moment to paint all decorations.
  await page.waitForSelector('.cm-blockquote-line', { timeout: 5_000 });
  await page.waitForSelector('.cm-table-row', { timeout: 5_000 });
  await page.waitForTimeout(250);
}

/**
 * Walk every construct × theme and emit one screenshot per (construct, variant, theme).
 * This is a single test on purpose — Playwright's per-test isolation would
 * re-seed the editor 30+ times otherwise, adding minutes of overhead for
 * zero benefit (we're capturing static decorations, not testing interactions).
 */
test.describe('§10.7b — Polish engine construct screenshots (capture only)', () => {
  test.setTimeout(180_000);

  test('capture every construct × both themes', async ({ page }) => {
    await seedAndOpenSource(page);

    for (const theme of THEMES) {
      await applyTheme(page, theme);
      await page.waitForTimeout(100);

      // Helper: take a screenshot of the first match for a selector.
      const capture = async (
        selector: string,
        construct: string,
        variant: string,
        description: string,
      ) => {
        const locator = page.locator(selector).first();
        const count = await locator.count();
        if (count === 0) {
          // Not every selector applies in every fixture pass — skip gracefully.
          // (e.g. nested-depth quotes only exist if the deeper rows rendered.)
          return;
        }
        await captureConstructScreenshot(
          locator,
          { construct, variant, theme, description },
          OUTPUT_DIR,
        );
      };

      // Headings — one image per level actually rendered.
      for (const level of [1, 2, 3]) {
        await capture(
          `.cm-heading-${level}`,
          'heading',
          `h${level}`,
          `Heading level ${level} (size hierarchy capped at 1.25× per D25)`,
        );
      }
      await capture(
        '.cm-header-mark',
        'heading',
        'header-mark',
        'Header `#` marker — muted, recedes behind heading text',
      );

      // Blockquote — depth 1/2/3 variants.
      await capture(
        '.cm-blockquote-line:not(.cm-blockquote-depth-2):not(.cm-blockquote-depth-3)',
        'blockquote',
        'depth-1',
        'Blockquote depth 1 — line tint + left border',
      );
      await capture(
        '.cm-blockquote-depth-2',
        'blockquote',
        'depth-2',
        'Blockquote depth 2 — border 65% muted-foreground',
      );
      await capture(
        '.cm-blockquote-depth-3',
        'blockquote',
        'depth-3',
        'Blockquote depth 3 — border 80% muted-foreground (cap)',
      );

      // Lists.
      await capture(
        '.cm-list-item-line',
        'list',
        'item-line',
        'List item line — hanging indent keeps wrapped text under content, not marker',
      );
      await capture('.cm-list-marker', 'list', 'marker', 'List marker (tabular-nums, muted)');
      await capture('.cm-task-marker', 'list', 'task-unchecked', 'Task marker — unchecked border');
      await capture(
        '.cm-task-marker-checked',
        'list',
        'task-checked',
        'Task marker — checked (accent background)',
      );

      // Tables — Tier 1 (row), Tier 2 (cell bands), Tier 3 (compactness = implicit in all).
      await capture('.cm-table-row', 'table', 'tier-1-row', 'Table Tier 1 — row tint + accent bar');
      await capture(
        '.cm-table-cell-band-0',
        'table',
        'tier-2-cell-band-0',
        'Table Tier 2 cell band 0 (4-color cycle ≤4% alpha)',
      );
      await capture(
        '.cm-table-cell-band-1',
        'table',
        'tier-2-cell-band-1',
        'Table Tier 2 cell band 1',
      );
      await capture(
        '.cm-table-cell-band-2',
        'table',
        'tier-2-cell-band-2',
        'Table Tier 2 cell band 2',
      );
      await capture(
        '.cm-table-cell-band-3',
        'table',
        'tier-2-cell-band-3',
        'Table Tier 2 cell band 3',
      );
      await capture('.cm-table-header', 'table', 'header', 'Table header row');

      // Fenced code + language badge + preserve-source-indent.
      await capture(
        '.cm-code-block',
        'fenced-code',
        'code-block-line',
        'Fenced code line tint (monospace, muted bg)',
      );
      await capture(
        '.cm-code-block-first',
        'fenced-code',
        'first-line-border',
        'Fenced code first-line (top border)',
      );
      await capture(
        '.cm-code-block-last',
        'fenced-code',
        'last-line-border',
        'Fenced code last-line (bottom border)',
      );
      await capture(
        '.cm-code-language-badge',
        'fenced-code',
        'language-badge',
        'Fenced code language badge (Decoration.widget side=1)',
      );

      // YAML frontmatter.
      await capture(
        '.cm-frontmatter-line',
        'frontmatter',
        'line-tint',
        'YAML frontmatter line tint',
      );
      await capture(
        '.cm-frontmatter-fence-open',
        'frontmatter',
        'fence-open',
        'YAML frontmatter opening fence border',
      );
      await capture(
        '.cm-frontmatter-fence-close',
        'frontmatter',
        'fence-close',
        'YAML frontmatter closing fence border',
      );

      // Inline marks.
      await capture('.cm-em', 'inline', 'emphasis', 'Emphasis (italic) content');
      await capture('.cm-strong', 'inline', 'strong', 'Strong (bold) content');
      await capture('.cm-del', 'inline', 'delete', 'Strikethrough content');
      await capture('.cm-inline-code', 'inline', 'inline-code', 'Inline code (monospace tint)');
      await capture(
        '.cm-em-marker',
        'inline',
        'em-marker',
        '`*` / `**` / `~~` marker — visible but opacity 0.65',
      );

      // Links + references.
      await capture('.cm-link-text', 'link', 'link-text', 'Link text (accent + dotted underline)');
      await capture('.cm-link-url', 'link', 'link-url', 'Link URL (muted, word-break: break-all)');
      await capture(
        '.cm-link-mark',
        'link',
        'link-mark',
        'Link brackets/parens (muted, 0.6 opacity)',
      );
      await capture(
        '.cm-link-ref-def-label',
        'link',
        'ref-def-label',
        'Reference definition label (accent color)',
      );
      await capture(
        '.cm-link-ref-broken',
        'link',
        'broken-ref',
        'Broken `[text][missing-label]` — wavy red (cross-scan StateField)',
      );

      // Wikilinks (owned by wiki-link-source.ts plugin, but still a source-view class).
      await capture(
        '.cm-wiki-link:not(.cm-wiki-link-broken)',
        'wikilink',
        'valid',
        'Valid `[[Page]]` wikilink (sky-blue, 500 weight)',
      );
      await capture(
        '.cm-wiki-link-broken',
        'wikilink',
        'broken',
        'Broken `[[Missing]]` wikilink — wavy red (plugin pagesCache check)',
      );

      // Thematic break.
      await capture(
        '.cm-thematic-break',
        'thematic-break',
        'color-transparent',
        'Thematic break — `---` text color: transparent, rule via border-bottom (D9 addressability)',
      );

      // HTML block.
      await capture(
        '.cm-html-block',
        'html-block',
        'line-tint',
        'HTML block line tint (purple accent)',
      );

      // Composition shot — the full editor (but still bounded by .cm-editor).
      await capture(
        '.cm-editor',
        'composition',
        'full-editor',
        'Full editor with every construct active — holistic composition check',
      );
    }
  });
});
