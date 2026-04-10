---
title: "Confluence Editor Quality & ADF Storage Format"
source_type: primary
date_collected: 2026-04-02
dimension: "Product Capabilities & Editing Experience; Storage & Format Model"
sources:
  - url: https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/
    title: "ADF Structure Specification"
    type: documentation
  - url: https://community.atlassian.com/forums/Confluence-questions/Why-is-the-Confluence-Cloud-Editor-so-much-worse/qaq-p/2242549
    title: "Community: Why is the Confluence Cloud Editor so much worse?"
    type: community
  - url: https://community.atlassian.com/forums/Confluence-Cloud-Admins/Confluence-Document-Editor-will-they-ever-fix-it-or-will-it/td-p/897607
    title: "Community: Will they ever fix the editor?"
    type: community
  - url: https://www.kolekti.com/resources/blog/confluence-cloud-legacy-editor
    title: "Confluence Cloud Legacy Editor Deprecation"
    type: blog
  - url: https://adfapi.dev/blog/2025/06/24/what-is-atlassian-document-format-adf-and-why-should-you-care/
    title: "What is ADF and why should you care?"
    type: blog
  - url: https://github.com/Spenhouet/confluence-markdown-exporter
    title: "Confluence Markdown Exporter (OSS)"
    type: github
  - url: https://marketplace.atlassian.com/apps/1221351/markdown-exporter-for-confluence
    title: "Markdown Exporter for Confluence (Marketplace)"
    type: marketplace
---

# Confluence Editor Quality & ADF Storage Format

## Editor Timeline

- **Legacy editor**: HTML/XHTML-based, being fully deprecated by April 2026
- **New cloud editor**: ADF-based, generally available since ~2022, mandatory from April 2026
- **Live Docs**: New page type (beta from Team '25) for real-time, Google Docs-like editing without publish step

## Editor Criticism (Persistent)

User complaints remain widespread and consistent:

- "Why is the Confluence Cloud Editor so much worse?" — common community thread pattern
- Cloud editor has "far fewer options compared to on-premises version"
- Formatting issues and limited design elements
- Complex documents with many diagrams/tables are slow to edit
- PDF export from complex pages results in "messy formatting"
- Collaborative editing can mix up changes between concurrent editors
- Templates described as "less refined"

## ADF Specification

ADF is a **proprietary JSON tree format** with:

- **Root node**: `doc` with `version` and `content` properties
- **~26 block node types**: paragraph, heading, table, codeBlock, panel, expand, mediaGroup, mediaSingle, bulletList, orderedList, blockquote, rule, etc.
- **~8 child node types**: listItem, tableCell, tableHeader, tableRow, media, nestedExpand, etc.
- **~8 inline node types**: text, emoji, hardBreak, inlineCard, mention, status, date, mediaInline
- **9 mark types**: strong, em, code, link, strike, underline, textColor, subsup, border

Example:
```json
{
  "version": 1,
  "type": "doc",
  "content": [{
    "type": "paragraph",
    "content": [
      {"type": "text", "text": "Hello "},
      {"type": "text", "text": "world", "marks": [{"type": "strong"}]}
    ]
  }]
}
```

## Data Portability / Markdown Export

- **No native markdown export** — not supported by default
- Third-party tools required: confluence-markdown-exporter (Python/OSS), Markdown Exporter marketplace app
- ADF-to-Markdown conversion is lossy — macros, panels, custom extensions have no markdown equivalent
- Built-in exports: PDF, Word (.docx), HTML — all with known formatting fidelity issues
- Atlassian provides XML space export for backup but not for migration to non-Atlassian tools

## Implications for Agent-Native Competitor

- ADF is a proprietary tree format ~40x more complex than markdown
- No round-trip markdown fidelity — content entering ADF is effectively locked in
- Migration tooling is third-party and lossy
- Editor quality remains a competitive vulnerability despite years of investment
- The "publish" paradigm (pages) vs "live" paradigm (Live Docs) creates content model fragmentation
