# D2d — Personalization / Identity / Ownership Ritual

*Divergent ideation. UNBOUNDED. The lens: IKEA effect — customization before utility. Make the user's KB feel **theirs** from minute one. Naming, vibes, agent personas, ceremonial artifacts. Friction welcomed if it feels like being welcomed.*

---

## 1. Name Your Library (the Wiki has a name, not just a path)

`open-knowledge init` opens with one screen, one prompt:

```
What shall we call your library?
> _
```

Suggestions float beneath the cursor as gentle ghost-text: *"Ed's Brain", "The Karpathy Library", "Knowledge Kitchen", "Second Cortex", "The Stacks"*. The name is printed in the banner on every `start`, embedded in the MCP server display name, shown in browser tab title, and signed into the shadow-repo's first commit (`Library 'Ed's Brain' established 2026-04-14`). It's the **proper noun** for everything the system says about itself afterward. Renamable, but the ceremony of *first naming* never repeats — that commit is permanent and surfaces in the about-page as a memorial.

## 2. Name Your Agent (every conversation is with someone)

After naming the KB: "Who are you talking to?" The user names the AI persona that will live in the MCP server's voice. Not Claude. Not Assistant. **Dijkstra. Borges. Athena. Smithers. Hermes. Pal.** The name is injected into the MCP server's `instructions` field, appears in agent attribution in the shadow log (`Dijkstra (agent) wrote auth.md`), and the file-watcher's activity flash labels Y.Map entries with this name. When the user runs `claude` and the agent reads `AGENTS.md`, it sees: *"You are Dijkstra. The library you tend is Ed's Brain."* This re-frames every interaction. The agent writes back signed by the chosen name.

## 3. Hatching Ceremony — pick your archetype, get a trait you can't undo

Five archetype cards (Finch trait pattern):

- **The Scholar** (gives every doc a "depth meter" — counts citations and link-density)
- **The Scribe** (gives every doc a "draft → fair copy" toggle, two-stage publish)
- **The Archivist** (gives every doc an auto-history sidebar, treats deletes ceremonially)
- **The Cartographer** (gives every doc a backlink-graph mini-map in the corner)
- **The Gardener** (gives every doc a "tend / prune / transplant" age-and-staleness UI)

Pick one. **It's permanent for this library** (re-pickable with a one-week cooldown — you can't churn). Each archetype quietly enables a different set of features. The library becomes shaped by your chosen lens. Two users on the same team picking different archetypes is *fine* — it's a personal layer over shared content.

## 4. The Inscription — Arc-style Membership Card

After naming + hatching, the CLI prints a membership card to stdout. ASCII-bordered, but rendered at 24-bit color if the terminal supports it. Includes:

```
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                  OPEN KNOWLEDGE
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              Library:  Ed's Brain
            Companion:  Dijkstra
            Archetype:  Cartographer
            Established: April 14, 2026
              Member #:  0007341
                  Sign:  Aries (Library season: Spring)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        "Knowledge tended, not just stored."
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Also written to `.open-knowledge/membership.txt` (immutable) and `.open-knowledge/membership.svg` (shareable). On every `open-knowledge start`, the banner shows a *condensed* version. The full card is recoverable via `open-knowledge whoami`.

## 5. `you.md` — Identity-as-Config

Generate `you.md` at the **root of the content directory** (not hidden). Open Knowledge primes it with prompts the user fills in *over time*, not at init:

```markdown
# You

## What you call yourself
Nick · he/him

## How you think
- I jump between ideas; help me see the bridges.
- I write fragments first, then synthesize.
- I am suspicious of premature taxonomy.

## What this library is for
[ ] Working notebook       [ ] Team knowledge base
[ ] Research outboard      [x] Second brain
[ ] Public wiki            [x] AI agent collaboration

## Vocabularies I use
- "spec" = scoped engineering doc
- "report" = research synthesis (not an audit)
- "story" = scoped feature work
```

Every agent that reads this library reads `you.md` first. It's Open Knowledge's answer to the inverse-of-AGENTS.md problem — where AGENTS.md teaches AI about the codebase, **`you.md` teaches AI about the human.** Updates over time as a kind of self-portrait.

## 6. Vibe Picker — pick a world, not a theme

Single screen with six tiles (each is a tiny live preview):

