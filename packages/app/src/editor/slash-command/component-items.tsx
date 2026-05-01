
import type { Editor } from '@tiptap/react';
import type { ReactNode } from 'react';
import { resolveIcon } from '../registry/icons.ts';
import { getDescriptor, getRegisteredDescriptors } from '../registry/index.ts';
import type { JsxComponentDescriptor } from '../registry/types.ts';
import type { SlashCommandItem } from './items';
import imagePreview from './preview-assets/image-preview.png';
import videoPreview from './preview-assets/video-preview.png';

interface PreviewConfig {
  description: string;
  props?: Record<string, unknown>;
  children?: ReactNode;
}

const PREVIEW_CONFIG: Record<string, PreviewConfig> = {
  Callout: {
    description: 'Highlight tips, warnings, and notes.',
    props: { type: 'note', title: 'Heads up' },
    children: 'Callouts draw attention to key information.',
  },
  Accordion: {
    description: 'Collapsible section with a clickable summary.',
    props: { title: 'Click to expand', defaultOpen: true },
    children: 'Hidden content goes here.',
  },
  img: {
    description: 'Embed an image with optional alt text.',
    props: { src: imagePreview, alt: 'Sample image' },
  },
  video: {
    description: 'Embed a video with native player controls.',
    props: { controls: true, poster: videoPreview },
  },
  audio: {
    description: 'Embed an audio file with native player controls.',
    props: { controls: true },
  },
  Math: {
    description: 'Block math equation rendered with KaTeX from a LaTeX source string.',
    props: { formula: 'c = \\pm\\sqrt{a^2 + b^2}' },
  },
};

function getDefaultProps(descriptor: JsxComponentDescriptor): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const prop of descriptor.props) {
    if (prop.type === 'reactnode') continue;
    if ('defaultValue' in prop && prop.defaultValue !== undefined) {
      defaults[prop.name] = prop.defaultValue;
    }
  }
  return defaults;
}

export function createChildNode(childName: string): Record<string, unknown> {
  const childDesc = getDescriptor(childName);
  const defaultProps = getDefaultProps(childDesc);
  return {
    type: 'jsxComponent',
    attrs: {
      componentName: childDesc.name,
      kind: 'element',
      attributes: [],
      sourceRaw: '',
      sourceDirty: true,
      props: defaultProps,
    },
    content: childDesc.hasChildren ? [{ type: 'paragraph' }] : undefined,
  };
}

const pendingAutoOpen = new Set<number>();

export function setPendingAutoOpen(pos: number): void {
  pendingAutoOpen.add(pos);
}

export function _resetPendingAutoOpenForTest(): void {
  pendingAutoOpen.clear();
}

export function consumeAutoOpen(pos?: number): boolean {
  if (typeof pos === 'number') {
    return pendingAutoOpen.delete(pos);
  }
  const iter = pendingAutoOpen.values().next();
  if (iter.done) return false;
  pendingAutoOpen.delete(iter.value);
  return true;
}

export function focusInsertedComponent(
  editor: Editor,
  insertPos: number,
  descriptor: JsxComponentDescriptor,
): void {
  const hasEditableProps = descriptor.props.some(
    (p) => !('hidden' in p && p.hidden) && p.type !== 'reactnode',
  );

  if (hasEditableProps) {
    setPendingAutoOpen(insertPos);
    requestAnimationFrame(() => {
      editor.commands.setNodeSelection(insertPos);
    });
  } else if (descriptor.hasChildren) {
    editor.commands.setTextSelection(insertPos + 2);
  }
}

function createInsertCommand(descriptor: JsxComponentDescriptor): (editor: Editor) => void {
  return (editor: Editor) => {
    const beforeRefs = new WeakSet<object>();
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'jsxComponent' && node.attrs.componentName === descriptor.name) {
        beforeRefs.add(node);
      }
    });

    editor.chain().focus().insertContent(createChildNode(descriptor.name)).run();

    let insertPos = -1;
    editor.state.doc.descendants((node, pos) => {
      if (insertPos >= 0) return false;
      if (
        node.type.name === 'jsxComponent' &&
        node.attrs.componentName === descriptor.name &&
        !beforeRefs.has(node)
      ) {
        insertPos = pos;
      }
    });

    if (insertPos < 0) return;
    focusInsertedComponent(editor, insertPos, descriptor);
  };
}

export function getComponentItems(): SlashCommandItem[] {
  const descriptors = getRegisteredDescriptors().filter((desc) => desc.surface === 'canonical');

  return descriptors.map((desc) => {
    const previewConfig = PREVIEW_CONFIG[desc.name];
    const Component = desc.Component;
    const preview: SlashCommandItem['preview'] = previewConfig
      ? {
          description: previewConfig.description,
          render: () => <Component {...previewConfig.props}>{previewConfig.children}</Component>,
        }
      : undefined;

    return {
      name: `component-${desc.name}`,
      label: desc.displayName ?? desc.name,
      icon: resolveIcon(desc.icon),
      category: desc.category ?? 'content',
      command: createInsertCommand(desc),
      aliases: desc.searchTerms,
      description: desc.description,
      preview,
    };
  });
}
