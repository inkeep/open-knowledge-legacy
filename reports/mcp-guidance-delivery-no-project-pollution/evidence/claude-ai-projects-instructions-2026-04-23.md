# Evidence: Claude.ai Projects + Custom Instructions as CLAUDE.md Analog

**Dimension:** Claude.ai Projects / Custom Instructions as always-on guidance surfaces for users without filesystem Skill install
**Date:** 2026-04-23
**Sources:** support.claude.com, claude.com blog, anthropic.com news, third-party best-practices writeups (jdhodges, claudelab, forwardfuture, understandingAI, amitkoth, bighatgroup, chrisprimett)
**Research mode:** Headless, 8-minute time-box. WebFetch denied — relied on WebSearch result synopses.

---

## Key files / pages referenced

- https://support.claude.com/en/articles/10185728-understanding-claude-s-personalization-features — profile preferences feature doc
- https://support.claude.com/en/articles/9519177-how-can-i-create-and-manage-projects — Projects feature doc
- https://support.claude.com/en/articles/9519189-manage-project-visibility-and-sharing — Project sharing (Teams/Enterprise)
- https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp — MCP connectors in claude.ai
- https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities — connector steering / permissions
- https://support.claude.com/en/articles/13455879-use-claude-cowork-on-team-and-enterprise-plans — Cowork admin surface
- https://claude.com/blog/skills-explained — official "Skills vs Projects vs MCP vs subagents" framing
- https://www.anthropic.com/news/projects — original Projects launch announcement
- https://support.claude.com/en/articles/12512176-what-are-skills — Skills availability in claude.ai
- https://claude.com/blog/cowork-for-enterprise — Cowork enterprise admin controls
- https://medium.com/@kdineshkvkl/stop-stuffing-your-custom-instructions-... — 2026-04 synthesis on Projects vs Skills vs MCP layering

---

## Findings

### Finding 1: Project-level Custom Instructions exist, are always-on, and have no published hard character limit
**Confidence:** CONFIRMED
**Evidence:** support.claude.com articles 9519177 and 10185728 (via WebSearch synopses)

- Projects support a dedicated "custom instructions" field. From the help center: "You can define custom instructions for each Project to further tailor Claude's responses, including instructing Claude to use a more formal tone or answer questions from the perspective of a specific role or industry." (Art. 9519177)
- Behavior is always-on within the project scope: "Claude will use these instructions for all the chats within the project." (Art. 9519177)
- **Character limit:** Anthropic has NOT published a hard limit in help docs as of 2026-04. Community guidance (jdhodges 2026, understandingAI) converges on "several paragraphs without hitting a wall" — explicitly contrasted with OpenAI Custom GPTs' published 8,000-char cap. Best-practice guidance recommends keeping it concise (under ~500-1000 words) because instructions consume tokens on every turn.
- **Injection behavior:** Loaded into the system prompt / conversation preamble on every new chat inside that project. From the 2026-04 Medium synthesis: "Profile Preferences load first, Project Instructions layer on top, Styles adjust delivery."

