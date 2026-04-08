---
title: Presence Visual Design Spec
type: design-spec
sources:
  - ~/agents/agents-manage-ui/src/components/icons/claude.tsx
  - ~/agents/agents-manage-ui/src/app/globals.css
  - Anthropic brand profile via fetch-brand.ts
  - Claude brand profile via fetch-brand.ts
---

# Presence Visual Design Spec

## Agent Identity

**Icon:** Claude sparkle mark (`claude.tsx` from ~/agents — 24x24 viewBox, `fill="currentColor"`)
**Primary color:** `#D97757` (Claude brand terracotta)
**Secondary:** `#CC785C` (Anthropic accent, slightly deeper)
**Light background:** `#F4F3EE` (Claude warm cream)
**Dark text:** `#141413` (Anthropic near-black)

The Claude sparkle icon is the visual indicator that distinguishes agent presence from human presence. Terracotta (#D97757) is used consistently for: agent cursor caret, agent selection highlight, agent flash animation, agent presence badge accent, and activity toast icon tint.

## Coeditor Identity (via ?coeditor= param)

When the editor is embedded in a coding tool, the coeditor param can drive the icon shown in the presence bar.

| Coeditor | Icon component | Accent color | Source |
|---|---|---|---|
| `claude-cowork` | `ClaudeIcon` | `#D97757` (terracotta) | `~/agents/icons/claude.tsx` |
| `cursor` | `CursorIcon` | `#F54E00` (orange-red) | `~/agents/icons/cursor.tsx` |
| `standalone` | Lucide `user` | Azure `#3784FF` | lucide-react |

### Cursor brand colors (via fetch-brand.ts)
- Accent: `#F54E00` (bright orange-red)
- Dark: `#26251E` (warm near-black)
- Light: `#F7F7F4` (warm off-white)

## Human Cursor Color Palette (8 colors)

Curated for: distinguishable from each other, work on light/dark backgrounds, work as both 2px caret and 20% opacity selection fill, harmonize with Inkeep OKLCH system, don't conflict with agent terracotta.

| Index | Name | Hex | Use |
|---|---|---|---|
| 0 | Azure | `#3784FF` | Default first user (Inkeep primary) |
| 1 | Violet | `#7C3AED` | Second user |
| 2 | Emerald | `#10B981` | Third user |
| 3 | Rose | `#F43F5E` | Fourth user |
| 4 | Amber | `#F59E0B` | Fifth user |
| 5 | Cyan | `#06B6D4` | Sixth user |
| 6 | Indigo | `#4F46E5` | Seventh user |
| 7 | Pink | `#EC4899` | Eighth user |

Assignment: `palette[clientID % 8]`. Agent color is always `#D97757` regardless of clientID.

## Cursor CSS (TipTap — WYSIWYG)

```css
.collaboration-cursor__caret {
  position: relative;
  margin-left: -1px;
  margin-right: -1px;
  border-left: 2px solid var(--cursor-color);
  border-right: 2px solid var(--cursor-color);
  pointer-events: none;
  word-break: normal;
}

.collaboration-cursor__label {
  position: absolute;
  top: -1.4em;
  left: -1px;
  font-family: var(--font-mono), 'JetBrains Mono', monospace;
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
  padding: 2px 6px;
  border-radius: 4px 4px 4px 0;
  color: white;
  background-color: var(--cursor-color);
  white-space: nowrap;
  user-select: none;
  pointer-events: none;
}

/* Agent cursor: add sparkle icon before name */
.collaboration-cursor__label[data-type="agent"]::before {
  content: '';
  display: inline-block;
  width: 12px;
  height: 12px;
  margin-right: 3px;
  background: url('data:image/svg+xml,...') center/contain no-repeat;
  vertical-align: middle;
}
```

## Cursor CSS (CodeMirror — Source)

```css
/* Override y-codemirror.next defaults */
.cm-ySelectionCaret {
  position: relative;
  display: inline;
  border-left: 2px solid var(--cursor-color);
  border-right: 0;
  margin: 0;
}

.cm-ySelectionCaretDot {
  display: none; /* Hide dot, show label instead */
}

.cm-ySelectionInfo {
  position: absolute;
  top: -1.4em;
  left: -1px;
  font-family: var(--font-mono), 'JetBrains Mono', monospace;
  font-size: 11px;
  font-weight: 500;
  padding: 2px 6px;
  border-radius: 4px 4px 4px 0;
  color: white;
  white-space: nowrap;
  opacity: 1; /* Override default 0 */
  transition: opacity 0.2s;
}

.cm-ySelectionCaret:not(:hover) > .cm-ySelectionInfo {
  opacity: 0; /* Fade to 0 when not hovered — but show initially for 3s */
}

.cm-ySelection {
  background-color: var(--cursor-color-alpha); /* 20% opacity of cursor color */
}
```

## Agent Flash Animation

```css
@keyframes agent-flash {
  0% {
    background-color: rgba(217, 119, 87, 0.2); /* #D97757 at 20% */
    box-shadow: inset 0 0 0 1px rgba(217, 119, 87, 0.3);
  }
  100% {
    background-color: transparent;
    box-shadow: none;
  }
}

.agent-flash {
  animation: agent-flash 2s ease-out forwards;
  border-radius: 4px;
}

/* CodeMirror line flash */
.cm-agent-flash {
  background-color: rgba(217, 119, 87, 0.15) !important;
  transition: background-color 2s ease-out;
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .agent-flash {
    animation: none;
    background-color: rgba(217, 119, 87, 0.1);
  }
}
```

## Presence Bar Design

```
┌─────────────────────────────────────────────────────────┐
│  [●] Nick (WYSIWYG)    [✦] Claude (editing)    [Undo]  │
│  └─ azure #3784FF      └─ terracotta #D97757           │
└─────────────────────────────────────────────────────────┘
```

### Badge specs

| Property | Human badge | Agent badge |
|---|---|---|
| Height | 28px | 28px |
| Padding | 4px 10px | 4px 10px |
| Border radius | 14px (pill) | 14px (pill) |
| Background | `{cursor-color}15` (10% opacity) | `#D9775720` (12% opacity terracotta) |
| Border | `1px solid {cursor-color}30` | `1px solid #D9775740` |
| Font | JetBrains Mono, 11px, weight 500 | JetBrains Mono, 11px, weight 500 |
| Text color | `{cursor-color}` | `#D97757` |
| Icon | Colored dot (6px circle, cursor color) | Claude sparkle (14px, terracotta) |
| Mode label | "(WYSIWYG)" or "(Source)" in muted | "(editing)" or "(idle)" in muted |

### Undo Agent button

| Property | Value |
|---|---|
| Variant | `outline` (from ~/agents Button) |
| Size | `sm` (h-8) |
| Text | "Undo Agent" |
| Font | JetBrains Mono, uppercase |
| Icon | Lucide `undo-2`, 14px |
| Color | `#D97757` border + text |
| Disabled state | When agent undo stack is empty |

## Activity Toast (Sonner)

```typescript
toast('Claude edited the document', {
  description: 'Added section: Build',
  icon: <ClaudeIcon className="size-4 text-[#D97757]" />,
  duration: 5000,
});
```

Styling inherits from ~/agents Sonner config (popover colors, border, shadow). The Claude icon and terracotta tint differentiate it from other toasts.
