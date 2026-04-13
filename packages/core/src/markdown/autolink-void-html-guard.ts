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
import type { Nodes, Root } from 'mdast';
import { visit } from 'unist-util-visit';

// Use Unicode Private Use Area characters as markers.
// These won't appear in normal text and MDX won't try to parse them as JSX.
// NG9 documents their reservation (source content containing these codepoints
// may be corrupted by the restoration pass — rare in legitimate content).
//
// Five sentinels total, each with a specific semantic role:
//   GUARD_OPEN  (U+E000) — replaces `<` in protected patterns
//   GUARD_CLOSE (U+E001) — replaces `>` in protected patterns
//   GUARD_COLON (U+E002) — replaces `:` inside autolink URLs so
//     remark-gfm's autolink-literal (scheme-colon URLs) and
//     remark-directive (`:name` text-directive syntax) cannot
//     re-claim the URL body as one of their constructs.
//   GUARD_AT    (U+E003) — replaces `@` inside autolink URLs so
//     remark-gfm's email autolink cannot re-claim `user@host.tld`
//     patterns inside wrapped mailto / other `@`-bearing URIs.
//   GUARD_OPEN_BRACE (U+E004) — replaces `{` in unmatched brace
//     positions so remark-mdx's JSX expression parser cannot claim
//     them and crash on "Unexpected end of file in expression".
//
// We preserve URL bytes otherwise (dots, slashes, hyphens) so the
// original `<url>` form survives round-trip byte-identically.
const GUARD_OPEN = '\uE000';
const GUARD_CLOSE = '\uE001';
const GUARD_COLON = '\uE002';
const GUARD_AT = '\uE003';
const GUARD_OPEN_BRACE = '\uE004';

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
 * HTML closing tags: </tag> — ONLY lowercase tags (real HTML).
 *
 * JSX component closing tags (`</Callout>`, `</Docs.Link>`) MUST pass through
 * to remark-mdx so paired components (mdxJsxFlowElement / mdxJsxTextElement)
 * parse correctly. Matching mixed-case closing tags here was the original bug
 * that broke paired MDX round-trip entirely — mirror the opening-tag regex's
 * lowercase-only discrimination (see `LOWERCASE_HTML_TAG_RE`).
 */
const HTML_CLOSE_TAG_RE = /<\/([a-z][a-z0-9]*)\s*>/g;

/**
 * Lowercase HTML tags (not JSX components).
 * JSX components start with uppercase or contain dots (member expressions).
 * Lowercase tags are standard HTML and should not be parsed as JSX.
 * Matches opening tags with optional attributes and optional self-closing slash.
 */
const LOWERCASE_HTML_TAG_RE = /<([a-z][a-z0-9]*)(\s[^>]*)?\/?>/g;

/**
 * Protect autolinks and HTML from MDX claiming.
 *
 * COUPLING NOTE: safeText() in to-markdown-handlers.ts strips escaping rules
 * for `<`, `:`, and `@` because this guard handles those characters on parse.
 * If a character is removed from protection here, the corresponding strip in
 * safeText() must also be removed — otherwise the serializer will produce
 * unescaped output for that character.
 */
