---
title: "Type-safety pattern — declaration-merged ActiveInteractableMap + branded IDs + .test-d.ts lock"
type: synthesis
created: 2026-04-21
---

## TLDR

The `ActiveInteractable` discriminated union achieves BOTH type safety AND extensibility simultaneously via TypeScript's declaration-merging pattern (the same mechanism TipTap uses for `Commands<ReturnType>`). Core declares a closed interface map; extensions augment it via `declare module`. All downstream consumers get typed narrowing automatically. Branded IDs prevent same-base-type confusion (the #1 AI-agent failure mode per the `/type-safety` skill's research). A `.test-d.ts` file locks both invariants.

## The pattern

Core package declares a kind-keyed interface map:

```ts
// packages/app/src/editor/active-plugin/types.ts
import { z } from 'zod';

// Branded IDs — loose runtime validation via .min(1); compile-time-only safety via .brand<>.
// Shipped codebases use counter formats that would FAIL .uuid() validation:
//   - CB-v2: `b${counter}` (bridge-id-plugin.ts:138)
//   - #237:  `m${counter}` (mark-identity.ts:159)
// Architecture embraces shipped formats — brand is the compile-time guard, not the runtime format gate.
export const MarkId   = z.string().min(1).brand<'MarkId'>();
export const NodeId   = z.string().min(1).brand<'NodeId'>();
export const BridgeId = z.string().min(1).brand<'BridgeId'>();
export type  MarkId   = z.infer<typeof MarkId>;
export type  NodeId   = z.infer<typeof NodeId>;
export type  BridgeId = z.infer<typeof BridgeId>;

export type Origin = 'pointer' | 'keyboard' | 'programmatic';
type ActiveBase = { origin: Origin };

// THE extensibility seam — interface (not type) so declare module can augment
export interface ActiveInteractableMap {
  mark:            { id: MarkId;   markType: string };
  node:            { id: NodeId;   pos: number };
  block:           { id: BridgeId; ancestorChain: Ancestor[] };      // BridgeId directly — CB-v2 invariant
  'nested-editor': { editorRef: EditorRef };                         // Leaf; no recursive `inner` (YAGNI)
}

export type ActiveKind = keyof ActiveInteractableMap;

export type ActiveInteractable = {
  [K in ActiveKind]: { kind: K } & ActiveBase & ActiveInteractableMap[K]
}[ActiveKind] | null;

// Narrowing helpers derive automatically
export function isActive<K extends ActiveKind>(
  a: ActiveInteractable,
  kind: K,
): a is Extract<ActiveInteractable, { kind: K }> {
  return a?.kind === kind;
}
```

Extension adds a kind:

```ts
// packages/some-extension/src/collab-halo.ts
import type { ActiveInteractable } from '@ok/editor';

declare module '@ok/editor' {
  interface ActiveInteractableMap {
    'collab-halo': { peerId: string; bridgeId: BridgeId; color: string };
  }
}

// isActive(a, 'collab-halo') now narrows correctly across every consumer
```

## What this buys

| Property | Status |
|---|---|
| Discriminated-union narrowing | ✅ Works — `Extract<ActiveInteractable, {kind: 'X'}>` returns typed payload |
| New kinds without modifying core | ✅ Pure extension-side `declare module` |
| Type-safe narrowing helpers | ✅ `isActive(a, 'collab-halo')` narrows correctly |
| Runtime cost | ✅ Zero — purely type-level |
| Confusable-ID swaps caught at compile time | ✅ `setActive({kind:'mark', id: someBlockId})` fails to compile |
| Lint of `!` / `as` / `@ts-ignore` via type-safety skill anti-patterns | ✅ Applies uniformly |

## The `assertNever` reconciliation

The `/type-safety` skill's anti-pattern list includes *"Writing a switch on a discriminated union without an `assertNever(x)` default."* This LOOKS contradictory with extensibility via declaration merging. Resolution:

- **Inside core's compilation unit**, the union is closed to the 4 core kinds → `assertNever` is correct and enforced for switches that own the complete set
- **Inside a consumer that imports both core + extension**, the union is wider → that consumer's switches either handle the new kind or fall through
- **Extension-added kinds flowing through a core switch using `assertNever` would throw at runtime** (assertNever is a runtime `throw`) — so core's DISPATCH switches must use `default` that delegates to the registry, not `assertNever`

