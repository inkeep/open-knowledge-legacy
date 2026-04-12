import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import type { ComponentProps, FC } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const themes: Array<{ value: string; label: string; icon: FC<ComponentProps<'svg'>> }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

export const ThemeToggle: FC = () => {
  const { theme, setTheme } = useTheme();

  // Trigger icon mirrors the user's explicit choice, not the resolved theme.
  // Showing Monitor when theme === 'system' makes the three-state model visible
  // and mitigates the system→explicit→OS-change mental-model trap (spec D15).
  const TriggerIcon = theme === 'system' ? Monitor : theme === 'dark' ? Moon : Sun;

  return (
    <DropdownMenuRoot>
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
            <DropdownMenuRadioItem key={value} value={value} className="capitalize gap-4">
              <Icon />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenuRoot>
  );
};
