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
import { Extension } from '@tiptap/core';
import Collaboration from '@tiptap/extension-collaboration';
import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, useEditor } from '@tiptap/react';
import { yCursorPlugin } from '@tiptap/y-tiptap';
import { type FC, useEffect, useRef } from 'react';
import { OUTLINE_NAV_EVENT, type OutlineNavDetail } from '@/components/OutlinePanel';
import { useIdentity } from '../presence/identity';
import { SideMenu } from './block-ux/SideMenu';
import { BubbleMenuBar } from './bubble-menu/BubbleMenuBar';
import { sharedExtensions } from './extensions/shared.ts';
import { setCurrentDocName, uploadDecorationPlugin } from './image-upload/index.ts';
import { markUserTyping } from './observers';
import { TableControlsMenu } from './table-controls/TableControlsMenu';

/** Custom cursor renderer — agents don't get cursors (NG1: no fake cursor animation). */
function renderCursor(user: Record<string, string>): HTMLElement {
  const cursor = document.createElement('span');

  // Agents: return invisible element (no cursor per NG1)
  if (user.type === 'agent') {
    cursor.style.display = 'none';
    return cursor;
  }

  // Humans: colored caret + name label
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
  // All text/plain clipboard data is parsed as markdown — no detection heuristic.
  // Cmd+Shift+V remains the browser-level plain-text escape hatch.
  const mdManagerRef = useRef(new MarkdownManager({ extensions: coreExtensions }));

  const editor = useEditor({
    editorProps: {
      attributes: {
        class: 'pt-10 pb-16 h-full',
      },
      clipboardTextParser: (text, _context, _plain, view) => {
        const json = mdManagerRef.current.parse(text);
        const node = view.state.schema.nodeFromJSON(json);
        // biome-ignore lint/suspicious/noExplicitAny: TipTap's clipboardTextParser expects a Slice-like return but ProseMirror Fragment works at runtime; no public type expresses the union
        return node.content as any;
      },
    },
    extensions: [
      ...sharedExtensions,
      Placeholder.configure({
        placeholder: placeholder ?? "Type '/' for commands",
        showOnlyCurrent: false,
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
      // Use yCursorPlugin from @tiptap/y-tiptap directly (same module as Collaboration v3)
      // to avoid ySyncPluginKey mismatch with y-prosemirror's yCursorPlugin
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

  // Mark user typing on the editor DOM. Observer B uses this timestamp to defer
  // its tree-replacement sync while the user is actively editing, preventing concurrent
  // user edits from being obliterated by updateYFragment.
  useEffect(() => {
    const docName = provider.configuration.name;
    setCurrentDocName(docName ?? null);
    return () => setCurrentDocName(null);
  }, [provider]);

  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const mark = () => markUserTyping(provider.document);
    dom.addEventListener('keydown', mark);
    dom.addEventListener('paste', mark);
    dom.addEventListener('drop', mark);
    dom.addEventListener('cut', mark);
    return () => {
      dom.removeEventListener('keydown', mark);
      dom.removeEventListener('paste', mark);
      dom.removeEventListener('drop', mark);
      dom.removeEventListener('cut', mark);
    };
  }, [editor, provider.document]);

  // Watch activity map and trigger flash. Tracks latest agent activity entry
  // to determine position (append vs prepend) and emits observable state.
  //
  // Observability layers (use whichever is ergonomic for your test):
  //   1. `data-agent-flash-state` attribute on the wrapper (Radix pattern)
  //   2. `window.__agentFlashState` object (poll-based)
  //   3. `document` events: 'agent-flash' (start) and 'agent-flash-end' (complete)
  useEffect(() => {
    if (!editor) return;
    const activityMap = provider.document.getMap('activity');
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
      flashStateRef.current = state;
      window.__agentFlashState = state;
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
        count: (window.__agentFlashState?.count ?? 0) + 1,
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
      if (!detail || detail.mode !== 'wysiwyg' || !editor) return;
      const headings = editor.view.dom.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6');
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
      {editor && <SideMenu editor={editor} />}
      <EditorContent editor={editor} className="h-full" />
    </div>
  );
};

// Expose flash state type on window for test access
declare global {
  interface Window {
    __agentFlashState?: AgentFlashState;
  }
}
