import { humanFormat } from '@inkeep/open-knowledge-core';
import { Contrast, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import type { ComponentProps, FC } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useConfigContext } from '@/lib/config-provider';

const themes: Array<{
  value: 'light' | 'dark' | 'system';
  label: string;
  icon: FC<ComponentProps<'svg'>>;
}> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Contrast },
];

export const ThemeToggle: FC = () => {
  const { theme: nextThemesTheme } = useTheme();
  const { merged, userBinding } = useConfigContext();

  const configTheme = merged?.appearance?.theme;
  const current = configTheme ?? nextThemesTheme ?? 'system';

  const handleChange = (raw: string): void => {
    if (raw !== 'light' && raw !== 'dark' && raw !== 'system') return;
    if (!userBinding) return; // bindings haven't synced yet — drop the click
    const result = userBinding.patch({ appearance: { theme: raw } });
    if (!result.ok) {
      toast.error(humanFormat(result.error));
    }
  };

  const TriggerIcon = current === 'system' ? Contrast : current === 'dark' ? Moon : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 hover:bg-accent text-muted-foreground"
        >
          <TriggerIcon />
          <span className="sr-only">Toggle theme (current: {current})</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={current} onValueChange={handleChange}>
          {themes.map(({ value, label, icon: Icon }) => (
            <DropdownMenuRadioItem key={value} value={value} className="capitalize">
              <Icon className="text-muted-foreground" />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
