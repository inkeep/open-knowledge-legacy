/**
 * Wiki-link micromark extension: tokenizer + mdast-util + remark plugin.
 *
 * Tokenizes: [[Page]], [[Page|Alias]], [[Page#Heading]], [[Page#Heading|Alias]]
 * Produces mdast node: { type: 'wikiLink', value, data: { target, anchor, alias } }
 *
 * Ported from tech-probes/wiki-link-micromark/ (20/20 tests pass, ~100 SLOC).
 */
import type { CompileContext, Extension as FromMarkdownExtension } from 'mdast-util-from-markdown';
import type { Handle as ToMarkdownHandle } from 'mdast-util-to-markdown';
import type { Construct, Extension, State, Token, Tokenizer } from 'micromark-util-types';
import type { Processor } from 'unified';
import type { WikiLinkEmbedMdast, WikiLinkMdast } from './mdast-augmentation.ts';

// Augment micromark's TokenTypeMap with our custom token types
declare module 'micromark-util-types' {
  interface TokenTypeMap {
    wikiLink: 'wikiLink';
    wikiLinkMarker: 'wikiLinkMarker';
    wikiLinkTarget: 'wikiLinkTarget';
    wikiLinkAnchor: 'wikiLinkAnchor';
    wikiLinkAlias: 'wikiLinkAlias';
    wikiLinkSeparator: 'wikiLinkSeparator';
    wikiLinkEmbed: 'wikiLinkEmbed';
    wikiLinkEmbedBang: 'wikiLinkEmbedBang';
  }
}

// ─────────────── micromark syntax extension ───────────────

const CODE_BANG = 33; // !
const CODE_LBRACKET = 91; // [
const CODE_RBRACKET = 93; // ]
const CODE_PIPE = 124; // |
const CODE_HASH = 35; // #

const tokenizeWikiLink: Tokenizer = (effects, ok, nok) => {
  let targetSize = 0;
  let anchorSize = 0;
  let aliasSize = 0;

  return start;

  function start(code: number | null): State | undefined {
    if (code !== CODE_LBRACKET) return nok(code);
    effects.enter('wikiLink');
    effects.enter('wikiLinkMarker');
    effects.consume(code);
    return open2 as State;
  }

  function open2(code: number | null): State | undefined {
    if (code !== CODE_LBRACKET) return nok(code);
    effects.consume(code);
    effects.exit('wikiLinkMarker');
    effects.enter('wikiLinkTarget');
    return target as State;
  }

  function target(code: number | null): State | undefined {
    // EOF or line ending
    if (code === null || code === -5 || code === -4 || code === -3) return nok(code);
    if (code === CODE_LBRACKET) return nok(code);
    if (code === CODE_RBRACKET) {
      if (targetSize === 0) return nok(code);
      effects.exit('wikiLinkTarget');
      return close1(code);
    }
    if (code === CODE_HASH) {
      if (targetSize === 0) return nok(code);
      effects.exit('wikiLinkTarget');
      effects.enter('wikiLinkSeparator');
      effects.consume(code);
      effects.exit('wikiLinkSeparator');
      effects.enter('wikiLinkAnchor');
      return anchor as State;
    }
    if (code === CODE_PIPE) {
      if (targetSize === 0) return nok(code);
      effects.exit('wikiLinkTarget');
      effects.enter('wikiLinkSeparator');
      effects.consume(code);
      effects.exit('wikiLinkSeparator');
      effects.enter('wikiLinkAlias');
      return alias as State;
    }
    effects.consume(code);
    targetSize++;
    return target as State;
  }

  function anchor(code: number | null): State | undefined {
    if (code === null || code === -5 || code === -4 || code === -3) return nok(code);
    if (code === CODE_LBRACKET) return nok(code);
    if (code === CODE_RBRACKET) {
      if (anchorSize === 0) return nok(code);
      effects.exit('wikiLinkAnchor');
      return close1(code);
    }
    if (code === CODE_PIPE) {
      if (anchorSize === 0) return nok(code);
      effects.exit('wikiLinkAnchor');
      effects.enter('wikiLinkSeparator');
      effects.consume(code);
      effects.exit('wikiLinkSeparator');
      effects.enter('wikiLinkAlias');
      return alias as State;
    }
    effects.consume(code);
    anchorSize++;
    return anchor as State;
  }

  function alias(code: number | null): State | undefined {
    if (code === null || code === -5 || code === -4 || code === -3) return nok(code);
    if (code === CODE_LBRACKET) return nok(code);
    if (code === CODE_RBRACKET) {
      if (aliasSize === 0) return nok(code);
      effects.exit('wikiLinkAlias');
      return close1(code);
    }
    effects.consume(code);
    aliasSize++;
    return alias as State;
  }

  function close1(code: number | null): State | undefined {
    if (code !== CODE_RBRACKET) return nok(code);
    effects.enter('wikiLinkMarker');
    effects.consume(code);
    return close2 as State;
  }

  function close2(code: number | null): State | undefined {
    if (code !== CODE_RBRACKET) return nok(code);
    effects.consume(code);
    effects.exit('wikiLinkMarker');
    effects.exit('wikiLink');
    return ok;
  }
};

