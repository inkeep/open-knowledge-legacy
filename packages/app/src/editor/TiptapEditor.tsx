import type { HocuspocusProvider } from '@hocuspocus/provider';
import {
  sharedExtensions as coreExtensions,
  deriveIconColor,
  evictStaleEntries,
  FLASH_DEBOUNCE_MS,
  FLASH_DURATION_MS,
  hasNewEntries,
  MarkdownManager,
} from '@inkeep/open-knowledge-core';
import { type AnyExtension, Editor, type EditorOptions, Extension, getSchema } from '@tiptap/core';
import Collaboration from '@tiptap/extension-collaboration';
import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent } from '@tiptap/react';
import { initProseMirrorDoc, yCursorPlugin, ySyncPluginKey } from '@tiptap/y-tiptap';
import { type FC, use, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SelectionAnnouncer } from '@/components/editor/SelectionAnnouncer';
import { parkTiptapEditor } from './editor-cache';
import { InteractionLayerView } from './interaction-layer';
import { getInteractionLayer } from './interaction-layer-host';

const editorCtorStartTimes = new WeakMap<object, number>();

import { OUTLINE_NAV_EVENT, type OutlineNavDetail } from '@/components/OutlinePanel';
import { mark } from '@/lib/perf';
import { wrapExtensionsWithTiming } from '@/lib/perf/cold-mount-instrumentation';
import { useIdentity } from '../presence/identity';
import { registerEditor, unregisterEditor } from './active-editor';
import { buildAwarenessUser } from './awareness-user';
import { BubbleMenuBar } from './bubble-menu/BubbleMenuBar';
import {
  createClipboardHtmlSerializer,
  createClipboardTextSerializer,
  createHandleDrop,
  createHandlePaste,
} from './clipboard/index.ts';
import { useDocumentContext } from './DocumentContext';
import { setEditorDocName } from './extensions/doc-context.ts';
import { setEditorSourceMode } from './extensions/editor-mode-context.ts';
import { sharedExtensions } from './extensions/shared.ts';
import { uploadDecorationPlugin } from './image-upload/index.ts';
import { getMountId } from './mount-id-registry';
import { mountTiptapEditorPromise } from './mount-promise';
import { markUserTyping } from './observers';
import { TableControlsMenu } from './table-controls/TableControlsMenu';
import { attachTypingBurstDetector } from './typing-burst-detector';
import { getEditorView } from './utils/get-editor-view';

function renderCursor(user: Record<string, string>): HTMLElement {
  const cursor = document.createElement('span');
  cursor.classList.add('collaboration-cursor__caret');
  cursor.style.borderColor = user.color;

  const label = document.createElement('div');
  label.classList.add('collaboration-cursor__label');
  label.style.backgroundColor = user.color;
  label.style.color = deriveIconColor(user.color);
  label.textContent = user.name;
  cursor.append(label);

  return cursor;
}

interface AgentFlashState {
  state: 'idle' | 'editing' | 'settled';
  count: number;
  lastFiredAt: number | null;
  position: 'append' | 'prepend';
  lastAgentId: string | null;
}

const INITIAL_FLASH_STATE: AgentFlashState = {
  state: 'idle',
  count: 0,
  lastFiredAt: null,
  position: 'append',
  lastAgentId: null,
};

interface TiptapEditorProps {
  provider: HocuspocusProvider;
  placeholder?: string;
  isSourceMode: boolean;
  portalTarget: HTMLElement;
}

type ClipboardState = ReturnType<typeof buildClipboardState>;

type ProsemirrorMapping = ReturnType<typeof initProseMirrorDoc>['mapping'];

function buildClipboardState() {
  const mdManager = new MarkdownManager({ extensions: coreExtensions });
  return {
    mdManager,
    text: createClipboardTextSerializer({ mdManager }),
    html: createClipboardHtmlSerializer({ mdManager }),
    paste: createHandlePaste({ mdManager }),
    drop: createHandleDrop({ mdManager }),
  };
}

interface BuildEditorOptionsArgs {
  provider: HocuspocusProvider;
  placeholder?: string;
  clipboard: ClipboardState;
  ctorStart: number;
  prebuiltMapping?: ProsemirrorMapping;
}

