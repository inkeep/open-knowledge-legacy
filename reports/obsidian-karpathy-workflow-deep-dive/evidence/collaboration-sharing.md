# Evidence: Obsidian Publish and Wiki Sharing Options

## Obsidian Publish (Official)

### Pricing
| Billing | Price |
|---------|-------|
| Monthly | $10/month |
| Annual | $8/month |

### Core Features
- Select which notes from vault to publish
- Custom domain support (point your own domain)
- Password protection (site-wide only; no per-page protection)
- Graph view for visitors (navigable connection map)
- Backlinks (automatic listing of pages referencing current page)
- CSS and JavaScript customization
- First-class SEO (auto-optimized for search engines + social cards)
- Option to prevent search engine indexing
- 100% Lighthouse accessibility score out of the box
- Mobile-first responsive design

### Storage
- 4 GB storage included
- Sufficient for thousands of text notes
- Media-heavy vaults may hit the limit

### Search Limitations
- **Critical limitation:** Search only covers titles, aliases, and headings — NOT full-text content
- Full-text search is a longstanding feature request (since 2023)
- Visitors cannot search within note body text

**Source:** [Obsidian Publish](https://obsidian.md/publish)
**Source:** [Obsidian Help — Introduction to Obsidian Publish](https://help.obsidian.md/publish)
**Source:** [Obsidian Help — Custom domains](https://help.obsidian.md/publish/domains)
**Source:** [Obsidian Forum — Have Obsidian Publish search feature search full text](https://forum.obsidian.md/t/have-obsidian-publish-search-feature-search-the-full-text-of-notes/62188)

### Use Cases
- Personal wiki / digital garden
- Documentation sites
- Knowledge base publishing
- Public second brain

**Source:** [Obsidian Forum — Suggestions on how to do a wiki in Obsidian with Publish](https://forum.obsidian.md/t/suggestions-on-how-to-do-a-wiki-in-obsidian-that-can-be-published-with-publish/85388)

## Quartz (Free Alternative)

### Overview
- Open-source static site generator by jackyzha0
- Specifically designed for Obsidian vaults
- Written in TypeScript (v4)
- Transforms Markdown into fully functional websites

### Features
- **Full-text search** (unlike Obsidian Publish)
- Graph view
- Backlinks
- Wikilinks
- Transclusions
- LaTeX support
- Syntax highlighting
- Popover previews
- Docker support
- Internationalization
- Comments integration
- Tag pages
- Automatic navigation structure from folder hierarchy

### Requirements
- Requires comfort with Node.js and Git
- Self-hosted (GitHub Pages, Netlify, Vercel, etc.)
- Free to use

**Source:** [Quartz — Welcome to Quartz 4](https://quartz.jzhao.xyz/)
**Source:** [Simon Späti — Quartz Publish Obsidian Vault](https://www.ssp.sh/brain/quartz-publish-obsidian-vault/)

## Other Free Alternatives

### Flowershow
- Free tier available; $50/year premium
- Supports wiki links
- No graph view (restricted to Obsidian Publish)

### Digital Garden Plugin
- Community plugin for publishing individual notes
- Free, open-source

### MkDocs
- Most mature for hierarchically structured documentation
- Python-based

### Share Note / JotBird / Enveloppe
- Community plugins for individual note/blog publishing
- Zero cost

**Source:** [Obsidian Forum — Obsidian Publish alternatives](https://forum.obsidian.md/t/obsidian-publish-alternatives/22886)
**Source:** [Unmarkdown — Obsidian Publish Alternatives 2026](https://unmarkdown.com/blog/obsidian-publish-alternatives)

## Karpathy Workflow Implications

| Aspect | Assessment |
|--------|-----------|
| Obsidian Publish for wiki | Good but search limitation is critical for knowledge base |
| Quartz for wiki | Better — full-text search, free, fully customizable |
| Publishing pipeline | Agent compiles wiki → Git commit → Quartz build → deploy |
| Graph view for visitors | Both Publish and Quartz support this |
| Custom domain | Both Publish and Quartz support this |
| Cost | Publish: $96-120/year; Quartz: free (hosting costs only) |
| Auto-deploy | Quartz + GitHub Actions = automatic deploy on push |
| Backlinks/wikilinks | Both support; critical for wiki navigation |
| Full-text search | Quartz yes; Publish no (titles/headings only) |
