/**
 * Shared tooltip content + platform-aware modifier label for link chips.
 * Keeps the Cmd/Ctrl+click affordance consistent across InternalLinkView
 * and WikiLinkView (and anything else we later surface as a link chip).
 *
 * Kbd styling follows the established InlineFormatButtons / LinkEditPopover
 * convention (`ml-1.5 text-[10px] opacity-60`).
 */

const IS_MAC =
  typeof navigator !== 'undefined' &&
  /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent || '');

export const MOD_LABEL = IS_MAC ? '⌘' : 'Ctrl';

export function LinkTooltipHint({ href }: { href: string }) {
  return (
    <>
      <span className="max-w-[18rem] truncate">{href}</span>
      <kbd className="ml-1.5 text-[10px] opacity-60">{MOD_LABEL}+click</kbd>
    </>
  );
}
