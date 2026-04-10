---
title: "Mintlify Collaboration & Multiplayer"
dimension: "Collaboration & Multiplayer"
date_collected: "2026-04-02"
sources:
  - url: "https://www.mintlify.com/docs/editor/collaborate"
    title: "Collaborate in the web editor - Mintlify"
  - url: "https://www.mintlify.com/blog/introducing-web-editor"
    title: "Introducing our revamped Web Editor"
  - url: "https://www.mintlify.com/blog/improved-web-editor"
    title: "A better way to edit and publish in Mintlify"
  - url: "https://www.mintlify.com/blog/launch-week-3-day-3"
    title: "Launch Week III Day 3: Web Editor Branching"
---

# Collaboration & Multiplayer Evidence

## Web Editor Collaboration

- Multiple team members can work on documentation simultaneously
- Changes visible to everyone in the web editor
- Described as a "Notion-like interface" for non-technical contributors

## Branch-Based Workflows

- Work on documentation updates in parallel without affecting live site
- Multiple team members on different branches simultaneously
- Branch naming and management in web editor
- Preview deployments auto-generated: `organization-branch-name.mintlify.app`

## Publishing Workflows

Two modes available per team preference:
1. **Direct publish**: Click button to merge changes immediately into deployment branch
2. **PR-based**: Configure branch protection rules requiring pull request review before merge

## Sharing & Review

- Share direct editor links: `https://dashboard.mintlify.com/{org}/{project}/editor/{branch}/~/{filepath}`
- Share preview deployment URLs for feedback
- Preview URLs publicly accessible by default; can enable preview authentication (Add-ons page)

## Real-Time Editing

The documentation mentions that "multiple team members can work on documentation simultaneously" but does not describe Google Docs-style real-time cursor sharing, simultaneous editing of the same paragraph, or live presence indicators. The collaboration model appears to be:
- Branch-level isolation (multiple people on different branches)
- Asynchronous review via previews and PRs
- Editor link sharing for coordination

## Roles & Permissions

- Pro plan: 5 editors included, +$20/month per additional seat
- Enterprise: User permissions, SSO login
- The documentation does not detail granular role-based access control (viewer, editor, admin, etc.)

## What's Missing vs. True Multiplayer

- No evidence of real-time co-editing (cursor sharing, live presence)
- No inline comments or suggestions within the editor (comments happen in git PRs)
- No threaded discussions on specific content blocks
- No approval workflows beyond git branch protection
- No notification system for content changes beyond git notifications
- Collaboration is fundamentally git-based, with the web editor as a convenience layer
