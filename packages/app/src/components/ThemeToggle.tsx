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
import { useConfigContext } from '@/lib/config-provider';

const themes: Array<{ value: 'light' | 'dark' | 'system'; label: string; icon: FC<ComponentProps<'svg'>> }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Contrast },
];

/**
 * Chrome theme toggle — read from merged config, write through to the
 * user-binding (per D55 / FR-40 unified path: all theme writes flow
 * through `userBinding.patch()` so localStorage stays a derived cache).
 *
 * Falls back to next-themes' `theme` for the trigger icon when the
 * config bindings haven't synced yet (cold-mount, ~100-300ms). The
 * ConfigProvider's bridge to next-themes ensures the displayed theme
 * mirrors the merged config the moment the bindings sync.
 */
export const ThemeToggle: FC = () => {
  const { theme: nextThemesTheme } = useTheme();
  const { merged, userBinding } = useConfigContext();

  // Prefer config value; fall back to next-themes during cold-mount.
  // `merged.appearance?.theme` may be undefined when the user has never
  // set the field — show next-themes' value (which is 'system' by default)
  // in that case so the dropdown isn't blank.
  const configTheme = merged?.appearance?.theme;
  const current = configTheme ?? nextThemesTheme ?? 'system';

  const handleChange = (raw: string): void => {
    if (raw !== 'light' && raw !== 'dark' && raw !== 'system') return;
    if (!userBinding) return; // bindings haven't synced yet — drop the click
    userBinding.patch({ appearance: { theme: raw } });
    // No setTheme() call — ConfigProvider's bridge will fire setTheme on
    // the resulting Y.Text observer event, keeping a single source of truth.
  };

  // Trigger icon mirrors the user's explicit choice, not the resolved theme.
  // Showing Contrast when current === 'system' makes the three-state model
  // visible and mitigates the system→explicit→OS-change mental-model trap
  // (spec D15).
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
