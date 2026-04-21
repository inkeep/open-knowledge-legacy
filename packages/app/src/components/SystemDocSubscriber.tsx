import { HocuspocusProvider } from '@hocuspocus/provider';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import * as Y from 'yjs';
import { useDocumentContext } from '@/editor/DocumentContext';
import { getLastUserKeystroke } from '@/editor/observers';
import {
  AGENT_PRESENCE_DEBOUNCE_MS,
  AGENT_PRESENCE_TYPING_GUARD_MS,
  type AgentPresenceAwareness,
  pickPrimary,
} from '@/lib/agent-presence';
import { parseCC1Signal, SYSTEM_DOC_NAME } from '@/lib/cc1';
import { hashFromDocName } from '@/lib/doc-hash';
import { emitDocumentsChanged, subscribeToDocumentsChanged } from '@/lib/documents-events';

export function SystemDocSubscriber() {
  const queryClient = useQueryClient();
  const { activeDocName, pinnedDoc, collabUrl, setSystemProvider } = useDocumentContext();
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
    if (Date.now() - getLastUserKeystroke() < AGENT_PRESENCE_TYPING_GUARD_MS) return;
    const provider = providerRef.current;
    const awareness = provider?.awareness as unknown as AgentPresenceAwareness | null;
    if (!awareness) return;
    const primary = pickPrimary(awareness, Date.now());
    if (!primary) return;
    if (primary === activeDocRef.current) return;
    window.location.hash = hashFromDocName(primary);
  }, [pinnedDoc]);

  useEffect(() => {
    if (collabUrl === null) return;
    const doc = new Y.Doc();
    const provider = new HocuspocusProvider({
      url: collabUrl,
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

    // Agent-presence nav: debounced, reads latest awareness on each tick to
    // coalesce bursts, navigates iff primary differs from the active doc.
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    // One-shot per-clientID warning when a stale bundled client still publishes
    // `user.type === 'agent'` (FR-10). `AwarenessUser.type` is narrowed to
    // `'human'` — anything else is a rollout drift signal. Gated on
    // NODE_ENV !== 'test' to avoid test-environment noise.
    const warnedStaleAgentClients = new Set<number>();
    const runNavCheck = (): void => {
      debounceTimer = null;
      // Pin: user has chosen to stay put. Honor unconditionally.
      if (pinnedDocRef.current !== null) return;
      // Typing guard: suppress nav silently while the user is actively editing.
      // Reads the module-level keystroke timestamp that TiptapEditor/SourceEditor
      // update via `markUserTyping` on every keydown/paste/drop/cut.
      const sinceLastKeystroke = Date.now() - getLastUserKeystroke();
      if (sinceLastKeystroke < AGENT_PRESENCE_TYPING_GUARD_MS) return;
      const awareness = provider.awareness as unknown as AgentPresenceAwareness | null;
      if (!awareness) return;
      const primary = pickPrimary(awareness, Date.now());
      if (!primary) return;
      if (primary === activeDocRef.current) return;
      window.location.hash = hashFromDocName(primary);
    };
    const handleAwarenessChange = (): void => {
      // Rollout-drift defense (FR-10): if any awareness peer is still
      // publishing `user.type === 'agent'` (post-narrowing that's invalid),
      // log once per clientID so operators can spot stale bundled clients.
      if (process.env.NODE_ENV !== 'test' && provider.awareness) {
        for (const [clientId, state] of provider.awareness.getStates().entries()) {
          if (warnedStaleAgentClients.has(clientId)) continue;
          const user = (state as { user?: { type?: string } }).user;
          if (user?.type === 'agent') {
            warnedStaleAgentClients.add(clientId);
            console.warn(
              `[agent-presence] observed stale AwarenessUser.type === 'agent' from clientID ${clientId} — probably a stale bundled client`,
            );
          }
        }
      }
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(runNavCheck, AGENT_PRESENCE_DEBOUNCE_MS);
    };
    provider.awareness?.on('change', handleAwarenessChange);
    providerRef.current = provider;
    // Lift the provider into DocumentContext so presence-bar consumers
    // (use-presence in US-006) can read the __system__ awareness without
    // re-materializing a second provider (multi-agent-presence SPEC §9).
    setSystemProvider(provider);

    // DEV-only test hook: inject a fake agent-presence awareness state as if
    // a remote peer (the "agent") is writing to a different doc. Fires the
    // awareness 'change' event which triggers the debounced nav check. The
    // fake state uses a fixed clientID (999999) that will never collide with
    // real clients. No encode/decode round-trip needed — we poke the internal
    // states map directly since this runs in the same JS context.
    if (import.meta.env.DEV) {
      window.__test_injectAgentPresence = (docName: string) => {
        const awareness = provider.awareness;
        if (!awareness) return false;
        const fakeClientId = 999999;
        const fakeState = {
          agentPresence: {
            'test-agent': {
              displayName: 'Test Agent',
              icon: 'claude',
              color: '#D97757',
              currentDoc: docName,
              mode: 'editing',
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
      setSystemProvider(null);
      provider.destroy();
      doc.destroy();
      providerRef.current = null;
      if (import.meta.env.DEV) {
        delete (window as { __test_injectAgentPresence?: unknown }).__test_injectAgentPresence;
      }
    };
  }, [queryClient, collabUrl, setSystemProvider]);

  return null;
}
