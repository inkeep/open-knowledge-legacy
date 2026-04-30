---
name: cross_process_write_strategy
description: Lock vs last-write-wins (LWW) for cross-process writes to ~/.open-knowledge/config.yml — analysis, recommendation, and the lost-update window envelope
type: evidence
date: 2026-04-28
sources:
  - "session: 2026-04-28 release-pivot intake (Track 3)"
  - "evidence/_init_worldmodel.md (Track 4 — cross-process fan-out risk)"
  - "packages/server/src/file-watcher.ts:185-202 (atomic-rename detection precedent — @parcel/watcher)"
  - "packages/server/src/process-lock.ts (existing process-lock pattern for server.lock)"
---

# Cross-process write strategy for user-global config

## The user's question (Track 3)

> "Happy with lock for user config writes or explore the idea of last write wins."

Both are viable. **LWW is the right choice for v0.** Here's why.

## The race that matters

Two `ok start` instances on the same machine, both have admitted `~/.open-knowledge/config.yml` as a synthetic Y.Doc, both have an open Modal with the user-global tab.

```
T=0:    A.YText = "theme: light"   B.YText = "theme: light"   disk = "theme: light"
T=10:   A user toggles → A.YText = "theme: dark"
T=11:   A persistence → atomic write → disk = "theme: dark"
T=12:   B user toggles → B.YText = "theme: light" (was light from T=0; B hasn't seen A's update yet)
T=13:   B persistence → atomic write → disk = "theme: light"   ← A's write LOST
T=14:   A's file watcher → A.YText updated to "theme: light" (matches disk)
T=14:   B's file watcher → B.YText already = "theme: light" (no change observed)
```

Outcome under LWW: A's user toggled to dark, but final state is light. A's window briefly showed dark, then reverted. B's user is satisfied.

The window size: it's the time between `B.YText.replace(...)` at T=12 and B's persistence atomic write at T=13. Realistically, with Hocuspocus's persistence debounce of ~2s, this window is ~2 seconds. A user would have to toggle in window B within ~2 seconds of A's toggle for the race to fire.

## Frequency analysis

When does a real user have two `ok start` instances simultaneously editing user-global config?

- **Two open OK projects** in two windows → has to be the case (one `ok start` per project)
- **Both with Modal Settings open on the user-global tab** → both windows actively in Settings
- **Both editing the same user-global field within a 2-second window** → simultaneous toggle

This is vanishingly rare. The most plausible canonical scenario is multi-window theme sync: user opens Settings in Project A, toggles theme; expects Project B's window to follow. **In that scenario, only ONE write happens** — the read on Project B is via the file watcher, no write. No race.

For a real lost-update, both users (the same human in both windows) have to toggle within 2s — which is essentially a self-inflicted race. The user who sees the revert just toggles again.

For workspace-scope config (within a single `ok start`), CRDT handles concurrent writes via Y.Text merge — no cross-process race even possible.

## Lock alternative — what it'd cost

A per-machine advisory lock on `~/.open-knowledge/config.yml`:

