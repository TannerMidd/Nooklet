import { type LoginInput } from "@/modules/identity-access/schemas/login";
import {
    hashPassword,
    passwordHashNeedsUpgrade,
    verifyPassword,
} from "@/modules/users/password-hasher";
import {
    clearFailedLogins,
    findUserByEmail,
    recordFailedLogin,
    updateUserPassword,
} from "@/modules/users/public";

const dummyPasswordHash = `scrypt$2$32768$8$3$${"0".repeat(32)}$${"0".repeat(128)}`;

export async function authenticateWithPassword(input: LoginInput) {
    const user = await findUserByEmail(input.email);

    if (!user || user.isDisabled) {
        await verifyPassword(input.password, dummyPasswordHash);

        return null;
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
        await verifyPassword(input.password, dummyPasswordHash);

        return null;
    }

    if (!(await verifyPassword(input.password, user.passwordHash))) {
        // The bounded account/source rate limiter handles online abuse. Recording
        // failures without hard-locking prevents unauthenticated account-lockout DoS.
        await recordFailedLogin(user.id);

        return null;
    }

    let authenticatedUser = user;

    if (passwordHashNeedsUpgrade(user.passwordHash)) {
        const upgraded = await updateUserPassword(user.id, await hashPassword(input.password));

        if (upgraded) {
            authenticatedUser = upgraded;
        }
    } else if ((user.failedLoginAttempts ?? 0) > 0 || user.lockedUntil) {
        await clearFailedLogins(user.id);
    }

    return {
        id: authenticatedUser.id,
        email: authenticatedUser.email,
        displayName: authenticatedUser.displayName,
        role: authenticatedUser.role,
        mustChangePassword: authenticatedUser.mustChangePassword,
        passwordChangedAt: authenticatedUser.passwordChangedAt.getTime(),
        authGeneration: authenticatedUser.authGeneration,
    };
}
