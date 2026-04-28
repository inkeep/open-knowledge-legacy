# Evidence: D4 — Production Editor Restart UX Bar

**Dimension:** D4 — What does the user see during and after server-side restart? What's the right product bar?
**Date:** 2026-04-23
**Sources:** Notion/Linear/Figma/Google Docs/Replit/Live Share docs, engineering blogs, forum threads

---

## Key sources referenced

- [Notion — Working offline guide](https://www.notion.com/help/guides/working-offline-in-notion-everything-you-need-to-know)
- [TaskFoundry — Notion Offline Mode Guide](https://www.taskfoundry.com/2025/08/notion-offline-mode-setup-sync-conflict-guide.html)
- [Linear Status — offline banner incident](https://linearstatus.com/incidents/01HKWZHY2CSQJ5WYVWHNQQ8DE7)
- [Bytemash — Linear local-first rabbit hole](https://bytemash.net/posts/i-went-down-the-linear-rabbit-hole/)
- [Reverse engineering Linear's sync magic](https://marknotfound.com/posts/reverse-engineering-linears-sync-magic/)
- [Figma Blog — How Figma's multiplayer technology works](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/)
- [Microsoft Learn — Live Share Connectivity](https://learn.microsoft.com/en-us/visualstudio/liveshare/reference/connectivity)
- [Obsidian Forum — Make Sync icon always visible](https://forum.obsidian.md/t/mobile-make-sync-icon-always-visible/31780)
- [Ink & Switch — Local-first software essay](https://www.inkandswitch.com/essay/local-first/)

---

## Per-product findings

### Notion

**Confidence:** CONFIRMED

- Disconnect indicator: Sync status icon in top bar ("offline" / "syncing" states).
- Unsynced edits: Saved locally since Aug 2025 offline-mode launch; auto-sync on reconnect.
- Reconnect: Push changes to cloud automatically.
- Content-safety messaging: **Conflict copies** — when Notion can't reconcile divergent edits, it creates duplicate pages. Users are expected to "look for sync banners."

### Linear

**Confidence:** CONFIRMED

- Disconnect indicator: "Syncing or offline spinner in the top left corner of the application"; workspace-level "Offline" or "Syncing" badges.
- Unsynced edits: Mutate local IndexedDB first, async sync via GraphQL/WebSocket. Never lost.
- Reconnect: Delta-sync packages; invisible unless the spinner was already showing.
- Content-safety messaging: Minimal — trust the badge.

### Figma

**Confidence:** CONFIRMED (mechanism) / INFERRED (UX intent)

- Disconnect indicator: Minimal — Figma leans hard on "offline tolerance is invisible."
- Unsynced edits: Queued, reapplied atop the fresh server state on reconnect.
- Reconnect mechanism: "Client downloads a fresh copy of the document, reapplies any offline edits on top of this latest state, and then continues syncing updates over a new WebSocket connection."
- Content-safety messaging: None visible.

### Google Docs

**Confidence:** CONFIRMED (widely-disliked banner)

- Disconnect indicator: Persistent banner: **"Trying to connect. To edit offline, turn on offline sync when you reconnect."**
- Often cited as annoying because it fires on brief hiccups.
- Content-safety messaging: Heavy — Google Docs is the LOUDEST in the set.

### Replit

**Confidence:** INFERRED

- Disconnect indicator: Visible "random disconnect/reconnects" (user forum reports).
- OT-based → drops stall edits rather than buffering silently.
- Less tolerant than CRDT editors.

### VS Code Live Share

**Confidence:** CONFIRMED

- Disconnect indicator: "Gold bar in VS, progress notification in VS Code" indicating Live Share is attempting to reconnect.
- Grace window: **60 seconds.**
- Under 60 s → session resumes losslessly.
- Over 60 s → "The collaboration session has ended due to network going offline. Check your network status." (modal)
- Content-safety messaging: Explicit, modal, stark.

---

## Cross-product doctrine

### Obsidian — users DEMAND more signal, not less

**Confidence:** CONFIRMED

[Obsidian Forum — Make Sync icon always visible](https://forum.obsidian.md/t/mobile-make-sync-icon-always-visible/31780): Multiple top-requested threads ask for the sync icon to be always visible, with progress: "they can't tell how much more is left to happen." Users explicitly want to "avoid editing files that might be out of sync."

**Implication:** Pure silence creates user superstition and distrust. Even subtle persistent signals build trust.

### Ink & Switch — local-first essay

**Confidence:** INFERRED (essay doesn't prescribe banner UX)

[Local-first software](https://www.inkandswitch.com/essay/local-first/) establishes substrate principles ("the network is optional", "collaboration must be seamless") but never advocates full silence. The principle is: local edits never lost. UI surface is downstream of that substrate.

---

## Comparison Table

| Product | Disconnect indicator | Reconnect indicator | Unsynced-edit fate | Content-safety messaging |
|---|---|---|---|---|
| Notion | Top-bar sync status | Silent push | Local, auto-sync | **Conflict copies** (duplicate pages) |
| Linear | Spinner + "Offline"/"Syncing" badge | Silent delta resume | Local IndexedDB; never lost | Minimal — trust the badge |
| Figma | Minimal / absent | Silent rebase onto fresh server | Queued, reapplied | None visible |
| Google Docs | **Modal-y banner** ("Trying to connect") | Banner disappears | Local cache, may need sync toggle | **Heavy** — often false-positive |
| Replit | Visible reconnect (OT-bound) | Visible reconnect | Stalled during drop | Forum evidence of user-visible churn |
| VS Code Live Share | Gold bar / progress notification | Silent under 60 s; **modal after** | Lossless < 60 s; session ends > 60 s | **Stark modal** on session end |

---

## Synthesis: the right bar for a Notion-esque Yjs-based product

The "invisible when fast, subtle-banner when slow" framing is **largely confirmed** with qualifications:

1. **Tier-2 winners (Figma, Linear) are invisible when hiccup is <~2 s** — local-first architecture makes the user's edit land instantly regardless of socket state. The badge/spinner exists but only sustains visibility when the drop persists.
2. **Tier-1 user-visible banner systems (Google Docs, Live Share) are widely disliked** when they fire on brief hiccups — but praised when the drop is real and the banner communicates "we saved your work locally, don't worry."
3. **Obsidian data refutes pure silence.** When the editor is silent, users assume worst-case and lose trust.
4. **Notion's "conflict copy" strategy is the outlier worth studying** — prefer materializing divergence as new content over silent merge.

### Emerging best practice

| Hiccup duration | UX surface |
|---|---|
| 0–2 s | **Invisible.** Don't punish for a TCP retransmit. |
| 2–10 s | **Subtle persistent indicator** (top-bar icon/badge, Linear-style spinner). Never modal. |
| 10+ s | **Named banner** — "Reconnecting — your edits are saved locally." Non-modal. |
| Post-resolve | **Never require user refresh.** "Click to refresh" admits self-healing failure. |
| Unreconcilable divergence | **Materialize as content** (Notion conflict-copy pattern), not destructive auto-merge. |

**Key doctrine:** The goal is TRUST. Silence is only acceptable when merge is provably lossless. The moment merge CAN lose content (the Obsidian case, and OK's current bug), silence becomes a liability. Subtle-but-present signal is the trust mechanism.

---

## Gaps / follow-ups

- Exact pixel-level banner copy from Figma during real reconnect not captured (Figma's engineering blog discusses algorithm, not UI).
- Replit forum evidence is user-reported; did not find official docs on Replit's multiplayer UX contract.
- Not every editor surveyed for the rare-but-real "server restart" case specifically — most discuss network disconnect generically, which is close enough for our purposes.
