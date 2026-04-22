import { BookOpen, CircleHelp, Globe } from 'lucide-react';
import type { ComponentProps, FC } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
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
  return (
    <Popover>
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
      <PopoverContent align="end" className="w-56 p-3">
        <p className="text-sm font-medium mb-2">Need help?</p>
        <nav aria-label="Help and resources">
          <ul className="space-y-0.5">
            {links.map(({ label, href, icon: Icon }) => (
              <li key={href}>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
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
