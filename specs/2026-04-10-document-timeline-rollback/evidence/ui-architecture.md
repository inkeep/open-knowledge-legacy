---
type: evidence
source: codebase trace (EditorPane.tsx, EditorHeader.tsx, Sheet, Resizable, globals.css)
confidence: HIGH
created: 2026-04-10
---

# UI Architecture for Timeline Panel

## Current Layout

```
App (h-screen)
  └─ SidebarProvider
     ├─ FileSidebar (left, empty placeholder)
     └─ SidebarInset
        └─ EditorPane (flex column)
           ├─ EditorHeader (h-12, shrink-0)
           │   [SidebarTrigger] [Separator] [filename]  [ToggleGroup]  [PresenceBar] [AgentUndoButton]
           │    ↑ left                                    ↑ center        ↑ ml-auto (right)
           └─ EditorArea (flex-1, overflow-y-auto)
              ├─ SourceEditor (conditional)
              └─ TiptapEditor (conditional)
```

## Recommended: Sheet (Right-Side Drawer)

**Why Sheet over Resizable:**
- Timeline is inspection UI — doesn't need constant visibility
- Doesn't compete for horizontal editor space
- Clean open/close semantics
- Lower dev effort (ready-made component)
- Mobile-friendly

**Sheet component** (`packages/app/src/components/ui/sheet.tsx`):
- Radix-based, supports `side="right"`
- Full viewport height, `w-3/4` default width (customizable via className)
- Includes SheetHeader, SheetTitle, SheetContent, SheetFooter
- Animations: slide-in-from-right, 200ms

## Trigger Button Placement

In EditorHeader right-side controls, before PresenceBar:
```tsx
<Button variant="ghost" size="icon-sm" onClick={toggleTimeline}>
  <Clock className="size-4" />
</Button>
```

## State Management

- `isTimelineOpen` boolean managed in EditorPane
- Passed to EditorHeader (trigger) and Sheet (content)
- Timeline panel receives `provider` from EditorPane for document context

## Design Tokens

| Token | Value | Usage |
|-------|-------|-------|
| Brand blue | `--color-azure-blue: #3784ff` | Human attribution |
| Agent accent | `--color-agent: #d97757` | Agent attribution |
| Muted text | `--color-muted-foreground` | Timestamps, secondary info |
| Mono font | "JetBrains Mono Variable" | Diff display |
| Small text | `--text-2xs: 0.688rem` | Timestamps |

## Available Dependencies

| Need | Available? | Package |
|------|-----------|---------|
| Diff | Yes | `diff@^7.0.0`, `diff-match-patch@^1.0.5` |
| Icons | Yes | `lucide-react` (Clock, History, GitBranch, ChevronRight, RotateCcw) |
| Date formatting | **No** | Need to add `date-fns` or similar |
| Virtualization | **No** | May need for long histories (future) |
