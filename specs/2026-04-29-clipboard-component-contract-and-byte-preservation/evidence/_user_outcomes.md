---
name: User-stated outcomes (intake elicitation)
description: Verbatim user-grounded outcomes from the intake conversation; primary source for SCR + persona discipline
date: 2026-04-29
sources:
  - "Intake conversation, /spec invocation 2026-04-29"
type: meta
---

# User-stated outcomes

## Verbatim seed (turn 1, user invocation)

> "lets start a /spec on this. goal will be end to end preservation of OK to OK pasting. but in general I want to think through the 'paste' scenarios, i.e. how do we handle paste from non-OK editors//text, etc."

## Verbatim direction (turn 2, response to clarifying questions)

> 1. - byte identity of soruce bytes
> 2 - both
> 3- lets do the toClipboardHast or equivalent -- i think being able to define copy behavior for custom OK components to our target destinations is good core functionality that we want to set the architecture for today.
> 4 - i would like to understand what would be different or what we need to consider for cross-machine. i think the scenario of "someone copy pastes their OK content as raw file over email or Slack etc. and i copy paste it into OK" scenario is important. I think generally byte preservation in all paste scenarios is probably required, if we don't already enforce that, i would like to understand why/where ?

## Pre-existing user-grounded context (carried from prior collaboration memory)

- **Owner:** Nick (CPO/CTO of Open Knowledge). Owns bridge / observer / CRDT-invariant / MDX layer. Greenfield project posture; no deferred tech debt; clean cuts with minimal coordination preferred.
- **Co-owners with overlapping surface:** Miles owns server / UI / MCP. PR #270 (asset embed surface) is in flight from Mike — coordinates with image upload flows but is upstream-orthogonal to this spec.
- **Greenfield directive:** Confirmed in CLAUDE.md (ARCHITECTURE.md and PRECEDENTS.md cite it). No backwards-compat cruft, no migration scaffolding, no deprecated paths.

## Outcomes (interpreted from verbatim direction; for SCR drafting)

**Who:** OK authors. Single primary persona — the human knowledge worker writing in OK, copying content out of OK or into OK across the paste matrix. (AI agents do not paste; they write via MCP.)

**Outcomes they care about, in their words:**
- "Byte preservation in all paste scenarios."
- Be able to copy OK content to a target destination and have it render usefully there (the toClipboardHast architecture).
- Move OK content as a raw file via email/Slack/etc. and have it round-trip through paste back into OK.

**Success looks like (in their terms):**
- Open a doc, copy a `<img/>` block, paste into another doc — the bytes are identical to the source. (The current bug.)
- Copy any custom OK component, paste into Slack/Notion/Gmail — recipient sees something semantically meaningful (an image as an image, a callout as a callout-shaped block, etc.). (Foundational pattern.)
- Receive `.md` content via email/Slack with `<img/>` in it, paste into OK — the canonical descriptor is recognized and bytes are preserved. (Cross-transport.)

**User journey(s) implied:**
- J1: Author moves content within OK across docs/tabs (OK→OK).
- J2: Author exports content to external destination via paste (OK→external).
- J3: Author imports content from external markdown source via paste (external→OK), where the external source produced OK-canonical bytes.
- J4: Author imports content from external rich-text/HTML source via paste (external→OK), where the external source did not produce OK-canonical bytes — best-effort cleanup pipeline applies.

**Customer evidence informing this:**
- The user hit the OK→OK regression themselves immediately after merging PR #310 (intake turn 1: "after merging in pr 310, when i paste in an <image> thing, it pastes as markdown instead").
- The 2026-04-16 spec NG1's revisit criterion ("users report round-trip fidelity loss on OK→OK cross-tab paste that text/plain markdown can't recover") is met by the user's own experience.
- The "raw file via email/Slack" scenario is asserted as important by the user at intake; not yet investigated for prior incidents.
