# Evidence: Adjacent Library Compat With Yjs 14 (2026-04-16 Update)

**Dimension:** Pull-in assessment — Q1 (library compat)
**Date:** 2026-04-16
**Sources:** npm registry JSON API per package, GitHub tag/commit feeds

---

## TL;DR matrix

| Library | Current OK uses | Latest stable | Latest pre-release | Yjs 14 support? | Status |
|---|---|---|---|---|---|
| `yjs` | `^13.6.30` | `13.6.30` | `14.0.0-16 (beta, stale 4mo)` | N/A (old name) | Active on `@y/y` |
| `@y/y` | — | — | `14.0.0-rc.13` (2026-04-14) | Itself | Active, RC phase |
| `y-prosemirror` | `1.3.7` (patched) | `1.3.7` | none on npm | No | Stalled |
| `@y/prosemirror` | — | — | `2.0.0-2` (2025-12-16) | Yes | **Rewrite rejected 2026-03-19** |
| `y-codemirror.next` | `^0.3.5` | `0.3.5` (2024-06-18) | none | No | Stale 22mo |
| `@y/codemirror` | — | — | `0.0.0-3` (2026-01-19) | Yes | 3 pre-releases, skeleton |
| `@y/tiptap` | — | — | none on npm | — | **Does not exist** |
| `@y/indexeddb` | — | — | none on npm | — | **Does not exist** |
| `@tiptap/core` | `^3.22.3` | `3.22.3` (2026-04-08) | `3.0.0-beta.14` | No | Pins `yjs ^13` (via ext-collab) |
| `@tiptap/extension-collaboration` | `^3.22.3` | `3.22.3` (2026-04-08) | `3.0.0-beta.14` | **No** | Peer `yjs: ^13` |
| `@tiptap/y-tiptap` | `^3.0.3` | `3.0.3` (2026-04-08) | `3.0.0-beta.3` | **No** | Peer `yjs: ^13.5.38` |
| `@hocuspocus/server` | `4.0.0-rc.1` | `3.4.4` | `4.0.0-rc.5` (2026-04-16) | **No** | `4.0.0-rc.5` still peers `yjs: ^13.6.8` |
| `@hocuspocus/provider` | `4.0.0-rc.1` | `3.4.4` | `4.0.0-rc.5` | **No** | Same peer pin |

**Current OK uses** reads from `packages/{core,server,app,cli}/package.json` in this worktree (2026-04-16).

## Key quote: `@tiptap/extension-collaboration@3.22.3` peer deps

From `curl https://registry.npmjs.org/@tiptap/extension-collaboration`:

```json
"peerDependencies": {
  "@tiptap/y-tiptap": "^3.0.2",
  "yjs": "^13",
  "@tiptap/core": "^3.22.3",
  "@tiptap/pm": "^3.22.3"
}
```

The `@tiptap/y-tiptap` package (3.0.3, 2026-04-08) also peers `yjs: ^13.5.38`.

## Key quote: `@hocuspocus/server@4.0.0-rc.5` peer deps

From `curl https://registry.npmjs.org/@hocuspocus/server/4.0.0-rc.5`:

```json
"peerDependencies": {
  "y-protocols": "^1.0.6",
  "yjs": "^13.6.8"
}
```

Published 6 hours before this evidence was captured (2026-04-16 20:31 UTC). The major version bump from 3.4 → 4.0 did NOT include Yjs 14 support — it's a refactor for BYO WebSocket (crossws, bun, deno) + sqlite migration.

No Yjs 14 PRs are open on `ueberdosis/hocuspocus`. No Tiptap PRs for Yjs 14.

## Key finding: PR #208 rewrite REJECTED

y-prosemirror PR #208 ("feat: rewrite prosemirror binding") was the actively-developed v2.0 rewrite that produced the git tags `v2.0.0-1` and `v2.0.0-2`, published as the scoped package `@y/prosemirror`.