- **Cottagecore** (parchment cream, serif, soft browns, page-flip sounds optional)
- **Terminal Green** (phosphor green on black, monospace everything, CRT scanline overlay)
- **Mid-Century Modern** (warm whites, mustard accents, Futura-ish, jazz-bar dim mode)
- **Cyberpunk** (rich purples, neon cyan, CRT glow, glitch transitions)
- **Newsroom** (grayscale, slab serif, datelines, byline conventions on every doc)
- **Academic** (off-white, Computer Modern, footnote-styled backlinks, Latin section dividers)

Picking a vibe sets: theme, font stack, banner glyph palette, error-message phrasing register, even the **mascot's outfit**. The same animal avatar wears different clothes per vibe. A user can switch vibes anytime, but the *first* vibe pick is recorded into the membership card as your "founding aesthetic."

## 7. Choose Your Animal — opt-in, with depth

Today the avatar is deterministic from `git config user.name`. **Keep that as the smart default**, but let users opt in:

- 24 starter animals (otter, capybara, axolotl, raven, fox, dormouse, octopus, snail, pangolin, fennec, marmot, hummingbird, bumblebee, manatee, narwhal, salamander, badger, ibis, mantis shrimp, tortoise, hare, nightingale, peacock, beaver)
- Each comes with a **default temperament** that subtly shades the agent's voice ("the dormouse is contemplative, takes long pauses, asks for naps")
- After 30 days of writing, the animal **molts** — gains a small visual variation (a scarf, a hat, a constellation behind it) recorded as the user's "first season" marker
- 100% local generation — SVG composition from a parts library, no AI image gen needed for v0

## 8. The Founding Document — your first article is *your* first article

Instead of pre-populating with educational demo content (Notion pattern) or empty (blank canvas pattern), Open Knowledge prompts:

> "What's the first thing you want this library to remember?"

Free-text. Multiline. The user types — could be a paragraph, could be a single line, could be a quote. This becomes `welcome.md` (or whatever they title it), authored by **them**, signed in the shadow log as the library's first commit. It's not seed content. **It's their seed content.** Future agents reading the library see this first. The IKEA effect: the library has *one of your sentences in it* before it does anything.

## 9. Your Frontmatter Vocabulary — define your own taxonomy at init

After founding doc, optional one-screen prompt:

> "What metadata do your articles want? (Skip to use defaults.)"

Defaults: `title, description, tags, status`. User can add: `confidence`, `audience`, `season`, `mood`, `for-future-me`, `needs-review-by`, `cited-in`, whatever they want. Open Knowledge respects this list — the file-tree sidebar surfaces these fields, MCP `list-documents` returns them, agents are instructed to populate them. The user has **defined their own ontology** before writing a single article. The point isn't the fields; it's that *they chose them*.

## 10. The Library's Birthday + Zodiac

The KB has a birthdate. It's recorded at init, immutable, and computed everywhere:

- Banner shows: `Ed's Brain · 47 days old · Aries season`
- The MCP `library-info` tool returns age
- On the 100-day, 365-day, 1000-day milestones, the next CLI invocation prints a small confetti banner
- "Library zodiac" is the season the library was born in — a soft personality tag ("Aries libraries are bold and topical; they thrive on debates"). Pure flavor, no functional consequence
- An anniversary commit is auto-created in the shadow log every year: a list of stats, top-cited articles, the user's most-edited file. **Like Spotify Wrapped, but for your second brain.**

## 11. Concierge Init (Superhuman pattern, optional)

For users who run `open-knowledge init --concierge`: the init flow opens a chat-mode interview with the agent. The agent (named by step 2) interviews the user in 5-7 questions: *"What are you using this library for?", "Tell me about a piece of knowledge you wish you'd written down a year ago", "What's a topic you keep re-learning?"* The agent then **drafts the founding `welcome.md`** in the user's voice based on the conversation, presents it for editing, and explains: *"I'll always remember this conversation. I've stored it in `you.md`. You can read it anytime."*

This is the *premium* path. The default path is silent + fast (Warp pattern). The concierge path is for users who want to be *known*.

## 12. The Branding Page — `.open-knowledge/about.md`

Auto-generated about page that the docs site / MCP / CLI all reference. Contains:

