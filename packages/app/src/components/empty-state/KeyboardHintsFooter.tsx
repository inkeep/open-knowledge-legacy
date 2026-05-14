import { cn, isMacOs } from '@/lib/utils';

interface KeyboardHintsFooterProps {
  readonly className?: string;
}

export function KeyboardHintsFooter({ className }: KeyboardHintsFooterProps) {
  const mod = isMacOs() ? '⌘' : 'Ctrl';
  return (
    <p
      className={cn(
        'select-none font-mono text-2xs uppercase tracking-wider text-muted-foreground',
        className,
      )}
    >
      <Kbd mod={mod} letter="K" /> Search
    </p>
  );
}

function Kbd({ mod, letter }: { readonly mod: string; readonly letter: string }) {
  const spacer = mod.length > 1 ? ' ' : '';
  return (
    <kbd className="font-mono not-italic">
      {mod}
      {spacer}
      {letter}
    </kbd>
  );
}
