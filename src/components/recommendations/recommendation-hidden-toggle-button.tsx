"use client";

import { Eye, EyeOff } from "lucide-react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function RecommendationHiddenToggleButton({
  isHidden,
  label,
}: {
  isHidden: boolean;
  label: string;
}) {
  const { pending } = useFormStatus();
  const HiddenIcon = isHidden ? Eye : EyeOff;

  return (
    <Button
      type="submit"
      variant="secondary"
      size="icon"
      className="h-8 min-h-8 w-8 rounded-full"
      disabled={pending}
      aria-label={label}
      title={label}
    >
      {pending ? <Spinner /> : <HiddenIcon aria-hidden="true" className="h-4 w-4" />}
    </Button>
  );
}
