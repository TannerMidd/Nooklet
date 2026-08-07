import { randomBytes, randomUUID, scrypt } from "node:crypto";
import path from "node:path";
import { promisify } from "node:util";

import Database from "better-sqlite3";

const deriveKey = promisify(scrypt);

function databasePathFromEnvironment() {
    const configured = process.env.DATABASE_URL?.trim() || "file:./data/nooklet.db";
    const value = configured.startsWith("file:") ? configured.slice(5) : configured;

    if (!value || value === ":memory:") {
        throw new Error("DATABASE_URL must point to an on-disk SQLite database.");
    }

    return path.resolve(value);
}

function requestedEmail() {
    const index = process.argv.indexOf("--email");
    const value = index >= 0 ? process.argv[index + 1]?.trim().toLowerCase() : "";

    if (index >= 0 && !value) {
        throw new Error("Pass an email after --email.");
    }

    return value || null;
}

async function hashPassword(password) {
    const salt = randomBytes(16).toString("hex");
    const key = await deriveKey(password, salt, 64, {
        N: 2 ** 15,
        r: 8,
        p: 3,
        maxmem: 64 * 1024 * 1024,
    });

    return ["scrypt", "2", 2 ** 15, 8, 3, salt, Buffer.from(key).toString("hex")].join("$");
}

async function main() {
    const databasePath = databasePathFromEnvironment();
    const database = new Database(databasePath, { fileMustExist: true });

    try {
        database.pragma("busy_timeout = 5000");
        const columns = database.prepare("PRAGMA table_info('users')").all();
        const hasAuthSessions = database
            .prepare(
                `
      SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'auth_sessions'
    `,
            )
            .get();

        if (!columns.some((column) => column.name === "auth_generation") || !hasAuthSessions) {
            throw new Error(
                "Database schema is outdated. Start the current Nooklet version once to apply migration 0044, then retry account recovery.",
            );
        }

        if (!columns.some((column) => column.name === "must_change_password")) {
            database.exec(
                "ALTER TABLE users ADD must_change_password integer DEFAULT false NOT NULL;",
            );
        }

        const email = requestedEmail();
        const user = email
            ? database
                  .prepare(
                      "SELECT id, email, display_name AS displayName FROM users WHERE lower(email) = ?",
                  )
                  .get(email)
            : (() => {
                  const admins = database
                      .prepare(
                          "SELECT id, email, display_name AS displayName FROM users WHERE role = 'admin' AND is_disabled = 0",
                      )
                      .all();

                  if (admins.length !== 1) {
                      throw new Error(
                          "More than one active administrator exists. Re-run with --email <account-email>.",
                      );
                  }

                  return admins[0];
              })();

        if (!user) {
            throw new Error(`No Nooklet account matches ${email}.`);
        }

        const temporaryPassword = `${randomBytes(18).toString("base64url")}Aa1!`;
        const passwordHash = await hashPassword(temporaryPassword);
        const now = Date.now();

        database.transaction(() => {
            database
                .prepare(
                    `
        UPDATE users
        SET password_hash = ?, password_changed_at = ?, must_change_password = 1,
            auth_generation = auth_generation + 1,
            failed_login_attempts = 0, locked_until = NULL, updated_at = ?
        WHERE id = ?
      `,
                )
                .run(passwordHash, now, now, user.id);
            database.prepare("DELETE FROM auth_sessions WHERE user_id = ?").run(user.id);
            database
                .prepare(
                    `
        INSERT INTO audit_events (id, actor_user_id, event_type, subject_type, subject_id, payload_json)
        VALUES (?, NULL, 'users.password.recovered', 'user', ?, ?)
      `,
                )
                .run(randomUUID(), user.id, JSON.stringify({ recoveryMethod: "local-cli" }));
        })();

        console.log(`Temporary password created for ${user.displayName} <${user.email}>:`);
        console.log(temporaryPassword);
        console.log("Sign in once, then Nooklet will require a private replacement password.");
    } finally {
        database.close();
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
