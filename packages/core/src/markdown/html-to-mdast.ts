/**
 * Shared HTML → mdast conversion for the canonical clipboard pipeline.
 *
 * Wraps `rehype-parse` (hast parse) → source-cleanup rehype plugins →
 * `rehype-remark` (hast → mdast). Used by both the WYSIWYG paste dispatcher
 * (branch D — generic HTML) and the Source paste dispatcher (branch D —
 * shared HTML → mdast → remark-stringify).
 *
 * Single source of truth for HTML ingestion across both views (FR-6, D13).
 * The `cleanupPlugins` array is the registration point for vendor-specific
 * rehype plugins (US-008 through US-010 — GDocs, Word/MSO, Apple Cocoa,
 * Gmail, Notion, VS Code, Google Sheets, Slack, GitHub).
 *
 * Error-path contract: rehype-parse runs in fragment mode with
 * `emitParseErrors: false`, so malformed HTML does not throw — ill-formed
 * tags are tolerated per the HTML5 parsing spec. Callers still wrap this
 * function in try/catch per FR-11 (three-layer fallback discipline) to
 * cover rehype-remark exceptions on pathological trees.
 */

import type { Root as HastRoot } from 'hast';
import type { Root as MdastRoot } from 'mdast';
import rehypeParse from 'rehype-parse';
import rehypeRemark from 'rehype-remark';
import { type Plugin, unified } from 'unified';
import { rehypeSkipNotionWhitespace } from './rehype-plugins/skip-notion-whitespace.ts';
import { rehypeStripCocoaMeta } from './rehype-plugins/strip-cocoa-meta.ts';
import { rehypeStripGdocsWrapper } from './rehype-plugins/strip-gdocs-wrapper.ts';
import { rehypeStripGmailClasses } from './rehype-plugins/strip-gmail-classes.ts';
import { rehypeStripMsoStyles } from './rehype-plugins/strip-mso-styles.ts';
import { rehypeStripVscodeSpans } from './rehype-plugins/strip-vscode-spans.ts';

export interface HtmlToMdastOptions {
  /**
   * Additional rehype plugins appended to the cleanup chain at runtime.
   * Registered AFTER the built-in vendor cleanup plugins so callers cannot
   * accidentally shadow them.
   *
   * Intended for tests and downstream consumers; the day-one panel of
   * vendor-specific cleanup plugins lives in `cleanupPlugins` (see below).
   */
  additionalCleanupPlugins?: Plugin[];
}

/**
 * Registration point for vendor-specific HTML cleanup plugins.
 *
 * Order matters: detection-specific plugins (which look for vendor
 * fingerprints like `docs-internal-guid`) must run BEFORE generic
 * plugins (which transform any HTML). The canonical order registered
 * here is the order preserved into the pipeline.
 *
 * Day-one panel per D9 LOCKED. US-008 added the first three; US-009 and
 * US-010 populate the remaining six (Gmail / Notion / VS Code / Google
 * Sheets / Slack / GitHub rendered) bringing the total to 9.
 */
export const cleanupPlugins: Plugin[] = [
  // Fingerprint-detecting plugins — each is a no-op on non-matching trees,
  // so ordering among them is irrelevant. They run before the generic
  // rehype-remark conversion stage which has no fingerprint detection.
  // US-008:
  rehypeStripGdocsWrapper as Plugin,
  rehypeStripMsoStyles as Plugin,
  rehypeStripCocoaMeta as Plugin,
  // US-009:
  rehypeStripGmailClasses as Plugin,
  rehypeSkipNotionWhitespace as Plugin,
  rehypeStripVscodeSpans as Plugin,
];

/**
 * Convert an HTML string to an mdast Root tree.
 *
 * @param html - Raw HTML string. Fragment or full document both work —
 *   `rehype-parse` normalises to a hast Root either way.
 * @param options - Optional additional cleanup plugins (see interface).
 * @returns mdast Root. Never null; on completely empty input, returns
 *   `{type:'root', children:[]}`.
 */
export function htmlToMdast(html: string, options?: HtmlToMdastOptions): MdastRoot {
  const processor = unified()
    // Fragment mode — clipboard HTML is almost never a full document with
    // <!DOCTYPE html>. `fragment: true` skips synthesizing <html><body>.
    .use(rehypeParse, { fragment: true });

  // Register all registered cleanup plugins in order, then any caller
  // additions. Each plugin is a unified transformer — unified accepts
  // them as bare functions or as [plugin, options] tuples.
  for (const plugin of cleanupPlugins) {
    processor.use(plugin);
  }
  for (const plugin of options?.additionalCleanupPlugins ?? []) {
    processor.use(plugin);
  }

  // rehype-remark in mutate mode: returns the mdast tree as the processor's
  // output. With no destination processor passed, `.runSync` yields mdast.
  processor.use(rehypeRemark);

  const hastTree = processor.parse(html) as HastRoot;
  const mdast = processor.runSync(hastTree) as unknown as MdastRoot;
  return mdast;
}
