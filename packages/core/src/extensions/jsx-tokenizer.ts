/**
 * JSX Block Tokenizer for marked — three versions at increasing robustness.
 *
 * This module provides `start()` and `tokenizer()` functions for use in a
 * marked extension that intercepts JSX component blocks (tags starting with
 * an uppercase letter) BEFORE marked's built-in HTML tokenizer runs.
 *
 * The tokenizer must handle:
 *   - Self-closing tags: <Image src="..." />
 *   - Paired tags with children: <Callout>...</Callout>
 *   - Nested different-name tags: <Steps><Step>...</Step></Steps>
 *   - (Version B+) Nested same-name tags: <Callout><Callout>inner</Callout></Callout>
 *   - (Version B+) Expression attributes with >: <Chart filter={x => x > 5}>
 *
 * All versions share the same `start()` function.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Shared: start() — tells marked where the next potential JSX block begins
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the index of the first `<` followed by an uppercase letter, or -1.
 * marked calls this on each remaining chunk of source text to decide whether
 * to attempt the tokenizer.
 */
export function jsxStart(src: string): number {
  const match = src.match(/^[ \t]*<[A-Z]/m);
  return match?.index ?? -1;
}

// ─────────────────────────────────────────────────────────────────────────────
// Version A — Simple regex, covers ~95% of practical cases
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Simple regex-based JSX tokenizer.
 *
 * Handles:
 *   - Self-closing tags: <Component attr="val" />
 *   - Paired tags with simple/string/boolean attributes
 *   - Nested DIFFERENT-name tags (Steps > Step, Tabs > Tab, etc.)
 *   - Multiple sequential same-name siblings
 *   - Expression attributes containing > (via regex backtracking -- the
 *     [^>]* misparses the opening-tag boundary, but [\s\S]*? absorbs the
 *     rest and the overall match is correct)
 *   - Expression attributes containing /> (same backtracking mechanism)
 *
 * Does NOT handle:
 *   - Nested SAME-name tags (<Callout><Callout>inner</Callout></Callout>)
 *     The non-greedy [\s\S]*? matches to the FIRST </TagName>, not the
 *     correct matching one. This is the ONLY known failure mode.
 *
 * ~20 lines of logic.
 */
