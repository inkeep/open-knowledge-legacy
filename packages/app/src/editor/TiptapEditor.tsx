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
import { Editor, Extension } from '@tiptap/core';
import Collaboration from '@tiptap/extension-collaboration';
import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent } from '@tiptap/react';
import { yCursorPlugin } from '@tiptap/y-tiptap';
import { type FC, useEffect, useRef, useState } from 'react';
import { mountTiptapEditor, parkTiptapEditor, type TiptapCacheEntry } from './editor-cache';
import { InteractionLayerView } from './interaction-layer';
import { getInteractionLayer } from './interaction-layer-host';

// Module-level WeakMap storing the `performance.now()` anchor captured in
// `onBeforeCreate` and consumed in `onCreate`. Scoped per-Editor instance so
// StrictMode double-invoke and provider-pool churn don't cross-contaminate
// measurements. WeakMap auto-GCs when the Editor is destroyed.
const editorCtorStartTimes = new WeakMap<object, number>();

import { OUTLINE_NAV_EVENT, type OutlineNavDetail } from '@/components/OutlinePanel';
import { mark } from '@/lib/perf';
import { useIdentity } from '../presence/identity';
import { registerEditor, unregisterEditor } from './active-editor';
import { BubbleMenuBar } from './bubble-menu/BubbleMenuBar';
import {
  createClipboardHtmlSerializer,
  createClipboardTextSerializer,
  createHandlePaste,
} from './clipboard/index.ts';
import { sharedExtensions } from './extensions/shared.ts';
import { setCurrentDocName, uploadDecorationPlugin } from './image-upload/index.ts';
import { markUserTyping } from './observers';
import { TableControlsMenu } from './table-controls/TableControlsMenu';

/**
 * Custom cursor renderer. Post-US-005 (multi-agent-presence FR-3 + FR-10),
 * agents no longer publish per-doc awareness — so this renderer only ever
 * sees humans. The former `user.type === 'agent'` short-circuit was removed
 * because it became unreachable after `AwarenessUser.type` narrowed to
 * `'human'`. NG1 (no fake-cursor animation for agents) is now satisfied
 * by absence, not by a conditional.
 */
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

/**
 * Flash state — observable programmatically via `window.__agentFlashState`.
 * Tests can poll this, listen for the `agent-flash` / `agent-flash-end` events,
 * or assert on the wrapper's `data-agent-flash-state` attribute.
 */
interface AgentFlashState {
  /** 'idle' (no flash active), 'editing' (flash animation running), 'settled' (just finished) */
  state: 'idle' | 'editing' | 'settled';
  /** Monotonic counter — increments on every flash trigger (useful for debounce tests) */
  count: number;
  /** Unix ms timestamp of the last flash trigger */
  lastFiredAt: number | null;
  /** 'append' flashes last N blocks; 'prepend' flashes first N blocks */
  position: 'append' | 'prepend';
  /** Agent ID that triggered the flash */
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
}

