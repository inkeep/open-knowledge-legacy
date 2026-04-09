import { HocuspocusProvider } from '@hocuspocus/provider';
import { Extension, getSchema } from '@tiptap/core';
import Collaboration from '@tiptap/extension-collaboration';
import { MarkdownManager } from '@tiptap/markdown';
import { EditorContent, useEditor } from '@tiptap/react';
import { yCursorPlugin } from '@tiptap/y-tiptap';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type * as Y from 'yjs';
import { useIdentity } from '../presence/identity';
import { prependFrontmatter } from './extensions/frontmatter';
import {
  type BuiltInComponentMeta,
  getSlashComponentItems,
} from './extensions/jsx-component-registry';
import { sharedExtensions } from './extensions/shared';
import { getSlashCommandMatch } from './extensions/slash-command';
import { markUserTyping, setupObservers } from './observers';
import {
  evictStaleEntries,
  FLASH_DEBOUNCE_MS,
  FLASH_DURATION_MS,
  hasNewEntries,
} from './plugins/flash-shared';

const DOC_NAME = 'test-doc';

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
  label.textContent = user.name;
  cursor.append(label);

  return cursor;
}

export interface TiptapEditorHandle {
  getMarkdown: () => string;
  /** Get Y.Text('source') for CodeMirror CRDT binding */
  getYText: () => Y.Text;
  /** Get HocuspocusProvider for awareness (cursor presence) */
  getProvider: () => HocuspocusProvider;
}

const editorSchema = getSchema(sharedExtensions);

// Singleton provider outside React lifecycle — survives StrictMode double-mount.
// Provider is created once and persists for the app lifetime.
let singletonProvider: HocuspocusProvider | null = null;
let observerCleanup: (() => void) | null = null;

