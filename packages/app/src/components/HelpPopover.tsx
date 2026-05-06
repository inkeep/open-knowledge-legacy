import { BookOpen, CircleHelp, Download, Globe, Settings } from 'lucide-react';
import type { ComponentProps, FC } from 'react';
import { useState } from 'react';
import { InstallInClaudeDesktopDialog } from '@/components/InstallInClaudeDesktopDialog';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { dispatchExternalLinkClick } from '@/lib/external-link';
import { SETTINGS_OPEN_HASH } from '@/lib/use-settings-route';
import { LinkedinIcon } from './icons/linkedin';
import { XTwitterIcon } from './icons/x-twitter';

const links: Array<{
  label: string;
  href: string;
  icon: FC<ComponentProps<'svg'>>;
}> = [
  { label: 'Documentation', href: 'https://openknowledge.ai/docs', icon: BookOpen },
  { label: 'Homepage', href: 'https://openknowledge.ai/', icon: Globe },
  { label: 'Twitter / X', href: 'https://x.com/inkeep', icon: XTwitterIcon },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/company/inkeep/', icon: LinkedinIcon },
];

export const HelpPopover: FC = () => {
  const [installDialogOpen, setInstallDialogOpen] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 hover:bg-accent text-muted-foreground"
              >
                <CircleHelp className="size-4" />
                <span className="sr-only">Help &amp; resources</span>
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>Help &amp; resources</TooltipContent>
        </Tooltip>
        <PopoverContent align="end" className="w-64 p-3">
          {/*
            Setup actions — one-time actions a user might want to re-find from
            here. Separated from external links below. Mirrors the Electron
            main menu's Help submenu (SPEC 2026-04-24 Ship 1h) so web and
            Electron users share one mental model for where to find setup.
          */}
          <p className="font-mono tracking-wide uppercase text-muted-foreground text-xs mb-1">
            Setup
          </p>
          <ul className="mb-3 space-y-0.5">
            <li>
              <button
                type="button"
                data-testid="help-popover-settings"
                onClick={() => {
                  setPopoverOpen(false);
                  if (window.location.hash !== SETTINGS_OPEN_HASH) {
                    window.location.hash = SETTINGS_OPEN_HASH;
                  }
                }}
                className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-azure-900/5 dark:hover:bg-white/20 hover:text-primary"
              >
                <Settings aria-hidden="true" className="size-4 shrink-0" />
                <span>Settings…</span>
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => {
                  setPopoverOpen(false);
                  setInstallDialogOpen(true);
                }}
                className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-azure-900/5 dark:hover:bg-white/20 hover:text-primary"
              >
                <Download aria-hidden="true" className="size-4 shrink-0" />
                <span>Install for Claude Chat &amp; Cowork…</span>
              </button>
            </li>
          </ul>
          <p className="font-mono tracking-wide uppercase text-muted-foreground text-xs mb-1">
            Resources
          </p>
          <nav aria-label="Help and resources">
            <ul className="space-y-0.5">
              {links.map(({ label, href, icon: Icon }) => (
                <li key={href}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => dispatchExternalLinkClick(e, href)}
                    onAuxClick={(e) => dispatchExternalLinkClick(e, href)}
                    className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-azure-900/5 dark:hover:bg-white/20 hover:text-primary"
                  >
                    <Icon aria-hidden="true" className="size-4 shrink-0" />
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </PopoverContent>
      </Popover>
      <InstallInClaudeDesktopDialog open={installDialogOpen} onOpenChange={setInstallDialogOpen} />
    </>
  );
};
