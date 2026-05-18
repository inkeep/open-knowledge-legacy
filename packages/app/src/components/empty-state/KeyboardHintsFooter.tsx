import { isMacOS } from '@tiptap/core';
import { Kbd } from '@/components/ui/kbd';

export function KeyboardHintsFooter() {
  const shortcut = isMacOS() ? '⌘ K' : 'Ctrl K';
  return (
    <p className="text-sm text-muted-foreground">
      <Kbd>{shortcut}</Kbd> <span>Search</span>
    </p>
  );
}
