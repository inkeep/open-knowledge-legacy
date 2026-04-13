/**
 * Autolink + void-HTML guard (R23).
 *
 * Preprocessor that protects autolinks (<https://url>) and void HTML tags
 * (<br>, <hr>, <img>) from remark-mdx's JSX claiming. Uses text markers
 * that MDX won't try to parse.
 *
 * Strategy: replace `<` in autolink/void-HTML patterns with a unique marker
 * before parsing. After parsing, a transformer restores the original patterns
 * in text and html nodes.
 */
import type { Root } from 'mdast';
import { visit } from 'unist-util-visit';

// Use Unicode Private Use Area characters as markers.
// These won't appear in normal text and MDX won't try to parse them as JSX.
const GUARD_OPEN = '\uE000'; // U+E000 Private Use
const GUARD_CLOSE = '\uE001'; // U+E001 Private Use

/**
 * Autolink pattern: <scheme:uri>
 * Captures the entire autolink including angle brackets.
 */
const AUTOLINK_RE = /<([a-zA-Z][a-zA-Z0-9+.-]*:[^\s<>]+)>/g;

/**
 * Void HTML tags that MDX would claim as JSX.
 * Matches with optional attributes and optional self-closing slash.
 */
const VOID_HTML_RE =
  /<(br|hr|img|wbr|area|base|col|embed|input|link|meta|source|track)(\s[^>]*)?\/?>/gi;

/**
 * Protect autolinks and void HTML from MDX claiming.
 * Replaces `<` and `>` in matched patterns with null-byte-wrapped markers.
 */
export function protectFromMdx(source: string): string {
  let result = source;

  // Protect autolinks: <https://url> → GUARD_LT https://url GUARD_GT
  result = result.replace(AUTOLINK_RE, (_match, uri: string) => {
    return `${GUARD_OPEN}${uri}${GUARD_CLOSE}`;
  });

  // Protect void HTML: <br> → GUARD_LT br GUARD_GT
  result = result.replace(VOID_HTML_RE, (match) => {
    return match.replace(/</g, GUARD_OPEN).replace(/>/g, GUARD_CLOSE);
  });

  return result;
}

/**
 * Restore protected autolinks and void HTML after parsing.
 * Runs as a unified transformer on the mdast tree.
 */
export function restoreFromMdx() {
  return (tree: Root) => {
    visit(tree, (node: any) => {
      // Restore in text values
      if (
        typeof node.value === 'string' &&
        (node.value.includes('\uE000') || node.value.includes('\uE001'))
      ) {
        node.value = restoreString(node.value);
      }
      // Restore in URL fields
      if (
        typeof node.url === 'string' &&
        (node.url.includes('\uE000') || node.url.includes('\uE001'))
      ) {
        node.url = restoreString(node.url);
      }
    });
  };
}

function restoreString(s: string): string {
  return s.replaceAll('\uE000', '<').replaceAll('\uE001', '>');
}