export const TiptapEditor: FC<TiptapEditorProps> = ({ provider, placeholder }) => {
  const frontmatterRef = useRef('');
  // Flash state lives in a ref + imperative DOM updates — never triggers React re-renders.
  // This is critical: re-rendering TiptapEditor during typing causes ProseMirror to
  // re-reconcile the view, which can jump the cursor position or drop in-flight keystrokes.
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const flashStateRef = useRef(INITIAL_FLASH_STATE);
  const identity = useIdentity();

  // Always-parse text/plain paste as markdown (R18, Archetype D).
  // Use useState with a lazy initializer so the bundle is constructed once
  // and returned via stable reference — React Compiler accepts useState
  // reads during render while it flags `useRef().current` reads. The
  // MarkdownManager + clipboard handlers are effectively constants; the
  // "state" slot is just the rendering-safe carrier.
  //
  // Per D14 LOCKED, WYSIWYG clipboard uses PM's documented editorProps hooks
  // (clipboardTextSerializer + clipboardSerializer + handlePaste) —
  // DOM-level copy/cut/dragstart overrides are prohibited.
  //
  // Known scope: FR-21's chunked Y.Text insertion guard applies to the
  // Source-view paste path only (D14 LOCKED). WYSIWYG paste of a >500KB
  // HTML blob runs `rehype-parse → cleanup plugins → rehype-remark →
  // remark-stringify → PM schema transaction → fragment insert`
  // synchronously. On very large rich-HTML pastes the user sees a brief
  // stall. Porting chunked insertion to the PM path is non-mechanical
  // (PM reaches Y.XmlFragment through different primitives than Y.Text)
  // and is explicitly out of scope for this spec — don't misdiagnose the
  // stall as a regression. See SPEC.md §Consider-1 for context.
  const [clipboard] = useState(() => {
    const mdManager = new MarkdownManager({ extensions: coreExtensions });
    return {
      mdManager,
      text: createClipboardTextSerializer({ mdManager }),
      html: createClipboardHtmlSerializer({ mdManager }),
      paste: createHandlePaste({ mdManager }),
    };
  });

  // V2 EDITOR CACHE WIRING (US-008)
  //
  // Architecture: V2 cache owns the EDITOR INSTANCE lifetime (creation,
  // park-don't-destroy on React unmount, evict-on-LRU). React's
  // <EditorContent editor={editor}> owns the DOM mount — it moves
  // editor.view.dom into its own ref on init, sets editor.contentComponent
  // (load-bearing for ReactRenderer + ReactNodeViewRenderer used by
  // SlashCommand + JsxComponentView), and on unmount moves view.dom back
  // into a fresh detached div WITHOUT calling editor.destroy().
  //
  // Why this split (vs. directly reparent to a custom div ref):
  //  - <EditorContent> sets editor.contentComponent, which
  //    ReactRenderer (SlashCommandMenu suggestion popup) and
  //    ReactNodeViewRenderer (JsxComponent NodeView) both REQUIRE.
  //    Without contentComponent, ReactRenderer.setRenderer is a no-op
  //    and ReactNodeViewRenderer returns {} (no NodeView at all).
  //  - <EditorContent>.componentWillUnmount does NOT destroy the editor —
  //    it only moves view.dom back to a detached div + nulls
  //    contentComponent. So our cache's "preserve editor instance"
  //    guarantee is intact.
  //  - useEditor() is the destroyer (scheduleDestroy(1ms) on unmount).
  //    We replace useEditor with the cache-managed factory; we keep
  //    EditorContent for the React-side coordination.
  //
  // Cache lifecycle:
  //  - mountTiptapEditor: factory creates `new Editor()` (default detached
  //    div as element); cache stores entry; on cache hit returns existing
  //    entry (no DOM work — EditorContent handles re-attach).
  //  - parkTiptapEditor: cache marks entry non-active; no DOM work
  //    (EditorContent already moved view.dom on its own unmount).
  //  - evictTiptapEditor: cache calls editor.destroy() (LRU only).
  //
  // FR15 kill switch: when CACHE_ENABLED=false, mountTiptapEditor
  // returns __uncached entry; parkTiptapEditor destroys immediately.
  const [editor, setEditor] = useState<Editor | null>(null);
  // Mount errors flow through a state slot re-thrown during render so
  // DocumentErrorBoundary catches (review Minor #26). useEffect callbacks
  // can't throw synchronously — they'd surface as unhandled rejections.
  const [mountError, setMountError] = useState<Error | null>(null);
  if (mountError) throw mountError;
  const cacheEntryRef = useRef<TiptapCacheEntry | null>(null);
  const docName = provider.configuration.name ?? '';

  // Placeholder deliberately excluded from the deps array below. The only
  // observable placeholder transition (the `isNewDoc` draft→saved flip) is
  // handled by the `key=${docName}-${isNewDoc}` force-remount in
  // `EditorActivityPool`; including `placeholder` here would park+remount
  // on every prop-identity churn (localized copy swaps, focus-conditional
  // prompts, agent-turn hints) and defeat the V2 cache on callers that
  // feed a freshly-derived string.
  // biome-ignore lint/correctness/useExhaustiveDependencies: placeholder intentionally excluded — see comment above
  useEffect(() => {
    let entry: TiptapCacheEntry | null = null;
    try {
      // FR3 size-aware cache gate driven at the consumer call site (review
      // Pass-2 Major #4). Y.Text byte-length is available before mount via
      // the provider; view-count would require a parse pass we don't want
      // to pay pre-mount. Setting viewCount=0 effectively disables the
      // view-count gate (threshold 50 is never hit) while keeping the
      // bytes gate (> 500_000) live. The bytes gate is the load-bearing
      // protection for multi-MB prose docs — the view-count gate can be
      // wired separately once view-count measurement is extracted from
      // mount-time into a pre-mount heuristic.
      const bytes = provider.document.getText('source').length;
      const sizeStats = { viewCount: 0, bytes };
      // Pass a transient detached div as the cache's "container". The cache
      // factory mounts the editor into it (default behavior — TipTap creates
      // its own div if element is omitted). EditorContent then takes view.dom
      // from this transient div and moves it into its own React-managed ref.
      const transient = document.createElement('div');
      entry = mountTiptapEditor({
        docName,
        container: transient,
        sizeStats,
        factory: (el) => {
          const ctorStart = performance.now();
          const tipTapEditor = new Editor({
            element: el,
            onBeforeCreate: ({ editor }) => {
              editorCtorStartTimes.set(editor, ctorStart);
            },
            onCreate: ({ editor }) => {
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
                class: 'pt-10 pb-16 h-full',
              },
              clipboardTextParser: (text, _context, _plain, view) => {
                const json = clipboard.mdManager.parse(text);
                const node = view.state.schema.nodeFromJSON(json);
                // biome-ignore lint/suspicious/noExplicitAny: TipTap's clipboardTextParser expects a Slice-like return but ProseMirror Fragment works at runtime; no public type expresses the union
                return node.content as any;
              },
              clipboardTextSerializer: (slice, view) => clipboard.text(slice, view),
              clipboardSerializer: clipboard.html,
              handlePaste: (view, event) => clipboard.paste(view, event),
            },
            extensions: [
              // Configure docName-aware extensions before construction so
              // InternalLink's link-resolution decoration plugin (US-005)
              // can compute resolved/folder/unresolved states.
              ...sharedExtensions.map((ext) => {
                if (ext.name === 'link') {
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
              }),
              Extension.create({
                name: 'imageUploadDecoration',
                addProseMirrorPlugins() {
                  return [uploadDecorationPlugin];
                },
              }),
              // Use yCursorPlugin from @tiptap/y-tiptap directly (same module
              // as Collaboration v3) to avoid ySyncPluginKey mismatch.
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
            ],
          });
          return {
            editor: tipTapEditor,
            ydoc: provider.document,
            ytext: provider.document.getText('source'),
            provider,
          };
        },
      });
      cacheEntryRef.current = entry;
      setEditor(entry.editor);
    } catch (err) {
      // Mount failure surfaces to the user via `DocumentErrorBoundary`
      // (review Minor #26). Pre-fix the effect silently caught + left
      // `editor = null` with no visible signal, forcing the user to nav
      // away + back to retry. By rethrowing we let the existing boundary's
      // "Try again" affordance (which recycles the pool entry) drive
      // recovery. `setMountError` pushes the error into a state slot
      // that React re-throws during render — effects can't throw
      // synchronously.
      console.error('[TiptapEditor] mountTiptapEditor failed', err);
      cacheEntryRef.current = null;
      setEditor(null);
      setMountError(err instanceof Error ? err : new Error(String(err)));
    }

    return () => {
      const cur = cacheEntryRef.current;
      if (cur) {
        parkTiptapEditor(cur);
      }
      cacheEntryRef.current = null;
      setEditor(null);
    };
    // `placeholder` is intentionally NOT in the deps array (review Pass-2
    // Major #7). The only observable transition in practice is the draft
    // → saved flip driven by `isNewDoc`, which `EditorActivityPool.tsx`
    // already handles via `key={\`${entry.docName}-${String(isNewDoc)}\`}`
    // — React force-remounts the entire TiptapEditor component, so the
    // mount effect re-runs and reads the current `placeholder` prop.
    // Including placeholder here would triple-mount on the first save.
  }, [docName, provider, clipboard]);

  // Mark user typing on the editor DOM. Observer B uses this timestamp to defer
  // its tree-replacement sync while the user is actively editing, preventing concurrent
  // user edits from being obliterated by updateYFragment.
  useEffect(() => {
    const docName = provider.configuration.name;
    setCurrentDocName(docName ?? null);
    return () => setCurrentDocName(null);
  }, [provider]);

  // DEV-only: register the TipTap editor instance in the module-level
  // active-editor map so Playwright can resolve `window.__activeEditor` →
  // the real Editor instance and poll `editor.state.selection` directly.
  // Needed to close the `click → keyboard.press(Tab|...)` PM-selection-sync
  // race described in precedent §20(a) category C — under workers>1 CPU
  // contention the DOMObserver hasn't synced the click-induced DOM
  // selection into PM state yet, and double-rAF yields aren't enough.
  //
  // `unregisterEditor` matches on the editor ref so the StrictMode double-
  // invoke ordering (register-A, register-B, cleanup-A) doesn't leave the
  // registry empty. Vite replaces `import.meta.env.DEV` at build time, so
  // production bundles strip this effect entirely.
  useEffect(() => {
    if (!editor || !import.meta.env.DEV) return;
    const docName = provider.configuration.name;
    if (!docName) return;
    registerEditor(docName, editor);
    return () => unregisterEditor(docName, editor);
  }, [editor, provider]);

  useEffect(() => {
    if (!editor) return;
    // TipTap v3's `editor.view` is a proxy that throws when accessed before
    // the underlying `editorView` is mounted — e.g. during an Activity
    // visible→hidden→visible cycle, a DocumentErrorBoundary retry that
    // recycles the pool entry, or any race where React runs a passive
    // effect on an editor whose view is mid-creation. We subscribe to the
    // editor's 'create' event so the listener attachment happens after the
    // view is guaranteed present. If the editor is already created by the
    // time this effect runs (common path), we attach immediately.
    // Regression fixed: QA-002 retry flow + any Activity unhide reconnect.
    const mark = () => markUserTyping();
    let attachedDom: HTMLElement | null = null;
    const attach = () => {
      if (attachedDom || !editor || editor.isDestroyed) return;
      attachedDom = editor.view.dom;
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
    // Access `editorView` directly (not through the throwing proxy) to check
    // mount state. The proxy intercepts property access on `editor.view` only.
    const isMounted = !!(editor as unknown as { editorView?: unknown }).editorView;
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

  // Watch activity map and trigger flash. Tracks latest agent activity entry
  // to determine position (append vs prepend) and emits observable state.
  //
  // Observability layers (use whichever is ergonomic for your test):
  //   1. `data-agent-flash-state` attribute on the wrapper (Radix pattern)
  //   2. `window.__agentFlashState` object (poll-based)
  //   3. `document` events: 'agent-flash' (start) and 'agent-flash-end' (complete)
  useEffect(() => {
    if (!editor) return;
    const activityMap = provider.document.getMap('agent-flash');
    let lastSeenTimestamp = Date.now();
    let lastFlashTime = 0;
    let pendingTimeout: number | null = null;
    let flashEndTimeout: number | null = null;
    let flashSettledTimeout: number | null = null;

    /** Extract the latest activity entry to know what the agent just wrote */
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

    /** Imperative DOM update — bypasses React re-render to avoid disrupting typing. */
    const applyFlashStateToDom = (state: AgentFlashState) => {
      // `flashStateRef` is the authoritative source in production — the
      // count-monotonicity logic in `triggerFlash` below derives the next
      // count from `flashStateRef.current?.count ?? 0`, not from the
      // window hook. The `window.__agentFlashState` write is a DEV-only
      // test observation channel (US-006 / PRECEDENTS.md precedent #20); Vite
      // statically replaces `import.meta.env.DEV` at build time so the
      // branch tree-shakes out of production bundles.
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
        // Read from the ref (prod-safe) rather than `window.__agentFlashState`
        // — the window write is DEV-gated (US-006) and the ref is the
        // authoritative source in production. Keeps count monotonic under
        // rapid re-trigger regardless of whether tests are observing.
        count: (flashStateRef.current?.count ?? 0) + 1,
        lastFiredAt: Date.now(),
        position,
        lastAgentId: latest?.agentId ?? null,
      };

      applyFlashStateToDom(nextState);
      document.dispatchEvent(new CustomEvent('agent-flash', { detail: nextState }));

      // Clear any prior end timers (in case of rapid re-trigger)
      if (flashEndTimeout) clearTimeout(flashEndTimeout);
      if (flashSettledTimeout) clearTimeout(flashSettledTimeout);

      // Transition editing → settled after animation completes
      flashEndTimeout = window.setTimeout(() => {
        const settledState: AgentFlashState = { ...nextState, state: 'settled' };
        applyFlashStateToDom(settledState);
        document.dispatchEvent(new CustomEvent('agent-flash-end', { detail: settledState }));

        // Return to idle after a brief settled window (lets tests observe the transition)
        flashSettledTimeout = window.setTimeout(() => {
          applyFlashStateToDom({ ...settledState, state: 'idle' });
        }, 300);
      }, FLASH_DURATION_MS);
    };

    // Initialize DOM + window state to idle
    applyFlashStateToDom(INITIAL_FLASH_STATE);

    const observer = () => {
      evictStaleEntries(activityMap);

      if (!hasNewEntries(activityMap, lastSeenTimestamp)) return;

      // Skip flash while tab is hidden — the visibility handler will fire a
      // "missed while away" flash when the user returns (FR15). Don't advance
      // lastSeenTimestamp here so the refocus check still detects the new entries.
      if (document.visibilityState !== 'visible') return;

      const now = Date.now();
      lastSeenTimestamp = now;

      // Debounce — rapid writes collapse into at most one queued flash
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

    // Visibility change handler (FR15): flash on tab refocus for missed writes
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
  }, [editor, provider.document]);

  // Scroll to a heading anchor after navigating from a wiki link.
  // The anchor slug is encoded in the URL as ?anchor=<slug>. TiptapEditor is
  // keyed by docName (see EditorArea), so this effect runs once per doc mount.
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

    // Try immediately (already synced) and again after sync if needed.
    tryScroll();
    provider.on('synced', tryScroll);
    return () => {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      provider.off('synced', tryScroll);
    };
  }, [provider]);

  // Outline panel click → scroll the Nth heading in the WYSIWYG DOM into view.
  // Using index (not slug) keeps this robust to duplicate heading texts without
  // re-implementing HeadingAnchors' dedup logic on the outline side.
  useEffect(() => {
    if (!editor) return;
    function onNav(e: Event) {
      const detail = (e as CustomEvent<OutlineNavDetail>).detail;
      if (!detail || detail.mode !== 'wysiwyg' || !editor || editor.isDestroyed) return;
      // Access the real editorView directly (not editor.view which is a
      // throwing proxy pre-mount). Typed as the relevant subset so we don't
      // need an `any` cast at the call site.
      const realView = (editor as unknown as { editorView?: { dom: HTMLElement } }).editorView;
      if (!realView) return;
      const headings = realView.dom.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6');
      const target = headings[detail.index];
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    window.addEventListener(OUTLINE_NAV_EVENT, onNav);
    return () => window.removeEventListener(OUTLINE_NAV_EVENT, onNav);
  }, [editor]);

  // Read frontmatter from Y.Doc metadata map (set by server persistence on load)
  useEffect(() => {
    const metaMap = provider.document.getMap('metadata');
    const fm = metaMap.get('frontmatter');
    if (typeof fm === 'string' && fm) {
      frontmatterRef.current = fm;
    }
    const observer = () => {
      const updated = metaMap.get('frontmatter');
      if (typeof updated === 'string') {
        frontmatterRef.current = updated;
      }
    };
    metaMap.observe(observer);
    return () => metaMap.unobserve(observer);
  }, [provider.document]);

  // Set awareness state on mount (user identity + mode)
  useEffect(() => {
    const awareness = provider.awareness;
    if (!awareness) return;
    awareness.setLocalStateField('user', {
      name: identity.name,
      color: identity.color,
      type: 'human' as const,
      coeditor: identity.coeditor,
      tabId: identity.tabId,
    });
    awareness.setLocalStateField('mode', 'wysiwyg');
  }, [provider, identity]);

  // Data attributes are set once on initial render; the flash useEffect updates them
  // imperatively via wrapperRef to avoid triggering React re-renders during typing.
  return (
    <div
      ref={wrapperRef}
      className="tiptap-editor h-full"
      data-agent-flash-state="idle"
      data-agent-flash-count="0"
      data-agent-flash-position="append"
      data-agent-flash-agent-id=""
    >
      {editor && <BubbleMenuBar editor={editor} />}
      {editor && <TableControlsMenu editor={editor} />}
      {/*
       * <EditorContent> owns the React-side DOM mount and sets
       * editor.contentComponent (load-bearing for ReactRenderer + the
       * SlashCommandMenu suggestion popup + ReactNodeViewRenderer used by
       * JsxComponentView). It does NOT destroy the editor on unmount —
       * just moves view.dom to a fresh detached div. The V2 cache holds
       * the editor instance across React unmount; EditorContent re-attaches
       * view.dom on remount. Editor identity preserved across navigation.
       */}
      <EditorContent editor={editor} className="h-full" />
      {/*
       * <InteractionLayerView> renders the singleton PropPanel / Toolbar /
       * Breadcrumb subtree FOR THE ACTIVE chip — inside the main React tree
       * so PropPanel renderers (InternalLinkPropPanel, WikiLinkPropPanel)
       * inherit context providers like <PageListProvider> + <ThemeProvider>.
       * The layer host (per-editor WeakMap) provides the store; the View
       * subscribes via useState + subscribe and renders the active
       * registration's controls. RawMdxFallback registers with empty controls
       * + a handlePrimary hook (dispatches RAW_MDX_NAV_EVENT); in-place MDX
       * editing is deferred to CB-v2's inline-nested RawMdxFallbackCMView
       * per T1 trim.
       *
       * Rendered AFTER EditorContent so its absolute-positioned PropPanels
       * stack above editor content (z-index handled in CSS).
       */}
      {editor && <InteractionLayerView store={getInteractionLayer(editor).store} />}
    </div>
  );
};

// Expose flash state type on window for test access
declare global {
  interface Window {
    __agentFlashState?: AgentFlashState;
  }
}