- **Library choice:** `proper-lockfile` (Node ecosystem standard, ~3M weekly downloads, cross-platform). Avoids fcntl portability quirks.
- **Acquire-modify-release pattern:** `await proper-lockfile.lock(path, { retries: { retries: 5, factor: 1.5 }})`; do read+modify+atomic-write; release.
- **Stale lock recovery:** `proper-lockfile` handles via lockfile-mtime + heartbeat; ~30s stale threshold.
- **Code:** ~20 LoC in the user-global write path inside `handleConfigStore` (Layer 3 from `evidence/server-side-validation-pattern.md`).
- **Failure modes:**
  - Lock contention → write blocks (rare, <100ms typical)
  - Lockfile filesystem permission errors → fall through to LWW (already what we'd do)
  - Process crash mid-lock → stale-lock recovery kicks in within 30s (briefly blocks new writers)

Cost is modest, but it's infrastructure for a near-zero-frequency event. **Not worth v0 complexity.**

## What protects us under LWW

Three things make LWW acceptable here:

1. **CRDT for intra-process concurrency.** Two browser tabs of the same `ok start` instance share one Y.Doc; CRDT merges their writes correctly. The race only exists across `ok start` instances.

2. **File watcher closes the loop.** Even after a lost write, both windows converge to the disk state within ~50-100ms (file-watcher debounce + Y.Text observer dispatch). Visual consistency restored quickly.

3. **Persistence-time validation (Layer 3 from sibling evidence file).** Even if CRDT-merge produces invalid YAML at the Y.Text level, the persistence hook rejects → reverts → all clients see correct state. Lost-update never produces *broken* state, only sub-optimal final state.

## What LWW does NOT protect against

The user notices. Specifically: their toggle "didn't stick" — they clicked dark, briefly saw dark, then it flipped back to light. They retry once. Fine.

If the user is editing a *different* field in window B than window A, both writes succeed and the final state has both changes. CRDT-merge in Y.Text handles this for the fields under user A's edit; B's atomic-write replaces wholesale, but field-level YAML operations on disjoint paths via yaml@2 setIn don't conflict.

Wait — that's not quite right. Let me trace it:

```
T=0:   disk = "theme: light\nport: 5173"
T=10:  A user changes theme → A.YText = "theme: dark\nport: 5173"
T=11:  A persistence → disk = "theme: dark\nport: 5173"
T=12:  B user changes port → B.YText = "theme: light\nport: 6000"  (B was stale)
T=13:  B persistence → disk = "theme: light\nport: 6000"   ← A's theme change LOST
```

So even disjoint-field writes lose data under LWW when one window is stale. The fix isn't a lock — it's **read-before-write at the persistence layer.** Specifically:

When B's persistence fires at T=13, it could:
1. Re-read disk (sees A's "theme: dark, port: 5173")
2. Apply B's intended *delta* (port: 5173 → 6000) on top of the fresh disk state
3. Write disk = "theme: dark, port: 6000"

This requires knowing B's *delta*, not just B's final Y.Text content. Y.Text doesn't carry deltas; it carries final state. So this approach needs Y.Text replace operations to be reified as patches at the persistence layer.

**Realistically:** this is more work than a lock. And the disjoint-field race is just as rare as the same-field race (still requires two windows + simultaneous edits).

## Decision

**Adopt LWW for v0.** Document the limitation. Add a Future Work entry that triggers if real-world lost-updates become a complaint:

```
[NOT NOW] NG14: Per-machine lock on ~/.open-knowledge/config.yml writes.
  Revisit if: users report theme/preference toggles "not sticking" or evidence of cross-process lost-updates emerges.
  Mechanism: proper-lockfile (or fcntl) advisory lock around the persistence-layer write in handleConfigStore.
  Cost: ~20 LoC + cross-platform testing + stale-lock recovery edge cases.
```

## What v0 ships

- **No lock infrastructure.** `handleConfigStore` does atomic tmp+rename without acquiring a lock first.
- **File watcher per server instance** for `~/.open-knowledge/config.yml`. `@parcel/watcher` already handles atomic-rename detection (per `file-watcher.ts:185-202` precedent).
- **Y.Text observer in Modal** re-renders on file-watcher-driven Y.Text updates → multi-window theme sync works.
- **Documented edge case:** simultaneous edits in two `ok start` instances may lose one write; user retries.

## Implementation cost

Zero new code beyond what's already needed for the user-global file watcher subscription (~30 LoC in `boot.ts` to extend file-watcher's roots). The lack of a lock IS the simplification.

## Recommendation for the spec

Lock this as D46 (proposed):

> **D46 — Last-write-wins for cross-process user-global config writes.**
> Atomic tmp+rename without per-machine advisory lock. Multi-`ok start` instances on the same machine that simultaneously edit `~/.open-knowledge/config.yml` may lose one write under a 2-second race window; the file watcher converges all instances to the final disk state within ~100ms. Persistence-time validation (D45 Layer 3) ensures lost-updates never produce invalid YAML, only stale-but-valid final state. Per-machine lock infrastructure deferred to Future Work (NG14, revisit if real-world lost-updates become a complaint).

D33 (ETag/If-Match concurrency control) was already DROPPING under the pivot; D46 captures the explicit trade-off accepted in its place.

## What this means for D27 (deferred .local.yml)

Unchanged. D27's reasoning still holds: no current schema field needs a 3rd tier. If/when one does, adding `.local.yml` is purely additive and inherits LWW (or whatever D46 evolves into) for that file too.
