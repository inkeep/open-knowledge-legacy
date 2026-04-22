---
dimension: D8
topic: User sovereignty during follow
confidence: High
---
# D8 — User sovereignty during follow

"Sovereignty" here means: while I'm following an agent (or another user), can I still do my own work? Or does follow lock me into passive spectating? This dimension is narrow but load-bearing — the answer determines whether follow-mode is usable for more than a brief demo.

## The spectrum

Shipping tools fall onto a spectrum from "follow is strictly passive" to "follow is a lens that I control."

### Strictly passive follow

**Google Docs / Slides follow presenter.** Your viewport is pinned; any interaction breaks follow. You're a passenger. Good for "give me a tour" use cases, bad for "I want to watch and occasionally take notes" use cases.

### Interaction-tolerant follow (sovereignty preserved)

**Figma Observation Mode.** Your viewport tracks the followed person's pan/zoom, but you can still click to inspect a layer (without breaking follow) as long as you don't pan/zoom yourself. Selection is a separate state from viewport. This is the middle of the spectrum.

**VS Code Live Share Follow.** You can open other panels (terminal, explorer, search) while following — these don't break follow. Typing in the followed editor also doesn't break follow (both you and the followed person can coexist as editors). Follow survives most interactions.

### Lens-style follow (highest sovereignty)

**No shipping tool implements this fully.** The hypothetical: "follow agent-X's focus, but within a second pane I maintain my own navigation independently." In VS Code Live Share's editor-group-scoped follow, this is approximated — one editor group follows, the other is under my own control. But VS Code's implementation requires the split-view.

## Common patterns for sovereignty preservation

### Pattern 1 — Mode indicator

Every follow UI shows a **clear indicator** that follow is active. Figma shows a banner at the top. Live Share shows the pushpin. Docs shows a "Following Alice" chip. Without this, users lose track of why their viewport is moving.

### Pattern 2 — Explicit exit affordance

"Stop following" is always visible, always one click. Figma has an ESC key shortcut. Live Share has unpin on the participant. Docs has a visible X button.

### Pattern 3 — Sovereignty zone

A screen region where the user can act independently while follow is active. Live Share's non-focused editor groups are this. Figma allows properties-panel and comments-panel interaction while observing the canvas. Docs has almost no sovereignty zone — only the comments panel.

### Pattern 4 — Preview without commit

Hovering / peeking at content without fully navigating. Linear has peek-on-hover for issues. GitHub has hover-previews for code. This is adjacent to follow — "I can check something without leaving my current context."

## Sovereignty vs awareness trade-off

There's an inherent tension: if I'm free to do anything, I might miss what the person I'm following is doing. If I'm locked to their viewport, I can't do anything else.

**Solutions in the wild:**

1. **Picture-in-picture follow** — the followed content appears in a small floating window while the main workspace is user-controlled. Video tools do this (Zoom PiP) but no editor-class tool has shipped it for text editing. Closest: Figma's Observation Mode overlays a dimmed view but still takes full-screen.

2. **Split-pane follow** — one pane follows, the other is user-controlled. VS Code Live Share's editor-group-scoped follow is this. Arguably the most elegant solution.

3. **Notification-on-change + manual navigation** — don't follow viewport at all; instead, show a toast when the followed person opens a new file, and let the user click to follow. This is the "async follow" pattern. Some CodeReview tools do this.

4. **Timeline scrubbing instead of live follow** — Devin's approach. You don't follow in real-time; you scrub the session timeline after-the-fact. Gives full sovereignty (you're not watching live) but loses the "live collaboration" feel.

## Agent-specific considerations

Agents present a different sovereignty calculus than humans:

- **Agents are faster** than humans. Following an agent that edits 20 files in 3 minutes is exhausting at live speed. Sovereignty affordances matter more.
- **Agents are pausable / interruptible.** Unlike a human colleague, you can pause the agent while you read context. This could be a new affordance ("hold agent while I look at this") that has no prior art in human-to-human follow.
- **Agents are replayable.** Their sessions are logged (in shadow repo + session feed), so if you miss something you can scrub back. This reduces the need for live follow sovereignty — you don't have to catch everything in real-time.

### Affordances worth designing in

1. **Pause-the-agent during follow.** One-click "hold" that pauses the agent's next write. Unique to agent follow (no human equivalent).
2. **Rewind + play-forward.** While following live, let the user rewind to the previous agent burst, re-read, and play forward to catch up. Uses the shadow-repo as the backing store.
3. **Preview before apply.** Suggestion-mode default for low-trust agents — edits appear as proposals, user accepts per-burst. Sovereignty via gating.
4. **Selective unpin.** "Keep following agent-X on `foo.ts` but stop following when they move to `bar.ts`" — per-file filtering of the pin.

## Anti-patterns observed

- **Docs-style aggressive auto-break** — breaks follow for harmless interactions like scrolling. Erodes trust in the feature.
- **Modal follow** (take over the whole screen) — forces sovereignty trade-off to "all or nothing."
- **Hidden follow state** — user doesn't realize they're following and is confused when viewport moves. Mode indicator is non-negotiable.
- **No pause** — especially bad for agents. A human colleague is polite; an agent is a firehose.

## Accessibility overlay

- **Reduced motion preference:** users with `prefers-reduced-motion` should get still-frame follow (snap to the followed view, not animated pan). Figma respects this; Docs does not.
- **Screen reader follow:** announcing "now following Alice's cursor — she is on line 42" is helpful for screen reader users. Live Share does this; Figma/Docs don't.
- **Keyboard-navigable exit:** ESC key is the universal escape from follow. Tools without it fail WCAG 2.1.2 No Keyboard Trap.

## References

- [VS Code Live Share Follow mode](https://learn.microsoft.com/en-us/visualstudio/liveshare/use/vscode#focus-participants)
- [Figma Observation Mode](https://help.figma.com/hc/en-us/articles/360040450474)
- [Google Docs presenter mode](https://support.google.com/docs/answer/63663)
- [Devin session overview](https://docs.devin.ai/essential-guidelines/session-overview)
- [WCAG 2.1.2 No Keyboard Trap](https://www.w3.org/WAI/WCAG21/Understanding/no-keyboard-trap)

## Decision triggers for Open Knowledge

- **Use VS Code Live Share's sovereignty model as the baseline.** Follow is sticky (explicit unpin), survives most interactions, scoped to editor pane not whole viewport.
- **Agent-specific affordances to add:**
  - **Pause-the-agent** button during follow (no human equivalent; highly valuable for agent burstiness)
  - **Rewind + play-forward** via shadow-repo scrubbing
  - **Per-file filter** on the pin ("follow this agent only on `foo.ts`")
- **Mode indicator:** visible chip in the header ("Following Agent-X") with one-click detach.
- **Respect reduced-motion preference:** snap-to-follow rather than animated pan for users with the preference set.
- **Keyboard escape:** ESC should exit follow mode (WCAG 2.1.2 compliance).
- **Avoid:** aggressive auto-break (Docs anti-pattern), modal full-screen follow, hidden follow state.