**Implications for OK:** Project instructions function as a true always-on steering surface inside claude.ai — the closest analog to a CLAUDE.md that a non-filesystem user has. There is room to paste a non-trivial prompt (the full "STOP — native tools on in-scope .md/.mdx" block from OK's AGENTS.md would comfortably fit).

---

### Finding 2: Project availability is per-plan; instructions field is on paid plans only
**Confidence:** CONFIRMED
**Evidence:** Anthropic help center (Art. 9519177) via WebSearch synopsis

- "Project instructions are available on paid plans only. However, Projects are available to all users, including those with free Claude accounts. Free users can create a maximum of five projects."
- Free users can create Projects but cannot set custom instructions on them — this is a meaningful gating constraint for OK's free-tier user story.

---

### Finding 3: User-level "Profile Preferences" exist as a separate, globally-applied surface
**Confidence:** CONFIRMED
**Evidence:** Art. 10185728, multiple secondary sources (chrisprimett, promptoptimizer, forwardfuture)

- Surface: Settings → Profile → "What personal preferences should Claude consider in responses?"
- Scope: account-wide, applies to EVERY conversation (inside and outside any Project), on every plan including free.
- Character limit: "no published limit" per secondary sources; community best practice is ~500 words because preferences load as tokens at the start of every conversation.
- Layering: Profile Preferences load first → Project Instructions layer on top → Styles adjust delivery (per Medium 2026-04 synthesis and claudelab guide). This is an explicit documented hierarchy.

**Implications for OK:** A user who uses OK across many projects could paste a short global steering snippet (e.g., "if OK MCP is connected, route markdown reads through it") into Profile Preferences. But the 500-word soft ceiling is tight — not enough room for the full AGENTS.md-style guidance.

---

### Finding 4: Projects CAN steer behavior toward MCP connectors via instructions — but connectors themselves are configured at account (not project) level in claude.ai
**Confidence:** INFERRED (from multiple aligned sources; no direct Anthropic doc tested)
**Evidence:** Art. 11175166, 11176164, claude.com/blog/skills-explained, Medium 2026-04 synthesis

Key distinctions pulled from the search corpus:
- MCP connectors are configured at the claude.ai account level (Settings → Connectors); they become available across conversations. "Custom connectors using remote MCP are available on Claude, Cowork, and Claude Desktop for users on Free, Pro, Max, Team, and Enterprise plans, though Free users are limited to one custom connector." (Art. 11175166)
- Per-tool permissions: "For every connector, you can set individual tools to Allow (runs automatically), Ask (confirms before running), or Block (never runs)." (Art. 11176164)
- Project instructions function as standing guidance that can reference and steer MCP tool use. The official Skills explainer positions Projects + Connectors + Skills as complementary layers: "MCP connects Claude to data; Skills teach Claude what to do with that data... Projects provide background knowledge and context that should inform all conversations about a specific initiative."
- **Gap:** No primary-source confirmation that project instructions can ENABLE a specific connector or narrow visible tools per-project. Connector allowlists appear account-scoped. A project instruction that says "always use the open-knowledge MCP for markdown reads" would bias Claude's tool choice, not restrict the tool surface.
- One help-center sentence flagged by search: "Connectors are only available in private projects" — this suggests some per-project gating exists, but the full semantics (whether a private project can whitelist which connectors are visible) weren't confirmed in the time-box.

---

### Finding 5: Teams/Enterprise admins can configure org-wide project visibility + SCIM-assigned capability groups, but the Projects instruction field itself is per-project (not global org policy)
**Confidence:** CONFIRMED (admin surface), INFERRED (no global "org prompt" mechanism found)
**Evidence:** Art. 14604406, Art. 9519189, claude.com/blog/cowork-for-enterprise, learn-claude docs, bighatgroup "CLAUDE.md for Enterprise Teams"

- **Project visibility:** "Teams can share projects with specific people, bulk add by email list, or make projects available organization-wide. Members can have different permission levels — 'Can view' allows seeing project contents, knowledge, and instructions, while 'Can edit' enables modifying project instructions and knowledge." (Art. 9519189 synopsis)
- **Org capability gating:** "Admins on Claude Enterprise can organize users into groups — manually or via SCIM from your identity provider — and assign each a custom role defining which Claude capabilities its members can use, allowing them to turn Claude Cowork on for specific teams." (claude.com/blog/cowork-for-enterprise)
- **Org-wide guidance analog:** A team can create a "Metaprompt" or template project shared org-wide whose instructions serve as a starting template (bighatgroup, learn-claude pattern). This is a convention, not a platform feature — it lives as a shared Project, not as a true admin-mandated system prompt.
- **Gap:** No evidence found of an Anthropic-provided "org-wide system prompt" or "force these instructions on every conversation org-wide" mechanism. Admins can force capability availability (connectors, Cowork, models) but not prompt content.

---

### Finding 6: Smooth manual OK setup story on claude.ai today is viable but has three friction points
**Confidence:** INFERRED (synthesized from Findings 1-5; not validated by actually performing the steps)

**Viable path for a Pro/Max/Team user (2026-04):**
1. Settings → Connectors → Add custom connector → paste OK's remote MCP URL (requires the user to have OK server exposed publicly or via Claude Desktop local MCP). Free users: 1 connector cap.
2. Settings → Connectors → OK connector → set tool-level Allow/Ask/Block per sensitivity.
3. Create a Project, e.g., "Work with Open Knowledge."
4. Paste OK's routing guidance (the "STOP — native tools on in-scope .md/.mdx" + "Preview before edit" blocks, adapted) into the Project's custom instructions field. No known character-limit blocker.
5. (Optional, global) Paste a 1-2 sentence version in Profile Preferences so OK routing applies even in non-project chats.

**Friction / gaps:**
- **Free-tier blocker:** No project instructions on free plan. Users would rely only on Profile Preferences (~500 word ceiling) — doable for a 1-paragraph "route markdown to OK MCP" snippet but not for the full anti-native-tool ruleset.
- **Remote MCP requirement:** Claude.ai's custom-connector pane accepts remote MCP URLs; OK today targets local Hocuspocus on `server.lock`. A user running OK locally would need Claude Desktop (supports stdio/local MCP) rather than claude.ai alone — or OK would need a remote-MCP bridge. Cowork/Desktop both support the connector surface per Art. 11175166.
- **No "install skill" mechanism in claude.ai:** OK cannot ship behavioral guidance as a formal Skill to claude.ai users the way Claude Code users can drop `.claude/skills/open-knowledge/SKILL.md` on disk. The workaround IS the Project instructions field — it's a text paste, not a programmatic install. Updates to OK's recommended routing would require every user to re-paste.

---

## Negative searches

- Searched: "Claude projects character limit 8000 instructions length" → no Anthropic-published limit found; third-party convergence is "no published cap, practical ceiling is token cost."
- Searched: '"claude project" instructions reference skill MCP "always use" behavior' → no primary Anthropic source confirming that project instructions can force-pin a specific MCP tool as default. The steering is behavioral (Claude reads the instruction and complies) not mechanical (no `required_tools` field).
- WebFetch was denied in this environment, so I could not read the support.claude.com articles in full — all quotes above are from WebSearch result synopses, which may have been lightly paraphrased by the search result summarizer. A follow-up pass with WebFetch enabled would lock down exact-quote fidelity.

---

## Gaps / follow-ups

1. **Exact character/token limit for Project instructions:** Anthropic has not published one. Empirical test (paste a 10K-char instruction, observe truncation or error) would resolve.
2. **Private-project connector scoping semantics:** The sentence "Connectors are only available in private projects" was surfaced without full context. Worth checking whether private projects can whitelist WHICH connectors are visible to Claude in that project's scope — that would meaningfully change the "OK-focused Project" UX.
3. **Cowork-specific surfacing:** Cowork reuses the Projects + Connectors primitives per Art. 13455879; no separate "Cowork instructions" surface was found distinct from Projects.
4. **Claude Desktop vs claude.ai MCP surface parity:** OK today assumes local Hocuspocus. Claude Desktop supports local MCP; claude.ai custom-connector pane requires remote MCP URL. Resolving this architectural gap (remote-MCP bridge or Desktop-only OK) is upstream of any "claude.ai journey" doc.
5. **Direct fetch of the two canonical help-center articles** (9519177, 10185728) when WebFetch is available — to lock down exact-quote fidelity for the 150-word summary and any downstream spec.

---

## Direct answer to the caller's framing question

**"Do Projects + Custom Instructions together act as a CLAUDE.md analog on claude.ai that users can set up manually with OK's help?"**

**Yes, with three asterisks:**

1. **On paid plans:** A Pro/Max/Team/Enterprise user can create an OK-focused Project, paste OK's routing guidance into the Project's custom instructions field (no hard char limit found; practical ceiling is token cost), add the OK remote MCP connector at account level, and get an always-on CLAUDE.md-like steering surface for every chat inside that project. Profile Preferences provides a weaker account-wide layer that layers underneath.

2. **Not on free plans:** Project custom instructions are paid-only. Free users fall back to Profile Preferences (~500 word soft ceiling), which is enough for a 1-2 sentence "use OK MCP for markdown" nudge but not the full anti-native-tool ruleset.

3. **Architecture gap:** Claude.ai's custom connectors take remote MCP URLs; OK today runs local Hocuspocus. Claude Desktop (which IS supported per Art. 11175166) accepts local MCP and is the closest non-Code host. A claude.ai-only user story requires either (a) OK exposing a remote MCP bridge or (b) the user using Claude Desktop as their host.

The setup is viable enough to document as a recommended manual path. The updatability problem (users must re-paste when OK's guidance changes) is the single biggest drawback vs. the filesystem Skill install model used by Claude Code.
