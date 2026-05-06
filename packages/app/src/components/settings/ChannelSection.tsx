import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { type UpdateChannel, useUpdateChannel } from '@/hooks/use-update-channel';

const FLASH_DURATION_MS = 2500;

export function ChannelSection() {
  const { channel, setChannel } = useUpdateChannel();
  const [savedFlash, setSavedFlash] = useState<UpdateChannel | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    },
    [],
  );

  if (channel === null) return null;

  const onSelect = async (raw: string) => {
    if (raw !== 'latest' && raw !== 'beta') return;
    if (raw === channel) return;
    try {
      await setChannel(raw);
      setSavedFlash(raw);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => setSavedFlash(null), FLASH_DURATION_MS);
    } catch (err) {
      toast.error('Couldn’t change update channel.', {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  return (
    <section aria-labelledby="settings-channel-title" className="space-y-3">
      <div className="space-y-1">
        <h2 id="settings-channel-title" className="text-base font-semibold">
          Channel
        </h2>
        <p className="text-sm text-muted-foreground">
          Which update stream this app follows. Beta builds may include in-flight bugs.
        </p>
      </div>
      <RadioGroup
        value={channel}
        onValueChange={onSelect}
        aria-label="Update channel"
        className="gap-2"
        data-testid="settings-channel-radio-group"
      >
        <div className="flex items-start gap-3 rounded-md border p-3">
          <RadioGroupItem
            value="latest"
            id="settings-channel-latest"
            className="mt-0.5"
            data-testid="settings-channel-latest"
          />
          <div className="space-y-0.5">
            <Label htmlFor="settings-channel-latest" className="cursor-pointer text-sm font-medium">
              Stable (recommended)
            </Label>
            <p className="text-xs text-muted-foreground">
              Safe, well-tested releases. Recommended for everyday use.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-md border p-3">
          <RadioGroupItem
            value="beta"
            id="settings-channel-beta"
            className="mt-0.5"
            data-testid="settings-channel-beta"
          />
          <div className="space-y-0.5">
            <Label htmlFor="settings-channel-beta" className="cursor-pointer text-sm font-medium">
              Beta (early access)
            </Label>
            <p className="text-xs text-muted-foreground">
              Early access to in-flight features. May include bugs. New beta builds released as the
              team merges work to main.
            </p>
          </div>
        </div>
      </RadioGroup>
      <p
        role="status"
        aria-live="polite"
        className="min-h-4 text-xs text-emerald-600"
        data-testid="settings-channel-flash"
      >
        {savedFlash
          ? `Channel saved. New version checks will use the ${
              savedFlash === 'beta' ? 'Beta' : 'Stable'
            } channel.`
          : ''}
      </p>
    </section>
  );
}
