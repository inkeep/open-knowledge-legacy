import { getSchema } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import { updateYFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import type * as Y from 'yjs';
import { prependFrontmatter, stripFrontmatter } from './extensions/frontmatter';
import { sharedExtensions } from './extensions/shared';

export const mdManager = new MarkdownManager({ extensions: sharedExtensions });
export const editorSchema = getSchema(sharedExtensions);

export function serializeDocToMarkdown(doc: Y.Doc, xmlFragment: Y.XmlFragment): string {
  const body = mdManager.serialize(yXmlFragmentToProsemirrorJSON(xmlFragment));
  const frontmatter = doc.getMap('metadata').get('frontmatter');
  return prependFrontmatter(typeof frontmatter === 'string' ? frontmatter : '', body);
}

export function applyMarkdownToDoc(doc: Y.Doc, xmlFragment: Y.XmlFragment, markdown: string): void {
  const { frontmatter, body } = stripFrontmatter(markdown);
  const json = mdManager.parse(body);
  const pmNode = editorSchema.nodeFromJSON(json);

  updateYFragment(doc, xmlFragment, pmNode, {
    mapping: new Map(),
    isOMark: new Map(),
  });
  doc.getMap('metadata').set('frontmatter', frontmatter);
}
