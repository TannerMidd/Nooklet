import { Eye, EyeOff } from "lucide-react";

import { cn } from "@/lib/utils";

type MonitoringStatusIconProps = {
  monitored: boolean;
  className?: string;
};

export function MonitoringStatusIcon({ monitored, className }: MonitoringStatusIconProps) {
  const Icon = monitored ? Eye : EyeOff;
  const label = monitored ? "Monitored" : "Unmonitored";

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
        monitored
          ? "border-accent-cool/35 bg-accent-cool/10 text-accent-cool"
          : "border-line/60 bg-background/20 text-muted",
        className,
      )}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
    </span>
  );
}