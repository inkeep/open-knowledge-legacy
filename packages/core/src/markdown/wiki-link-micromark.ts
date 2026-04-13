/**
 * Wiki-link micromark extension: tokenizer + mdast-util + remark plugin.
 *
 * Tokenizes: [[Page]], [[Page|Alias]], [[Page#Heading]], [[Page#Heading|Alias]]
 * Produces mdast node: { type: 'wikiLink', value, data: { target, anchor, alias } }
 *
 * Ported from tech-probes/wiki-link-micromark/ (20/20 tests pass, ~100 SLOC).
 */

import type { Nodes as MdastNodes } from 'mdast';
import type { CompileContext, Extension as FromMarkdownExtension } from 'mdast-util-from-markdown';
import type { Construct, Extension, State, Token, Tokenizer } from 'micromark-util-types';

// Augment micromark's TokenTypeMap with our custom token types
declare module 'micromark-util-types' {
  interface TokenTypeMap {
    wikiLink: 'wikiLink';
    wikiLinkMarker: 'wikiLinkMarker';
    wikiLinkTarget: 'wikiLinkTarget';
    wikiLinkAnchor: 'wikiLinkAnchor';
    wikiLinkAlias: 'wikiLinkAlias';
    wikiLinkSeparator: 'wikiLinkSeparator';
  }
}

// ─────────────── micromark syntax extension ───────────────

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

/** Micromark syntax extension for wiki-links */
export function wikiLinkSyntax(): Extension {
  return {
    text: { [CODE_LBRACKET]: wikiLinkConstruct },
  };
}

// ─────────────── mdast-util-from-markdown extension ───────────────

function enterWikiLink(this: CompileContext, token: Token) {
  this.enter(
    { type: 'wikiLink', value: '', data: { target: '', anchor: null, alias: null } } as MdastNodes,
    token,
  );
}

function exitTarget(this: CompileContext, token: Token) {
  const node = this.stack[this.stack.length - 1] as Extract<MdastNodes, { type: 'wikiLink' }>;
  node.data.target = this.sliceSerialize(token).trim();
}

function exitAnchor(this: CompileContext, token: Token) {
  const node = this.stack[this.stack.length - 1] as Extract<MdastNodes, { type: 'wikiLink' }>;
  const raw = this.sliceSerialize(token).trim();
  node.data.anchor = raw.length ? raw : null;
}

function exitAlias(this: CompileContext, token: Token) {
  const node = this.stack[this.stack.length - 1] as Extract<MdastNodes, { type: 'wikiLink' }>;
  const raw = this.sliceSerialize(token).trim();
  node.data.alias = raw.length ? raw : null;
}

function exitWikiLink(this: CompileContext, token: Token) {
  const node = this.stack[this.stack.length - 1] as Extract<MdastNodes, { type: 'wikiLink' }>;
  const { target, anchor, alias } = node.data;
  node.value = alias ? alias : anchor ? `${target}#${anchor}` : target;
  this.exit(token);
}

/** mdast-util-from-markdown extension */
export const wikiLinkFromMarkdown: FromMarkdownExtension = {
  enter: { wikiLink: enterWikiLink },
  exit: {
    wikiLinkTarget: exitTarget,
    wikiLinkAnchor: exitAnchor,
    wikiLinkAlias: exitAlias,
    wikiLink: exitWikiLink,
  },
};

/** mdast-util-to-markdown extension (handlers + unsafe) */
export const wikiLinkToMarkdown = {
  handlers: {
    wikiLink(node: Extract<MdastNodes, { type: 'wikiLink' }>) {
      const target = node.data?.target ?? '';
      const anchor = node.data?.anchor;
      const alias = node.data?.alias;
      let out = `[[${target}`;
      if (anchor) out += `#${anchor}`;
      if (alias) out += `|${alias}`;
      return `${out}]]`;
    },
  },
  unsafe: [{ character: '[', inConstruct: ['phrasing'] }],
};

// ─────────────── remark plugin ───────────────

/**
 * Remark plugin that adds wiki-link syntax support.
 * Use: `.use(remarkWikiLink)`
 */
export function remarkWikiLink(this: {
  data(): {
    micromarkExtensions?: Extension[];
    fromMarkdownExtensions?: FromMarkdownExtension[];
    toMarkdownExtensions?: unknown[];
  };
}) {
  const data = this.data();

  // Register micromark syntax extension
  if (!data.micromarkExtensions) data.micromarkExtensions = [];
  data.micromarkExtensions.push(wikiLinkSyntax());

  // Register mdast-util extensions
  if (!data.fromMarkdownExtensions) data.fromMarkdownExtensions = [];
  data.fromMarkdownExtensions.push(wikiLinkFromMarkdown);

  if (!data.toMarkdownExtensions) data.toMarkdownExtensions = [];
  data.toMarkdownExtensions.push(wikiLinkToMarkdown);
}
