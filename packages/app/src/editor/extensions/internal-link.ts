import {
  classifyMarkdownHref,
  extractAssetExtension,
  LinkFidelity,
  resolveAssetProjectPath,
} from '@inkeep/open-knowledge-core';
import { mergeAttributes } from '@tiptap/core';
import { createElement } from 'react';
import { dispatchAssetClick } from '../asset-dispatch';
import { openHashHrefInNewTab, openInternalHashHrefInNewTab } from '../internal-link-helpers';
import { createAssetContextMenuPlugin } from '../plugins/asset-context-menu';
import { isSafeNavigationUrl } from '../safe-navigation-url';
import { InternalLinkPropPanel } from './InternalLinkPropPanel';
import { makeLinkResolutionAttrsComputer } from './link-resolution';
import { linkResolutionDecorationPlugin } from './link-resolution-decoration';
import { createMarkInteractionBridgePlugin, getCurrentMarkInfo } from './mark-interaction-bridge';

export interface InternalLinkOptions {
  docName: string;
}

export const InternalLink = LinkFidelity.extend<InternalLinkOptions>({
  addOptions() {
    return {
      ...this.parent?.(),
      docName: '',
    };
  },

  renderHTML({ HTMLAttributes }) {
    const href = typeof HTMLAttributes.href === 'string' ? HTMLAttributes.href : '';
    const ariaLabel = href ? `Link: ${href}` : 'Link';
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-link': '',
        role: 'link',
        tabindex: '0',
        'aria-label': ariaLabel,
        style: 'touch-action: manipulation;',
      }),
      0,
    ];
  },

  addProseMirrorPlugins() {
    const docName = this.options.docName ?? '';
    return [
      createMarkInteractionBridgePlugin({
        editor: this.editor,
        markTypes: ['link'],
        renderPropPanel: ({ editor, nodeId, deactivate }) =>
          createElement(InternalLinkPropPanel, {
            editor,
            nodeId,
            sourceDocName: docName,
            onClose: deactivate,
          }),
        handlePrimary: ({ editor, nodeId, newTab }) => {
          const info = getCurrentMarkInfo(editor.state, nodeId);
          const href = info?.attrs?.href;
          if (typeof href !== 'string' || !href) return false;

          const sourceForm = info?.attrs?.sourceForm;
          const target = classifyMarkdownHref(href, docName);
          const hrefExt = extractAssetExtension(href);
          const isAssetShape =
            target?.kind === 'asset' || (sourceForm === 'wikiembed' && hrefExt !== null);
          if (isAssetShape) {
            const url = target?.kind === 'asset' ? target.url : href;
            const ext = target?.kind === 'asset' ? target.ext : (hrefExt ?? '');
            const projectRelPath = resolveAssetProjectPath(url, docName);
            if (!projectRelPath) {
              return false;
            }
            void dispatchAssetClick({
              url,
              projectRelPath,
              ext,
              title: projectRelPath.split('/').pop() ?? url,
              forceOsDelegation: newTab,
            });
            return true;
          }

          if (!newTab) return false;
          if (!target) return false;
          if (target.kind === 'doc') {
            openInternalHashHrefInNewTab({ docName: target.docName, anchor: target.anchor });
            return true;
          }
          if (target.kind === 'anchor') {
            openInternalHashHrefInNewTab({ docName, anchor: target.anchor });
            return true;
          }
          if (!isSafeNavigationUrl(target.url)) return false;
          openHashHrefInNewTab(target.url);
          return true;
        },
      }),
      linkResolutionDecorationPlugin({
        markTypes: ['link'],
        computeAttrs: makeLinkResolutionAttrsComputer(docName),
      }),
      createAssetContextMenuPlugin({ sourceDocName: docName }),
    ];
  },
});