function buildExtensionList(args: BuildEditorOptionsArgs): AnyExtension[] {
  const { provider, placeholder, prebuiltMapping } = args;
  return [
    ...sharedExtensions.map((ext) => {
      if (ext.name === 'link' || ext.name === 'wikiLink') {
        return ext.configure({ docName: provider.configuration.name ?? '' });
      }
      return ext;
    }),
    Placeholder.configure({
      placeholder: placeholder ?? "Type '/' for commands",
      showOnlyCurrent: true,
    }),
    Collaboration.configure({
      document: provider.document,
      ...(prebuiltMapping ? { ySyncOptions: { mapping: prebuiltMapping } } : {}),
    }),
    Extension.create({
      name: 'imageUploadDecoration',
      addProseMirrorPlugins() {
        return [uploadDecorationPlugin];
      },
    }),
    Extension.create({
      name: 'collaborationCursor',
      addProseMirrorPlugins() {
        const awareness = provider.awareness;
        if (!awareness) {
          throw new Error(
            '[TiptapEditor] HocuspocusProvider has no awareness instance — cursor plugin cannot initialize',
          );
        }
        return [
          yCursorPlugin(awareness, {
            cursorBuilder: renderCursor,
          }),
        ];
      },
    }),
  ];
}

function buildEditorOptions(args: BuildEditorOptionsArgs): Partial<EditorOptions> {
  const { provider, clipboard, ctorStart } = args;
  return {
    onBeforeCreate: ({ editor }) => {
      editorCtorStartTimes.set(editor, ctorStart);
    },
    onCreate: ({ editor }) => {
      clipboard.html.setView(editor.view);
      const start = editorCtorStartTimes.get(editor);
      editorCtorStartTimes.delete(editor);
      if (start == null) return;
      const now = performance.now();
      mark(
        'ok/editor/create-tiptap',
        {
          docName: provider.configuration.name ?? 'unknown',
          ytextLength: provider.document.getText('source').length,
        },
        { startTime: start, duration: Math.max(0, now - start) },
      );
    },
    editorProps: {
      attributes: {
        class: 'pt-4 pb-4 h-full',
      },
      clipboardTextParser: (text, _context, _plain, view) => {
        const json = clipboard.mdManager.parse(text);
        const node = view.state.schema.nodeFromJSON(json);
        // biome-ignore lint/suspicious/noExplicitAny: TipTap's clipboardTextParser expects a Slice-like return but ProseMirror Fragment works at runtime; no public type expresses the union
        return node.content as any;
      },
      clipboardTextSerializer: (slice, view) => clipboard.text(slice, view),
      clipboardSerializer: clipboard.html.serializer,
      handlePaste: (view, event) => clipboard.paste(view, event),
      handleDrop: (view, event) => clipboard.drop(view, event as DragEvent),
    },
    extensions: wrapExtensionsWithTiming(buildExtensionList(args)),
  };
}

interface BuildPatternDConstructorOptionsArgs {
  provider: HocuspocusProvider;
  placeholder?: string;
  clipboard: ClipboardState;
  ctorStart: number;
}

type PatternDConstructorOptions = Partial<EditorOptions> & { element: null };

export function buildPatternDConstructorOptions(
  args: BuildPatternDConstructorOptionsArgs,
): PatternDConstructorOptions {
  const { provider, placeholder, clipboard, ctorStart } = args;
  const baseExtensions = buildExtensionList({ provider, placeholder, clipboard, ctorStart });
  const schema = getSchema(baseExtensions);
  const fragment = provider.document.getXmlFragment('default');
  const { doc: prebuiltDoc, mapping: prebuiltMapping } = initProseMirrorDoc(fragment, schema);
  return {
    ...buildEditorOptions({ provider, placeholder, clipboard, ctorStart, prebuiltMapping }),
    content: prebuiltDoc.toJSON(),
    element: null,
  };
}

export const TiptapEditor: FC<TiptapEditorProps> = ({
  provider,
  placeholder,
  isSourceMode,
  portalTarget,
}) => {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const flashStateRef = useRef(INITIAL_FLASH_STATE);
  const identity = useIdentity();
  const { principal, activeDocName } = useDocumentContext();
  const docName = provider.configuration.name ?? '';

  const [clipboard] = useState(buildClipboardState);

  const [construct] = useState(() => () => {
    const ctorStart = performance.now();
    const tipTapEditor = new Editor(
      buildPatternDConstructorOptions({
        provider,
        placeholder,
        clipboard,
        ctorStart,
      }),
    );
    return {
      editor: tipTapEditor,
      ydoc: provider.document,
      ytext: provider.document.getText('source'),
      provider,
    };
  });

  const bytes = provider.document.getText('source').length;
  const sizeStats = { viewCount: 0, bytes };

  const mountId = getMountId(docName) ?? crypto.randomUUID();
  const entry = use(mountTiptapEditorPromise({ docName, mountId, construct, sizeStats }));
  const editor = entry.editor;

  useEffect(() => {
    return () => {
      parkTiptapEditor(entry);
    };
  }, [entry]);

  return (
    <TiptapEditorChrome
      provider={provider}
      isSourceMode={isSourceMode}
      docName={docName}
      activeDocName={activeDocName}
      identity={identity}
      principal={principal}
      editor={editor}
      wrapperRef={wrapperRef}
      flashStateRef={flashStateRef}
      portalTarget={portalTarget}
    />
  );
};

