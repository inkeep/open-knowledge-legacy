import type { HocuspocusProvider } from '@hocuspocus/provider';
import type { AgentPresenceEntry } from '@inkeep/open-knowledge-core';
import { useEffect, useState } from 'react';
import {
  type AgentPresenceAwareness,
  hasAgentPresenceShape,
  pickAgentsForDoc,
} from '@/lib/agent-presence';
import type { AwarenessState, AwarenessUser } from './identity.ts';

// `pickAgentsForDoc` returns `{agentId, entry}` pairs directly so this hook
// doesn't have to reverse-lookup the id from the awareness map per render.
// The earlier shape forced a Map.entries() reverse lookup inside the
// participants build, which was O(N²) over presence-map size.

/**
 * A human participant — publishes per-doc awareness (name, color, icon,
 * cursor position, mode). Cursors are rendered by `@tiptap/extension-
 * collaboration-cursor`.
 *
 * `tabCount` is 1 for non-deduped entries and ≥2 when multiple clientIds
 * share the same `principalId` (multi-tab dedupe for git-config users). The
 * tooltip in PresenceBar uses this to show "Name · N tabs" when N > 1.
 */
export interface HumanParticipant {
  kind: 'human';
  clientId: number;
  user: AwarenessUser;
  mode: AwarenessState['mode'];
  tabCount: number;
}

/**
 * An agent participant — publishes presence via the `__system__` Y.Doc's
 * `agentPresence` map (never per-doc awareness; see FR-3 + precedent #3).
 * `presence` carries everything the bar needs: displayName, icon, color,
 * currentDoc, mode, ts.
 */
export interface AgentParticipant {
  kind: 'agent';
  agentId: string;
  presence: AgentPresenceEntry;
}

export type Participant = HumanParticipant | AgentParticipant;

/**
 * 1s cadence is a compromise. Awareness-change events fan out on every
 * server-side `setPresence` / `touchMode` / `clearPresence` — that's the
 * primary signal. The interval tick exists as a backup so TTL-based
 * staleness (§13 R2 — silent WS close / clock skew) ages entries out even
 * when no awareness-change fires. Not user-visible; small enough to catch
 * a 5s-stale entry within ~1s of its real expiry, big enough to keep the
 * re-render cost negligible.
 */
const TTL_TICK_MS = 1_000;

/**
 * Process-wide one-shot guard for the shape-guard warning. The hook remounts
 * on every provider swap, but a shape mismatch comes from the provider
 * class / Hocuspocus upgrade — it's a static trait of the build, not a
 * per-mount concern. Warning once per process surfaces the drift without
 * spamming on every remount.
 */
let warnedOnMalformedAwareness = false;

/**
 * Shallow-compare two Participant arrays across the render-affecting
 * fields. Intentionally skips `presence.ts` because the timestamp shifts
 * on every `touchMode` call (mode-flip → same render output) without
 * changing what the bar looks like. Used to short-circuit the 1 Hz TTL
 * tick's `setState` when no peer actually changed — React Compiler cannot
 * elide this because every tick produces a fresh object reference.
 *
 * `user.principalId` is not compared directly; principalId changes are
 * covered indirectly because color is seeded from principalId — a
 * principalId transition (e.g. boot-race resolution) always changes color.
 */
export function participantsEqual(a: Participant[], b: Participant[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x.kind !== y.kind) return false;
    if (x.kind === 'human' && y.kind === 'human') {
      if (x.clientId !== y.clientId || x.mode !== y.mode || x.tabCount !== y.tabCount) return false;
      const u = x.user;
      const v = y.user;
      if (u.name !== v.name || u.color !== v.color || u.icon !== v.icon) return false;
    } else if (x.kind === 'agent' && y.kind === 'agent') {
      if (x.agentId !== y.agentId) return false;
      const p = x.presence;
      const q = y.presence;
      if (
        p.displayName !== q.displayName ||
        p.icon !== q.icon ||
        p.color !== q.color ||
        p.currentDoc !== q.currentDoc ||
        p.mode !== q.mode
      ) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Dedupe `HumanParticipant[]` by `principalId`, collapsing multiple entries
 * that share the same eligible principalId into one with `tabCount` set to
 * the group size. Eligible means `typeof principalId === 'string' && principalId.length > 0`.
 *
 * Tie-break: the entry with the lowest `clientId` is the representative.
 * Output order matches the position of each group's representative (lowest-clientId
 * entry) in the input. When the representative is NOT the first-occurring entry for
 * that principalId, earlier non-representative entries are skipped and the group
 * appears at the representative's position. Ineligible entries (no principalId or
 * empty string) pass through as-is with `tabCount === 1`.
 *
 * Exported for unit testing — pure function over plain arrays.
 */
export function dedupeHumansByPrincipalId(humans: HumanParticipant[]): HumanParticipant[] {
  // First pass: group eligible entries by principalId
  const groups = new Map<string, HumanParticipant[]>();
  for (const h of humans) {
    const pid = h.user.principalId;
    if (typeof pid === 'string' && pid.length > 0) {
      const g = groups.get(pid);
      if (g) g.push(h);
      else groups.set(pid, [h]);
    }
  }

  // For each eligible group, identify the representative (lowest clientId)
  const reps = new Map<string, { repClientId: number; count: number }>();
  for (const [pid, group] of groups) {
    const repClientId = group.reduce((min, h) => Math.min(min, h.clientId), Infinity);
    reps.set(pid, { repClientId, count: group.length });
  }

  // Second pass: rebuild in original input order, skipping non-representative eligible entries
  const result: HumanParticipant[] = [];
  for (const h of humans) {
    const pid = h.user.principalId;
    if (typeof pid === 'string' && pid.length > 0) {
      const info = reps.get(pid);
      if (info && info.repClientId === h.clientId) {
        result.push({ ...h, tabCount: info.count });
      }
      // else: non-representative — skipped (deduped)
    } else {
      result.push({ ...h, tabCount: 1 });
    }
  }

  return result;
}

