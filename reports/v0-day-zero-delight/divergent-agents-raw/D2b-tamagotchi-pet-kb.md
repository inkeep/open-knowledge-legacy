# D2b — Tamagotchi / Pet-KB / Gamified Evolution

*Divergent ideation. Unranked. Unbounded. Ridiculous is welcome. Shame is banned.*

---

## Lens

What if the knowledge base ITSELF is the living creature — not a mascot watching from the corner, but the whole thing as a Tamagotchi-style entity that grows, evolves, and shows legibility of care? Articles = food. Backlinks = exercise. Abandonment shows. The KB is a pet, a garden, a village, a reef — something tended. Neglect is visible but never scolding (Finch, not Duolingo).

---

## 1. The Hatching Ceremony (first 60 seconds)

`open-knowledge init` is not a scaffold — it is **a hatching**. ASCII egg pulses in the terminal for ~8 seconds while files write. A single crack appears. Then a second. Then the egg opens and a tiny creature wobbles out. The CLI asks three questions: its name, its color, one personality trait (curious / steady / mischievous / quiet). The creature blinks and says its first line: *"hi, i'm [name]. what should we remember first?"* The empty sidebar in the web editor is not "Create your first file" — it's the creature, in a 120×120 ASCII idle loop, asking to be fed. The first article the user writes is *the first meal*. Everything from this point is the creature's biography.

**Why it lands:** Finch's onboarding-as-character-creation pattern (trait + name + color BEFORE any utility) transplanted onto a CLI. Ownership precedes utility. You've already named it; now you have to feed it.

---

## 2. Evolution Stages Tied to Real KB Milestones

Seven stages, each locked to a genuine KB-maturity signal — not gamified proxy actions:

- **Egg** (0 articles): shaking, cracking ASCII
- **Hatchling** (1-3 articles): big head, unsteady, asks what everything is
- **Sprout** (4-10 articles, first backlink): starts remembering names
- **Fledgling** (10-25 articles, first `[[wiki-link]]` web of 3+): starts making connections aloud
- **Companion** (25-100 articles, 10+ backlinks, first agent co-edit): becomes a genuine peer
- **Sage** (100+ articles, graph connected component > 50 nodes): quiet, thoughtful, rarely speaks but says meaningful things
- **Ancient** (1 year old, continuous tending): holographic, slightly translucent, can recall anything

Each evolution is a **ceremony** — a 15-second ASCII animation, a single line ("you've become…"), and a *permanent change to the creature's visual and personality.* There is no reversal. Your KB is marked by its history.

**Why it lands:** Tamagotchi's generational memory — the evolution branch is a permanent record of how you cared. We port that faithfully.

---

## 3. The Care Legibility Principle (Passive Visible State)

The creature's appearance is a continuous readout of KB health — never scolding, always observable.

- **Well-tended**: bright, plump, moving idle loops, occasional hum
- **Busy** (many recent edits): slightly disheveled, a trail of paper scraps around it
- **Resting** (no edits in 3 days): eyes closed, curled up, gentle Z's
- **Dusty** (no edits in 2 weeks): small dust particles in ASCII, a cobweb in one corner
- **Dormant** (no edits in 90 days): stone-still, a tiny flower growing nearby — *waiting, not dying*
- **Hibernating** (6+ months): a crystalline shell around it, still beautiful, still warm

No creature dies. No creature guilts. The visual weight does the work. Returning to a dormant KB gets a soft *"oh, you're back"* — not *"where have you been?"*

**Why it lands:** Finch's "no-penalty" constraint + Forest's kill screen ("your tree has died" — stated, not dramatized). Neglect has consequence; the consequence is visual, not verbal.

---

## 4. The Y.Map('activity') → Creature Pulse Bridge

The *technical* unlock. `packages/app/src/presence/` already has `Y.Map('activity')` carrying agent edits with `{actor, timestamp, action, visibility}` — precisely the structured shape we need. Every entry in that map animates the creature in real time:

- Human edits → creature leans toward the cursor, watches
- Agent edits → creature's ears perk, eyes widen ("something's happening")
- Agent writes a new section → creature bounces
- Human and agent co-edit same paragraph → creature spins in excitement
- Conflict / rollback → creature flinches, then settles

The creature is **live-rendered from the CRDT activity-map**. It's not a decoration — it's a visualization of the thing that's uniquely ours (S5 defining UX).