function getCollabUrl(): string {
  if (typeof window === 'undefined') {
    return 'ws://localhost:5173/collab';
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/collab`;
}

function getProvider(): HocuspocusProvider {
  if (!singletonProvider) {
    console.log('[TiptapEditor] Creating provider singleton');
    singletonProvider = new HocuspocusProvider({
      url: getCollabUrl(),
      name: DOC_NAME,
    });

    // Set up bidirectional observers once after first sync
    const provider = singletonProvider;
    console.log('[TiptapEditor] Registering onSync handler');
    const onSync = () => {
      console.log('[TiptapEditor] onSync fired, observerCleanup=', !!observerCleanup);
      if (observerCleanup) return; // Already set up
      const doc = provider.document;
      const mdMgr = new MarkdownManager({ extensions: sharedExtensions });
      observerCleanup = setupObservers({
        doc,
        xmlFragment: doc.getXmlFragment('default'),
        ytext: doc.getText('source'),
        mdManager: mdMgr,
        schema: editorSchema,
        onSyncError: (direction, error) => {
          console.warn(`[Sync] ${direction} failed:`, error.message);
        },
      });
      provider.off('synced', onSync);
    };
    provider.on('synced', onSync);

    // Expose provider on window for E2E test access
    if (typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>).__hocuspocusProvider = provider;
    }
  }
  return singletonProvider;
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

interface SlashMenuState {
  query: string;
  from: number;
  to: number;
  items: BuiltInComponentMeta[];
  selectedIndex: number;
}

export const TiptapEditor = forwardRef<TiptapEditorHandle>(function TiptapEditor(_props, ref) {
  const frontmatterRef = useRef<string>('');
  // Flash state lives in a ref + imperative DOM updates — never triggers React re-renders.
  // This is critical: re-rendering TiptapEditor during typing causes ProseMirror to
  // re-reconcile the view, which can jump the cursor position or drop in-flight keystrokes.
  const wrapperRef = useRef<HTMLDivElement>(null);
  const flashStateRef = useRef<AgentFlashState>(INITIAL_FLASH_STATE);
  const slashMenuRef = useRef<SlashMenuState | null>(null);
  const provider = getProvider();
  const identity = useIdentity();
  const [slashMenuState, setSlashMenuState] = useState<SlashMenuState | null>(null);

  const mdManager = useMemo(() => new MarkdownManager({ extensions: sharedExtensions }), []);

  const editor = useEditor({
    extensions: [
      ...sharedExtensions,
      Collaboration.configure({
        document: provider.document,
      }),
      // Use yCursorPlugin from @tiptap/y-tiptap directly (same module as Collaboration v3)
      // to avoid ySyncPluginKey mismatch with y-prosemirror's yCursorPlugin
      Extension.create({
        name: 'collaborationCursor',
        addProseMirrorPlugins() {
          const awareness = provider.awareness;
          if (!awareness) {
            // HocuspocusProvider constructs its awareness instance synchronously,
            // so this should never happen. If it does, fail loudly with context
            // instead of passing a bogus object that yCursorPlugin will blow up on.
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

  useEffect(() => {
    slashMenuRef.current = slashMenuState;
  }, [slashMenuState]);

  useEffect(() => {
    if (!editor) return;

    const syncSlashMenu = () => {
      const { state } = editor;
      if (!state.selection.empty) {
        setSlashMenuState(null);
        return;
      }

      const { $from } = state.selection;
      if (!$from.parent.isTextblock) {
        setSlashMenuState(null);
        return;
      }

      const textBeforeCursor = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc');
      const match = getSlashCommandMatch(textBeforeCursor, state.selection.from);
      if (!match) {
        setSlashMenuState(null);
        return;
      }

      const items = getSlashComponentItems(match.query);
      setSlashMenuState((current) => ({
        query: match.query,
        from: match.from,
        to: match.to,
        items,
        selectedIndex:
          current && current.query === match.query && current.items.length > 0
            ? Math.min(current.selectedIndex, Math.max(items.length - 1, 0))
            : 0,
      }));
    };

    editor.on('selectionUpdate', syncSlashMenu);
    editor.on('update', syncSlashMenu);
    return () => {
      editor.off('selectionUpdate', syncSlashMenu);
      editor.off('update', syncSlashMenu);
    };
  }, [editor]);

  useEffect(() => {
    if (!editor) return;

    const insertSelectedComponent = (component: BuiltInComponentMeta) => {
      const currentSlashMenu = slashMenuRef.current;
      if (!currentSlashMenu) {
        return;
      }

      editor
        .chain()
        .focus()
        .deleteRange({ from: currentSlashMenu.from, to: currentSlashMenu.to })
        .insertJsxComponent(component.defaultTemplate())
        .run();

      setSlashMenuState(null);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const currentSlashMenu = slashMenuRef.current;
      if (!currentSlashMenu) {
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setSlashMenuState(null);
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        event.stopPropagation();
        if (currentSlashMenu.items.length === 0) return;
        setSlashMenuState((current) =>
          current
            ? {
                ...current,
                selectedIndex: (current.selectedIndex + 1) % current.items.length,
              }
            : current,
        );
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopPropagation();
        if (currentSlashMenu.items.length === 0) return;
        setSlashMenuState((current) =>
          current
            ? {
                ...current,
                selectedIndex:
                  (current.selectedIndex - 1 + current.items.length) % current.items.length,
              }
            : current,
        );
        return;
      }

      if (event.key === 'Enter') {
        const selectedComponent = currentSlashMenu.items[currentSlashMenu.selectedIndex];
        if (!selectedComponent) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        insertSelectedComponent(selectedComponent);
      }
    };

    const dom = editor.view.dom;
    dom.addEventListener('keydown', onKeyDown, true);
    return () => {
      dom.removeEventListener('keydown', onKeyDown, true);
    };
  }, [editor]);

  // Mark user typing on the editor DOM. Observer B uses this timestamp to defer
  // its tree-replacement sync while the user is actively editing, preventing concurrent
  // user edits from being obliterated by updateYFragment.
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const mark = () => markUserTyping();
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
    const activityMap = provider.document.getMap('activity');
    let lastSeenTimestamp = Date.now();
    let lastFlashTime = 0;
    let pendingTimeout: ReturnType<typeof setTimeout> | null = null;
    let flashEndTimeout: ReturnType<typeof setTimeout> | null = null;
    let flashSettledTimeout: ReturnType<typeof setTimeout> | null = null;

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
      flashEndTimeout = setTimeout(() => {
        const settledState: AgentFlashState = { ...nextState, state: 'settled' };
        applyFlashStateToDom(settledState);
        document.dispatchEvent(new CustomEvent('agent-flash-end', { detail: settledState }));

        // Return to idle after a brief settled window (lets tests observe the transition)
        flashSettledTimeout = setTimeout(() => {
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
          pendingTimeout = setTimeout(() => {
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

  useImperativeHandle(
    ref,
    () => ({
      getMarkdown(): string {
        if (!editor) return '';
        const json = editor.getJSON();
        const body = mdManager.serialize(json);
        return prependFrontmatter(frontmatterRef.current, body);
      },
      getYText(): Y.Text {
        return provider.document.getText('source');
      },
      getProvider(): HocuspocusProvider {
        return provider;
      },
    }),
    [editor, mdManager, provider.document, provider],
  );

  // Data attributes are set once on initial render; the flash useEffect updates them
  // imperatively via wrapperRef to avoid triggering React re-renders during typing.
  return (
    <div
      ref={wrapperRef}
      className="tiptap-editor"
      data-agent-flash-state="idle"
      data-agent-flash-count="0"
      data-agent-flash-position="append"
      data-agent-flash-agent-id=""
      style={{ position: 'relative' }}
    >
      {slashMenuState ? (
        <div
          data-slash-menu=""
          role="listbox"
          aria-label="Insert component"
          style={{
            position: 'absolute',
            top: '12px',
            left: '12px',
            zIndex: 20,
            width: '300px',
            borderRadius: '12px',
            border: '1px solid #d4d4d8',
            background: '#ffffff',
            boxShadow: '0 20px 45px rgba(15, 23, 42, 0.12)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '10px 12px',
              borderBottom: '1px solid #e4e4e7',
              background: '#fafafa',
              fontSize: '12px',
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: '#52525b',
            }}
          >
            Insert component
          </div>
          <div style={{ maxHeight: '320px', overflowY: 'auto', padding: '6px' }}>
            {slashMenuState.items.length > 0 ? (
              slashMenuState.items.map((component, index) => {
                const isSelected = index === slashMenuState.selectedIndex;
                return (
                  <button
                    key={component.name}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    data-slash-item={component.name}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      editor?.chain().focus().run();
                      editor
                        ?.chain()
                        .focus()
                        .deleteRange({ from: slashMenuState.from, to: slashMenuState.to })
                        .insertJsxComponent(component.defaultTemplate())
                        .run();
                      setSlashMenuState(null);
                    }}
                    style={{
                      width: '100%',
                      border: 'none',
                      borderRadius: '10px',
                      background: isSelected ? '#18181b' : 'transparent',
                      color: isSelected ? '#ffffff' : '#18181b',
                      padding: '10px 12px',
                      textAlign: 'left',
                      display: 'grid',
                      gap: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ fontSize: '13px', fontWeight: 700 }}>
                      {component.displayName}
                    </span>
                    <span
                      style={{
                        fontSize: '12px',
                        color: isSelected ? 'rgba(255, 255, 255, 0.82)' : '#71717a',
                      }}
                    >
                      {component.description}
                    </span>
                  </button>
                );
              })
            ) : (
              <div style={{ padding: '12px', fontSize: '13px', color: '#71717a' }}>
                No built-in components match <strong>/{slashMenuState.query}</strong>.
              </div>
            )}
          </div>
        </div>
      ) : null}
      <EditorContent editor={editor} />
    </div>
  );
});

// Expose flash state type on window for test access
declare global {
  interface Window {
    __agentFlashState?: AgentFlashState;
  }
}
