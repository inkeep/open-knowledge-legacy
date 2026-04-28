---
sources:
  - packages/core/src/utils/identity.ts
  - packages/core/src/types/identity.ts
  - packages/core/src/types/awareness.ts
  - packages/app/src/presence/identity.ts
  - packages/app/src/editor/TiptapEditor.tsx
  - packages/app/src/editor/SourceEditor.tsx
  - packages/app/src/presence/PresenceBar.tsx
  - packages/app/src/presence/use-presence.ts
captured: 2026-04-27
---

# Current client-side identity flow

## Generation — `getIdentity()` ([identity.ts:188](packages/core/src/utils/identity.ts:188))

```typescript
export function getIdentity(): Identity {
  const params = new URLSearchParams(window.location.search);
  const coeditor = params.get('coeditor') || 'standalone';
  const tabId = crypto.randomUUID();

  let name = safeLocalStorageGet(LS_NAME_KEY);
  let color = safeLocalStorageGet(LS_COLOR_KEY);

  if (!name) {
    name = generateRandomName();          // "Curious Squirrel"
    safeLocalStorageSet(LS_NAME_KEY, name);
  }
  if (!color) {
    color = generateRandomColor();        // pastel from HUMAN_COLORS
    safeLocalStorageSet(LS_COLOR_KEY, color);
  }

  return { name, color, coeditor, tabId };
}
```

- **Synchronous.** Returns `Identity` immediately, no `await`.
- **localStorage keys:** `ok-user-name-v2`, `ok-user-color-v2`. Already at v2 — prior schema-change precedent.
- **Random pool:** 10 adjectives × 10 animals = 100 distinct names ([identity.ts:120-144](packages/core/src/utils/identity.ts:120-144)).
- **Random color pool:** 7 pastels in `HUMAN_COLORS` ([identity.ts:32-40](packages/core/src/utils/identity.ts:32-40)).

## Hook wrapper — `useIdentity()` ([app/src/presence/identity.ts:14](packages/app/src/presence/identity.ts:14))

```typescript
export function useIdentity(): Identity {
  const [identity] = useState(getIdentity);
  return identity;
}
```

- `useState`'s initializer runs once per component mount, value cached for the component's lifetime.
- Identity is therefore stable for the editor instance's lifetime, but **fresh per tab** (since `tabId` is regenerated each call to `getIdentity` and there's only one mount per tab).

## Awareness publication — TiptapEditor ([TiptapEditor.tsx:641-652](packages/app/src/editor/TiptapEditor.tsx:641))

```typescript
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
```

- Effect re-runs when `provider` or `identity` reference changes.
- `identity` is stable for the component lifetime today (because `useState(getIdentity)`), so the effect fires once per editor mount.
- A parallel effect exists in [SourceEditor.tsx](packages/app/src/editor/SourceEditor.tsx) — confirm symmetry when the spec implementation lands.

## Type — `AwarenessUser` ([packages/core/src/types/awareness.ts:1](packages/core/src/types/awareness.ts:1))

```typescript
export interface AwarenessUser {
  name: string;
  color: string;
  type: 'human';
  icon?: string;
  coeditor?: string;
  tabId: string;          // required (not optional)
}
```

- `principalId` is **not present** today.
- `tabId` is **required** — every `AwarenessUser` carries one. Today's `getIdentity()` always populates it via `crypto.randomUUID()`. Q6 (deferred): the field is set but never consumed by any peer; cleanup candidate.
- `coeditor` is the URL `?coeditor=cursor` query param — used as a sticky tag for the host that opened the editor (Claude Code / Cursor / standalone). Not related to identity per se; preserved unchanged.

## Consumption — PresenceBar HumanAvatar ([PresenceBar.tsx:61](packages/app/src/presence/PresenceBar.tsx:61))

```typescript
function HumanAvatar({ user, mode }) {
  const animal = user.name.split(' ')[1];
  const AnimalIcon = animal ? ANIMAL_ICON_MAP[animal] : undefined;
  const initials = user.name.split(' ').map((w) => w[0]).join('');
  // ...
  {AnimalIcon ? <AnimalIcon /> : <span>{initials}</span>}
}
```

- Animal-icon lookup keys off the second word of the name. Random "Curious Squirrel" → 🐿; real "Miles Kaming-Thanassi" → second word is "Kaming-Thanassi", which doesn't match → falls back to initials `MK` automatically.
- The fallback path already exists.

## Aggregation — `usePresence()` ([use-presence.ts:151](packages/app/src/presence/use-presence.ts:151))

```typescript
const humans: HumanParticipant[] = [];
if (activeAwareness) {
  for (const [clientId, rawState] of activeAwareness.getStates().entries()) {
    const user = rawState.user as AwarenessUser;
    if (user.type !== 'human') continue;
    humans.push({ kind: 'human', clientId, user, mode: ... });
  }
}
```

- Today: one `HumanParticipant` per Yjs `clientId`. Two tabs of the same human → two avatars in the bar.
- No deduplication by any user-level identity field (no `principalId` to dedupe by).