interface TiptapEditorChromeProps {
  provider: HocuspocusProvider;
  isSourceMode: boolean;
  docName: string;
  activeDocName: string | null;
  identity: ReturnType<typeof useIdentity>;
  principal: ReturnType<typeof useDocumentContext>['principal'];
  editor: Editor;
  wrapperRef: React.RefObject<HTMLDivElement | null>;
  flashStateRef: React.RefObject<AgentFlashState>;
  portalTarget: HTMLElement;
}

const TiptapEditorChrome: FC<TiptapEditorChromeProps> = ({
  provider,
  isSourceMode,
  docName,
  activeDocName,
  identity,
  principal,
  editor,
  wrapperRef,
  flashStateRef,
  portalTarget,
}) => {
  const portalSlotRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const slot = portalSlotRef.current;
    if (!slot) return;
    slot.appendChild(portalTarget);
    return () => {
      if (portalTarget.parentNode === slot) {
        slot.removeChild(portalTarget);
      }
    };
  }, [portalTarget]);
  useEffect(() => {
    const docName = provider.configuration.name ?? null;
    setEditorDocName(editor, docName);
    return () => {
      setEditorDocName(editor, null);
    };
  }, [editor, provider]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const docName = provider.configuration.name;
    if (!docName) return;
    registerEditor(docName, editor);
    return () => unregisterEditor(docName, editor);
  }, [editor, provider]);

  useEffect(() => {
    if (import.meta.env.PROD) return;
    if (!editor) return;
    const docName = provider.configuration.name;
    if (!docName) return;
    const mountId = getMountId(docName);
    if (!mountId) return;
    const sampler = attachTypingBurstDetector({
      mode: 'WYSIWYG',
      docName,
      mountId,
    });
    type TxArg = {
      transaction: { docChanged: boolean; getMeta: (key: typeof ySyncPluginKey) => unknown };
    };
    const onTransaction = (arg: unknown) => {
      const transaction = (arg as TxArg).transaction;
      if (!transaction.docChanged) return;
      if (transaction.getMeta(ySyncPluginKey)) return;
      sampler.recordUserInput(0, 1);
    };
    editor.on('transaction', onTransaction);
    return () => {
      editor.off('transaction', onTransaction);
      sampler.detach();
    };
  }, [editor, provider]);

  useEffect(() => {
    const mark = () => markUserTyping();
    let attachedDom: HTMLElement | null = null;
    const attach = () => {
      if (attachedDom || editor.isDestroyed) return;
      const view = getEditorView(editor);
      if (!view) return;
      attachedDom = view.dom;
      attachedDom.addEventListener('keydown', mark);
      attachedDom.addEventListener('paste', mark);
      attachedDom.addEventListener('drop', mark);
      attachedDom.addEventListener('cut', mark);
    };
    const detach = () => {
      if (!attachedDom) return;
      attachedDom.removeEventListener('keydown', mark);
      attachedDom.removeEventListener('paste', mark);
      attachedDom.removeEventListener('drop', mark);
      attachedDom.removeEventListener('cut', mark);
      attachedDom = null;
    };
    const isMounted = !!getEditorView(editor);
    if (isMounted) {
      attach();
    } else {
      editor.on('create', attach);
    }
    return () => {
      editor.off('create', attach);
      detach();
    };
  }, [editor]);

  useEffect(() => {
    const activityMap = provider.document.getMap('agent-flash');
    let lastSeenTimestamp = Date.now();
    let lastFlashTime = 0;
    let pendingTimeout: number | null = null;
    let flashEndTimeout: number | null = null;
    let flashSettledTimeout: number | null = null;

    const getLatestActivity = (): {
      agentId: string;
      type: string;
      description?: string;
    } | null => {
      let latest: {
        agentId: string;
        type: string;
        description?: string;
        timestamp: number;
      } | null = null;
      for (const [, value] of activityMap.entries()) {
        const entry = value as {
          agentId?: string;
          timestamp?: number;
          type?: string;
          description?: string;
        };
        if (entry.timestamp && (!latest || entry.timestamp > latest.timestamp)) {
          latest = {
            agentId: entry.agentId ?? 'unknown',
            timestamp: entry.timestamp,
            type: entry.type ?? 'insert',
            description: entry.description,
          };
        }
      }
      return latest;
    };

    const applyFlashStateToDom = (state: AgentFlashState) => {
      flashStateRef.current = state;
      if (import.meta.env.DEV) {
        window.__agentFlashState = state;
      }
      const el = wrapperRef.current;
      if (el) {
        el.setAttribute('data-agent-flash-state', state.state);
        el.setAttribute('data-agent-flash-count', String(state.count));
        el.setAttribute('data-agent-flash-position', state.position);
        el.setAttribute('data-agent-flash-agent-id', state.lastAgentId ?? '');
      }
    };

    const triggerFlash = () => {
      const latest = getLatestActivity();
      const position: 'append' | 'prepend' = latest?.description?.toLowerCase().includes('prepend')
        ? 'prepend'
        : 'append';

      const nextState: AgentFlashState = {
        state: 'editing',
        count: (flashStateRef.current?.count ?? 0) + 1,
        lastFiredAt: Date.now(),
        position,
        lastAgentId: latest?.agentId ?? null,
      };

      applyFlashStateToDom(nextState);
      document.dispatchEvent(new CustomEvent('agent-flash', { detail: nextState }));

      if (flashEndTimeout) clearTimeout(flashEndTimeout);
      if (flashSettledTimeout) clearTimeout(flashSettledTimeout);

      flashEndTimeout = window.setTimeout(() => {
        const settledState: AgentFlashState = { ...nextState, state: 'settled' };
        applyFlashStateToDom(settledState);
        document.dispatchEvent(new CustomEvent('agent-flash-end', { detail: settledState }));

        flashSettledTimeout = window.setTimeout(() => {
          applyFlashStateToDom({ ...settledState, state: 'idle' });
        }, 300);
      }, FLASH_DURATION_MS);
    };

    applyFlashStateToDom(INITIAL_FLASH_STATE);

    const observer = () => {
      evictStaleEntries(activityMap);

      if (!hasNewEntries(activityMap, lastSeenTimestamp)) return;

      if (document.visibilityState !== 'visible') return;

      const now = Date.now();
      lastSeenTimestamp = now;

      if (now - lastFlashTime < FLASH_DEBOUNCE_MS) {
        if (!pendingTimeout) {
          const delay = FLASH_DEBOUNCE_MS - (now - lastFlashTime);
          pendingTimeout = window.setTimeout(() => {
            pendingTimeout = null;
            lastFlashTime = Date.now();
            triggerFlash();
          }, delay);
        }
        return;
      }

      lastFlashTime = now;
      triggerFlash();
    };

    activityMap.observe(observer);

    const visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        if (hasNewEntries(activityMap, lastSeenTimestamp)) {
          lastSeenTimestamp = Date.now();
          lastFlashTime = Date.now();
          triggerFlash();
        }
      } else {
        lastSeenTimestamp = Date.now();
      }
    };
    document.addEventListener('visibilitychange', visibilityHandler);

    return () => {
      activityMap.unobserve(observer);
      document.removeEventListener('visibilitychange', visibilityHandler);
      if (pendingTimeout) clearTimeout(pendingTimeout);
      if (flashEndTimeout) clearTimeout(flashEndTimeout);
      if (flashSettledTimeout) clearTimeout(flashSettledTimeout);
    };
  }, [provider.document, flashStateRef, wrapperRef]);

  useEffect(() => {
    const hash = window.location.hash;
    const qmark = hash.indexOf('?');
    const anchorRaw = qmark >= 0 ? new URLSearchParams(hash.slice(qmark + 1)).get('anchor') : null;
    if (!anchorRaw) return;
    const anchor = anchorRaw; // narrowed to string for closure

    let attempts = 0;
    let timeoutId: number | undefined;
    let scrolled = false;

    function tryScroll() {
      if (scrolled) return;
      const el = document.getElementById(anchor);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        scrolled = true;
        provider.off('synced', tryScroll);
      } else if (attempts < 20) {
        attempts += 1;
        timeoutId = window.setTimeout(tryScroll, 100);
      }
    }

    tryScroll();
    provider.on('synced', tryScroll);
    return () => {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      provider.off('synced', tryScroll);
    };
  }, [provider]);

  useEffect(() => {
    function onNav(e: Event) {
      const detail = (e as CustomEvent<OutlineNavDetail>).detail;
      if (!detail || detail.mode !== 'wysiwyg' || editor.isDestroyed) return;
      const realView = getEditorView(editor);
      if (!realView) return;
      const headings = realView.dom.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6');
      const target = headings[detail.index];
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    window.addEventListener(OUTLINE_NAV_EVENT, onNav);
    return () => window.removeEventListener(OUTLINE_NAV_EVENT, onNav);
  }, [editor]);

  useEffect(() => {
    const awareness = provider.awareness;
    if (!awareness) return;
    if (docName !== activeDocName) {
      awareness.setLocalState(null);
      return;
    }
    awareness.setLocalState({
      user: buildAwarenessUser({ principal, identity }),
      mode: isSourceMode ? 'source' : 'wysiwyg',
    });
  }, [provider, docName, activeDocName, identity, principal, isSourceMode]);

  useEffect(() => {
    setEditorSourceMode(editor, isSourceMode);
    return () => {
      setEditorSourceMode(editor, false);
    };
  }, [editor, isSourceMode]);

  return (
    <div
      ref={wrapperRef}
      className="tiptap-editor h-full"
      data-agent-flash-state="idle"
      data-agent-flash-count="0"
      data-agent-flash-position="append"
      data-agent-flash-agent-id=""
    >
      {/* Both menus portal to document.body, so they escape the
          `ok-mode-hidden` wrapper — the React conditional below is the
          only gate. Slash, wiki-link, and tag suggestion popups are
          gated separately via the `getEditorSourceMode` signal in
          `editor-mode-context.ts`, consumed by each plugin's `allow`
          predicate; unmounting these React menus does NOT affect those
          plugins. */}
      {!isSourceMode && <BubbleMenuBar editor={editor} />}
      {!isSourceMode && <TableControlsMenu editor={editor} />}
      {/* Drag handle + "+" chrome is registered as the imperative
          `BlockDragHandle` TipTap extension in `sharedExtensions` —
          bare DOM container, no React involvement. A React-wrapper
          variant (`@tiptap/extension-drag-handle-react`) is
          incompatible with `<Activity>` because the plugin externally
          moves its ref'd `<div>` into `editor.view.dom.parentElement`
          and Activity mode flips then throw `Failed to execute
          'removeChild' on 'Node'` — regression validated against
          docs-open F1/F4/F5/F10, 2026-04-18. */}
      {/*
       * Portal slot — JSX-rendered placeholder where the per-Activity
       * portal target is imperatively appended (see the useLayoutEffect
       * above). The actual `<EditorContent>` renders into the portal
       * target via `createPortal` below, but the DOM appears here in
       * the `.tiptap-editor` grid — matching the pre-fix position so
       * scroll geometry (specifically `docs-open.e2e.ts:262` F1 warm-nav
       * scroll restoration) is unchanged.
       *
       * Structural H6 cross-doc-bleed fix: `<EditorContent>` renders into
       * the per-Activity portal target via `createPortal`, making
       * `editor.view.dom.parentNode` structurally private to THIS editor.
       * Other DOM children of this wrapper (`BubbleMenuBar`,
       * `TableControlsMenu`, `SelectionAnnouncer`, `InteractionLayerView`)
       * deliberately stay OUTSIDE the portal — they are not editor-view
       * DOM and don't participate in the
       * `appendChild(...parentNode.childNodes)` vacuum that the upstream
       * `PureEditorContent` lifecycle performs on `view.dom.parentNode`.
       */}
      <div ref={portalSlotRef} style={{ display: 'contents' }} />
      {createPortal(
        // biome-ignore lint/plugin/no-unportaled-editor-content: canonical portaled site — H6 fix per PRECEDENTS.md #44
        <EditorContent editor={editor} className="tiptap-editor-portal-content h-full" />,
        portalTarget,
      )}
      {/* Aria-live announcer for selection changes. Always in the DOM
          (role=status + sr-only) and updates imperatively. */}
      <SelectionAnnouncer editor={editor} />
      {/*
       * <InteractionLayerView> renders the singleton PropPanel / Toolbar /
       * Breadcrumb subtree FOR THE ACTIVE chip — inside the main React tree
       * so PropPanel renderers (InternalLinkPropPanel, WikiLinkPropPanel)
       * inherit context providers like <PageListProvider> + <ThemeProvider>.
       * The layer host (per-editor WeakMap) provides the store; the View
       * subscribes via useState + subscribe and renders the active
       * registration's controls. In CB-v2, RawMdxFallback is handled inline
       * via `RawMdxFallbackCMView` (per precedent #30 "all user content
       * visible and editable") and does not register with InteractionLayer.
       *
       * Rendered AFTER EditorContent so its absolute-positioned PropPanels
       * stack above editor content (z-index handled in CSS).
       */}
      <InteractionLayerView store={getInteractionLayer(editor).store} />
    </div>
  );
};

declare global {
  interface Window {
    __agentFlashState?: AgentFlashState;
  }
}
