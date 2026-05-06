import { useUpdateChannel } from '@/hooks/use-update-channel';
import { Badge } from './ui/badge';

interface BetaBadgeProps {
  readonly className?: string;
}

export function BetaBadge({ className }: BetaBadgeProps) {
  const { channel } = useUpdateChannel();
  if (channel !== 'beta') return null;
  return (
    <Badge
      variant="secondary"
      aria-label="Beta channel"
      data-testid="beta-badge"
      className={className}
    >
      BETA
    </Badge>
  );
}
