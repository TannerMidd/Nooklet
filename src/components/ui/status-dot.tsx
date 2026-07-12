import { cn } from "@/lib/utils";

type StatusDotTone = "ok" | "active" | "error" | "neutral";

const toneText = {
  ok: "text-accent-cool",
  active: "text-accent",
  error: "text-accent-wine",
  neutral: "text-muted",
} satisfies Record<StatusDotTone, string>;

const toneDot = {
  ok: "bg-accent-cool",
  active: "bg-accent",
  error: "bg-accent-wine",
  neutral: "bg-muted",
} satisfies Record<StatusDotTone, string>;

type StatusDotProps = {
  tone: StatusDotTone;
  label: string;
  className?: string;
};

/**
 * Redesign status pattern: a 6px colored dot followed by small semibold text.
 * Teal = healthy/verified, amber = active/in-flight, wine = failed, muted = neutral.
 */
export function StatusDot({ tone, label, className }: StatusDotProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-semibold",
        toneText[tone],
        className,
      )}
    >
      <span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-full", toneDot[tone])} />
      {label}
    </span>
  );
}
