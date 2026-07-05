"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function SignOutButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="secondary" size="sm" className="w-full" disabled={pending}>
      {pending ? <Spinner /> : null}
      {pending ? "Signing out..." : "Sign out"}
    </Button>
  );
}