export function protectFromMdx(source: string): string {
  let result = source;

  // Protect HTML comments first (they can contain < and >)
  result = result.replace(HTML_COMMENT_RE, (match) => {
    return match.replace(/</g, GUARD_OPEN).replace(/>/g, GUARD_CLOSE);
  });

  // Protect autolinks: <scheme:uri> → GUARD_OPEN + scheme + GUARD_COLON + rest + GUARD_CLOSE
  // (and GUARD_AT replacing any `@` in the rest).
  //
  // Simple bracket replacement leaves the URL body exposed to downstream
  // pattern matchers: remark-gfm's autolink-literal still matches the
  // scheme-colon URL, remark-gfm's email autolink still matches `user@host`,
  // and remark-directive still claims the `:` as a text-directive marker.
  // Replacing the pattern-triggering chars (`:` and `@`) with PUA sentinels
  // defeats all three matchers while preserving every other byte of the URL,
  // so restoreFromMdx can reconstruct the original `<scheme:uri>` form
  // byte-identically.
  result = result.replace(AUTOLINK_RE, (_match, uri: string) => {
    const safe = uri.replaceAll(':', GUARD_COLON).replaceAll('@', GUARD_AT);
    return `${GUARD_OPEN}${safe}${GUARD_CLOSE}`;
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

  // Final catch-all: protect ANY remaining `<` that doesn't have a matching
  // close-tag on the same line. This handles:
  //   - Bare `<` at EOF/EOL (`<`, `< `, `<\n`)
  //   - `<<`, `<<<` (consecutive angle brackets)
  //   - `<foo bar` (unclosed lowercase)
  //   - `<Component` (unclosed uppercase)
  //   - `<B>text` (opened uppercase tag without closing `</B>` — mdx-jsx
  //     would claim `<B>` as JSX element start then crash on missing close)
  //   - `<$` and `<_` (remark-mdx claims $ and _ as JSX name starts)
  //
  // The earlier rules (AUTOLINK_RE, HTML_COMMENT_RE, HTML_CLOSE_TAG_RE,
  // LOWERCASE_HTML_TAG_RE) have already replaced their matches with PUA
  // sentinels. Any `<` still present either:
  //   (a) starts a valid uppercase JSX tag with both open+close (`<X>...</X>`)
  //   (b) is bare/unclosed and will crash remark-mdx
  //
  // Strategy: for each remaining `<`, check if it's followed by a valid
  // tag name AND has BOTH a closing `>` AND a matching `</TagName>` on the
  // same line or within the document. If not → protect with GUARD_OPEN.
  //
  // Simplified heuristic: protect `<` unless it's followed by an uppercase
  // letter, has `>` on the same line, AND has `</` + same tag name later.
  // This is conservative — some valid JSX may get guarded and rendered as
  // text. But the alternative (crash) is worse.
  result = result.replace(/</g, (match, offset) => {
    const rest = result.slice(offset);

    // Close tags (</TagName>) — pass through ONLY if complete.
    // Incomplete `</` or `</foo` (no closing `>`) crashes remark-mdx.
    // Lowercase close tags were already handled by HTML_CLOSE_TAG_RE above.
    if (rest[1] === '/') {
      if (/^<\/[a-zA-Z][a-zA-Z0-9.]*\s*>/.test(rest)) return match;
      return GUARD_OPEN; // Incomplete close tag — protect
    }

    // Check if this looks like a valid self-closing or paired tag
    const tagMatch = /^<([A-Z][a-zA-Z0-9.]*)[\s/>]/.exec(rest);
    if (!tagMatch) {
      // Not an uppercase tag start — protect unconditionally
      return GUARD_OPEN;
    }

    const tagName = tagMatch[1];

    // Check for self-closing: <TagName ... /> (may span multiple lines)
    // Multi-line self-closing JSX like `<Widget\n  attr="x"\n/>` has the
    // `/>` on a later line. Search up to the next paragraph break (blank line)
    // — JSX tags don't span paragraph breaks.
    const nextBlankLine = rest.search(/\n\s*\n/);
    const searchRegion = nextBlankLine === -1 ? rest : rest.slice(0, nextBlankLine);
    if (/\/>/.test(searchRegion)) {
      return match; // Self-closing — safe for mdx-jsx
    }

    // Check for matching close tag: </TagName>
    const closeTag = `</${tagName}>`;
    if (rest.includes(closeTag)) {
      return match; // Has matching close tag — safe for mdx-jsx
    }

    // Uppercase tag with no self-close and no matching close tag — protect
    return GUARD_OPEN;
  });

  // ── Brace guard ──
  // remark-mdx claims `{` as JSX expression start. An unclosed `{` (no
  // matching `}`) crashes with "Unexpected end of file in expression".
  // Protect ALL unmatched `{` with a PUA sentinel.
  //
  // Strategy: classic stack pairing. Push each `{` position; pop on `}`.
  // After the scan, any positions remaining on the stack are unmatched.
  // This correctly handles `{{`, `{{{`, `{a {b}`, etc.
  {
    const stack: number[] = [];
    for (let i = 0; i < result.length; i++) {
      if (result[i] === '{') {
        stack.push(i);
      } else if (result[i] === '}') {
        if (stack.length > 0) stack.pop(); // matched pair
      }
    }
    if (stack.length > 0) {
      const chars = [...result];
      for (const pos of stack) {
        chars[pos] = GUARD_OPEN_BRACE;
      }
      result = chars.join('');
    }
  }

  return result;
}

/**
 * Protect a single literal `<` at a known source offset.
 *
 * Used by the parse retry path when remark-mdx misclassifies prose like
 * `<50ms` as a JSX opener and aborts the entire document parse.
 */
export function protectLiteralLtAtOffset(source: string, offset: number): string {
  if (offset < 0 || offset >= source.length) return source;
  if (source[offset] !== '<') return source;
  return `${source.slice(0, offset)}${GUARD_OPEN}${source.slice(offset + 1)}`;
}

/**
 * Restore protected autolinks and HTML after parsing.
 * Runs as a unified transformer on the mdast tree.
 */
/** Check whether a string contains any PUA sentinel character. */
function hasSentinels(s: string): boolean {
  return (
    s.includes('\uE000') ||
    s.includes('\uE001') ||
    s.includes('\uE002') ||
    s.includes('\uE003') ||
    s.includes('\uE004')
  );
}

export function restoreFromMdx() {
  return (tree: Root) => {
    visit(tree, (node: Nodes) => {
      // Restore in text values, URL, title, alt — use a record view because
      // these fields live on different subsets of Nodes.
      const rec = node as unknown as Record<string, unknown>;
      if (typeof rec.value === 'string' && hasSentinels(rec.value)) {
        rec.value = restoreString(rec.value);
      }
      if (typeof rec.url === 'string' && hasSentinels(rec.url)) {
        rec.url = restoreString(rec.url);
      }
      if (typeof rec.title === 'string' && hasSentinels(rec.title)) {
        rec.title = restoreString(rec.title);
      }
      if (typeof rec.alt === 'string' && hasSentinels(rec.alt)) {
        rec.alt = restoreString(rec.alt);
      }
    });
  };
}

function restoreString(s: string): string {
  // Restore every sentinel to its original character. Sentinels are mutually
  // independent (no nesting) so replacement order does not matter.
  return s
    .replaceAll(GUARD_OPEN, '<')
    .replaceAll(GUARD_CLOSE, '>')
    .replaceAll(GUARD_COLON, ':')
    .replaceAll(GUARD_AT, '@')
    .replaceAll(GUARD_OPEN_BRACE, '{');
}
