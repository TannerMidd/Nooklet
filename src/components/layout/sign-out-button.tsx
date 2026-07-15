"use client";

import { LogOut } from "lucide-react";
import { useFormStatus } from "react-dom";

import { Spinner } from "@/components/ui/spinner";

export function SignOutButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      title="Sign out"
      aria-label="Sign out"
      disabled={pending}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-cream/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-55"
    >
      {pending ? <Spinner className="h-3.5 w-3.5" /> : <LogOut aria-hidden="true" className="h-3.5 w-3.5" />}
    </button>
  );
}
