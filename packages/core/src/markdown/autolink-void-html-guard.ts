/**
 * Autolink + HTML guard (R23).
 *
 * Preprocessor that protects autolinks (<https://url>), void HTML tags
 * (<br>, <hr>, <img>), HTML comments (<!-- -->), closing tags (</div>),
 * and lowercase HTML tags from remark-mdx's JSX claiming.
 *
 * MDX/JSX components use UpperCase or dotted names; lowercase `<div>`, `<span>`,
 * etc. are standard HTML. remark-mdx claims ALL `<` tokens, so we guard
 * anything that isn't a valid JSX component reference.
 *
 * Strategy: replace `<` and `>` in protected patterns with Unicode Private
 * Use Area characters before parsing. A post-parse transformer restores them.
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
 * HTML comment pattern: <!-- ... -->
 */
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;

/**
 * HTML closing tags: </tag>
 */
const HTML_CLOSE_TAG_RE = /<\/[a-zA-Z][a-zA-Z0-9]*\s*>/g;

/**
 * Lowercase HTML tags (not JSX components).
 * JSX components start with uppercase or contain dots (member expressions).
 * Lowercase tags are standard HTML and should not be parsed as JSX.
 * Matches opening tags with optional attributes and optional self-closing slash.
 */
const LOWERCASE_HTML_TAG_RE = /<([a-z][a-z0-9]*)(\s[^>]*)?\/?>/gi;

/**
 * Protect autolinks and HTML from MDX claiming.
 */
export function protectFromMdx(source: string): string {
  let result = source;

  // Protect HTML comments first (they can contain < and >)
  result = result.replace(HTML_COMMENT_RE, (match) => {
    return match.replace(/</g, GUARD_OPEN).replace(/>/g, GUARD_CLOSE);
  });

  // Protect autolinks: <https://url> → GUARD_LT https://url GUARD_GT
  result = result.replace(AUTOLINK_RE, (_match, uri: string) => {
    return `${GUARD_OPEN}${uri}${GUARD_CLOSE}`;
  });

  // Protect HTML closing tags: </div> → GUARD_LT /div GUARD_GT
  result = result.replace(HTML_CLOSE_TAG_RE, (match) => {
    return match.replace(/</g, GUARD_OPEN).replace(/>/g, GUARD_CLOSE);
  });

  // Protect lowercase HTML tags (not JSX components)
  result = result.replace(LOWERCASE_HTML_TAG_RE, (match, tag: string) => {
    // Only protect if the tag name is lowercase (standard HTML).
    // Uppercase or dotted names are JSX components — leave for remark-mdx.
    if (tag[0] === tag[0].toLowerCase() && tag[0] !== tag[0].toUpperCase()) {
      return match.replace(/</g, GUARD_OPEN).replace(/>/g, GUARD_CLOSE);
    }
    return match;
  });

  // Protect empty angle brackets <> and bare < followed by > in non-JSX contexts
  // These appear in CommonMark edge cases like ![foo](<>) or bare < in text
  result = result.replace(/<>/g, `${GUARD_OPEN}${GUARD_CLOSE}`);

  return result;
}

/**
 * Restore protected autolinks and HTML after parsing.
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