const wikiLinkConstruct: Construct = {
  name: 'wikiLink',
  tokenize: tokenizeWikiLink,
};

// Asset embed: `![[file.ext]]`, `![[file.ext|alt]]`, `![[file.pdf#page=3]]`.
// Distinct state machine so the outer token is `wikiLinkEmbed` — the compile
// step keys off outer-token to build a `wikiLinkEmbed` mdast node rather
// than mixing embeds into the `wikiLink` type. Inner target/anchor/alias
// tokens reuse the wikiLink* token names because the exit handlers mutate
// the top-of-stack node, which is `wikiLinkEmbed` during an embed parse —
// the data shape is identical.
const tokenizeWikiLinkEmbed: Tokenizer = (effects, ok, nok) => {
  let targetSize = 0;
  let anchorSize = 0;
  let aliasSize = 0;

  return start;

  function start(code: number | null): State | undefined {
    if (code !== CODE_BANG) return nok(code);
    effects.enter('wikiLinkEmbed');
    effects.enter('wikiLinkEmbedBang');
    effects.consume(code);
    effects.exit('wikiLinkEmbedBang');
    return open1 as State;
  }

  function open1(code: number | null): State | undefined {
    if (code !== CODE_LBRACKET) return nok(code);
    effects.enter('wikiLinkMarker');
    effects.consume(code);
    return open2 as State;
  }

  function open2(code: number | null): State | undefined {
    if (code !== CODE_LBRACKET) return nok(code);
    effects.consume(code);
    effects.exit('wikiLinkMarker');
    effects.enter('wikiLinkTarget');
    return target as State;
  }

  function target(code: number | null): State | undefined {
    if (code === null || code === -5 || code === -4 || code === -3) return nok(code);
    if (code === CODE_LBRACKET) return nok(code);
    if (code === CODE_RBRACKET) {
      if (targetSize === 0) return nok(code);
      effects.exit('wikiLinkTarget');
      return close1(code);
    }
    if (code === CODE_HASH) {
      if (targetSize === 0) return nok(code);
      effects.exit('wikiLinkTarget');
      effects.enter('wikiLinkSeparator');
      effects.consume(code);
      effects.exit('wikiLinkSeparator');
      effects.enter('wikiLinkAnchor');
      return anchor as State;
    }
    if (code === CODE_PIPE) {
      if (targetSize === 0) return nok(code);
      effects.exit('wikiLinkTarget');
      effects.enter('wikiLinkSeparator');
      effects.consume(code);
      effects.exit('wikiLinkSeparator');
      effects.enter('wikiLinkAlias');
      return alias as State;
    }
    effects.consume(code);
    targetSize++;
    return target as State;
  }

  function anchor(code: number | null): State | undefined {
    if (code === null || code === -5 || code === -4 || code === -3) return nok(code);
    if (code === CODE_LBRACKET) return nok(code);
    if (code === CODE_RBRACKET) {
      if (anchorSize === 0) return nok(code);
      effects.exit('wikiLinkAnchor');
      return close1(code);
    }
    if (code === CODE_PIPE) {
      if (anchorSize === 0) return nok(code);
      effects.exit('wikiLinkAnchor');
      effects.enter('wikiLinkSeparator');
      effects.consume(code);
      effects.exit('wikiLinkSeparator');
      effects.enter('wikiLinkAlias');
      return alias as State;
    }
    effects.consume(code);
    anchorSize++;
    return anchor as State;
  }

  function alias(code: number | null): State | undefined {
    if (code === null || code === -5 || code === -4 || code === -3) return nok(code);
    if (code === CODE_LBRACKET) return nok(code);
    if (code === CODE_RBRACKET) {
      if (aliasSize === 0) return nok(code);
      effects.exit('wikiLinkAlias');
      return close1(code);
    }
    effects.consume(code);
    aliasSize++;
    return alias as State;
  }

  function close1(code: number | null): State | undefined {
    if (code !== CODE_RBRACKET) return nok(code);
    effects.enter('wikiLinkMarker');
    effects.consume(code);
    return close2 as State;
  }

  function close2(code: number | null): State | undefined {
    if (code !== CODE_RBRACKET) return nok(code);
    effects.consume(code);
    effects.exit('wikiLinkMarker');
    effects.exit('wikiLinkEmbed');
    return ok;
  }
};

