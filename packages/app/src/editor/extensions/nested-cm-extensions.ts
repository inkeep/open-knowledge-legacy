
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import type { Compartment, Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { GFM } from '@lezer/markdown';
import { basicDarkInit, basicLightInit } from '@uiw/codemirror-theme-basic';
import type * as Y from 'yjs';
import { codeLanguages } from '../markdown-code-languages';
import { createAgentFlashSourceExtension } from '../plugins/agent-flash-source';
import { createMdLinkSourceExtension } from '../plugins/md-link-source';
import { createWikiLinkSourceExtension } from '../plugins/wiki-link-source';

export const darkTheme = basicDarkInit({
  settings: {
    background: 'transparent',
    gutterBackground: 'transparent',
  },
});

export const lightTheme = basicLightInit({
  settings: {
    background: 'transparent',
    gutterBackground: 'transparent',
  },
});

interface NestedCMOptions {
  themeCompartment: Compartment;
  resolvedTheme: string | undefined;
  ydoc?: Y.Doc;
  extraKeymaps?: Extension;
}

export function createNestedCMExtensions(options: NestedCMOptions): Extension[] {
  const { themeCompartment, resolvedTheme, ydoc } = options;
  const theme = resolvedTheme === 'dark' ? darkTheme : lightTheme;

  return [
    markdown({ base: markdownLanguage, extensions: [GFM], codeLanguages }),
    createWikiLinkSourceExtension(),
    createMdLinkSourceExtension(),
    ...(ydoc ? [createAgentFlashSourceExtension(ydoc)] : []),
    keymap.of([]),
    themeCompartment.of(theme),
    EditorView.lineWrapping,
    ...(options.extraKeymaps ? [options.extraKeymaps] : []),
  ];
}
