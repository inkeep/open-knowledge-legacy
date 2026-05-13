import { BookOpen, CircleHelp, Globe } from 'lucide-react';
import type { ComponentProps, FC } from 'react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { dispatchExternalLinkClick } from '@/lib/external-link';
import { DiscordIcon } from './icons/discord';
import { GithubIcon } from './icons/github';
import { XTwitterIcon } from './icons/x-twitter';

const links: Array<{
  label: string;
  href: string;
  icon: FC<ComponentProps<'svg'>>;
}> = [
  { label: 'Documentation', href: 'https://openknowledge.ai/docs', icon: BookOpen },
  { label: 'GitHub', href: 'https://github.com/inkeep/open-knowledge', icon: GithubIcon },
  { label: 'Website', href: 'https://openknowledge.ai/', icon: Globe },
  { label: 'Discord', href: 'https://go.inkeep.com/ok-discord', icon: DiscordIcon },
  { label: 'Twitter', href: 'https://x.com/inkeep', icon: XTwitterIcon },
];

export const HelpPopover: FC = () => {
  const [popoverOpen, setPopoverOpen] = useState(false);

  return (
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
              <span className="sr-only">Resources</span>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Resources</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-64 p-3">
        <p className="font-mono tracking-wide uppercase text-muted-foreground text-xs mb-1">
          Resources
        </p>
        <nav aria-label="Resources">
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
  );
};
