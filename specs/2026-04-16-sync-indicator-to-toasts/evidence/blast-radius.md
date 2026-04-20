---
title: SyncIndicator blast radius analysis
sources:
  - packages/app/src/presence/PresenceBar.tsx
  - packages/app/src/presence/use-sync-status.ts
  - packages/app/src/components/EditorHeader.tsx
  - packages/app/src/components/ui/sonner.tsx
---

## Consumers of `useSyncStatus`

1. **PresenceBar.tsx:160** — drives `SyncIndicator` → being removed
2. **EditorHeader.tsx:50-52** — derives `isConnected` for source-mode disable → stays unchanged

## Consumers of `SyncIndicator` / `SYNC_CONFIG`

Only `PresenceBar.tsx`. Not exported; purely local to that file.

## Test references

- `data-sync-status` selector: **zero** test files
- `SyncIndicator` string: **zero** test files
- `SYNC_CONFIG`: **zero** test files

## CSS references

All styling is inline Tailwind classes on the component. No external CSS rules target sync-indicator classes.

## Dark mode gap resolution

`specs/2026-04-11-dark-mode/evidence/gap-inventory.md` line 17 noted hardcoded hex colors (#f59e0b, #22c55e, #ef4444) in SYNC_CONFIG. Deleting the component resolves this gap entirely — toasts use the theme-aware Sonner styling (`--normal-bg`, `--normal-text`, `--normal-border` CSS variables).

## Existing toast infrastructure

- `packages/app/src/components/ui/sonner.tsx` — themed Toaster with custom icons
- `packages/app/src/main.tsx:32` — `<Toaster />` rendered at root
- Position: Sonner default (bottom-right)
- Existing usage: `toast.error()` in FileTree, image-upload; `toast.info()` in EditorPane
- No existing `toast.warning()` or `toast.success()` usage — this spec introduces both

## Forward compatibility

GitHub sync spec FR29 envisions a new `SyncStatusBadge` component with expanded states. That component will be net-new — no collision with this removal.