export function jsxTokenizerA(src: string): JsxToken | undefined {
  // Self-closing: <Component attr="val" />
  const selfClose = src.match(/^[ \t]*<([A-Z][A-Za-z0-9]*)\b[^>]*?\/>\s*(?:\n|$)/);
  if (selfClose) {
    return {
      type: 'jsxBlock',
      raw: selfClose[0],
      tagName: selfClose[1],
      content: selfClose[0].trim(),
    };
  }

  // Paired: <Component ...>children</Component>
  // The [^>]* stops at the first >, then [\s\S]*? non-greedy matches to
  // the FIRST </TagName>. This fails for nested same-name tags.
  const paired = src.match(/^[ \t]*<([A-Z][A-Za-z0-9]*)\b[^>]*>([\s\S]*?)<\/\1>\s*(?:\n|$)/);
  if (paired) {
    return {
      type: 'jsxBlock',
      raw: paired[0],
      tagName: paired[1],
      content: paired[0].trim(),
    };
  }

  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Version B — Tag-counting + brace-depth, covers 99%+ of cases
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Robust JSX tokenizer using character-level scanning.
 *
 * Handles everything Version A handles, PLUS:
 *   - Nested same-name tags via open/close tag counting
 *   - Expression attributes containing > via brace-depth tracking
 *   - Expression attributes containing /> via brace-depth tracking
 *   - String attribute values containing > or { characters
 *
 * Strategy:
 *   1. Parse the opening tag character-by-character, tracking brace depth
 *      and string context to correctly find the closing >
 *   2. If the opening tag is self-closing (/>) we are done
 *   3. Otherwise, scan the body counting open/close tags of the same name
 *      to find the correct matching close tag
 *
 * ~80 lines of logic.
 */
export function jsxTokenizerB(src: string): JsxToken | undefined {
  // Quick check: must start with optional whitespace then <Uppercase
  const startMatch = src.match(/^([ \t]*)<([A-Z][A-Za-z0-9]*)\b/);
  if (!startMatch) return undefined;

  const leadingWhitespace = startMatch[1];
  const tagName = startMatch[2];
  const tagStart = leadingWhitespace.length;

  // Step 1: Find the end of the opening tag, respecting braces and strings
  const openTagEnd = findOpenTagEnd(src, tagStart);
  if (openTagEnd === -1) return undefined;

  // Step 2: Check if self-closing
  const isSelfClosing = src[openTagEnd - 1] === '/' && src[openTagEnd] === '>';
  if (isSelfClosing) {
    const rawEnd = consumeTrailingNewline(src, openTagEnd + 1);
    const raw = src.slice(0, rawEnd);
    return { type: 'jsxBlock', raw, tagName, content: raw.trim() };
  }

  // Step 3: Find the matching close tag using tag counting
  const bodyStart = openTagEnd + 1; // character after >
  const closeEnd = findMatchingClose(src, tagName, bodyStart);
  if (closeEnd === -1) return undefined;

  const rawEnd = consumeTrailingNewline(src, closeEnd);
  const raw = src.slice(0, rawEnd);
  return { type: 'jsxBlock', raw, tagName, content: raw.trim() };
}

/**
 * Scans from the opening `<` to find the closing `>` of the opening tag,
 * respecting brace-depth (for expression attributes) and string literals.
 *
 * Returns the index of the closing `>`, or -1 if not found.
 */
function findOpenTagEnd(src: string, startIdx: number): number {
  let i = startIdx;
  let braceDepth = 0;
  let inString: string | null = null; // tracks quote character (' or ")

  // Skip past the < and tag name
  if (src[i] !== '<') return -1;
  i++; // skip <
  // Skip tag name
  while (i < src.length && /[A-Za-z0-9]/.test(src[i])) i++;

  // Now scan attributes
  while (i < src.length) {
    const ch = src[i];

    // Inside a string literal — only the matching quote ends it
    if (inString) {
      if (ch === '\\') {
        i += 2; // skip escaped character
        continue;
      }
      if (ch === inString) {
        inString = null;
      }
      i++;
      continue;
    }

    // Inside a brace expression — track depth
    if (braceDepth > 0) {
      if (ch === '{') braceDepth++;
      else if (ch === '}') braceDepth--;
      else if (ch === '"' || ch === "'") inString = ch;
      else if (ch === '`') {
        // Template literal — scan to matching backtick (simplified: no nesting)
        i++;
        while (i < src.length && src[i] !== '`') {
          if (src[i] === '\\') i++;
          i++;
        }
      }
      i++;
      continue;
    }

    // Outside braces and strings
    if (ch === '{') {
      braceDepth++;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = ch;
      i++;
      continue;
    }
    if (ch === '/' && i + 1 < src.length && src[i + 1] === '>') {
      // Self-closing: return index of >
      return i + 1;
    }
    if (ch === '>') {
      return i;
    }
    i++;
  }

  return -1; // unterminated opening tag
}

/**
 * Starting after the opening tag's `>`, scans the body to find the matching
 * `</tagName>`, counting nested open/close tags of the same name.
 *
 * Returns the index one past the final `>` of the closing tag, or -1.
 */
function findMatchingClose(src: string, tagName: string, startIdx: number): number {
  let depth = 1; // we already have one open tag
  let i = startIdx;
  const openPattern = `<${tagName}`;
  const closePattern = `</${tagName}`;

  while (i < src.length && depth > 0) {
    // Quick skip: find next < character
    const nextAngle = src.indexOf('<', i);
    if (nextAngle === -1) break;
    i = nextAngle;

    // Check for closing tag: </TagName> or </TagName  >
    if (src.startsWith(closePattern, i)) {
      const afterName = i + closePattern.length;
      // Must be followed by > or whitespace then >
      const closeEnd = src.indexOf('>', afterName);
      if (closeEnd !== -1) {
        const between = src.slice(afterName, closeEnd).trim();
        if (between === '') {
          depth--;
          if (depth === 0) {
            return closeEnd + 1; // index past >
          }
          i = closeEnd + 1;
          continue;
        }
      }
    }

    // Check for opening tag: <TagName  or <TagName> or <TagName/> or <TagName ...
    if (src.startsWith(openPattern, i)) {
      const afterName = i + openPattern.length;
      if (afterName >= src.length) break;
      const nextChar = src[afterName];
      // Ensure it's actually the tag name boundary (not <TabName when tag is Tab)
      if (
        nextChar === '>' ||
        nextChar === '/' ||
        nextChar === ' ' ||
        nextChar === '\t' ||
        nextChar === '\n'
      ) {
        // Check if self-closing — find the > for this tag
        const tagEnd = findOpenTagEnd(src, i);
        if (tagEnd === -1) break;
        const isSC = src[tagEnd - 1] === '/' && src[tagEnd] === '>';
        if (!isSC) {
          depth++;
        }
        // Skip past this tag
        i = tagEnd + 1;
        continue;
      }
    }

    // Not a tag of interest — skip past this <
    i++;
  }

  return -1; // no matching close found
}

/**
 * Advances past optional trailing whitespace and one newline.
 * marked requires `raw` to include consumed whitespace so the cursor
 * advances correctly.
 */
function consumeTrailingNewline(src: string, idx: number): number {
  let i = idx;
  // consume optional trailing spaces/tabs
  while (i < src.length && (src[i] === ' ' || src[i] === '\t')) i++;
  // consume one newline if present
  if (i < src.length && src[i] === '\n') i++;
  else if (i + 1 < src.length && src[i] === '\r' && src[i + 1] === '\n') i += 2;
  return i;
}

// ─────────────────────────────────────────────────────────────────────────────
// Version C — Hybrid: regex start() + acorn-jsx tokenize()
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Version C: Hybrid regex/acorn-jsx tokenizer.
 *
 * The idea: use acorn-jsx to parse the opening tag with full JS expression
 * parsing, then use Version B's tag-counting for the body/close.
 *
 * WHY THIS DOESN'T WORK WELL IN PRACTICE:
 *   - acorn-jsx parses JSX _elements_, not just opening tags. The children
 *     of the JSX element are expected to be valid JSX/JS, but in our case
 *     they are markdown (plain text, headings, code blocks, etc.).
 *   - Wrapping the markdown children in a JS context for acorn to parse
 *     is fragile and requires escaping.
 *   - acorn could parse just the opening tag by feeding it `<Tag ...>` as
 *     a JSXOpeningElement, but extracting that substring is exactly what
 *     Version B's findOpenTagEnd already does.
 *   - The marginal benefit is JS expression VALIDATION (syntax checking),
 *     which we don't need for tokenization.
 *
 * ARCHITECTURAL CONCLUSION:
 *   Version C = Version B's findOpenTagEnd replaced with acorn-jsx, providing
 *   marginal benefit (expression validation) for substantial complexity
 *   (~50KB runtime dependency, error handling for invalid JS expressions).
 *   Since Version B's brace-depth tracking handles all practical cases,
 *   Version C is not worth implementing.
 *
 * If we ever need a true JSX parser (e.g., for extracting structured prop
 * values from expression attributes), we should use acorn-jsx at that layer,
 * not at the tokenizer layer.
 */
export function jsxTokenizerC(src: string): JsxToken | undefined {
  // Delegates to Version B — see rationale above.
  return jsxTokenizerB(src);
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared types
// ─────────────────────────────────────────────────────────────────────────────

export interface JsxToken {
  type: 'jsxBlock';
  raw: string;
  tagName: string;
  content: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory: creates a marked extension using the specified tokenizer version
// ─────────────────────────────────────────────────────────────────────────────

export type TokenizerVersion = 'A' | 'B' | 'C';

const tokenizers = {
  A: jsxTokenizerA,
  B: jsxTokenizerB,
  C: jsxTokenizerC,
};

/**
 * Creates a marked extension object for JSX block tokenization.
 *
 * Usage:
 * ```ts
 * import { marked } from 'marked';
 * import { createJsxBlockExtension } from './jsx-tokenizer';
 *
 * marked.use({ extensions: [createJsxBlockExtension('B')] });
 * ```
 */
export function createJsxBlockExtension(version: TokenizerVersion = 'B') {
  const tokenize = tokenizers[version];

  return {
    name: 'jsxBlock',
    level: 'block' as const,
    start: jsxStart,
    tokenizer(src: string) {
      return tokenize(src);
    },
    renderer(token: JsxToken) {
      // Default renderer — in practice, the Tiptap parseMarkdown handler
      // consumes this token before the renderer is called.
      return token.content;
    },
  };
}