/**
 * Two-source presence reader for the sectioned PresenceBar.
 *
 * Humans come from the **per-doc** `activeProvider.awareness` (each human
 * has their own Y.Doc clientID; cursor positions + name/color live here).
 * Agents come from the **`__system__`-scoped** `systemProvider.awareness`
 * map-valued field `agentPresence`, bucketed into `current` (same-doc as
 * `activeDocName`) vs `crossDoc` (different doc).
 *
 * Returns two arrays:
 *   - `current`: humans + agents whose `currentDoc === activeDocName`
 *   - `crossDoc`: agents whose `currentDoc !== activeDocName` (and non-null)
 *
 * Ordering: humans first in `current` (they're the active user's peers on
 * this doc), then same-doc agents. Within each group, stable insertion
 * order (awareness state map iteration order).
 */
export function usePresence(
  activeProvider: HocuspocusProvider | null,
  systemProvider: HocuspocusProvider | null,
  activeDocName: string | null,
): { current: Participant[]; crossDoc: Participant[] } {
  const [state, setState] = useState<{ current: Participant[]; crossDoc: Participant[] }>({
    current: [],
    crossDoc: [],
  });

  useEffect(() => {
    const activeAwareness = activeProvider?.awareness;
    // Structural guard at the one boundary where the cast happens — the
    // only place `HocuspocusProvider.awareness`'s y-protocols shape meets
    // our narrow `AgentPresenceAwareness` contract. If Hocuspocus ever
    // ships a breaking upgrade or a test passes a mock that doesn't expose
    // `getStates()`, we log a one-shot warning (`[agent-presence]` matches
    // SystemDocSubscriber's convention) and read empty instead of crashing
    // deep in `.getStates().values()` during a render.
    const rawSystemAwareness: unknown = systemProvider?.awareness;
    let systemAwareness: AgentPresenceAwareness | undefined;
    if (rawSystemAwareness === undefined || rawSystemAwareness === null) {
      systemAwareness = undefined;
    } else if (hasAgentPresenceShape(rawSystemAwareness)) {
      systemAwareness = rawSystemAwareness;
    } else {
      systemAwareness = undefined;
      if (!warnedOnMalformedAwareness) {
        warnedOnMalformedAwareness = true;
        console.warn(
          '[agent-presence] __system__ provider awareness missing getStates() — presence bar will render without agent peers',
        );
      }
    }

    const compute = (): void => {
      const humans: HumanParticipant[] = [];
      if (activeAwareness) {
        for (const [clientId, rawState] of activeAwareness.getStates().entries()) {
          const s = rawState as Record<string, unknown>;
          if (!s.user || typeof s.user !== 'object') continue;
          const user = s.user as AwarenessUser;
          // Defensive: AwarenessUser.type is narrowed to 'human' by the type
          // system but a stale bundled client could still emit 'agent'. Skip
          // that shape silently — no warning is wired here. SystemDocSubscriber's
          // per-clientID warn targets the `__system__` awareness surface; this
          // hook iterates the per-doc provider's awareness, a different surface,
          // so that warning path does not cover what this branch skips.
          if (user.type !== 'human') continue;
          humans.push({
            kind: 'human',
            clientId,
            user,
            mode: (s.mode as HumanParticipant['mode']) ?? 'wysiwyg',
            tabCount: 1,
          });
        }
      }
      const deduped = dedupeHumansByPrincipalId(humans);

      const now = Date.now();
      const { current: currentAgents, crossDoc: crossDocAgents } = systemAwareness
        ? pickAgentsForDoc(systemAwareness, activeDocName, now)
        : { current: [], crossDoc: [] };

      const toParticipant = ({
        agentId,
        entry,
      }: {
        agentId: string;
        entry: AgentPresenceEntry;
      }): AgentParticipant => ({
        kind: 'agent',
        agentId,
        presence: entry,
      });
      const currentAgentParticipants: AgentParticipant[] = currentAgents.map(toParticipant);
      const crossDocAgentParticipants: AgentParticipant[] = crossDocAgents.map(toParticipant);

      const nextCurrent: Participant[] = [...deduped, ...currentAgentParticipants];
      const nextCrossDoc: Participant[] = crossDocAgentParticipants;
      // Functional updater so the equality check compares against the
      // LATEST committed state, not a stale closure capture. When both
      // arrays are participant-equal to what's already rendered, return
      // prev — React's useState bails out on `Object.is(prev, next)` and
      // skips the re-render. The 1 Hz TTL tick hits this fast path on
      // every idle second; only semantic changes (new peer, mode flip,
      // doc move, TTL expiry) commit state.
      setState((prev) => {
        if (
          participantsEqual(prev.current, nextCurrent) &&
          participantsEqual(prev.crossDoc, nextCrossDoc)
        ) {
          return prev;
        }
        return { current: nextCurrent, crossDoc: nextCrossDoc };
      });
    };

    compute();

    const handleActive = (): void => compute();
    const handleSystem = (): void => compute();
    activeAwareness?.on('change', handleActive);
    systemProvider?.awareness?.on('change', handleSystem);

    // TTL refresh — see TTL_TICK_MS above for rationale.
    const interval = setInterval(compute, TTL_TICK_MS);

    return () => {
      activeAwareness?.off('change', handleActive);
      systemProvider?.awareness?.off('change', handleSystem);
      clearInterval(interval);
    };
  }, [activeProvider, systemProvider, activeDocName]);

  return state;
}
