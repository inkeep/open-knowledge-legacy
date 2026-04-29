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
 * Lowercase tag names that ARE registered canonical descriptors and must
 * pass through to remark-mdx as `mdxJsxFlowElement` rather than being
 * PUA-protected as raw HTML. This carve-out is what makes the "media
 * converges with HTML primitives" rule work — `<img>` / `<video>` /
 * `<audio>` author as JSX so descriptor dispatch + PropPanel + advanced-
 * attr passthrough light up. Without the carve-out the guard would route
 * them into text and the slash-menu insert path round-trips as a string.
 *
 * Adding a new lowercase canonical descriptor to the registry requires
 * appending its tag name here. Capitalized canonicals (Callout / Accordion)
 * pass through automatically — only lowercase needs the exemption.
 *
 * Sister set in `mdast-to-hast-handlers.ts` — `HTML_PRIMITIVE_TAGS` —
 * gates which lowercase tags emit as native hast (vs `<pre>` fallback) at
 * cross-app paste time. The two sets currently coincide for the v1 5-pack
 * but are conceptually distinct: a tag could be PUA-exempt here without
 * being native-renderable there (e.g., a future descriptor whose React
 * component handles the rendering). Update both deliberately.
 */
const LOWERCASE_JSX_CANONICAL_TAGS = new Set(['img', 'video', 'audio']);

/**
 * Uppercase close tag used for the catch-all matching-close lookup (R15).
 *
 * Matches the literal `</UpperName>` form with NO whitespace before `>` —
 * the pre-fix code used `rest.includes('</TagName>')` which is byte-literal.
 * Lowercase close tags were already replaced with PUA sentinels by the
 * earlier `HTML_CLOSE_TAG_RE` pass, so only uppercase-initial JSX close
 * tags remain in `result` at this point.
 */
const UPPERCASE_CLOSE_TAG_INDEX_RE = /<\/([A-Z][A-Za-z0-9.]*)>/g;

/**
 * Binary search: smallest index `i` such that `arr[i] >= target`
 * (standard lower-bound). Used by the R15 guard to resolve per-`<`
 * position queries in O(log n) against pre-indexed sorted arrays.
 */
