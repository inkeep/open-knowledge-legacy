# Evidence: Toast / banner / awareness-cursor notification patterns

**Dimension:** What UX surfaces exist for "your edit may have been affected"? Where does each pattern shine or fail?
**Date:** 2026-04-16
**Sources:** Editor UX surveys, notification-system design guides, internal UX precedents.

---

## Key pages referenced

- [Fernando Ruiz — Conflict Resolution in Collaboration](https://www.fernandoux.com/en/wiki/concepts/conflict-resolution/) — UX framework
- [Figma — Review branch changes](https://help.figma.com/hc/en-us/articles/5693123873687-Review-branch-changes) — closest precedent for "review-conflict-with-version-history" flow
- [NN/g — Toast message patterns](https://www.nngroup.com/articles/toast-notifications/) — Nielsen Norman guidance
- [Material Design — Snackbars](https://m2.material.io/components/snackbars) — canonical transient-notification guidance

---

## Findings

### Finding: Five distinct UX patterns exist for collaborative-edit anomaly signaling
**Confidence:** CONFIRMED
**Evidence:** Aggregated from Figma, Notion, Google Docs, Obsidian, SharePoint, GitKraken, and NN/g pattern catalog.

| Pattern | When used | Pros | Cons | Example |
|---|---|---|---|---|
| **Silent log + counter** | CRDT-based editors with correct merge | Zero disruption; matches "conflict-free" promise | No recovery signal if merge is imperfect | Google Docs, Yjs apps, our current D3 |
| **Dismissable toast (ephemeral)** | Connection loss, async state changes | Non-blocking; fades; optional CTA | Easy to miss; no persistence | Our `use-sync-toasts.ts`; Figma "offline" banner |
| **Persistent banner** | Branch/merge ceremony state | High visibility; persists until resolved | Occupies chrome space | Figma branch-merge; Confluence concurrent-edit |
| **Artifact creation** | Cannot auto-resolve; preserve both | Lossless; zero live UX cost | User must discover the artifact | Notion "(Conflict)" page; Obsidian `.conflict` file |
| **Inline diff marker** | Granular, location-specific | Shows exactly what changed | High cognitive load; rare in rich-text editors | Git merge markers; some IDE plugins |
| **Awareness-cursor hint** | Ambient, passive signal | Zero UI cost; feels natural | Low signal strength; easy to miss | Co-editor avatar; Google Docs cursor |

**Implications:** For a rare, recoverable event (bridge-merge content-loss), the ephemeral-toast pattern balances visibility and non-disruption. Persistent banner is overkill for something that happens <1% of the time. Artifact creation doesn't fit because our architecture already has version history (the artifact).

---

### Finding: Toast patterns have well-established UX constraints
**Confidence:** CONFIRMED
**Evidence:** [NN/g — Toast message patterns](https://www.nngroup.com/articles/toast-notifications/); Material Design Snackbar guidance

- Auto-dismissal time: typically 4–7s for info, longer for warnings (Sonner default: 4000ms)
- Dismissable with explicit close button
- Single CTA maximum to avoid decision paralysis
- Stacking: most systems limit to 1–3 concurrent toasts
- Throttling required to prevent spam during burst events

These constraints are all satisfied by our existing Sonner wrapper (`packages/app/src/components/ui/sonner.tsx`) and the already-shipped paste-failure-toast throttle pattern (`packages/app/src/editor/clipboard/paste-failure-toast.ts`).

**Implications:** We have the infrastructure. The interesting design question is the message copy and the CTA target, not the mechanism.

---

### Finding: "Toast with link to version history" is a rare but coherent pattern in non-editor products
**Confidence:** INFERRED
**Evidence:** [Figma Help — Get updates from main files](https://help.figma.com/hc/en-us/articles/5665728006423); GitHub web ("New activity on this branch"); Vercel ("Deployment updated"); Linear ("Issue moved")

> (Figma library updates) "If changes are made in the main file, Figma will notify any branches that updates are available. If you have edit access to the branch, you can review and apply those updates to your branch."

Pattern template: "Something happened you may want to know about. [Review →]" where the link opens a review surface (history, diff, log). Not unique to editors; common in deploy dashboards, issue trackers, PR review tools.

**Implications:** The pattern is coherent and transferable. Saying "This doc had a complex merge — [View version history]" is structurally the same as Vercel's "Deployment updated — [View logs]."

---

### Finding: Throttling is essential — burst-mode merge anomalies would spam
**Confidence:** CONFIRMED
**Evidence:** Our own `paste-failure-toast.ts` uses `THROTTLE_MS = 3000` with per-scope counter; Sonner library supports `toast.id` to deduplicate.

If a user makes 20 concurrent source-mode edits while an agent is writing, the bridge could fire `mergeThreeWay` post-condition (c) violations 20 times in 5 seconds. Without throttling, a toast fires 20 times. With throttling (one toast per 5s window per doc), the user gets one signal per observable burst.

**Implications:** Throttling should match the typical burst duration. A 30s window is a reasonable first cut; tune based on fuzz-replay telemetry.

---

### Finding: Awareness-cursor hint is a weaker signal; not suitable for rare/critical events
**Confidence:** INFERRED
**Evidence:** [Figma cursor design](https://www.figma.com/blog/multiplayer-editing-in-figma/); [Google Docs presence cursors](https://support.google.com/docs/answer/7664184)

Awareness cursors are continuous, passive. They work for "who's here" but fail for "rare event just happened" because the user's gaze may be 500px away and the change is instantaneous. Content-loss events are irregular and deserve a signal-priority consistent with their semantic weight.

**Implications:** The awareness-cursor pattern is unsuitable for bridge-merge loss signaling. A toast is stronger than an ambient indicator for this event class.

---

### Finding: Inline diff markers fit pattern C (granular, location-specific) but don't fit our data
**Confidence:** CONFIRMED
**Evidence:** Git merge conflict markers; GitKraken's 3-way merge tool; microsoft/vscode issue #146091

Inline diff markers show `<<<<<<<` / `=======` / `>>>>>>>` at exactly the conflict location. They require the conflict region to be well-localized AND the user to be in a state that can manipulate the markers (e.g. plain-text mode).

Our bridge-merge content-loss is detected AT the merge layer (post-condition c in `mergeThreeWay`), not at a specific text range visible to the user. The "lost substring" might not even be IN the current document — it's the fingerprint the bridge couldn't preserve. Rendering an inline marker at "where the loss happened" doesn't map to meaningful coordinates.

**Implications:** Inline diff markers are the wrong pattern for this failure class. They work for git-style merges where both sides are already line-aligned; they don't work for CRDT-bridge merges where the anomaly is a content-fingerprint failure, not a location-aligned divergence.

---

## Negative searches

- "Notion in-editor toast version history CTA" → Nothing. Notion's recovery UX is always via the 3-dot menu → "Version history," not push.
- "Google Docs toast merge conflict" → Nothing.
- "VS Code Live Share toast conflict" → Nothing.

---

## Gaps / follow-ups

- How do local-first design patterns (CRDT-grounded) articulate the anomaly-surface question? Ink & Switch's Patchwork + Cambria may have opinions but public docs are thin.
- Atlassian's Confluence has a concurrent-edit banner — worth a deeper look; not fully fetched here.
