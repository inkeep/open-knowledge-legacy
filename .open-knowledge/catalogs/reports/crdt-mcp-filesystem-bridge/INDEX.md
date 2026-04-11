---
title: crdt-mcp-filesystem-bridge
description: ""
generated: true
schema_version: 1
---

## Articles

- **[Bridging AI Coding Agents and CRDT-Authoritative Editing: The MCP Filesystem Translation Layer](reports/crdt-mcp-filesystem-bridge/REPORT.md)** — How to build an MCP filesystem server that translates standard file operations (read_file, write_file, edit_file) into Yjs CRDT operations via Hocuspocus DirectConnection, enabling AI coding agents to work with a visual editor without knowing it is CRDT-backed. Covers Replit Crosis protocol analysis, Hocuspocus DirectConnection API, translation layer design for all agent edit patterns, read/write consistency, non-content file operations, bidirectional file-CRDT sync safety under concurrent mutations (updateYFragment clobber analysis), feedback loop prevention for file watchers, and CRDT-to-disk persistence latency optimization.

## Subfolders

- **[evidence](.open-knowledge/catalogs/reports/crdt-mcp-filesystem-bridge/evidence/INDEX.md)** (10 articles)
- **[meta](.open-knowledge/catalogs/reports/crdt-mcp-filesystem-bridge/meta/INDEX.md)** (1 article)
