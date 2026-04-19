---
topic: React 19 async-UI patterns + Yjs/Hocuspocus edge cases + library compatibility
sources:
  - https://react.dev/reference/react/Suspense
  - https://react.dev/reference/react/useTransition
  - https://react.dev/reference/react/use
  - https://react.dev/reference/react/startTransition
  - https://react.dev/learn/you-might-not-need-an-effect
  - https://github.com/ueberdosis/tiptap/issues/5761
  - https://github.com/yjs/y-websocket/issues/81
  - https://github.com/ueberdosis/hocuspocus/issues/183
  - https://www.freecodecamp.org/news/the-modern-react-data-fetching-handbook-suspense-use-and-errorboundary-explained/
  - https://dev.to/a1guy/react-19-concurrency-deep-dive-mastering-usetransition-and-starttransition-for-smoother-uis-51eo
  - https://medium.com/@ignatovich.dm/react-19-2-useeffectevent-hook-f8eb2348553e
session: Predecessor conversation
confidence: HIGH for React/library patterns; MEDIUM for Hocuspocus edge-case frequency
status: Active
---

# Architecture research findings

Reified from web-search passes in the predecessor session. Claims verified via direct URL fetches.

## React 19 declarative-async primitives

### Suspense + `use(promise)` — canonical for promise-based async
- Source: https://react.dev/reference/react/Suspense, https://react.dev/reference/react/use
- Use case: when async data is promise-shaped and resolution unblocks rendering.
- **Critical rule:** `use(promise)` requires stable promise references. Do NOT create promises inside component body (infinite loop). Solutions: module-level cache, passed via props, or `cache()` API.
- **"Avoid hiding revealed content"** — documented React behavior: during a Transition, React will not unmount already-visible children to show a Suspense fallback. This is the property that enables D1's content-continuity.

### `useTransition` + `isPending` — for pending-state affordances
- Source: https://react.dev/reference/react/useTransition
- Use case: non-urgent state updates (navigation, filter, sort) where UI should stay responsive.
- Quote from docs context: "Transitions don't make your app faster — they make it feel faster by getting out of the way of urgent updates."
- `isPending` boolean is the primary surface for pending-UI (e.g., progress strips, subtle loaders).

### `startTransition` — standalone version
- Source: https://react.dev/reference/react/startTransition
- Use case: same as useTransition but outside React function components (e.g., event handlers calling out to imperative code).

### `useSyncExternalStore` + Suspense caveats
- Source: https://dev.to/saiful7778/usesyncexternalstore-in-react-the-right-way-to-subscribe-to-external-data-p6
- Quote: "any loading spinner that appears unexpectedly makes the application feel slower."
- Implication for D5: skeleton should only appear when there's no prior content to preserve. React 19's Transition semantics prefer content preservation over fallback flashing.

## React Compiler interactions

- Source: https://www.infoq.com/news/2025/12/react-compiler-meta/ (Meta 1.0 announcement)
- **Stable and production-ready as of React Compiler 1.0** (Dec 2025).
- **Module-level state (e.g., Map caches) is NOT memoized by the compiler** — only component-local useState/useMemo-equivalents. Safe for syncPromise cache pattern.
- Manual `useMemo`/`useCallback` still respected by the compiler; causes marginal overhead but doesn't break semantics.
- No documented interference with `use(promise)` or Suspense. Confirmed via multiple 2026 source surveys.

## Error-boundary canonical pairing

- Source: https://www.freecodecamp.org/news/the-modern-react-data-fetching-handbook-suspense-use-and-errorboundary-explained/
- **2026 convention:** `react-error-boundary` library, not hand-written class component.
- Key API: `resetKeys` (re-attempts when array values change), `FallbackComponent` (declarative), `onReset` (side-effect hook).
- Canonical structure:
  ```tsx
  <ErrorBoundary FallbackComponent={...} resetKeys={[key]}>
    <Suspense fallback={<Skeleton />}>
      <AsyncComponent />
    </Suspense>
  </ErrorBoundary>
  ```
- Class-component ErrorBoundary still works but lacks reset semantics; more boilerplate.

## TipTap dynamic-ydoc limitation (critical)

- Source: https://github.com/ueberdosis/tiptap/issues/5761 (verified open as of 2026-04-14 search)
- **Finding:** "When using the Collaboration plugin, changing the document doesn't automatically update the editor content to match the new document."
- Changing the name/document on `TiptapCollabProvider` does not propagate to the editor.
- **Implication for D1:** Cannot hot-swap ydoc on an existing TipTap instance. The `key={activeDocName}` remount is *structurally necessary*. Suspense-gating this remount is the correct workaround.
- Alternative considered and rejected: forking the Collaboration extension to support dynamic ydoc. High fork-maintenance cost for equivalent user outcome.

## HocuspocusProvider `synced` event semantics (critical for D7)

### Known edge-case: synced-fires-but-no-content
- Source: https://github.com/yjs/y-websocket/issues/81
- **Finding:** "users joining a room after others have started typing may not receive initial content, which can be confirmed by the onSynced listener never being triggered unless `forceSyncInterval` is set."
- Implication: `synced` is not a guarantee of content presence in all scenarios.

### Known edge-case: sync-stops-after-reconnect
- Source: https://github.com/ueberdosis/hocuspocus/issues/183
- **Finding:** "the editor can stop syncing after a reconnect, making it problematic because the provider appears connected and synced even when it isn't."
- Implication: `syncState === 'synced'` can be stale after a reconnect lifecycle.

### Implications for D7 promise-cache lifecycle
1. **Resolve on first `synced`** — covers the normal case.
2. **Do NOT invalidate on normal disconnect/reconnect** — content is already there from the first sync; provider-pool handles reconnect transparently; keeping the promise resolved is correct.
3. **Invalidate if pre-sync disconnect** — rare but possible; must be treated as a failure.
4. **Invalidate on provider destroy/recreate** — lifecycle boundary.
5. **10s timeout guard** — defense against both edge cases above; converts silent hang into retry-able error via the ErrorBoundary.
6. **Check if `forceSyncInterval` is set on server** — secondary defense against y-websocket#81. If not set, propose adding it as a server config change (separate from this spec if scope permits).

## Citation-worthy facts for spec cross-ref

| Claim | Source | Evidence |
|---|---|---|
| React preserves revealed content during transitions | https://react.dev/reference/react/Suspense | "During a Transition, React will avoid hiding already revealed content" |
| `use(promise)` requires stable refs | https://react.dev/reference/react/use | Docs warning; multiple 2026 sources reiterate |
| TipTap Collaboration cannot hot-swap ydoc | github.com/ueberdosis/tiptap#5761 | Issue open, reproducing, without resolution |
| `synced` event can fail silently | github.com/yjs/y-websocket#81 | Confirmed edge case; `forceSyncInterval` is the mitigation |
| Hocuspocus can go out-of-sync after reconnect | github.com/ueberdosis/hocuspocus#183 | Confirmed; affects `isSynced` accuracy post-reconnect |
| `react-error-boundary` is 2026 canonical | freeCodeCamp handbook + other surveys | Multiple converging sources |

## Anchor-link IDs for cross-reference from SPEC.md

- `#d1` — TipTap-remount + Suspense-gating decision
- `#d2` — syncPromise + use() pattern
- `#d3` — startTransition wrapping
- `#d4` — react-error-boundary choice
- `#d5` — skeleton cold-load-only
- `#d6` — isPending progress strip
- `#d7` — promise cache lifecycle hardening
