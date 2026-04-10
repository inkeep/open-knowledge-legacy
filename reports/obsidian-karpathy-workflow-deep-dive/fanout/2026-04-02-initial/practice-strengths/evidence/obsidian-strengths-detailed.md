# Evidence: What Obsidian Does Exceptionally Well

## Sources
- [faesel.com — Why every developer needs to use Obsidian](https://www.faesel.com/blog/why-every-developer-needs-to-use-obsidian)
- [thebusinessdive.com — Obsidian Review 2026](https://thebusinessdive.com/obsidian-review)
- [lindy.ai — Obsidian Review 2026](https://www.lindy.ai/blog/obsidian-review)
- [practicalpkm.com — 2025 Obsidian Report Card](https://practicalpkm.com/2025-obsidian-report-card/)
- [practicalpkm.com — Obsidian Core Plugins Tier List](https://practicalpkm.com/obsidian-core-plugins-tier-list/)
- [dev.to — Why I switched from Obsidian](https://dev.to/dev_tips/why-i-switched-from-obsidian-a-real-developers-story-and-what-im-using-now-ndn)
- [xda-developers.com — reasons switching from Obsidian](https://www.xda-developers.com/reasons-switching-from-obsidian-to-notion/)
- [obsidian.md/changelog/2025-05-21 — Obsidian 1.9.0](https://obsidian.md/changelog/2025-05-21-desktop-v1.9.0/)

---

## Strength 1: File-Over-App Philosophy / Data Ownership
- Vault is literally a folder of `.md` files on disk
- No proprietary database, no lock-in
- Files readable by any text editor forever
- Users' most-cited reason for choosing Obsidian over Notion
- Quote: "You cannot be held hostage behind a paywall"

**Why it matters for LLM KB:** Markdown files are the native language of LLMs. No extraction layer needed.

## Strength 2: Live Preview Rendering
- Solved the "two-pane problem" — inline rendering as cursor moves away
- Markdown renders in-place, no separate preview panel needed
- Code blocks, LaTeX, Mermaid diagrams all render inline
- Quote: "Smooth cross-platform writing with Markdown editing that lets users easily style without leaving the keyboard"

**Why it matters for LLM KB:** Agent-generated markdown is immediately rendered beautifully without user effort.

## Strength 3: Plugin Ecosystem Depth
- 2,749 plugins, 414 themes
- Most powerful PKM tool available in terms of extensibility
- Quote: "You cannot get this level of customization in Notion — you get what they give you"
- Dataview alone can query and aggregate across the entire vault via metadata
- Excalidraw provides whiteboarding/visual thinking embedded in notes

**Why it matters for LLM KB:** Plugins like Dataview, Templater, and QuickAdd provide the automation layer between LLM output and vault organization.

## Strength 4: Command Palette / Keyboard-Driven Workflow
- Works exactly like VS Code's command palette
- Fuzzy-match any command from the keyboard
- Power users never touch the mouse
- Hotkey customization for every command
- Quote: "Keyboard-only navigation is ideal for power users"

**Why it matters for LLM KB:** Developers (the primary audience) feel at home immediately.

## Strength 5: Backlinks and Graph Structure
- `[[wikilink]]` syntax creates bidirectional links between notes
- Backlink panel shows incoming references
- Local graph view shows immediate neighborhood of connections
- Unlinked mentions detection (finds references without explicit links)
- **Consensus:** Backlinks are genuinely useful; visual graph view has diminishing returns at scale but underlying link structure remains valuable
- Quote: "Core navigation and search is really based on the graph structure (i.e., navigating links in notes and navigating backlinks)"

**Why it matters for LLM KB:** LLM-compiled wikis naturally produce wikilinks. Backlinks let users navigate LLM-generated content serendipitously.

## Strength 6: Bases (Core Plugin — launched 1.9.0, August 2025)
- **Source:** [Obsidian changelog](https://obsidian.md/changelog/2025-05-21-desktop-v1.9.0/) and [help.obsidian.md/bases](https://help.obsidian.md/bases)
- Turns any set of notes into a database
- Views: Table, List, Cards, Map (added in 1.10.0)
- Filter, sort, group by any property
- Formulas for derived dynamic properties
- All data backed by local Markdown files + YAML
- Roadmap: Plugin API, more views, Publish support

**Why it matters for LLM KB:** Provides structured views over LLM-generated wiki content without changing the underlying markdown.

## Strength 7: CSS Customizability
- **Sources:** [help.obsidian.md/snippets](https://help.obsidian.md/snippets), [Style Settings plugin](https://github.com/mgmeyers/obsidian-style-settings)
- CSS snippets can modify any part of the UI
- Style Settings plugin creates GUI controls for CSS variables
- CSS variables organized hierarchically: foundation → semantic → component → context
- Class toggles for feature flags
- 414+ themes with deep customization
- Quote: Obsidian can be made to "look like anything"

**Why it matters for LLM KB:** Users can create specialized views for wiki browsing, agent-generated content, or research workflows.

## Strength 8: Performance on Standard Vaults
- **Good:** Handles standard vaults (hundreds to low thousands of files) well
- **Good:** Dataview scales to "hundreds of thousands of annotated notes without issue"
- **Problem:** Degrades at 10,000+ files (20+ min indexing, slow search, slow `[[` completion)
- **Mitigating:** Performance is primarily affected by plugin count, not file count — disabling plugins helps

## Strength 9: Privacy / Offline-First
- Works completely offline
- No account required for core features
- No telemetry by default
- Sync is optional and paid
- All data stays on user's device unless they choose otherwise

**Why it matters for LLM KB:** Sensitive research stays private by default.

## Strength 10: Cross-Platform Consistency
- Desktop: macOS, Windows, Linux
- Mobile: iOS, Android
- Consistent experience across platforms
- Same vault, same plugins (mostly)
