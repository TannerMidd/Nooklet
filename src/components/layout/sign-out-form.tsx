import { signOut } from "@/auth";

import { SignOutButton } from "@/components/layout/sign-out-button";

export function SignOutForm() {
  return (
    <form
      action={async () => {
        "use server";

        await signOut({ redirectTo: "/login" });
      }}
    >
      <SignOutButton />
    </form>
  );
}
