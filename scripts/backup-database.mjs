import { chmodSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

function databasePathFromEnvironment() {
    const configured = process.env.DATABASE_URL?.trim() || "file:./data/nooklet.db";
    const value = configured.startsWith("file:") ? configured.slice(5) : configured;

    if (!value || value === ":memory:") {
        throw new Error("DATABASE_URL must point to an on-disk SQLite database.");
    }

    return path.resolve(value);
}

function defaultDestination() {
    const timestamp = new Date().toISOString().replaceAll(":", "-");

    return path.resolve("backups", `nooklet-${timestamp}.db`);
}

function assertHealthy(database, label) {
    const result = database.pragma("quick_check", { simple: true });

    if (result !== "ok") {
        throw new Error(`${label} failed SQLite quick_check: ${String(result)}`);
    }
}

async function main() {
    const sourcePath = databasePathFromEnvironment();
    const destinationPath = path.resolve(process.argv[2] || defaultDestination());

    if (sourcePath === destinationPath) {
        throw new Error("The backup destination must differ from DATABASE_URL.");
    }

    if (!existsSync(sourcePath)) {
        throw new Error(`Database does not exist: ${sourcePath}`);
    }

    if (existsSync(destinationPath)) {
        throw new Error(`Refusing to overwrite an existing backup: ${destinationPath}`);
    }

    mkdirSync(path.dirname(destinationPath), { recursive: true });
    const temporaryPath = path.join(
        path.dirname(destinationPath),
        `.${path.basename(destinationPath)}.partial-${process.pid}-${Date.now()}`,
    );

    let source;
    let backup;

    try {
        source = new Database(sourcePath, { readonly: true, fileMustExist: true });
        assertHealthy(source, "Source database");
        await source.backup(temporaryPath);

        backup = new Database(temporaryPath, { readonly: true, fileMustExist: true });
        assertHealthy(backup, "Backup");
        backup.close();
        backup = undefined;
        source.close();
        source = undefined;

        // Backups can contain password hashes and encrypted integration secrets.
        // Restrict their mode on platforms that implement POSIX permissions.
        chmodSync(temporaryPath, 0o600);
        renameSync(temporaryPath, destinationPath);
        console.log(`Verified database backup created at ${destinationPath}`);
    } catch (error) {
        backup?.close();
        source?.close();
        rmSync(temporaryPath, { force: true });

        throw error;
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
