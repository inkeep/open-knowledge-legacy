import { Contrast, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import type { ComponentProps, FC } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const themes: Array<{ value: string; label: string; icon: FC<ComponentProps<'svg'>> }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Contrast },
];

export const ThemeToggle: FC = () => {
  const { theme, setTheme } = useTheme();

  // Trigger icon mirrors the user's explicit choice, not the resolved theme.
  // Showing Contrast when theme === 'system' makes the three-state model visible
  // and mitigates the system→explicit→OS-change mental-model trap (spec D15).
  const TriggerIcon = theme === 'system' ? Contrast : theme === 'dark' ? Moon : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 hover:bg-accent text-muted-foreground"
        >
          <TriggerIcon />
          <span className="sr-only">Toggle theme (current: {theme ?? 'system'})</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
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
