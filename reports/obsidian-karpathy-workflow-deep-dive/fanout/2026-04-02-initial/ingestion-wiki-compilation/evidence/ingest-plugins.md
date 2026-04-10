# Evidence: Obsidian Ingestion Plugins & Methods

## ReadItLater Plugin
- **GitHub**: [DominikPieper/obsidian-ReadItLater](https://github.com/DominikPieper/obsidian-ReadItLater) (~620 stars)
- **Latest**: v0.11.4 (January 28, 2026) — actively maintained
- **Capabilities**: Paste URL → fetch → convert to markdown. Supports: web articles (Readability parser), YouTube/Vimeo/TikTok, Twitter/X, Mastodon, Stack Exchange, Wikipedia, Substack, WeChat, GitHub repos, text snippets.
- **Batch processing**: "Create from batch in clipboard" command processes multiple URLs at once.
- **Image handling**: Can download images locally.
- **Template engine**: Recently refactored with cleaner syntax and content filters. Each content type has its own template with type-specific variables.

## Readwise Official Plugin
- **GitHub**: [readwiseio/obsidian-readwise](https://github.com/readwiseio/obsidian-readwise)
- **Maintained by**: Readwise team (actively maintained)
- **Cost**: Readwise subscription required ($7.99/mo or $95.88/yr)
- **Syncs**: Kindle, Apple Books, Google Play Books, Instapaper, Pocket, Medium, Twitter/X, PDFs, podcasts (Airr, Snipd), Readwise Reader articles + full content
- **Format**: Each source → own markdown file. Highlights appended. **Jinja2 templating** for full customization.
- **Behavior**: Append-only by default (never overwrites edits). Auto-sync on app open or scheduled (1/12/24 hours).
- **Mobile**: iOS and Android support (v2).

## Omnivore (DEFUNCT)
- Acquihired by ElevenLabs (October 2024). Shut down November 15, 2024. All data deleted.
- Plugin [obsidian-omnivore](https://github.com/omnivore-app/obsidian-omnivore) is now non-functional.
- **Migration paths**: Readwise Reader (dedicated import tool), Obsidian Web Clipper, Wallabag (self-hosted), Raindrop.io.
- Source: [blog.omnivore.app](https://blog.omnivore.app/p/omnivore-is-joining-elevenlabs)

## Zotero Integration (Academic Papers)

### ZotLit (recommended — actively maintained)
- **GitHub**: [PKM-er/obsidian-zotlit](https://github.com/PKM-er/obsidian-zotlit) (~900 stars)
- **Latest**: v1.1.11 (August 2025)
- Two-part system (Obsidian plugin + Zotero plugin). Bulk export, annotation extraction, drag-and-drop annotations.
- **Docs**: [zotlit.aidenlx.top](https://zotlit.aidenlx.top/)

### Zotero Integration by mgmeyers (largest user base)
- **GitHub**: [mgmeyers/obsidian-zotero-integration](https://github.com/mgmeyers/obsidian-zotero-integration) (~1,400 stars)
- Insert citations, import bibliographies, extract PDF annotations with color-coding.
- Requires Better BibTeX for Zotero.
- **Maintenance concern**: Latest release ~2 years old.

## RSS Reader Plugins
- **RSS Reader** ([joethei/obsidian-rss](https://github.com/joethei/obsidian-rss)): Read/manage feeds, create notes from articles, supports audio/video feeds, TTS.
- **Obsidian Feed** ([fjdu/obsidian-feed](https://github.com/fjdu/obsidian-feed)): Pulls RSS into vault as markdown files.
- **RSS Dashboard** ([amatya-aditya/obsidian-rss-dashboard](https://github.com/amatya-aditya/obsidian-rss-dashboard)): Dashboard for RSS, YouTube, podcasts.

## Email-to-Obsidian (WEAK AREA)
- **Email-to-PARA** ([mriechers/obsidian-email-to-para](https://github.com/MarkOnFire/obsidian-email-to-para)): Star in Gmail → auto-create note. One-directional.
- **Vault Bridges** ([vault-bridges/obsidian-email-plugin](https://github.com/vault-bridges/obsidian-email-plugin)): Alpha-stage. Receives emails directly.
- External: Readwise for newsletters, Zapier/Make.com automations, forwarding to Notion then importing.
- **No mature solution exists.**

## PDF Handling

### Native
- `![[file.pdf]]` renders inline with PDF viewer.
- `![[file.pdf#page=3]]` opens specific page.

### PDF++ (standout plugin)
- **GitHub**: [RyotaUshio/obsidian-pdf-plus](https://github.com/RyotaUshio/obsidian-pdf-plus)
- Annotations stored as markdown links/backlinks (not written into PDF).
- Color-coded highlights, callouts, sidenotes as pure markdown.
- Annotations distributed across vault, survive plugin removal.

### Extract PDF Annotations
- **GitHub**: [munach/obsidian-extract-pdf-annotations](https://github.com/munach/obsidian-extract-pdf-annotations)
- Batch extraction from directories. Supports categorization by topic.

## Drag-and-Drop Behavior
- Files copied to configured attachment directory.
- Embed link `![[filename.ext]]` auto-inserted at cursor.
- Supported: images (8 formats), audio (7), video (5), PDF.
- Audio/video get embedded players. PDFs render inline.

## Official Importer Plugin
- **GitHub**: [obsidianmd/obsidian-importer](https://github.com/obsidianmd/obsidian-importer) (Obsidian team)
- **14 format families**: Apple Notes, Apple Journal, Bear, Evernote (.enex), Google Keep, OneNote, Notion, Roam Research, HTML, Markdown, CSV, Textbundle/Textpack.
- Generally solid for bulk migration. Post-import cleanup expected.
- Known issues: tags with spaces truncated, some Apple Notes attachments get UUID filenames.

## Programmatic / Batch Ingestion

### Direct Filesystem (simplest)
- Vault = folder of markdown files. Any script can write `.md` files directly.
- Obsidian detects new files on refresh.

### Obsidian CLI (NEW — February 2026)
- [help.obsidian.md/cli](https://help.obsidian.md/cli)
- 100+ commands: `obsidian read`, `obsidian search`, `obsidian create`, `obsidian append`.
- Currently requires Catalyst License ($25, Early Access). Will be free.

### Local REST API Plugin
- **GitHub**: [coddingtonbear/obsidian-local-rest-api](https://github.com/coddingtonbear/obsidian-local-rest-api)
- HTTPS REST API for CRUD operations. Supports PATCH for surgical edits (append, prepend, replace within heading/block/frontmatter).
- Search (fuzzy + Dataview DQL). Command execution.
- Security: HTTPS + API key authentication.

### MCP Servers
- See separate evidence file (llm-obsidian-workflows.md).

## Karpathy Workflow Relevance

**For the `/raw` directory pattern:**
- ReadItLater + Web Clipper cover most web article ingestion
- Zotero integration handles academic papers
- RSS plugins handle feed monitoring
- Direct filesystem writes enable batch import scripts
- New CLI (Feb 2026) is a game-changer for agent-driven ingest

**Gaps:**
- No unified ingest pipeline — requires stitching together multiple plugins
- Email ingestion is immature
- No "watch folder" or "auto-import" native capability
- Image download requires separate plugin (Local Images Plus)
- No content deduplication
