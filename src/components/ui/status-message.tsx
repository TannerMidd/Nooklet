import { cn } from "@/lib/utils";

type StatusMessageProps = {
  status: "idle" | "success" | "error";
  message: string | null;
  className?: string;
};

/**
 * Compact status feedback line for form actions. Renders nothing while idle
 * or when there is no message.
 */
export function StatusMessage({ status, message, className }: StatusMessageProps) {
  if (status === "idle" || !message) {
    return null;
  }

  return (
    <p
      role={status === "error" ? "alert" : undefined}
      className={cn(
        "text-sm leading-6",
        status === "success" ? "text-accent-cool" : "text-accent-wine",
        className,
      )}
    >
      {message}
    </p>
  );
}
