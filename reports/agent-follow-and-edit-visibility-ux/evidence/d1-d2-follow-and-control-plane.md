---
dimension: D1 + D2
topic: Follow-mode mechanics and presence-as-control-plane
confidence: High (multiple primary sources, directly observable in product)
---
# D1 + D2 — Follow-mode mechanics and presence-as-control-plane

Two rubric dimensions that cluster: how you *enter* follow mode (D1), and what UI surface carries the affordance (D2). Every shipping collaborative tool puts the control on the presence indicator itself (avatar pill, cursor flag, participants panel row), but the mechanics around it vary substantially.

## Tools surveyed

| Tool                            | Entry affordance                                       | Persistence                                    | Target granularity                                             | Notification to followed user                                          |
| ------------------------------- | ------------------------------------------------------ | ---------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------- |
| [[Figma]] Observation Mode      | Click avatar in top-right pill                         | Session-lived; broken by own interaction       | Per-viewport (zoom + pan)                                      | **Silent** (no indicator)                                              |
| Google Docs/Slides Follow       | Click avatar → "Follow" menu item                      | Aggressive auto-break (scroll, type, click)    | Cursor (Docs) / current slide (Slides)                         | **Silent**                                                             |
| VS Code Live Share              | Pushpin icon on avatar or "Follow Participant" command | **Explicit unpin required**                    | Per-editor-group pin (can pin different people in split views) | **Silent**                                                             |
| [[Miro]] Follow                 | Click avatar → Follow                                  | Session-lived                                  | Viewport                                                       | **Notification sent** (opt-in badge visible to followed user — unique) |
| Replit Multiplayer              | Avatar in file header; no dedicated follow             | N/A                                            | N/A (no native follow — presence only)                         | N/A                                                                    |
| [[Zoom]] (reference vocabulary) | Pin (local) vs Spotlight (global)                      | Pin until unpinned; spotlight until host stops | Per-participant video tile                                     | Spotlight notifies; pin does not                                       |
| Tuple                           | "Driver/Navigator" model (role swap, not follow)       | Explicit swap                                  | Full screen                                                    | Both parties see the role                                              |

## Primary-source evidence

### Figma — Observation Mode

Figma's [help center](https://help.figma.com/hc/en-us/articles/360040450474-View-a-collaborator-s-activity-in-a-file) documents "Observation Mode" as clicking a collaborator's avatar in the top-right, which shifts the viewer's camera to follow the target's viewport (pan + zoom). The followed person is **not notified**, which Figma's own docs call out. Breaking conditions: the observer pans, zooms, selects a layer, or the followed collaborator leaves the file.

**Implication for agent-follow:** Figma's docs describe silent observation without a followed-user notification option. Extending silent observation to AI agents has a different ethical calculus (the agent isn't a person), but *users being followed by other users through an agent's actions* is a distinct case — if user-A is watching agent-X and agent-X also edits user-B's active doc, the spillover matters.

### Google Docs / Slides — Follow Presenter

