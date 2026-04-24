import { signOut } from "@/auth";

import { Button } from "@/components/ui/button";

export function SignOutForm() {
  return (
    <form
      action={async () => {
        "use server";

        await signOut({ redirectTo: "/login" });
      }}
    >
      <Button type="submit" variant="secondary" className="w-full">
        Sign out
      </Button>
    </form>
  );
}
