import { posix } from 'node:path';
import { resolveInternalHref } from '@inkeep/open-knowledge-core';

interface FenceState {
  char: '`' | '~';
  length: number;
}

export interface RenameRewriteResult {
  markdown: string;
  rewrites: number;
}

function matchFence(line: string): FenceState | null {
  const match = /^\s{0,3}([`~]{3,})/.exec(line);
  if (!match) return null;
  const fence = match[1];
  const char = fence[0];
  if (char !== '`' && char !== '~') return null;
  return { char, length: fence.length };
}

function isFenceClose(line: string, fence: FenceState): boolean {
  return new RegExp(`^\\s{0,3}\\${fence.char}{${fence.length},}\\s*$`).test(line);
}

function leadingMarkdownPrefixLength(line: string): number {
  const match = /^\s{0,3}(?:#{1,6}\s+|>\s+|(?:[-+*]|\d+[.)])\s+)/.exec(line);
  return match ? match[0].length : 0;
}

function readInlineCode(line: string, start: number): { nextIndex: number } | null {
  let runLength = 0;
  while (line[start + runLength] === '`') runLength++;
  if (runLength === 0) return null;
  const openEnd = start + runLength;

  let i = openEnd;
  while (i < line.length) {
    if (line[i] !== '`') {
      i++;
      continue;
    }
    let closeLen = 0;
    while (line[i + closeLen] === '`') closeLen++;
    if (closeLen === runLength) {
      return { nextIndex: i + runLength };
    }
    i += closeLen;
  }

  return null;
}

function readWikiLink(
  line: string,
  start: number,
): { target: string; alias: string | null; anchor: string | null; nextIndex: number } | null {
  const match = /^\[\[([^\n#[\]|]+)(?:#([^\n[\]|]+))?(?:\|([^\n[\]]+))?\]\]/.exec(
    line.slice(start),
  );
  if (!match) return null;

  const target = match[1]?.trim();
  const anchor = match[2]?.trim() || null;
  const alias = match[3]?.trim() || null;
  if (!target) return null;

  return {
    target,
    alias,
    anchor,
    nextIndex: start + match[0].length,
  };
}

function readMarkdownLink(
  line: string,
  start: number,
): {
  text: string;
  hrefRaw: string;
  href: string;
  titleSuffix: string;
  nextIndex: number;
} | null {
  const match =
    /^\[([^\]\n]*)\]\((<[^>\n]+>|[^)\s\n]+)((?:\s+(?:"[^"\n]*"|'[^'\n]*'|\([^)\n]*\)))?)\)/.exec(
      line.slice(start),
    );
  if (!match) return null;

  const hrefRaw = match[2] ?? '';
  return {
    text: match[1] ?? '',
    hrefRaw,
    href: hrefRaw.startsWith('<') && hrefRaw.endsWith('>') ? hrefRaw.slice(1, -1) : hrefRaw,
    titleSuffix: match[3] ?? '',
    nextIndex: start + match[0].length,
  };
}

function splitLines(markdown: string): Array<{ line: string; ending: string }> {
  const parts = markdown.split(/(\r\n|\r|\n)/);
  const lines: Array<{ line: string; ending: string }> = [];

  for (let i = 0; i < parts.length; i += 2) {
    lines.push({
      line: parts[i] ?? '',
      ending: parts[i + 1] ?? '',
    });
  }

  return lines;
}

function rewriteWikiLinksInLine(
  line: string,
  oldDocName: string,
  newDocName: string,
): RenameRewriteResult {
  let rewritten = '';
  let rewrites = 0;
  let idx = 0;
  const prefixLength = leadingMarkdownPrefixLength(line);

  if (prefixLength > 0) {
    rewritten += line.slice(0, prefixLength);
    idx = prefixLength;
  }

  while (idx < line.length) {
    if (line[idx] === '\\' && idx + 1 < line.length) {
      rewritten += line.slice(idx, idx + 2);
      idx += 2;
      continue;
    }

    if (line[idx] === '`') {
      const inlineCode = readInlineCode(line, idx);
      if (inlineCode) {
        rewritten += line.slice(idx, inlineCode.nextIndex);
        idx = inlineCode.nextIndex;
        continue;
      }
    }

    if (line[idx] === '[' && line[idx + 1] === '[') {
      const wikiLink = readWikiLink(line, idx);
      if (wikiLink) {
        if (wikiLink.target === oldDocName) {
          rewritten += `[[${newDocName}${wikiLink.anchor ? `#${wikiLink.anchor}` : ''}${wikiLink.alias ? `|${wikiLink.alias}` : ''}]]`;
          rewrites++;
        } else {
          rewritten += line.slice(idx, wikiLink.nextIndex);
        }
        idx = wikiLink.nextIndex;
        continue;
      }
    }

    rewritten += line[idx];
    idx++;
  }

  return { markdown: rewritten, rewrites };
}

function buildRelativeMarkdownHref(
  originalHref: string,
  sourceDocName: string,
  newDocName: string,
): string {
  const hashIndex = originalHref.indexOf('#');
  const hashSuffix = hashIndex >= 0 ? originalHref.slice(hashIndex) : '';
  const beforeHash = hashIndex >= 0 ? originalHref.slice(0, hashIndex) : originalHref;
  const queryIndex = beforeHash.indexOf('?');
  const querySuffix = queryIndex >= 0 ? beforeHash.slice(queryIndex) : '';
  const pathPart = queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash;

  const sourceDir = posix.dirname(sourceDocName);
  let relativePath = posix.relative(sourceDir === '.' ? '' : sourceDir, newDocName);
  if (!relativePath) {
    relativePath = posix.basename(newDocName);
  }

  if (pathPart.endsWith('.md')) {
    relativePath += '.md';
  }

  if (
    pathPart.startsWith('./') &&
    !relativePath.startsWith('./') &&
    !relativePath.startsWith('../')
  ) {
    relativePath = `./${relativePath}`;
  }

  return `${relativePath}${querySuffix}${hashSuffix}`;
}

function rewriteMarkdownLinksInLine(
  line: string,
  sourceDocName: string,
  oldDocName: string,
  newDocName: string,
): RenameRewriteResult {
  let rewritten = '';
  let rewrites = 0;
  let idx = 0;
  const prefixLength = leadingMarkdownPrefixLength(line);

  if (prefixLength > 0) {
    rewritten += line.slice(0, prefixLength);
    idx = prefixLength;
  }

  while (idx < line.length) {
    if (line[idx] === '\\' && idx + 1 < line.length) {
      rewritten += line.slice(idx, idx + 2);
      idx += 2;
      continue;
    }

    if (line[idx] === '`') {
      const inlineCode = readInlineCode(line, idx);
      if (inlineCode) {
        rewritten += line.slice(idx, inlineCode.nextIndex);
        idx = inlineCode.nextIndex;
        continue;
      }
    }

    if (line[idx] === '[' && line[idx + 1] === '[') {
      const wikiLink = readWikiLink(line, idx);
      if (wikiLink) {
        rewritten += line.slice(idx, wikiLink.nextIndex);
        idx = wikiLink.nextIndex;
        continue;
      }
    }

    if (line[idx] === '[' && line[idx - 1] !== '!') {
      const markdownLink = readMarkdownLink(line, idx);
      if (markdownLink) {
        const resolved = resolveInternalHref(markdownLink.href, sourceDocName);
        if (resolved?.docName === oldDocName) {
          const nextHref = buildRelativeMarkdownHref(markdownLink.href, sourceDocName, newDocName);
          const hrefRaw =
            markdownLink.hrefRaw.startsWith('<') && markdownLink.hrefRaw.endsWith('>')
              ? `<${nextHref}>`
              : nextHref;
          rewritten += `[${markdownLink.text}](${hrefRaw}${markdownLink.titleSuffix})`;
          rewrites++;
        } else {
          rewritten += line.slice(idx, markdownLink.nextIndex);
        }
        idx = markdownLink.nextIndex;
        continue;
      }
    }

    rewritten += line[idx];
    idx++;
  }

  return { markdown: rewritten, rewrites };
}

export function rewriteWikiLinksForDocumentRename(
  markdown: string,
  oldDocName: string,
  newDocName: string,
): RenameRewriteResult {
  let fence: FenceState | null = null;
  let rewrites = 0;

  const rewrittenMarkdown = splitLines(markdown)
    .map(({ line, ending }) => {
      if (fence) {
        if (isFenceClose(line, fence)) {
          fence = null;
        }
        return `${line}${ending}`;
      }

      const nextFence = matchFence(line);
      if (nextFence) {
        fence = nextFence;
        return `${line}${ending}`;
      }

      const rewrittenLine = rewriteWikiLinksInLine(line, oldDocName, newDocName);
      rewrites += rewrittenLine.rewrites;
      return `${rewrittenLine.markdown}${ending}`;
    })
    .join('');

  return { markdown: rewrittenMarkdown, rewrites };
}

export function rewriteMarkdownLinksForDocumentRename(
  markdown: string,
  sourceDocName: string,
  oldDocName: string,
  newDocName: string,
): RenameRewriteResult {
  let fence: FenceState | null = null;
  let rewrites = 0;

  const rewrittenMarkdown = splitLines(markdown)
    .map(({ line, ending }) => {
      if (fence) {
        if (isFenceClose(line, fence)) {
          fence = null;
        }
        return `${line}${ending}`;
      }

      const nextFence = matchFence(line);
      if (nextFence) {
        fence = nextFence;
        return `${line}${ending}`;
      }

      const rewrittenLine = rewriteMarkdownLinksInLine(line, sourceDocName, oldDocName, newDocName);
      rewrites += rewrittenLine.rewrites;
      return `${rewrittenLine.markdown}${ending}`;
    })
    .join('');

  return { markdown: rewrittenMarkdown, rewrites };
}