**Why it lands:** This is the only pet-mascot-UX in the world that would be a *visualization of real-time human+AI co-editing.* Claude's `/buddy` observes the terminal; ours observes the CRDT. That's the differentiation.

---

## 5. "Your Bird is on an Adventure" (Agent Off-Screen Activity)

Finch's clearest narrative move, ported directly. When a Claude Code agent is working on the KB *outside* the editor (via MCP, off-screen, you're on a call), the creature is *not* in its home box. A small note: *"[name] is off exploring with Claude. They've been gone 12 minutes."* When the agent completes its burst of writes, the creature returns with a **trip report** — a 3-sentence summary composed from the Y.Map('activity') structured entries: *"we revised three articles about auth, added 7 backlinks, and found something weird in rate-limiting.md — want to look?"*

**Why it lands:** The reward is a *story*, not points. And it is literally true — the creature's report is synthesized from the attribution journal. Nothing is fake.

---

## 6. Naming is Serious — and Sharable

The creature's name and species become part of the `.open-knowledge/config.yml`. `open-knowledge status` reports it: *"Bramble (Fledgling chickadee) — 14 articles, last tended 2h ago."* The creature's visual + name appear in the editor's top-left corner, in the docs site footer if the KB is published, and as a **badge** in the GitHub README of any repo that hosts a KB. Committing to git includes the creature's state in the commit trailer (opt-in): `Co-tended-by: Bramble <fledgling-chickadee>`.

**Why it lands:** Every KB has a named creature, so every repo README can display it, so discovery becomes "oh, they have a Sage-level KB." Taste visible from the outside.

---

## 7. The Deterministic Species / Rarity / Shiny Roll

Steal `/buddy`'s exact structure because it's *the* proven pattern. At hatch time, species is a deterministic FNV-1a hash of (git user.email + content-dir-path). **18 species × 5 rarity tiers × 1% shiny.** Every user on every machine gets the same roll for the same KB — which means sharing a screenshot of "my Shiny Silver Stoat" is a verifiable fingerprint. Reroll costs: **create a new KB in a new directory.** That's the whole mechanic. Collection emerges organically.

Species pool (illustrative, 18 slots): Fox, Owl, Otter, Crow, Cat, Axolotl, Ferret, Badger, Hedgehog, Magpie, Stoat, Lemur, Salamander, Seahorse, Wombat, Kingfisher, Mantis, Pika. Each has a distinct ASCII sprite. Rarity tiers modify palette + accessory. Shiny is a chromatic inversion.

**Why it lands:** `/buddy` went viral because deterministic+persistent. Rerolling requires effort, so sharing is earned. Our rerolls actually correspond to meaningful user behavior (starting a new KB).

---

## 8. Generational Memory — Lineage Markers

When a user archives a KB, exports it to publish, or **forks it into a new project**, the creature leaves a **lineage record** — a tiny stone in the new KB's garden with the old creature's name, species, and age. First-time users see nothing. Second-KB users see *"Bramble (Sage chickadee, 174 days) watches from the garden."* The stones accumulate. Your tenth KB has a nine-generation lineage. This is entirely *cosmetic* but emotionally heavy — every new project carries its ancestors.

**Why it lands:** Tamagotchi's generational evolution reinterpreted as inheritance, not death. And it naturally encodes one of our moat differentiators (everything branchable, KBs are first-class).

---

## 9. The Settlement View (Forest-style Ambient Visualization)

Alongside the graph view, a **settlement view** — a 2D pixel-art isometric rendering of your KB as a village:

- Articles = buildings (size = article length, style = tag/frontmatter)
- Backlinks = paved paths (density = traffic)
- Orphan articles = abandoned cottages with vines
- Highly-connected hubs = town square / well / bell tower
- Recent edits = chimneys smoking, lanterns lit
- Agent co-edited sections = small figures visible through windows
- The creature walks through it, idly

Your KB is no longer a file tree — it is **a place you've built.** Tweet-able. Wallpaper-able. "Check out my settlement" is a natural share-trigger. This is Forest's tree-garden move but for knowledge structures, not focus sessions.

**Why it lands:** Emotional reframe ("Arc = home on the internet"). Your KB becomes a place, not a folder.

---

## 10. The Tending Ritual (9am Mail)

