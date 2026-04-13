/**
 * Micromark syntax extension for wiki-links: [[Target]], [[Target|Alias]],
 * [[Target#Anchor]], [[Target#Anchor|Alias]].
 *
 * Forbidden inside target/anchor/alias: '[', ']', '\n'.
 * Pipe '|' is forbidden in target/anchor. '#' ends target, starts anchor.
 * Escaping: a preceding backslash on the FIRST '[' disables the construct
 * (handled by micromark's character-escape construct naturally).
 *
 * @typedef {import('micromark-util-types').Extension} Extension
 * @typedef {import('micromark-util-types').Construct} Construct
 * @typedef {import('micromark-util-types').State} State
 * @typedef {import('micromark-util-types').Tokenizer} Tokenizer
 */

const CODE_LBRACKET = 91; // [
const CODE_RBRACKET = 93; // ]
const CODE_PIPE = 124; // |
const CODE_HASH = 35; // #
const CODE_EOF = null;
const CODE_LF = -5; // micromark marker for \n (markdownLineEnding)
const CODE_CR = -5;

/** @returns {Extension} */
export function wikiLink() {
  /** @type {Construct} */
  const construct = {
    name: 'wikiLink',
    tokenize: tokenizeWikiLink,
  };
  return {
    text: { [CODE_LBRACKET]: construct },
  };
}

/** @type {Tokenizer} */
function tokenizeWikiLink(effects, ok, nok) {
  let targetSize = 0;
  let anchorSize = 0;
  let aliasSize = 0;
  let sawAnchor = false;
  let sawAlias = false;

  return start;

  /** @type {State} */
  function start(code) {
    if (code !== CODE_LBRACKET) return nok(code);
    effects.enter('wikiLink');
    effects.enter('wikiLinkMarker');
    effects.consume(code);
    return open2;
  }

  /** @type {State} */
  function open2(code) {
    if (code !== CODE_LBRACKET) return nok(code);
    effects.consume(code);
    effects.exit('wikiLinkMarker');
    effects.enter('wikiLinkTarget');
    return target;
  }

  /** @type {State} */
  function target(code) {
    if (code === CODE_EOF || code === -5 || code === -4 || code === -3) {
      return nok(code);
    }
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
      sawAnchor = true;
      return anchor;
    }
    if (code === CODE_PIPE) {
      if (targetSize === 0) return nok(code);
      effects.exit('wikiLinkTarget');
      effects.enter('wikiLinkSeparator');
      effects.consume(code);
      effects.exit('wikiLinkSeparator');
      effects.enter('wikiLinkAlias');
      sawAlias = true;
      return alias;
    }
    effects.consume(code);
    targetSize++;
    return target;
  }

  /** @type {State} */
  function anchor(code) {
    if (code === CODE_EOF || code === -5 || code === -4 || code === -3) {
      return nok(code);
    }
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
      sawAlias = true;
      return alias;
    }
    // '#' inside anchor: consume as literal (matches current regex which
    // greedily matches [^\]|] so a second # is part of the anchor).
    effects.consume(code);
    anchorSize++;
    return anchor;
  }

  /** @type {State} */
  function alias(code) {
    if (code === CODE_EOF || code === -5 || code === -4 || code === -3) {
      return nok(code);
    }
    if (code === CODE_LBRACKET) return nok(code);
    if (code === CODE_RBRACKET) {
      if (aliasSize === 0) return nok(code);
      effects.exit('wikiLinkAlias');
      return close1(code);
    }
    effects.consume(code);
    aliasSize++;
    return alias;
  }

  /** @type {State} */
  function close1(code) {
    if (code !== CODE_RBRACKET) return nok(code);
    effects.enter('wikiLinkMarker');
    effects.consume(code);
    return close2;
  }

  /** @type {State} */
  function close2(code) {
    if (code !== CODE_RBRACKET) return nok(code);
    effects.consume(code);
    effects.exit('wikiLinkMarker');
    effects.exit('wikiLink');
    return ok;
  }
}
