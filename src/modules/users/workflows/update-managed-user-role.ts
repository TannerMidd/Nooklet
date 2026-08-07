import {
    createAuditEvent,
    updateUserRoleGuarded,
} from "@/modules/users/repositories/user-repository";
import { type UpdateManagedUserRoleInput } from "@/modules/users/schemas/admin-user";

type UpdateManagedUserRoleResult = { ok: true; message: string } | { ok: false; message: string };

export async function updateManagedUserRole(
    actorUserId: string,
    input: UpdateManagedUserRoleInput,
): Promise<UpdateManagedUserRoleResult> {
    const update = await updateUserRoleGuarded(actorUserId, input.userId, input.role);

    if (update.status === "not_found") {
        return {
            ok: false,
            message: "User not found.",
        };
    }

    if (update.status === "self_update") {
        return {
            ok: false,
            message: "Use a different admin account to change your own role.",
        };
    }

    if (update.status === "actor_not_authorized") {
        return {
            ok: false,
            message: "Your administrator session is no longer active.",
        };
    }

    if (update.status === "unchanged") {
        return {
            ok: true,
            message: "Role already matches the requested value.",
        };
    }

    if (update.status === "last_active_admin") {
        return {
            ok: false,
            message: "Keep at least one active admin account.",
        };
    }

    if (update.status !== "updated") {
        return { ok: false, message: "The user role could not be updated." };
    }

    const updatedUser = update.user;

    await createAuditEvent({
        actorUserId,
        eventType: "users.role-updated",
        subjectType: "user",
        subjectId: updatedUser.id,
        payloadJson: JSON.stringify({
            previousRole: update.previousUser.role,
            nextRole: updatedUser.role,
        }),
    });

    return {
        ok: true,
        message: `${updatedUser.displayName} is now ${updatedUser.role}.`,
    };
}