Animal Crossing's 9am/5pm mail, ported. Once per day — at a time the user picks in `config.yml` — the creature leaves **a tiny note in the sidebar** proposing one small tending action: *"I noticed [[rate-limiting]] hasn't been touched in 30 days. Want to revisit it together?"* or *"[[auth-flow]] has 12 backlinks but no summary. Should we write one?"* Not a push notification. Not a red badge. Just a note in the creature's speech bubble when you next open the editor. **Never more than one per day. Never urgent. Never guilt.**

The user can dismiss with a single key. Or they can ask the creature: *"ok what do you suggest?"* — which kicks Claude Code into the suggested work.

**Why it lands:** Animal Crossing's "meaning in the practice, not the mechanics." A daily ritual that respects presence without demanding it.

---

## 11. The Adventure Deck (Agent Composability as Creature Behavior)

Shipped agents (the bundled MCP tools) aren't toolbar buttons — they are **things the creature knows how to do.** The UI shows the creature with a small card deck. Each card is an agent skill: *Reorganize*, *Summarize-Cluster*, *Find-Orphans*, *Link-Suggest*, *Compile-Timeline*. The user hands the creature a card. The creature trots off with it (animated, 3 seconds). The agent runs. The creature returns with a proposed diff.

This is **CCs, MCP tools, and the staging-for-review flow** (one of our four locked differentiators) re-presented as creature behavior. The diff review isn't a modal — it's *the creature holding up a scroll.*

**Why it lands:** Agents-as-cards turns an abstract MCP toolset into **discrete concrete objects** a user can collect, invoke, and show off. Also — beat cards become the shareable artifact (*"I got the Timeline card!"*).

---

## 12. The Recovery Ritual (Coming Back After Absence)

A user who opens a dormant KB after 90 days sees a **one-time welcome-back ceremony**: a soft-spoken note from the creature — *"it's been a while. i kept the lights on. everything is still here."* Followed by an auto-generated **"what changed while you were away"** digest — files touched by agents via MCP, any external git activity. The ritual has ONE action: a button labeled *"sit with it for a minute"* that does nothing — just pauses on this screen for 60 seconds with ambient creature idle animation.

**Then** the normal editor loads. No badge overflow. No unread queue. No streak-freeze purchase.

**Why it lands:** The Duolingo inverse. The product *rewards* return with presence, not with reactivation campaigns. Explicitly un-manipulative.

---

## 13. Creature Comments on Co-Edit Events (Ambient Commentary)

When an agent and a human are in the same document simultaneously, the creature sits at the bottom of the editor with occasional speech bubbles — not reading the content, just reacting to the **rhythm** of the co-edit:

- Human types fast: creature watches attentively
- Agent writes a big block: creature tilts head ("that's a lot")
- Rollback happens: creature says *"oh!"*
- Backlink formed: creature emits a tiny sparkle
- Graph connected component crosses a threshold: creature does a small dance

The commentary is **generated from CRDT event streams**, not LLM. Deterministic, debouncible, skippable. In settings: *"creature commentary: full / rare / silent."*

**Why it lands:** The creature becomes a *witness* to the unique thing only this product enables (human+AI co-editing). The warmth is in being seen.

---

## 14. Collection is Community (Species Page Per User)

Publicly discoverable (opt-in) species page at `openknowledge.inkeep.com/@username` shows all of that user's creatures across all their KBs, their ages, their species, their lineage tree. Nothing is leaderboarded. Nothing is ranked. It's a **scrapbook**. You can click through to any public KB whose owner opted in. The URL becomes your public-knowledge-worker identity.

And because species are deterministic per email+path, *another user can't fake your creature*. It is cryptographically your signature.

**Why it lands:** Ties into kepano-archetype (solo-author mythology) and identity-object share-triggers. Also seeds a natural invite surface — see someone's creature, click, find their KB, ask to peek.

---

## 15. The April 1 Mechanic (Permanence of the Joke)

Launch day is **not** April 1 (we ship v0 on whatever actual date). But on the *next* April 1 after launch, something happens: **every creature finds a mushroom.** Eating it causes a **one-time irreversible metamorphosis** — the creature becomes its alternate form for 24 hours. Axolotl-users see a brief Dragon. Owl-users see a Phoenix. Stoat-users see an Ermine in royal robes. Screenshots spread. The next year, a different one-time event. The year after, another.

The joke is real because the code is in main. It is also permanent-*ish* — the metamorphosis reverts but a **scar** (a tiny permanent accessory) remains. Your creature carries the record of every April 1 it's lived through.

