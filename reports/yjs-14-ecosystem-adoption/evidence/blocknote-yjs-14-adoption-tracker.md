---
name: BlockNote Yjs 14 adoption tracker
description: Current state of BlockNote's Yjs 14 / attribution / track-changes work (2026-04-16)
sources: [npm registry, github API]
date: 2026-04-16
---

# BlockNote Yjs 14 Adoption Tracker

## Quick facts (verified 2026-04-16)

- **`@blocknote/core` latest:** `0.48.1` published `2026-04-16T17:11:22.446Z` (same day as this probe)
- **yjs pin in `@blocknote/core`'s dependencies:** `yjs@^13.6.27` (NOT `@y/y`)
- **y-prosemirror pin:** `y-prosemirror@^1.3.7` (NOT `@y/prosemirror`)
- **y-protocols pin:** `y-protocols@^1.0.6` (NOT `@y/protocols`)
- **@y/* packages in BlockNote's deps:** **ZERO** — across dependencies + peerDependencies
- **@blocknote/core has no peerDependencies** (deps only)
- **`@tiptap/y-tiptap` in BlockNote's deps:** NOT listed — BlockNote binds to `y-prosemirror` directly (skipping the TipTap y-tiptap vendored fork). This is structurally different from Open Knowledge's import topology.
- **peerDep: `@tiptap/core ^3.13.0`** — same TipTap 3.x family still pinning yjs ^13

## Recent commit activity (last 30 commits, via GitHub API)

Source: `https://api.github.com/repos/TypeCellOS/BlockNote/commits?per_page=30`

**Zero commits mention:** yjs, @y, v14, yjs-14, versioning, track-changes, attribution, expand, mark boundary, or Kevin Jahns.

Recent (Apr 9-16, 2026) focus is dependency management + stability:
- `chore: upgrade Vite from v5.4.20 to v8.0.3`
- `fix(deps): upgrade nx to 22.6.5 to resolve axios security vulnerability (CVE-2025-62718)`
- `refactor: portal floating UI elements to document.body`
- `fix: make CustomChange compatible with prosemirror-changeset 2.4.1` (**NOTE:** `prosemirror-changeset` is the ProseMirror-level change-tracking primitive, adjacent to but distinct from Yjs 14's CRDT-level attribution work. Not a signal of v14 migration.)
- Multiple Dependabot PRs for hono, undici, next
- `publish 0.48.0` → `publish 0.48.1` (2 releases in 3 days)

Most active committers: Nick Perez, Nick "the Sick" (release bot), Yousef El-Dardiry, Matthew Lipski, Stephan Meijer.

## Branch search (verified 2026-04-16)

Source: `https://api.github.com/repos/TypeCellOS/BlockNote/branches?per_page=100`

**None of these branches exist** in the public repo:
- `yjs-14`, `v14`, `@y`, `y-14`
- `versioning`, `track-changes`, `attribution`
- `upgrade-yjs`

200+ other branches exist (AI blocks, custom blocks, collaboration, animations, API updates, documentation) — but zero match the Yjs 14 feature-set the FOSDEM 2026 talk claimed.

## FOSDEM 2026 talk

- **Title:** "BlockNote, Prosemirror and Yjs 14: Versioning and Track Changes"
- **Speakers:** Yousef El-Dardiry + Nick Perez
- **Funding claim:** ZenDiS (OpenDesk, German government) + DINUM (La Suite Docs, French government)
- **Event:** FOSDEM 2026 (held late January / first weekend of February 2026 in Brussels)
- **~2.5 months have passed** since the talk; public commits in that window show zero v14-related work landing on `main`

## Ship timeline signal

**Unknown — with strong negative indicators.** The concrete evidence:

1. **Zero public code** in the `main` branch or named branches implements Yjs 14 integration
2. **BlockNote shipped a release TODAY (`0.48.1`)** that explicitly kept `yjs ^13.6.27` — a conscious choice not to include v14 work in this release
3. **No public timeline commitment.** Search of their GitHub Discussions, issues, and recent PRs returns no ship-date for the FOSDEM 2026 features
4. **Grant milestones not public** — ZenDiS + DINUM public grant records couldn't be located (may be behind agency portals)

Two interpretations, both plausible:
- **(a) Private fork / design-phase:** v14 work is happening in a private branch, fork, or separate repo not yet public-facing. Design partnership may still be in API-sketch phase
- **(b) Delayed / deprioritized:** The government-funded work slipped or got re-scoped to a later quarter. 2.5 months with zero public commits is notable

Either way: **no concrete ship-date signal today.**

## What they HAVEN'T shipped

- Any code using `@y/y`, `@y/prosemirror`, or any `@y/*` package
- Any branch or PR with Yjs 14 in the title
- Any public design doc, RFC, or discussion thread about BlockNote's Yjs 14 integration strategy
- Any `peerDependencies.yjs: "^14"` or similar migration-ready peer-dep in any published package

## What they HAVE shipped (collateral, not v14-specific)

- `CustomChange` compatibility with `prosemirror-changeset@2.4.1` (April 2026) — this is PM-layer change-tracking, preparatory infrastructure for a CRDT-layer attribution integration but not the integration itself
- Liveblocks Yjs integration upgrade (`feat: upgrade nx to 22.6.4 and liveblocks to 3.17.0`, Apr 9) — BlockNote supports multiple sync providers; Liveblocks 3.17 still pins yjs ^13
- TypeCellOS `@tiptap/core` upgrade to `^3.13.0` — stays on v13-pinning TipTap collab extensions

## BlockNote's server-side story

- BlockNote does NOT ship a canonical server — it delegates to user's choice (Hocuspocus, Liveblocks, y-sweet, PartyKit, custom Yjs server)
- Their public example repos use Hocuspocus (which per this report still pins `yjs ^13.6.8`)
- **Server-side migration is BYO on BlockNote** — if BlockNote ships a v14 client without a v14 server recommendation, users still face the Hocuspocus migration gap

## BlockNote's ProseMirror binding shape

- **BlockNote binds to `y-prosemirror` directly** (`y-prosemirror ^1.3.7` in deps), NOT to `@tiptap/y-tiptap`. This means BlockNote's migration path to `@y/prosemirror` is less blocked than TipTap's — they can swap `y-prosemirror ^1.3.7` for `@y/prosemirror ^2.0.0-2` without waiting for TipTap's `@tiptap/y-tiptap` migration
- But the peerDep on `@tiptap/core ^3.13.0` keeps BlockNote tied to TipTap's Yjs 13 pinning transitively through the TipTap extension family that BlockNote consumes (`@tiptap/extension-bold`, `@tiptap/extension-code`, etc.)

## Implications for the Yjs 14 ecosystem adoption report

**REPORT's framing needs sharpening:** "BlockNote is the lone publicly-committed Yjs 14 design partner" is technically correct but overstated. They are publicly committed to the idea (FOSDEM talk + government funding), but **have zero public code toward it as of 2026-04-16, 2.5 months after the talk.**

**Corrected framing:**
- BlockNote is the lone publicly-announced Yjs 14 design partner
- Public code progress: zero
- Their shipping would be a leading indicator, but hasn't started yet
- No earlier-than-Q3-2026 expectation is currently supportable

**Watch-list triggers (specific, testable):**
1. `@blocknote/core` introduces any `@y/*` dependency (check `npm view @blocknote/core dependencies` monthly)
2. Any PR or branch in `TypeCellOS/BlockNote` appears with `yjs-14`, `v14`, `attribution`, or `track-changes` in the name
3. A public blog post or release note from BlockNote mentioning v14 integration
4. ZenDiS or DINUM publishes a milestone report naming BlockNote + Yjs 14 as completed or in progress

**Next-check cadence: monthly or on release.** BlockNote releases frequently (0.48.0 → 0.48.1 in 3 days); a v14 signal would appear quickly once work lands on main.

## Sources

- [npm registry: @blocknote/core](https://registry.npmjs.org/@blocknote/core) — fetched 2026-04-16
- [GitHub API: TypeCellOS/BlockNote commits](https://api.github.com/repos/TypeCellOS/BlockNote/commits?per_page=30) — fetched 2026-04-16
- [GitHub API: TypeCellOS/BlockNote branches](https://api.github.com/repos/TypeCellOS/BlockNote/branches?per_page=100) — fetched 2026-04-16
- FOSDEM 2026 talk listing (referenced in sister evidence `yjs-14-maintainer-roadmap-and-signals.md`)
