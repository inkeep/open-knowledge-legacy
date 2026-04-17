import { HocuspocusProvider } from '@hocuspocus/provider';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import * as Y from 'yjs';
import { useDocumentContext } from '@/editor/DocumentContext';
import { getLastUserKeystroke } from '@/editor/observers';
import {
  AGENT_FOCUS_DEBOUNCE_MS,
  AGENT_FOCUS_TYPING_GUARD_MS,
  type AgentFocusAwareness,
  pickPrimary,
} from '@/lib/agent-focus';
import { defaultCollabWsUrl, parseCC1Signal, SYSTEM_DOC_NAME } from '@/lib/cc1';
import { hashFromDocName } from '@/lib/doc-hash';
import { emitDocumentsChanged, subscribeToDocumentsChanged } from '@/lib/documents-events';

export function SystemDocSubscriber() {
  const queryClient = useQueryClient();
  const { activeDocName, pinnedDoc } = useDocumentContext();
  // Hold activeDocName + pinnedDoc in refs so the awareness handler reads the
  // latest without needing to recreate the provider on every change. Writing
  // refs in effects (not during render) keeps React Compiler happy.
  const activeDocRef = useRef<string | null>(activeDocName);
  const pinnedDocRef = useRef<string | null>(pinnedDoc);
  useEffect(() => {
    activeDocRef.current = activeDocName;
  }, [activeDocName]);
  // Track the just-unpinned moment so we can immediately nav to the current
  // primary without waiting for the next awareness change. Runs after the
  // main effect has wired the provider/listener.
  const providerRef = useRef<HocuspocusProvider | null>(null);
  useEffect(() => {
    const wasPinned = pinnedDocRef.current !== null;
    pinnedDocRef.current = pinnedDoc;
    const becameUnpinned = wasPinned && pinnedDoc === null;
    if (!becameUnpinned) return;
    // Respect the typing guard on unpin-nav too — don't yank focus if the
    // user just typed and then unpinned (unlikely but consistent).
    if (Date.now() - getLastUserKeystroke() < AGENT_FOCUS_TYPING_GUARD_MS) return;
    const provider = providerRef.current;
    const awareness = provider?.awareness as unknown as AgentFocusAwareness | null;
    if (!awareness) return;
    const primary = pickPrimary(awareness, Date.now());
    if (!primary) return;
    if (primary === activeDocRef.current) return;
    window.location.hash = hashFromDocName(primary);
  }, [pinnedDoc]);

  useEffect(() => {
    const doc = new Y.Doc();
    const provider = new HocuspocusProvider({
      url: defaultCollabWsUrl(),
      name: SYSTEM_DOC_NAME,
      document: doc,
      onStateless: ({ payload }: { payload: string }) => {
        const signal = parseCC1Signal(payload);
        if (!signal) {
          console.warn('[CC1] Unparseable stateless payload, skipping:', payload.slice(0, 100));
          return;
        }
        emitDocumentsChanged([signal.ch]);
      },
      onClose: ({ event }) => {
        console.warn('[CC1] __system__ connection closed:', event.code, event.reason);
      },
      onDisconnect: () => {
        console.warn('[CC1] __system__ disconnected - derived views may be stale');
      },
    });

    const unsubscribe = subscribeToDocumentsChanged((channels) => {
      if (channels.includes('files') || channels.includes('backlinks')) {
        void queryClient.invalidateQueries({ queryKey: ['backlinks'] });
        void queryClient.invalidateQueries({ queryKey: ['forward-links'] });
      }
      if (channels.includes('files') || channels.includes('graph')) {
        void queryClient.invalidateQueries({ queryKey: ['orphans'] });
        void queryClient.invalidateQueries({ queryKey: ['hubs'] });
      }
    });

    provider.on('synced', () => {
      emitDocumentsChanged(['files', 'backlinks', 'graph']);
    });

    // Agent-focus nav: debounced, reads latest awareness on each tick to
    // coalesce bursts, navigates iff primary differs from the active doc.
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const runNavCheck = (): void => {
      debounceTimer = null;
      // Pin: user has chosen to stay put. Honor unconditionally.
      if (pinnedDocRef.current !== null) return;
      // Typing guard: suppress nav silently while the user is actively editing.
      // Reads the module-level keystroke timestamp that TiptapEditor/SourceEditor
      // update via `markUserTyping` on every keydown/paste/drop/cut.
      const sinceLastKeystroke = Date.now() - getLastUserKeystroke();
      if (sinceLastKeystroke < AGENT_FOCUS_TYPING_GUARD_MS) return;
      const awareness = provider.awareness as unknown as AgentFocusAwareness | null;
      if (!awareness) return;
      const primary = pickPrimary(awareness, Date.now());
      if (!primary) return;
      if (primary === activeDocRef.current) return;
      window.location.hash = hashFromDocName(primary);
    };
    const handleAwarenessChange = (): void => {
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(runNavCheck, AGENT_FOCUS_DEBOUNCE_MS);
    };
    provider.awareness?.on('change', handleAwarenessChange);
    providerRef.current = provider;

    // DEV-only test hook: inject a fake agent-focus awareness state as if a
    // remote peer (the "agent") is focusing on a different doc. Fires the
    // awareness 'change' event which triggers the debounced nav check. The
    // fake state uses a fixed clientID (999999) that will never collide with
    // real clients. No encode/decode round-trip needed — we poke the internal
    // states map directly since this runs in the same JS context.
    if (import.meta.env.DEV) {
      window.__test_injectAgentFocus = (docName: string) => {
        const awareness = provider.awareness;
        if (!awareness) return false;
        const fakeClientId = 999999;
        const fakeState = {
          agentFocus: {
            'test-agent': {
              currentDoc: docName,
              ts: Date.now(),
            },
          },
        };
        awareness.states.set(fakeClientId, fakeState);
        awareness.emit('change', [{ added: [fakeClientId], updated: [], removed: [] }, 'test']);
        return true;
      };
    }

    return () => {
      unsubscribe();
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      provider.awareness?.off('change', handleAwarenessChange);
      provider.destroy();
      doc.destroy();
      providerRef.current = null;
      if (import.meta.env.DEV) {
        delete (window as { __test_injectAgentFocus?: unknown }).__test_injectAgentFocus;
      }
    };
  }, [queryClient]);

  return null;
}