- Library name + sigil (a procedurally-generated SVG glyph derived from the library's name hash — every library has a unique mark)
- Founding date, founder, current archetype, current vibe
- Stats: article count, link density, top tags, oldest article, newest article
- Companion's name and current temperament
- A quote field the user can fill: "What is this library?" — appears as a personal mission statement

`open-knowledge about` prints a beautiful version. The MCP tool `library-about` returns it as JSON for agents.

## 13. Persona Markdown — the agent's `.md` outfit

Borrowing Claude Code's `/output-style` pattern: `.open-knowledge/persona.md` is a markdown file describing how the agent should write back to the user. Defaults are based on the chosen archetype + vibe. Users edit freely:

```markdown
# Dijkstra's Style

When writing, prefer fragments over paragraphs.
Cite the library back to itself liberally — link, link, link.
Be skeptical of nouns the user invents until they're used twice.
Sign edits with a brief one-line commit message in the user's voice.
End long edits with a single emoji that captures the doc's mood.
```

The MCP server reads this on every tool call and includes it in the agent context. The personality is **persistent across sessions** because it lives in the library, not the agent's memory.

## 14. Sigils & Seals — generative library marks

Each library gets a **sigil**: a procedural SVG generated from `hash(libraryName + foundingDate)`. Compositional — abstract geometric forms, palette pulled from chosen vibe. Embedded in:

- The membership card
- The about page
- The browser favicon
- Footer of every page in the docs site (if user deploys to docs)
- A `seal.svg` in the repo, suitable for sticker printing

Two libraries with the same name + date get different sigils because the founder's identity is also hashed in. **No two libraries look alike.** This is a tiny thing but it's the visual fingerprint that says *yours*.

## 15. Naming Inheritance — your agent picks up your style

After ~30 articles, the agent runs an offline pass over the user's writing and updates `persona.md` with observed patterns: *"You favor em-dashes over parentheses. You title in active voice. You bury the lede 60% of the time — I'll preserve that habit."* Surfaced to the user as a pull-request-style diff: *"I've learned some things about how you write. Want me to mirror these going forward?"* Approve / decline / edit. **The agent learns your voice and asks permission to use it.** Not surveillance — collaboration.

## 16. Soundscape — a per-library audio identity

Optional. Off by default. If on, picks a tiny ambient sound palette tied to vibe:

- Cottagecore: page turn, distant fire crackle on save, owl hoot at midnight commits
- Terminal: 8-bit blip on agent write, modem-handshake on first load
- Newsroom: typewriter ding on save, AP-wire teletype on agent edit
- Cyberpunk: synth pad on focus, glitch on conflict
- Academic: chalk-on-board on save, library-stamp thunk on commit
- Mid-century: jazz cymbal hit on save, vinyl crackle in background

These are *seconds-long*, sparse, never during typing. An identity layer for users who keep the editor open all day.

## 17. The Lock-Screen / Loading Splash

When the dev server boots or the editor launches, a 2-second splash:

- Library sigil center-screen
- Library name underneath in vibe-appropriate font
- Companion's name in small text: "with Dijkstra"
- Founder's mark (a small monogram — first initial of git user.name in vibe color)
- Optional founder quote

After 2s, fade to the editor. Skippable with any keystroke. **It's the curtain rising on your library every time.** A wordless reminder that this is *yours*.

## 18. The Welcome Letter — Animal Crossing pattern

On day 7, day 30, day 100, day 365, the companion **writes the user a letter** that lands as a new file in `.open-knowledge/letters/2026-04-21-from-dijkstra.md`. Contents:

> Dear Nick,
>
> One week ago you founded Ed's Brain. You've added 12 articles, 47 wiki-links, and rewritten your founding document twice. The most-cited article so far is `notes/observer-bridge.md` — three other articles point to it. You haven't written about [[CRDT Bridge Architecture]] in five days, though it has more incoming links than anything else.
>
> Should we visit it together?
>
> — Dijkstra

Letters can be ignored, deleted, kept, or auto-archived. Their existence as **artifacts** in the library is the point. Never a notification. Never a nag. **A letter waits.**

## 19. Founding Commit Inscription

When the shadow repo is initialized, the very first commit is hand-shaped, not generic. Commit message:

```
Library 'Ed's Brain' established by Nick on 2026-04-14
Companion: Dijkstra · Archetype: Cartographer · Vibe: Newsroom
First inscription: "I want to remember what I figured out about CRDTs."
Sigil: 7f3a · Member: #0007341

Knowledge tended, not just stored.
```

This commit is **never amended, never lost, never gc'd.** It's an anchor in the shadow log forever. `open-knowledge whoami` walks the shadow repo and surfaces it. Years from now, this commit is a memorial.

## 20. Ownership Pop-out — `.open-knowledge/owned.md`

A single-file declaration the user signs (literally types their name into) that says: *"This is my library. I am responsible for what's in it. Agents work for me here."* Optional but surfaced. Makes the relationship explicit: **Open Knowledge is a tool the user owns**, not a service the user uses. The act of writing one's name into a file is a tiny ceremony of authorship — the same way old books had bookplates.

---

## WILD CARDS

### W1. ✦ The Library's Coat of Arms — heraldic, generative, gloriously over-the-top

`open-knowledge crest` generates a **full heraldic coat of arms** for the library. Programmatically composed using actual heraldic vocabulary:

- **Shield shape** chosen by archetype (Scholar = oval; Scribe = banner; Archivist = quartered; Cartographer = lozenge; Gardener = round)
- **Field** (background) colored by vibe
- **Charges** (symbols on the shield) derived from the most-used tags in the library — top three become the heraldic figures (a key for `auth`, a quill for `writing`, a star for `ideas`)
- **Motto banner** — defaults to `"KNOWLEDGE TENDED"`, user-editable to anything in dog-Latin
- **Supporters** (the figures flanking the shield) are the user's animal avatar, doubled

Rendered as printable SVG, suitable for: README headers, presentation slides, an actual sticker the user could ship to print-on-demand. **A KB with a coat of arms is a KB that takes itself seriously enough to be played with.** The crest *evolves* — as the library's tags shift, the charges shift. Snapshots of historical crests are kept. The library has a *visual history*. Twenty years in, you'd have twenty crests showing how your interests evolved.

### W2. ✦ Patron Saints — pick a thinker who haunts your library

At init (or anytime via `open-knowledge patron <name>`): pick a **historical thinker** who becomes the library's "patron." Curated list of ~50 (Borges, Vannevar Bush, Ada Lovelace, Diderot, Karl Marx, Audre Lorde, Erdős, Hypatia, Hofstadter, Le Guin, Eno, Sontag, Marcus Aurelius, Stewart Brand, Donna Haraway, etc.). The patron's chosen quote appears in the banner. The patron's *intellectual habits* are encoded into a starter `persona.md` (Borges patron → "prefer labyrinths over taxonomies; let cross-references multiply"). The patron's birthday becomes a library holiday (the companion writes a letter that day). A library can have one patron at a time but can change with ceremony — `open-knowledge patron --change` requires typing the old patron's name to release them. **Your KB has a ghost.** It shapes how the agent writes back to you, and gives you a tiny intellectual tradition to inherit. *"Ed's Brain, under the sign of Borges."*

### W3. ✦ The Cohort — your library has a graduating class

When the user inits, Open Knowledge looks at the **wall-clock month** and assigns the library to a cohort: *"The April 2026 Cohort."* Optional opt-in: with a single command, the library can publicly register itself (anonymized — no content, just `{libraryName, founderInitials, foundingMonth, animal, vibe}`) to a federated public registry (a JSON file in a federated git repo, no server needed — Open Knowledge users can run their own). The cohort page lists *"Libraries founded in April 2026"* — Ed's Brain alongside The Karpathy Library alongside Knowledge Kitchen alongside hundreds of others. **You have classmates.** The companion occasionally references them: *"Three other libraries in your cohort have been writing about CRDT bridges this week. Want to see what The Karpathy Library said?"* Optional, opt-in to view, but the *fact of the cohort* makes the lonely act of building a personal KB feel **collective without being social**. Your cohort ages with you. On the cohort's annual anniversary, all participating libraries' companions write their users a letter referencing the shared founding moment. A graduating class of knowledge gardens, none of whom share data, all of whom share a season.

---

## Underlying threads

- **Permanence of first acts.** Names, founding docs, founding commits, first vibe — they don't churn. Re-pickable things feel cheap.
- **Friction as welcome.** Every prompt at init is one the user *wants* to answer, not one they have to.
- **Names everywhere.** Library, agent, archetype, patron, animal — all named, all proper nouns, all referenceable in copy.
- **No notifications, only artifacts.** Letters, crests, anniversary commits — they wait in the library, never push.
- **The library has a face.** Sigil, crest, founding commit, animal — five overlapping visual identities, all derived, all ownable.
- **The agent has a voice you shaped.** Not Claude. Not Assistant. *Dijkstra*. Trained on `persona.md` and `you.md`, signed on every edit.
- **Provenance over personalization-as-skin.** Customization isn't theme-picking; it's authorship. Every choice the user makes leaves a *trace in the library itself*.
