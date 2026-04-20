/**
 * Clipboard source detection.
 *
 * Maps an observed DataTransfer to a named source token, which drives the
 * dispatcher branch choice + the FR-18 telemetry `clipboard-source-detected`
 * event.
 *
 * Detection precedence (highest fidelity wins):
 *   1. `vscode-editor-data` MIME → `vscode`
 *   2. `text/x-gfm` MIME → `gfm`
 *   3. HTML contains `data-pm-slice` → `pm-origin`
 *   4. HTML contains vendor fingerprints → `gdocs` / `word` / `gmail` /
 *      `notion` / `apple` / `slack` / `gsheets` / `github`
 *   5. HTML present (no fingerprint) → `generic`
 *   6. Only text/plain, `isMarkdown(text)` true → `markdown-text`
 *   7. Only text/plain, prose → `plaintext`
 */

/**
 * Source identifier produced by `detectSource` + augmented with branch-level
 * tokens that downstream paste dispatchers emit (`markdown-text` is set
 * inside `handle-paste.ts` after `isMarkdown` fires on a text/plain-only
 * payload). Keep this union in sync with the code that emits each token —
 * orphan values mislead future readers into believing detection coverage
 * exists where it does not. Precedent #7 ("remove broken capabilities
 * rather than shipping them") guided the removal of the `ai-chat` value
 * which was declared but never produced.
 */
export type ClipboardSource =
  | 'vscode'
  | 'gfm'
  | 'pm-origin'
  | 'gdocs'
  | 'word'
  | 'gmail'
  | 'notion'
  | 'apple'
  | 'slack'
  | 'gsheets'
  | 'github'
  | 'generic'
  | 'markdown-text'
  | 'plaintext'
  // `local` is the token for copy/cut-path telemetry where the "source" of
  // the content is the editor itself — the `source` dimension has no vendor
  // meaning on the outbound side but we keep the field required so log
  // aggregators can filter consistently across copy + paste events.
  | 'local';

export function detectSource(dt: DataTransfer | null): ClipboardSource {
  if (!dt) return 'plaintext';

  if (dt.types.includes('vscode-editor-data')) return 'vscode';
  if (dt.types.includes('text/x-gfm')) return 'gfm';

  const html = dt.getData('text/html');
  if (html) {
    if (/data-pm-slice/i.test(html)) return 'pm-origin';
    if (/docs-internal-guid-/i.test(html)) return 'gdocs';
    if (/xmlns:o="urn:schemas-microsoft-com:office/i.test(html)) return 'word';
    if (/<meta[^>]*Generator[^>]*Microsoft Word/i.test(html)) return 'word';
    if (/class="gmail_|class='gmail_/i.test(html)) return 'gmail';
    if (/notionvc:/i.test(html)) return 'notion';
    if (/Cocoa HTML Writer/i.test(html)) return 'apple';
    if (/c-message_kit__|c-message__|c-compose/i.test(html)) return 'slack';
    if (/google-sheets-html-origin/i.test(html)) return 'gsheets';
    if (/data-hovercard-type=/i.test(html)) return 'github';
    return 'generic';
  }
  return 'plaintext';
}
