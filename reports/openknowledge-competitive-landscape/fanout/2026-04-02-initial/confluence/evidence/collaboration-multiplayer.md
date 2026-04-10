---
title: "Confluence Collaboration & Multiplayer Editing"
source_type: primary
date_collected: 2026-04-02
dimension: "Collaboration & Multiplayer"
sources:
  - url: https://support.atlassian.com/confluence-cloud/docs/create-and-collaborate-in-real-time-with-live-docs/
    title: "Live Docs: Real-Time Collaboration"
    type: documentation
  - url: https://confluence.atlassian.com/doc/collaborative-editing-858771779.html
    title: "Collaborative Editing in Confluence"
    type: documentation
  - url: https://confluence.atlassian.com/doc/page-history-and-page-comparison-views-139379.html
    title: "Page History and Page Comparison Views"
    type: documentation
  - url: https://community.atlassian.com/forums/Confluence-User-Group-articles/Live-Docs-in-Confluence-Cloud-Collaborate-in-Real-Time/ba-p/3114893
    title: "Community: Live Docs in Confluence Cloud"
    type: community
  - url: https://www.atlassian.com/software/confluence/resources/guides/confluence-essentials/collaborate
    title: "Collaborate on a Confluence page"
    type: documentation
---

# Confluence Collaboration & Multiplayer Editing

## Real-Time Editing Models

### Traditional Pages (Collaborative Editing)
- Up to **12 simultaneous editors** per page
- Changes sync in near-real-time but require "Publish" to become the canonical version
- Known issues: concurrent edits can mix up, with one person's partial edits potentially overwriting another's
- Presence indicators show who else is editing
- Unpublished drafts are user-specific

### Live Docs (New — Beta from Team '25)
- Up to **100 simultaneous viewers**
- Real-time editing without publish step (Google Docs model)
- Changes automatically saved and reflected to all viewers instantly
- Inline comments and reactions supported
- Jira integration within live docs

### Whiteboards
- Real-time visual collaboration
- AI-assisted idea generation and grouping
- Voting feature for prioritization
- Smart Create for brainstorming and diagramming

## Comments System

- **Footer comments**: Traditional discussion at bottom of page
- **Inline comments**: Tied to specific text selections within the page
- **Reactions**: Lightweight emoji responses on comments
- **@mentions**: Notify specific people in comments
- **Comment resolution**: Mark threads as resolved
- **AI comment summarization**: Rovo can summarize comment threads

## Permissions Model

- **Space-level permissions**: Admin, editor, viewer per space
- **Page-level restrictions**: Override space permissions for specific pages
- **Group-based**: Permissions assigned to groups, not just individuals
- **Anonymous access**: Configurable for public-facing content
- **Guest access**: External collaborators with limited permissions

## Version History

- Auto-incrementing version numbers (v.1, v.2, v.3...)
- Change author attribution per version
- Optional version comments describing changes
- Side-by-side comparison between any two versions
- Restore previous version capability
- Change History macro for embedding version log in page

**Limitations:**
- No branching versions (linear history only)
- Cannot view individual contributions within a single version (when multiple editors contribute before publish)
- No diff at the structural level — comparison is visual, not semantic
- No git-like merge, rebase, or branch concepts

## Spaces & Hierarchy

- **Spaces**: Top-level organizational containers (personal, team, project)
- **Page trees**: Hierarchical parent-child page structure within spaces
- **Folders**: Recently added for content organization
- **Labels**: Tag-based cross-cutting categorization
- **Blueprints/Templates**: Pre-structured page types for common use cases

## Assessment

**Mature aspects:**
- Comments (footer + inline) are well-established
- Space/permission model is enterprise-grade
- Live Docs closes the gap with Google Docs for real-time editing

**Immature/missing aspects:**
- Version history is linear-only — no branching, no git-like workflow
- Collaborative editing on traditional pages has known reliability issues
- 12-editor limit on traditional pages is constraining for large teams
- No concept of "agent as collaborator" in the multiplayer model
- No structural diffing — changes are opaque blobs between versions
- No conflict resolution beyond "last write wins" in concurrent scenarios