const wikiLinkEmbedConstruct: Construct = {
  name: 'wikiLinkEmbed',
  tokenize: tokenizeWikiLinkEmbed,
};

/**
 * Micromark syntax extension for wiki-links AND asset embeds.
 * CODE_LBRACKET (91) → `[[Page]]` link construct.
 * CODE_BANG (33)    → `![[file.ext]]` embed construct.
 *
 * Both constructs are registered on the `text` map so they're available
 * anywhere inline content is allowed. Backslash-escape of either sigil
 * (`\!` or `\[`) is handled upstream by CommonMark §2.4 escape parsing —
 * the escape construct consumes the backslash+char pair before our
 * tokenizers see the stream.
 */
export function wikiLinkSyntax(): Extension {
  return {
    text: {
      [CODE_LBRACKET]: wikiLinkConstruct,
      [CODE_BANG]: wikiLinkEmbedConstruct,
    },
  };
}

// ─────────────── mdast-util-from-markdown extension ───────────────

function enterWikiLink(this: CompileContext, token: Token) {
  this.enter(
    {
      type: 'wikiLink',
      value: '',
      data: { target: '', anchor: null, alias: null },
      children: [],
    } as unknown as Parameters<CompileContext['enter']>[0],
    token,
  );
}

function enterWikiLinkEmbed(this: CompileContext, token: Token) {
  this.enter(
    {
      type: 'wikiLinkEmbed',
      value: '',
      data: { target: '', anchor: null, alias: null },
      children: [],
    } as unknown as Parameters<CompileContext['enter']>[0],
    token,
  );
}

function topNode<T>(ctx: CompileContext): T {
  return ctx.stack[ctx.stack.length - 1] as unknown as T;
}

function exitTarget(this: CompileContext, token: Token) {
  const node = topNode<WikiLinkMdast | WikiLinkEmbedMdast>(this);
  node.data.target = this.sliceSerialize(token).trim();
}

function exitAnchor(this: CompileContext, token: Token) {
  const node = topNode<WikiLinkMdast | WikiLinkEmbedMdast>(this);
  const raw = this.sliceSerialize(token).trim();
  node.data.anchor = raw.length ? raw : null;
}

function exitAlias(this: CompileContext, token: Token) {
  const node = topNode<WikiLinkMdast | WikiLinkEmbedMdast>(this);
  const raw = this.sliceSerialize(token).trim();
  node.data.alias = raw.length ? raw : null;
}

function finalizeLabel(node: WikiLinkMdast | WikiLinkEmbedMdast): void {
  const { target, anchor, alias } = node.data;
  const label = alias ? alias : anchor ? `${target}#${anchor}` : target;
  node.value = label;
  // Populate children so mdast→hast (US-007 / US-010) renders `<a>label</a>`
  // with visible text. The markdown handler reads `data`, not children, so
  // there is no double-emit on serialize.
  node.children = [{ type: 'text', value: label }];
}