Policy per switch site:
- Core's switches over "what kinds core owns (all 4)" → `assertNever` ✅
- Core's dispatch-to-registry switches → `default { registry.handle(a) }` (DO NOT `assertNever`) ✅
- Extension-side switches over their own union → `assertNever` ✅

Both patterns coexist. The type-safety skill's anti-pattern applies to the first class; the registry-dispatch class is a different beast.

## The `.test-d.ts` lock

From the `/type-safety` skill's `references/negative-type-tests.md`: architecture invariants that COULD regress in a future refactor should be locked via `@ts-expect-error` in a dedicated test file.

```ts
// packages/app/src/editor/active-plugin/types.test-d.ts
import { MarkId, BridgeId, type ActiveInteractable } from './types';

// Positive: shipped counter formats parse cleanly (architecturally embraces
// CB-v2's `b${n}` + #237's `m${n}` runtime shapes; no .uuid() constraint)
const markId:   MarkId   = MarkId.parse('m1');
const bridgeId: BridgeId = BridgeId.parse('b1');

// Positive: well-typed mark active
const ok: Extract<ActiveInteractable, { kind: 'mark' }> = {
  kind: 'mark', id: markId, markType: 'link', origin: 'pointer',
};

// @ts-expect-error — BridgeId not assignable to MarkId (brand mismatch locks brand invariant)
const swappedId: Extract<ActiveInteractable, { kind: 'mark' }> = {
  kind: 'mark', id: bridgeId, markType: 'link', origin: 'pointer',
};

// @ts-expect-error — 'collab-halo' kind not yet declared; this line compiling
// means the extensibility seam broke (e.g., ActiveInteractableMap was converted
// from interface to type)
declare const halo: Extract<ActiveInteractable, { kind: 'collab-halo' }>;
```

If anyone refactors `ActiveInteractableMap` from `interface` to `type`, the last line starts compiling → `@ts-expect-error` becomes its own compile error → CI catches the regression.

## Ecosystem precedent

This is NOT novel. Three prior art examples:
- **TypeScript stdlib:** `WindowEventMap` — event name → event type, extensions augment via `declare global { interface WindowEventMap { ... } }`
- **JSX:** `JSX.IntrinsicElements` — HTML/SVG element tag → props type, extensions augment
- **TipTap (our stack!):** `interface Commands<ReturnType>` — every extension augments Commands to add typed commands

The last one is decisive. The framework we're already using ships declaration merging as its canonical extensibility path. Following suit is idiomatic, not experimental.

## Research correction

My original Track 3 writeup said *"every surveyed editor chose open extensibility via class hierarchy."* On second pass with the /type-safety skill loaded, this was incomplete. Lexical + BlockSuite chose classes because they predate wide adoption of declaration merging as a pattern. The TipTap-family ecosystem converged on declaration merging in the 2023-2024 timeframe. OK should follow TipTap precedent, not Lexical.

## Pointers

- `/type-safety` skill: `references/branded-ids.md` (branding), `references/discriminated-unions.md` (the union pattern), `references/negative-type-tests.md` (the `.test-d.ts` lock)
- TipTap's `Commands<ReturnType>` pattern: `packages/app/node_modules/@tiptap/core/src/types.ts` (search for `declare module '@tiptap/core'`)
- TypeScript handbook — Declaration Merging: <https://www.typescriptlang.org/docs/handbook/declaration-merging.html>

## Gaps / follow-ups

- NOT YET VERIFIED: I have not run `tsc --noEmit` against a scratch file to confirm the mapped-type derivation + declaration merging + branded narrowing all compose as claimed. Validation loop from the type-safety skill says this check is not optional. Do before ActivePlugin work starts.
- Monorepo `$brand` symbol unification across workspace packages is theoretically sound (same `Symbol("zod_brand")`) but not empirically validated in a two-package setup. If extensions live in separate workspace packages, add a `.test-d.ts` that confirms brands unify across the boundary BEFORE relying on it.
