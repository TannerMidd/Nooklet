import { submitSignOutAction } from "@/components/layout/sign-out-actions";
import { SignOutButton } from "@/components/layout/sign-out-button";

export function SignOutForm() {
  return (
    <form action={submitSignOutAction}>
      <SignOutButton />
    </form>
  );
}
