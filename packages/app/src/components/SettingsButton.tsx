import { Settings } from 'lucide-react';
import type { FC } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SETTINGS_OPEN_HASH } from '@/lib/use-settings-route';

export const SettingsButton: FC = () => {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 hover:bg-accent text-muted-foreground"
          data-testid="header-settings-button"
          onClick={() => {
            if (window.location.hash !== SETTINGS_OPEN_HASH) {
              window.location.hash = SETTINGS_OPEN_HASH;
            }
          }}
        >
          <Settings className="size-4" />
          <span className="sr-only">Settings</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>Settings</TooltipContent>
    </Tooltip>
  );
};