function lowerBound(arr: number[], target: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * One O(n) sweep collecting the absolute offsets of every uppercase-initial
 * `</TagName>` close tag, grouped by tag name. Enables O(log n) "is there a
 * matching close tag after this `<`?" lookups during the catch-all pass.
 */
function indexUppercaseCloseTagsByName(source: string): Map<string, number[]> {
  const index = new Map<string, number[]>();
  const re = new RegExp(UPPERCASE_CLOSE_TAG_INDEX_RE.source, 'g');
  let m = re.exec(source);
  while (m !== null) {
    const existing = index.get(m[1]);
    if (existing) existing.push(m.index);
    else index.set(m[1], [m.index]);
    m = re.exec(source);
  }
  return index;
}

/**
 * One O(n) sweep collecting the offset of every paragraph-break match
 * (`/\n\s*\n/`). Offsets are stored in ascending order so lower-bound
 * binary search yields the next paragraph break > a given `<` offset.
 */
function indexParagraphBreaks(source: string): number[] {
  const breaks: number[] = [];
  const re = /\n\s*\n/g;
  let m = re.exec(source);
  while (m !== null) {
    breaks.push(m.index);
    m = re.exec(source);
  }
  return breaks;
}

/**
 * One O(n) sweep collecting the offset of every `/>` occurrence. Allows
 * finding the last self-closing marker within a paragraph region in
 * O(log n). Skip-past after each match (+2) mirrors `indexOf` semantics
 * and prevents double counting of overlapping `/>`.
 */
function indexSelfClose(source: string): number[] {
  const positions: number[] = [];
  let i = source.indexOf('/>');
  while (i !== -1) {
    positions.push(i);
    i = source.indexOf('/>', i + 2);
  }
  return positions;
}

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
    // Lowercase canonical media tags (img/video/audio) are JSX descriptors
    // post-pivot — pass them through to remark-mdx so they parse as
    // mdxJsxFlowElement and reach the descriptor dispatch. Only the
    // self-closing JSX form (`<img ... />`) is exempted; bare `<img>` /
    // `<img src="x">` (HTML void semantics) stays guarded so legacy
    // HTML-form content keeps parsing as text without remark-mdx
    // demanding a close tag.
    if (LOWERCASE_JSX_CANONICAL_TAGS.has(tag) && match.endsWith('/>')) {
      return match;
    }
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
  //
  // R15 (US-005): position indexes built once in O(n) so each `<` callback
  // resolves in O(log n). Pre-fix did O(rest.includes(closeTag)) per `<`,
  // which is O(n·m) worst case (e.g., many unique unclosed tags forcing
  // full-rest scans). Empirical pathology: ~570ms at 10K unclosed tags
  // pre-fix → log-linear post-fix. Behavior preserved byte-identically;
  // only the lookup mechanism changed.
  const closeTagOffsets = indexUppercaseCloseTagsByName(result);
  const paragraphBreaks = indexParagraphBreaks(result);
  const selfCloseOffsets = indexSelfClose(result);

  result = result.replace(/</g, (match, offset) => {
    // Bounded lookahead is enough for the regex prefix tests below — tag
    // names are short, the regex patterns anchor at start. 256 chars is well
    // beyond the longest dotted JSX name (`<Foo.Bar.Baz...>`) we'd hit in
    // practice. Keeping this bounded converts a per-`<` O(n) slice into O(1).
    const lookahead = result.slice(offset, offset + 256);

    // Close tags (</TagName>) — pass through ONLY if complete.
    // Incomplete `</` or `</foo` (no closing `>`) crashes remark-mdx.
    // Lowercase close tags were already handled by HTML_CLOSE_TAG_RE above.
    if (lookahead[1] === '/') {
      if (/^<\/[a-zA-Z][a-zA-Z0-9.]*[ \t]*>/.test(lookahead)) return match;
      return GUARD_OPEN; // Incomplete close tag — protect
    }

    // Lowercase canonical media tags (img/video/audio) survived the
    // LOWERCASE_HTML_TAG_RE pass via the JSX-canonical exemption — keep
    // them passing through here too so remark-mdx claims them as JSX.
    // Same self-closing constraint as the LOWERCASE_HTML_TAG_RE branch:
    // require the `/>` suffix within the bounded lookahead window so bare
    // `<img>` (HTML void) stays guarded.
    const lowercaseCanonicalMatch = /^<([a-z][a-z0-9]*)([^>]*)\/>/.exec(lookahead);
    if (lowercaseCanonicalMatch && LOWERCASE_JSX_CANONICAL_TAGS.has(lowercaseCanonicalMatch[1])) {
      return match;
    }

    // Check if this looks like a valid self-closing or paired tag
    const tagMatch = /^<([A-Z][a-zA-Z0-9.]*)[\s/>]/.exec(lookahead);
    if (!tagMatch) {
      // Not an uppercase tag start — protect unconditionally
      return GUARD_OPEN;
    }

    const tagName = tagMatch[1];

    // Find next paragraph break > offset via binary search (O(log n)).
    // JSX tags don't span paragraph breaks, so this scopes the self-close
    // search the same way `rest.search(/\n\s*\n/)` did pre-fix.
    const pbIdx = lowerBound(paragraphBreaks, offset);
    const nextBlankLine = pbIdx < paragraphBreaks.length ? paragraphBreaks[pbIdx] : result.length;

    // Check for self-closing: <TagName ... /> (may span multiple lines).
    // Want the LAST `/>` strictly within (offset, nextBlankLine). Pre-fix
    // used `searchRegion.lastIndexOf('/>')`; same semantics, indexed.
    const scIdx = lowerBound(selfCloseOffsets, nextBlankLine);
    if (scIdx > 0) {
      const lastSelfCloseAbs = selfCloseOffsets[scIdx - 1];
      if (lastSelfCloseAbs > offset) {
        const tagEndAbs = offset + tagMatch[0].length - 1;
        const betweenContent = result.slice(tagEndAbs, lastSelfCloseAbs);
        // Strip quoted strings — `/` inside "..." or '...' is valid attr content
        const withoutQuotes = betweenContent.replace(/"[^"]*"|'[^']*'/g, '');
        if (!withoutQuotes.includes('/')) {
          return match; // Self-closing — safe for mdx-jsx
        }
      }
    }

    // Check for matching close tag </TagName> anywhere after offset (O(log n)).
    // Pre-fix used `rest.includes(closeTag)` which is O(n) per `<`.
    const positions = closeTagOffsets.get(tagName);
    if (positions) {
      const idx = lowerBound(positions, offset);
      if (idx < positions.length) {
        return match; // Has matching close tag — safe for mdx-jsx
      }
    }

    // Uppercase tag with no self-close and no matching close tag — protect
    return GUARD_OPEN;
  });

  // ── Brace guard ──
  // remark-mdx claims `{` as JSX expression start. An unclosed `{` (no
  // matching `}`) crashes with "Unexpected end of file in expression".
  // Protect ALL unmatched `{` with a PUA sentinel.
  //
  // Strategy: classic stack pairing with block-boundary awareness. Push
  // each `{` position; pop on `}`. On block boundaries, flush the stack
  // — treat all open braces as unmatched because remark-parse processes
  // block structure BEFORE remark-mdx processes expressions.
  //
  // Escape discipline (US-009, R6a): `{` preceded by an odd number of
  // backslashes is a CommonMark §2.4 escape — the brace is already
  // neutralized from remark-mdx's expression parser, so PUA-protecting
  // it would DEFEAT the escape semantics: remark-parse would see
  // `\<PUA>` and keep the backslash as literal text (since `<PUA>` is
  // not in §2.4's escapable set), producing text value `\{` on restore.
  // That text value then re-escapes on serialize to `\\\{`, growing 2
  // backslashes per round-trip (safeText non-idempotence). Skipping the
  // stack operations for escaped braces lets remark-parse apply the
  // escape naturally; position-slice then tags `data.escapedChars` and
  // the text handler re-emits `\{` on serialize. Idempotent.
  //
  // Symmetry note: `}` with odd preceding backslashes is similarly
  // skipped — an escaped `}` can't close an expression, so counting it
  // as a matched close would spuriously "pair" an earlier unmatched `{`,
  // bypassing protection and handing the unclosed expression to
  // remark-mdx (crash).
  //
  // This correctly handles `{{`, `{{{`, `{a{b}`, `{\n\n}text`,
  // `a{\n>}` (blockquote splits expression), `\{`, `\}`, `\{a}`, etc.
  {
    const unmatchedPositions: number[] = [];
    const stack: number[] = [];
    for (let i = 0; i < result.length; i++) {
      // Block boundary: flush open braces as unmatched
      if (result[i] === '\n') {
        const next = result[i + 1];
        if (next === '\n' || next === '>') {
          unmatchedPositions.push(...stack);
          stack.length = 0;
          if (next === '\n') {
            while (result[i + 1] === '\n') i++;
          }
          continue;
        }
      }
      if (result[i] === '{' || result[i] === '}') {
        // Count preceding backslashes; odd count means this brace is
        // CommonMark-escaped and remark-parse will consume the escape.
        // Escape-awareness for `<`/`>`/`:`/`@` is NOT applied here — those
        // passes unconditionally PUA-substitute. The position-slice walker
        // at packages/core/src/markdown/position-slice.ts (ESCAPABLE_CHARS
        // check + value-consistency guard, lines 100-116) is the
        // downstream enforcement point for the `\<` / `\>` / `\:` / `\@`
        // cases: if a future refactor makes R23 escape-aware for those
        // chars as well, the position-slice value-consistency guard can be
        // simplified at that time.
        let bs = 0;
        for (let j = i - 1; j >= 0 && result[j] === '\\'; j--) bs++;
        if (bs % 2 === 1) continue; // escaped — skip stack operations
        if (result[i] === '{') stack.push(i);
        else if (stack.length > 0) stack.pop(); // matched pair within same block
      }
    }
    // Any remaining at EOF are also unmatched
    unmatchedPositions.push(...stack);

    if (unmatchedPositions.length > 0) {
      const chars = [...result];
      for (const pos of unmatchedPositions) {
        chars[pos] = GUARD_OPEN_BRACE;
      }
      result = chars.join('');
    }
  }

  return result;
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
