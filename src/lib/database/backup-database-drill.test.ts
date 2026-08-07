import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

describe("database backup and restore drill", () => {
    it("creates an integral online backup that retains exact restored content", () => {
        const sandbox = mkdtempSync(path.join(tmpdir(), "nooklet-backup-drill-"));
        const sourcePath = path.join(sandbox, "source.db");
        const backupPath = path.join(sandbox, "backup.db");
        const restoredPath = path.join(sandbox, "restored.db");
        const source = new Database(sourcePath);

        try {
            source.pragma("journal_mode = WAL");
            source.exec(`
        CREATE TABLE restore_probe (
          id INTEGER PRIMARY KEY,
          label TEXT NOT NULL,
          payload BLOB NOT NULL
        );
      `);
            source
                .prepare(
                    `
        INSERT INTO restore_probe (id, label, payload) VALUES (?, ?, ?)
      `,
                )
                .run(1, "Backup drill — exact Unicode ✓", Buffer.from([0, 1, 2, 254, 255]));
            source
                .prepare(
                    `
        INSERT INTO restore_probe (id, label, payload) VALUES (?, ?, ?)
      `,
                )
                .run(2, "second row", Buffer.from("durable-content", "utf8"));

            // Keep the WAL-mode source connection open while exercising the real
            // backup CLI so the drill covers SQLite's online backup behavior.
            const result = spawnSync(
                process.execPath,
                [path.join(process.cwd(), "scripts", "backup-database.mjs"), backupPath],
                {
                    cwd: process.cwd(),
                    encoding: "utf8",
                    env: {
                        ...process.env,
                        DATABASE_URL: `file:${sourcePath}`,
                    },
                },
            );

            expect(result.status, result.stderr || result.stdout).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toContain("Verified database backup created at");

            copyFileSync(backupPath, restoredPath);
            const restored = new Database(restoredPath, { readonly: true, fileMustExist: true });

            try {
                expect(restored.pragma("quick_check", { simple: true })).toBe("ok");
                expect(restored.pragma("integrity_check", { simple: true })).toBe("ok");
                expect(
                    restored
                        .prepare(
                            `
          SELECT id, label, hex(payload) AS payload_hex
          FROM restore_probe
          ORDER BY id
        `,
                        )
                        .all(),
                ).toEqual([
                    {
                        id: 1,
                        label: "Backup drill — exact Unicode ✓",
                        payload_hex: "000102FEFF",
                    },
                    {
                        id: 2,
                        label: "second row",
                        payload_hex: Buffer.from("durable-content", "utf8")
                            .toString("hex")
                            .toUpperCase(),
                    },
                ]);
            } finally {
                restored.close();
            }
        } finally {
            source.close();
            rmSync(sandbox, { recursive: true, force: true });
        }
    });
});