[Google's docs on presenter mode](https://support.google.com/docs/answer/63663) and the in-product "Follow" affordance (avatar click → Follow menu item) use **aggressive auto-break**: any scroll, click, or keystroke cancels follow. This is in contrast to Figma's "own interaction" break — Google breaks on any passive reading cue, including scroll, which makes follow hard to use for extended viewing.

Slides has a separate "Present + remote follow" mode that's more stable for all-hands presentations. Docs uses the twitchy flavor.

### VS Code Live Share — Follow Participant (most sophisticated)

[VS Code Live Share docs: "Follow mode"](https://learn.microsoft.com/en-us/visualstudio/liveshare/use/vscode#focus-participants) document the **pushpin affordance** on each participant in the Live Share panel. Distinctions unique to Live Share:

1. **Explicit unpin required** — no auto-break on scroll. Feels like a mode toggle, not a polite suggestion.
2. **Per-editor-group scoping** — in a split view, you can pin Alice in the left group and Bob in the right group simultaneously. This is the only mainstream tool with multi-pin, editor-group-scoped follow.
3. **Follow survives file switches** — when the pinned participant opens a different file, your editor follows them to that file and opens the new buffer.
4. **"Focus participants" command** — the host can push a followed state to all participants ("everyone look here"), which the followee can accept or decline. This is the closest prior art to "presenter mode for AI agents driving a review."

Per-editor-group pinning is the single most relevant affordance for multi-agent follow: you can keep one pane pinned to agent-A editing `foo.ts` and another pinned to agent-B editing `bar.ts`.

### Miro — Follow (notified)

[Miro's collaboration docs](https://help.miro.com/hc/en-us/articles/360017730573) describe click-to-follow on avatars with a **notification badge** visible to the followed collaborator. This is the outlier: every other tool is silent.

**Implication for agents:** following an agent should probably be silent (the agent has no feelings), but if the product wants to expose "this agent is being watched by N users" back to *other users* sharing the doc (a governance signal), Miro's pattern is the prior art.

### Replit Multiplayer — presence without follow

[Replit's multiplayer docs](https://docs.replit.com/teams-edu/intro-teams-edu#multiplayer) show avatar pills in the file header showing who's currently in the file, and colored cursor borders on edits. But **Replit has no follow mode** — you navigate by clicking the file someone's in. The filetree shows a stacked-avatar indicator per file (see D3 evidence).

### Zoom — pin vs spotlight (vocabulary precedent)

Although Zoom is video, its [pin vs spotlight distinction](https://support.zoom.us/hc/en-us/articles/201362743) is the clearest vocabulary precedent for "local-personal-pin vs global-broadcast-pin." Pin = only I see this person's tile large; spotlight = everyone does. For agent follow, this distinction matters: *pinning an agent for yourself* (local) is the default feature, but "spotlight this agent for the whole team" (global) could become a presenter-mode feature.

### Tuple — driver/navigator (not follow)

[Tuple](https://tuple.app/) uses pair-programming vocabulary: one participant has the driver role (active control), the other is the navigator (view-only, can see cursor). **There's no follow mode because there's no multi-location context** — you share one screen. This is the "pair programming" pattern and it doesn't apply to multi-file agent work, but it's worth noting as the polar opposite of follow.

## Cross-tool patterns

1. **Avatar is the universal entry point.** Every tool puts the follow affordance on the avatar — click, hover-menu, or right-click. No tool uses a separate "Follow" button or dialog.
2. **Pushpin is the dominant persistence metaphor.** VS Code Live Share uses it literally; Zoom's "pin" is identical semantically. Both mean "this is sticky until I unpin."
3. **Silent is the default.** Figma, Google, VS Code Live Share all follow silently. Miro is the outlier (notified), and pre-pandemic feedback called it useful; post-pandemic feedback calls it intrusive. For an agent follow, silent is safe.
4. **Auto-break policies split into three buckets:**
   - **Aggressive** (Google Docs) — any interaction breaks
   - **Interaction-only** (Figma) — your own direct interaction breaks
   - **Explicit only** (VS Code Live Share) — only unpinning breaks
     For follow-the-agent, explicit-only is probably right — agent work unfolds over minutes, and you don't want to break follow every time you scroll to glance at context.
5. **Multi-pin is rare.** Only VS Code Live Share supports pinning multiple people into different view splits. This is the prior art for following multiple agents simultaneously.

## Anti-patterns observed

- **Google Docs auto-break on scroll** breaks follow for any passive reading action, which makes the feature hard to use for extended viewing — scrolling to re-read context loses the track.
- **Figma's silent follow** raises a real question for human-to-human follow ("should the followed entity know?"); the agent case sidesteps it since the agent has no privacy interest.
- **No tool has per-file follow pinning** separately from editor-group pinning. VS Code's per-editor-group is the closest analogue, but it requires a split view — you can't pin in a single-pane layout.
- **No tool exposes follow in an activity feed.** Follow state is ephemeral UI, not a log entry. For agent work that happens over minutes-to-hours, *history* of follow would be useful ("I was following agent-X when it edited these files") but no prior art does this.

## References

- [Figma Observation Mode — help.figma.com](https://help.figma.com/hc/en-us/articles/360040450474)
- [VS Code Live Share: Follow mode — learn.microsoft.com](https://learn.microsoft.com/en-us/visualstudio/liveshare/use/vscode#focus-participants)
- [Google Docs: presenter and follow — support.google.com/docs](https://support.google.com/docs/answer/63663)
- [Miro collaboration docs — help.miro.com](https://help.miro.com/hc/en-us/articles/360017730573)
- [Zoom pin vs spotlight — support.zoom.us](https://support.zoom.us/hc/en-us/articles/201362743)
- [Replit Multiplayer — docs.replit.com](https://docs.replit.com/teams-edu/intro-teams-edu#multiplayer)

## Decision triggers for Open Knowledge

- **Follow entry point:** avatar in presence bar → pin icon + "Follow agent" menu item. Matches universal precedent.
- **Persistence model:** explicit unpin (Live Share semantics), not auto-break. Agent work is long-running; user should stay glued across files unless they actively choose to detach.
- **Notification:** silent to the agent (no ethical concern), but the UI should badge "N users are following you" visibly to *other human users* on the doc (Miro's governance-visibility pattern applied to the human audience, not the agent subject).
- **Multi-agent follow:** worth designing for from day one. Per-editor-group pinning (Live Share) is the cleanest UX if the editor supports split panes; otherwise a "followed agents" chip row is a viable alternative.

