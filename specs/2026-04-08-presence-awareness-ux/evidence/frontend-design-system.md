---
title: Frontend Design System (~/agents)
type: prior-art-survey
sources:
  - ~/agents/agents-manage-ui/src/app/globals.css
  - ~/agents/agents-manage-ui/src/components/ui/
  - ~/agents/agents-manage-ui/src/lib/utils.ts
  - ~/agents/agents-manage-ui/package.json
---

# Frontend Design System — ~/agents

## Stack

- Tailwind CSS v4 (CSS-first @theme config, PostCSS v4 plugin)
- Radix UI v1.4.3 primitives with custom styling
- class-variance-authority (CVA) v0.7.1 for variant management
- cn() = clsx + tailwind-merge
- Sonner v2.0.6 for toasts (theme-aware)
- Lucide React v0.555.0 for icons
- Inter (sans) + JetBrains Mono (mono) fonts
- OKLCH color space for design tokens
- Dark mode via next-themes + CSS custom properties
- data-slot="component-name" convention on all components

## Key Design Tokens

### Colors (OKLCH)
- --color-azure-blue: #3784ff (primary brand)
- --color-sky-blue: #69a3ff (dark mode primary)
- --primary: oklch(0.6321 0.1983 259.59) (azure-500)
- --destructive: oklch(0.577 0.245 27.325) (red)
- --success: var(--color-azure-500)
- --warning: oklch(0.65 0.18 75) (amber)
- Gray scale: --color-gray-50 through --color-gray-950 (OKLCH)
- Azure scale: --color-azure-50 through --color-azure-950

### Typography
- Sans: Inter (Google Fonts, variable)
- Mono: JetBrains Mono (Google Fonts)
- Custom sizes: --text-2xs (0.688rem/11px), --text-1sm (0.813rem/13px)
- Button style: font-mono uppercase font-medium
- Table headers: font-mono uppercase text-xs text-muted-foreground

### Spacing/Border
- --radius: 0.625rem (10px base)
- --radius-sm: 6px, --radius-md: 8px, --radius-lg: 10px, --radius-xl: 14px

### Animations
- bounce-dot: 1.5s infinite loading dots
- shimmer: 3.5s skeleton shimmer
- shine: 2s text shine effect
- Tailwind animate-in/animate-out for dialogs/popovers

## Component Pattern

```typescript
const variants = cva('base-classes', {
  variants: { variant: {...}, size: {...} },
  defaultVariants: { variant: 'default', size: 'default' },
});

function Component({ className, variant, size, ...props }: Props) {
  return <element data-slot="component-name" className={cn(variants({ variant, size, className }))} {...props} />;
}
```

## Reusable Components for Presence UX

| Need | Existing Component | Notes |
|---|---|---|
| Presence badges | Badge (12 variants) | Add 'presence-human' and 'presence-agent' variants |
| Activity toast | Sonner (toast()) | Already configured with custom error/success styling |
| Undo button | Button (10 variants) | Use outline or ghost variant with icon-sm size |
| Cursor tooltip | Tooltip (Radix) | For hover info on cursor labels |
| Mode indicator | Badge code variant | font-mono style for 'WYSIWYG' / 'Source' labels |

## Dependencies to Add (init_spike)

init_spike currently uses plain CSS. To align with ~/agents design system:
- tailwindcss v4 + @tailwindcss/postcss
- class-variance-authority
- clsx + tailwind-merge
- sonner
- lucide-react
- @radix-ui/react-tooltip (for cursor tooltips)
- Inter + JetBrains Mono fonts

## Toast Configuration (from ~/agents)

```typescript
// Sonner toaster in root layout
<Toaster closeButton />

// Custom error styling in globals.css
li[data-sonner-toast][data-type="error"] {
  @apply text-red-700 dark:text-red-400 border-red-200
         dark:border-red-800 bg-red-50 dark:bg-red-950/30
         backdrop-blur-sm shadow-xl;
}
```

## Scrollbar Pattern

```css
scrollbar-thin scrollbar-thumb-muted-foreground/30
dark:scrollbar-thumb-muted-foreground/50
scrollbar-track-transparent
```
