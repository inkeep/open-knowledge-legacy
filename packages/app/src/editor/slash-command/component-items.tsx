import type { Editor } from '@tiptap/react';
import { FileUp, Hash } from 'lucide-react';
import type { ReactNode } from 'react';
import { uploadAndInsert } from '../image-upload/index.ts';
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
  Embed: {
    description: 'Embed an external page in an inline iframe (docs, demos, Figma, CodeSandbox).',
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

    const inserted = createChildNode(descriptor.name);
    if (descriptor.name === 'Tabs') {
      const tab1 = createChildNode('Tab');
      const tab2 = createChildNode('Tab');
      const tab1Attrs = tab1.attrs as Record<string, unknown>;
      const tab2Attrs = tab2.attrs as Record<string, unknown>;
      tab1Attrs.props = { ...(tab1Attrs.props as Record<string, unknown>), label: 'Tab 1' };
      tab2Attrs.props = { ...(tab2Attrs.props as Record<string, unknown>), label: 'Tab 2' };
      (inserted as Record<string, unknown>).content = [tab1, tab2];
    }
    editor.chain().focus().insertContent(inserted).run();

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

const SLASH_HIDDEN_CANONICALS = new Set(['File', 'Tab']);

function getCustomBlockComponentItems(): SlashCommandItem[] {
  return [
    {
      name: 'component-File',
      label: 'File',
      icon: FileUp,
      category: 'media',
      aliases: ['file', 'attachment', 'download', 'upload', 'document', 'doc', 'docx', 'zip'],
      description: 'Attach a downloadable file (`.pdf` / `.docx` / `.zip` / …)',
      command: openFilePickerAndUpload,
    },
  ];
}

export function getComponentItems(): SlashCommandItem[] {
  const descriptors = getRegisteredDescriptors().filter(
    (desc) => desc.surface === 'canonical' && !SLASH_HIDDEN_CANONICALS.has(desc.name),
  );

  const descriptorItems = descriptors.map((desc) => {
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

  return [...descriptorItems, ...getCustomBlockComponentItems()];
}

function openFilePickerAndUpload(editor: Editor): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '*/*';
  input.style.display = 'none';
  input.addEventListener(
    'change',
    () => {
      const file = input.files?.[0];
      if (file) {
        const insertPos = editor.state.selection.from;
        void uploadAndInsert(file, editor, insertPos);
      }
      input.remove();
    },
    { once: true },
  );
  input.addEventListener('cancel', () => input.remove(), { once: true });
  document.body.appendChild(input);
  input.click();
}

export function getInlineComponentItems(): SlashCommandItem[] {
  return [
    {
      name: 'component-Tag',
      label: 'Tag',
      icon: Hash,
      category: 'content',
      aliases: ['#', 'hashtag', 'label'],
      description: 'Inline tag (`#tagname`) for cross-doc linking',
      command: (editor: Editor) => {
        editor.chain().insertTag('').run();
      },
    },
  ];
}
