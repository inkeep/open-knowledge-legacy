/**
 * mdast-util extensions for wikiLink: from-markdown + to-markdown.
 *
 * Node shape:
 *   { type: 'wikiLink', value: <display>, data: { target, anchor, alias } }
 *
 * @typedef {import('mdast-util-from-markdown').Extension} FromMarkdownExtension
 * @typedef {import('mdast-util-to-markdown').Options} ToMarkdownExtension
 */

export const wikiLinkFromMarkdown = {
  enter: {
    wikiLink: enterWikiLink,
  },
  exit: {
    wikiLinkTarget: exitTarget,
    wikiLinkAnchor: exitAnchor,
    wikiLinkAlias: exitAlias,
    wikiLink: exitWikiLink,
  },
};

function enterWikiLink(token) {
  this.enter(
    { type: 'wikiLink', value: '', data: { target: '', anchor: null, alias: null } },
    token,
  );
}
function sliceToken(ctx, token) {
  // sliceSerialize gives the text content of the token range.
  return ctx.sliceSerialize(token);
}
function exitTarget(token) {
  const node = this.stack[this.stack.length - 1];
  node.data.target = sliceToken(this, token).trim();
}
function exitAnchor(token) {
  const node = this.stack[this.stack.length - 1];
  const raw = sliceToken(this, token).trim();
  node.data.anchor = raw.length ? raw : null;
}
function exitAlias(token) {
  const node = this.stack[this.stack.length - 1];
  const raw = sliceToken(this, token).trim();
  node.data.alias = raw.length ? raw : null;
}
function exitWikiLink(token) {
  const node = this.stack[this.stack.length - 1];
  const { target, anchor, alias } = node.data;
  node.value = alias ? alias : anchor ? `${target}#${anchor}` : target;
  this.exit(token);
}

export const wikiLinkToMarkdown = {
  handlers: {
    wikiLink(node) {
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