function exitWikiLink(this: CompileContext, token: Token) {
  finalizeLabel(topNode<WikiLinkMdast>(this));
  this.exit(token);
}

function exitWikiLinkEmbed(this: CompileContext, token: Token) {
  finalizeLabel(topNode<WikiLinkEmbedMdast>(this));
  this.exit(token);
}

/** mdast-util-from-markdown extension */
export const wikiLinkFromMarkdown: FromMarkdownExtension = {
  enter: {
    wikiLink: enterWikiLink,
    wikiLinkEmbed: enterWikiLinkEmbed,
  },
  exit: {
    wikiLinkTarget: exitTarget,
    wikiLinkAnchor: exitAnchor,
    wikiLinkAlias: exitAlias,
    wikiLink: exitWikiLink,
    wikiLinkEmbed: exitWikiLinkEmbed,
  },
};

/** mdast-util-to-markdown extension (handlers + unsafe) */
const wikiLinkHandler: ToMarkdownHandle = (node) => {
  const wiki = node as unknown as WikiLinkMdast;
  const target = wiki.data?.target ?? '';
  const anchor = wiki.data?.anchor;
  const alias = wiki.data?.alias;
  let out = `[[${target}`;
  if (anchor) out += `#${anchor}`;
  if (alias) out += `|${alias}`;
  return `${out}]]`;
};

const wikiLinkEmbedHandler: ToMarkdownHandle = (node) => {
  const embed = node as unknown as WikiLinkEmbedMdast;
  const target = embed.data?.target ?? '';
  const anchor = embed.data?.anchor;
  const alias = embed.data?.alias;
  let out = `![[${target}`;
  if (anchor) out += `#${anchor}`;
  if (alias) out += `|${alias}`;
  return `${out}]]`;
};

export const wikiLinkToMarkdown: {
  handlers: Record<string, ToMarkdownHandle>;
  unsafe: Array<{ character: string; inConstruct: string[] }>;
} = {
  handlers: {
    wikiLink: wikiLinkHandler,
    wikiLinkEmbed: wikiLinkEmbedHandler,
  },
  unsafe: [{ character: '[', inConstruct: ['phrasing'] }],
};

// ─────────────── remark plugin ───────────────

/**
 * Module-level singleton. wikiLinkSyntax() builds a fresh Extension each call;
 * R16 (spec 2026-04-16 markdown-pipeline-engineering-health) requires the
 * attacher to be idempotent under re-entry, which means identity-based dedup:
 * we always push the SAME object reference, never a rebuilt clone.
 */
const MICROMARK_EXT = wikiLinkSyntax();

/**
 * Remark plugin that adds wiki-link syntax support.
 * Use: `.use(remarkWikiLink)`
 *
 * Idempotent: if the processor's `data()` already carries the exact
 * `MICROMARK_EXT` / `wikiLinkFromMarkdown` / `wikiLinkToMarkdown` references,
 * the attacher leaves them alone. Under the cached-processor pattern this is
 * defense-in-depth — unified freezes the processor on first use, so the
 * attacher only ever fires once per processor anyway.
 */
export function remarkWikiLink(this: Processor) {
  const data = this.data() as {
    micromarkExtensions?: unknown[];
    fromMarkdownExtensions?: unknown[];
    toMarkdownExtensions?: unknown[];
  };

  // Register micromark syntax extension
  if (!data.micromarkExtensions) data.micromarkExtensions = [];
  if (!data.micromarkExtensions.some((e) => e === MICROMARK_EXT)) {
    data.micromarkExtensions.push(MICROMARK_EXT);
  }

  // Register mdast-util extensions (already module-level singletons)
  if (!data.fromMarkdownExtensions) data.fromMarkdownExtensions = [];
  if (!data.fromMarkdownExtensions.some((e) => e === wikiLinkFromMarkdown)) {
    data.fromMarkdownExtensions.push(wikiLinkFromMarkdown);
  }

  if (!data.toMarkdownExtensions) data.toMarkdownExtensions = [];
  if (!data.toMarkdownExtensions.some((e) => e === wikiLinkToMarkdown)) {
    data.toMarkdownExtensions.push(wikiLinkToMarkdown);
  }
}
