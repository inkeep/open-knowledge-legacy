/**
 * InlineTOCView — editor wrapper for fumadocs' InlineTOC.
 *
 * **Contract mismatch, fixed here.** fumadocs `InlineTOC` requires
 * `items: TOCItemType[]` (`~/.claude/oss-repos/fumadocs/packages/radix-ui/src/components/inline-toc.tsx:9-11`).
 * In the docs site, `items` come from a build-time MDX pipeline. In the
 * editor, there is no build pipeline — so we walk the live PM doc for
 * heading nodes and derive `items` on every render. The user sees a live
 * TOC that updates as they type headings; no authoring burden.
 *
 * **`children` handling.** fumadocs' InlineTOC treats `children` as the
 * collapsible trigger label (defaults to "Table of Contents"). We pass
 * any NodeViewContent children through unchanged — a user who writes
 * `<InlineTOC>Custom Label</InlineTOC>` gets a custom trigger label.
 *
 * **Url synthesis.** Docs-site TOC items have real anchor URLs
 * (`#section-id`). The editor has no such URL scheme — headings aren't
 * addressable by fragment in the editor pane. We synthesize `url` as
 * `#hN-idx` (heading level + index) so React keys are stable and the
 * items can't collide; clicks are best-effort only.
 */

import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { InlineTOC as FumadocsInlineTOC } from 'fumadocs-ui/components/inline-toc';
import type { ComponentProps, ReactNode } from 'react';
import { useEditorContext } from './EditorContext';

interface TOCItem {
  title: ReactNode;
  url: string;
  depth: number;
}

/**
 * Walk the editor's doc and extract every top-level heading as a
 * TOCItemType. Exported for unit test coverage.
 */
export function extractHeadings(editor: Editor): TOCItem[] {
  const items: TOCItem[] = [];
  let idx = 0;
  editor.state.doc.descendants((node) => {
    if (node.type.name !== 'heading') return true;
    const level = (node.attrs.level as number | undefined) ?? 1;
    const title = node.textContent.trim();
    if (title.length === 0) {
      idx += 1;
      return false; // Don't recurse into heading text nodes.
    }
    items.push({
      title,
      url: `#h${level}-${idx}`,
      depth: level,
    });
    idx += 1;
    // Headings don't contain block descendants worth recursing into for
    // TOC extraction — block-type is `heading`, content is `inline*`.
    return false;
  });
  return items;
}

type InlineTOCPassthroughProps = Omit<ComponentProps<typeof FumadocsInlineTOC>, 'items'>;

/**
 * Editor-side InlineTOC. Reads the editor from context, subscribes to
 * heading changes via `useEditorState`, and passes the derived items to
 * the real fumadocs component. Re-renders only when the heading list
 * actually changes (selector returns a stable string key).
 */
export function InlineTOCView(props: InlineTOCPassthroughProps): ReactNode {
  const editor = useEditorContext();
  const items = useEditorState({
    editor,
    // Extracts items + a stable fingerprint. TipTap calls the selector on
    // every transaction; returning the fingerprint lets TipTap's shallow-
    // equality bailout suppress re-renders on non-heading edits.
    selector: (ctx) => {
      if (!ctx.editor) return { items: [] as TOCItem[], key: '' };
      const derived = extractHeadings(ctx.editor);
      const key = derived.map((item) => `${item.depth}:${String(item.title)}`).join('|');
      return { items: derived, key };
    },
    equalityFn: (a, b) => a?.key === b?.key,
  });

  return <FumadocsInlineTOC items={items?.items ?? []} {...props} />;
}
