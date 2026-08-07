import { type UserRole } from "@/lib/database/schema";

export type ManagedUserConfirmation = {
    title: string;
    description: string;
    confirmLabel: string;
    tone: "danger" | "warning";
};

export function roleChangeConfirmation(
    displayName: string,
    currentRole: UserRole,
    nextRole: UserRole,
): ManagedUserConfirmation | null {
    if (currentRole === nextRole) {
        return null;
    }

    if (nextRole === "admin") {
        return {
            title: `Make ${displayName} an administrator?`,
            description:
                "Administrators can change shared connections, indexers, storage, users, and other instance-wide settings.",
            confirmLabel: "Grant administrator access",
            tone: "warning",
        };
    }

    return {
        title: `Remove administrator access from ${displayName}?`,
        description:
            "This account will keep personal access and request permissions, but will no longer be able to manage the Nooklet instance.",
        confirmLabel: "Change role to user",
        tone: "danger",
    };
}

export function statusChangeConfirmation(
    displayName: string,
    willDisable: boolean,
): ManagedUserConfirmation {
    return willDisable
        ? {
              title: `Disable ${displayName}?`,
              description:
                  "The account will be unable to sign in. Existing sessions stop working when they are next validated; owned data is kept.",
              confirmLabel: "Disable account",
              tone: "danger",
          }
        : {
              title: `Re-enable ${displayName}?`,
              description:
                  "The account will be allowed to sign in again with its current password and role.",
              confirmLabel: "Re-enable account",
              tone: "warning",
          };
}

export function passwordResetConfirmation(displayName: string): ManagedUserConfirmation {
    return {
        title: `Reset ${displayName}'s password?`,
        description:
            "The temporary password takes effect immediately, invalidates older sessions, and must be replaced by the account owner at the next sign-in. It will not be shown again.",
        confirmLabel: "Reset password",
        tone: "warning",
    };
}