**Why it lands:** Claude Code's `/buddy` taught us exactly this — ship the playful thing on April 1 so criticism can't stick, make it deterministic+persistent so it becomes identity. We copy the playbook faithfully and time-delay it for maximum "oh, they actually did it" effect.

---

## 16. Contribution-Grid as Creature Food History

Ambient, passive — GitHub-contribution-graph style — but reskinned. The green-squares grid is renamed **"meals"** or **"songs"** or (user's choice) **"pebbles"**. It renders in the CLI status output (`open-knowledge status` shows a 4-week mini-grid) and in the editor. Hovering a square shows *"you fed Bramble 3 articles on Tuesday, April 14."* Factual, warm. Not streak-weighted — no red triangle for a missed day. The grid is a record of presence, not of consistency.

**Why it lands:** GitHub-grid works because it's "about real output." We index the grid to the thing that matters (articles written, backlinks formed, agent-collabs completed) not to shallow engagement.

---

## 17. The Moulting Ceremony (Schema / Structural Upgrades)

When a KB crosses a structural threshold — first folder refactor, first tag system introduced, first graph-island-bridged — the creature **moults.** A 10-second animation: old fur/feathers/scales fall away, new pattern emerges. The new pattern encodes the structural change (refactor adds stripes; tag-system adds a crest; graph-bridge adds an extra limb segment). The creature's *look* accumulates the KB's structural biography.

**Why it lands:** Tamagotchi evolution branches mattered because they were legibly caused by play style. We do the same for knowledge-work style. A heavily-tagged KB's creature looks visibly different from a heavily-linked KB's creature.

---

## 18. The Save-Version Lullaby

"Save Version" — the `POST /api/save-version` endpoint that produces a project-repo commit + shadow checkpoint — is reskinned as **"tucking in."** The CLI plays a 2-second ASCII lullaby (a soft wave of dots across the screen, gentle). The creature curls up. The commit fires. The creature snores softly for one frame. Saving a version becomes a micro-ritual that people might actually do *more often* because it feels nice.

**Why it lands:** The UX flywheel for "people actually make checkpoints" is entirely emotional. Make the act feel like care.

---

# WILD CARDS

---

## WC1. The Creature Writes the CHANGELOG

The creature ghost-writes a poetic first-person changelog between any two versions of the KB. Stored as `CHANGELOG.md`. Generated on `save-version` by running the diff through a local deterministic template (no LLM — `fill('we touched {{n}} articles. {{most_active_topic}} got {{delta}} backlinks. we remembered {{new_page}}. we let {{abandoned_page}} rest a while longer.')`). Over months, the CHANGELOG reads like a *diary written by the KB itself.* Year-end, the creature "reads it back" — a single-screen animated scroll-through, 30 seconds, ambient. If the user commits CHANGELOG.md, the public record of their KB *is narrated by the KB.* Kepano-archetype meets Animal Crossing letters meets the share-triggering-artifact pattern.

## WC2. Creature Inheritance Across Agents (Multi-Machine Sync)

When a user opens the same KB from a second machine, the creature **does not duplicate.** It **migrates.** A gentle "Bramble is on the way" message shows on the second machine; the first machine shows "Bramble is traveling." Takes 8 seconds (deliberate, ceremonial — not a sync-speed thing). The creature is an *entity with location.* When Claude Code opens the MCP connection on the second machine, the creature is *there,* not on the first. It's the same creature — one body, one state, one history. Unreasonably poetic; technically trivial (store creature state in the KB itself, under `.open-knowledge/creature.yml`). Converts multi-device into a **narrative event** rather than a sync indicator.

## WC3. The Ossuary (Dead KBs as Opt-In Public Ruins)

Users can **donate** an archived KB — not its content, just its creature's bones — to a public **Ossuary** at `openknowledge.inkeep.com/ossuary`. Each entry: creature species, rarity, age at archival, cause ("outgrew it," "project shipped," "moved to a new convention," "just stopped"). No blame. No grief. The Ossuary is a **graveyard as library** — evidence that knowledge bases end, that ending is honorable, and that the shape of a creature tells you something about the shape of a life's knowledge. Other users browse the Ossuary for inspiration. Some creatures become legendary ("the Thousand-Article Badger of 2028"). It is explicitly *the opposite* of Notion's "never delete anything." Death is dignified. Archival is an act. This also quietly solves the #1 problem with gamified productivity apps: they assume infinite lifetime, which is a lie. Ours assumes **mortality with meaning.**

---

*Raw. Unranked. For convergence downstream.*