- **Opened:** 2025-12-17 by nperez0111
- **Closed WITHOUT MERGE:** 2026-03-19 by dmonad (Kevin Jahns, Yjs author)

Dmonad's stated reasons (summarized from PR review discussion):
- "Binding attempted to handle too many responsibilities simultaneously"
- "Content initialization by clients is unreliable"
- "Async operations should be avoided in editor bindings"
- "Attribution manager was being used inconsistently, causing sync failures and console errors"
- "Basic operations like paragraph deletion broke synchronization"

Resolution: Dmonad wants a modular refactor with pause/suggestion in separate plugins. **No timeline committed.**

Meanwhile, the `@y/prosemirror@2.0.0-2` package on npm (from the PR branch) remains at the peer `@y/y: ^14.0.0-16` — while Yjs main branch has moved to `14.0.0-rc.13`. The library on npm is already semver-incompatible with current Yjs RCs.

Master branch `package.json` shows the version in-tree IS `2.0.0-2` still, now with peer `@y/y: ^14.0.0-rc.13` — but no npm publish since December. The delta between git and npm widens.

## Cross-reference: y-prosemirror v2 is contingent on funding

[y-prosemirror Open Collective](https://opencollective.com/y-collective/projects/y-prosemirror) states the rewrite starts "if at least $30k in funding is received." No public update on funding progress as of 2026-04-16.

## CodeMirror integration: gravest concern for Open Knowledge

Open Knowledge uses **CodeMirror 6 source mode** (see `packages/app/src/editor/SourceEditor.tsx`). The y-codemirror.next binding (Yjs 13-based, stable at 0.3.5 since 2024-06-18 = **22 months stale**) is our wire from Y.Text into CodeMirror.

The Yjs 14 equivalent `@y/codemirror` is at `0.0.0-3` — the zero-prefix version and the peer pin on the now-stale `@y/y: ^14.0.0-22` (vs current `@y/y: 14.0.0-rc.13`) indicates this package has NOT been regularly maintained during the RC phase. It's a skeleton.

Status of the CodeMirror 6 path for Peritext-on-Yjs-14:
- The Y.Text → CodeMirror binding does exist in skeleton form.
- It pins to a stale Yjs 14 pre-release.
- No semantic change has occurred — it's still a Y.Text binding. Moving to Peritext semantics (a single flat YType with formatting annotations) would require a NEW binding.
- **For Architecture C (source view reads markdown projection), CodeMirror would need a non-Yjs or read-only binding** — because editing markdown and writing it back to a Peritext YType re-introduces the markdown ↔ tree translation this spec is trying to eliminate.

## Findings

- **CONFIRMED:** No adjacent library in the Open Knowledge stack has been updated to consume `@y/y` / Yjs 14.
- **CONFIRMED:** `@hocuspocus/server` and `@tiptap/extension-collaboration` — the two heaviest deps — explicitly peer-pin `yjs: ^13` as of their latest releases (including 4.0-rc shipped today).
- **CONFIRMED:** The y-prosemirror v2 rewrite on which the "2-4 week" estimate depends was closed without merge on 2026-03-19.
- **CONFIRMED:** `@y/codemirror` exists but is a 3-pre-release skeleton pinned to a 3-month-stale `@y/y` RC — not production-ready.
- **INFERRED:** A Peritext-on-Yjs-14 pull-in would ship on an `@y/*` ecosystem whose non-Yjs packages are either skeletons (`@y/codemirror`), closed rewrites (`@y/prosemirror`), or non-existent (`@y/tiptap`).
- **NOT FOUND:** Any Tiptap or Hocuspocus plan-of-record to migrate to Yjs 14.

## Gaps / follow-ups

- Tiptap private roadmap communications (Discord, paid channels) — could reveal an internal Yjs 14 plan we can't see.
- ueberdosis/hocuspocus roadmap / Linear board — not public.
- The y-prosemirror modular refactor dmonad hinted at may be underway in a new PR — not visible yet as of 2026-04-16.
