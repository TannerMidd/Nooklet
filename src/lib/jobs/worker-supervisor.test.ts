import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const temporaryDirectories: string[] = [];
const childProcesses: ReturnType<typeof spawn>[] = [];

afterEach(async () => {
    for (const child of childProcesses.splice(0)) {
        if (child.exitCode === null && child.signalCode === null) {
            const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));

            child.kill("SIGTERM");
            await closed;
        }
    }

    for (const directory of temporaryDirectories.splice(0)) {
        rmSync(directory, { recursive: true, force: true });
    }
});

describe("supported split runtime", () => {
    it("starts the durable worker and an immediate disposable storage probe", async () => {
        const directory = mkdtempSync(path.join(tmpdir(), "nooklet-worker-supervisor-"));

        temporaryDirectories.push(directory);
        const workerEntry = path.join(directory, "worker.mjs");

        writeFileSync(
            workerEntry,
            [
                "if (process.argv.includes('--migrate-only')) { console.log('fixture-migrated'); process.exit(0); }",
                "if (process.argv.includes('--refresh-storage-snapshots')) { console.log('fixture-storage-probe'); process.exit(0); }",
                "console.log('fixture-worker-started');",
                "setInterval(() => {}, 1000);",
            ].join("\n"),
            "utf8",
        );

        const supervisorPath = path.resolve(process.cwd(), "scripts", "worker-supervisor.mjs");
        const supervisor = spawn(process.execPath, [supervisorPath], {
            cwd: directory,
            env: {
                ...process.env,
                NOOKLET_WORKER_ENTRY: workerEntry,
                NOOKLET_WORKER_HEARTBEAT_PATH: path.join(directory, "worker-heartbeat.json"),
            },
            stdio: ["ignore", "pipe", "pipe"],
        });

        childProcesses.push(supervisor);
        let output = "";

        supervisor.stdout?.on("data", (chunk) => {
            output += chunk.toString();
        });
        supervisor.stderr?.on("data", (chunk) => {
            output += chunk.toString();
        });

        await vi.waitFor(
            () => {
                expect(output).toContain("fixture-migrated");
                expect(output).toContain("fixture-worker-started");
                expect(output).toContain("fixture-storage-probe");
            },
            { timeout: 8_000, interval: 50 },
        );

        expect(supervisor.exitCode).toBeNull();
        supervisor.kill("SIGTERM");
        await new Promise<void>((resolve) => supervisor.once("close", () => resolve()));
    });

    it("reports a stale heartbeat without terminating a working child", async () => {
        const directory = mkdtempSync(path.join(tmpdir(), "nooklet-worker-stale-"));

        temporaryDirectories.push(directory);
        const workerEntry = path.join(directory, "worker.mjs");
        const heartbeatPath = path.join(directory, "worker-heartbeat.json");

        writeFileSync(
            workerEntry,
            [
                "import { writeFileSync } from 'node:fs';",
                "if (process.argv.includes('--migrate-only') || process.argv.includes('--refresh-storage-snapshots')) process.exit(0);",
                "writeFileSync(process.env.NOOKLET_WORKER_HEARTBEAT_PATH, JSON.stringify({ version: 1, recordedAt: new Date(Date.now() - 120000).toISOString() }));",
                "console.log(`fixture-stale-worker-started-${process.pid}`);",
                "setInterval(() => {}, 1000);",
            ].join("\n"),
            "utf8",
        );

        const supervisorPath = path.resolve(process.cwd(), "scripts", "worker-supervisor.mjs");
        const supervisor = spawn(process.execPath, [supervisorPath], {
            cwd: directory,
            env: {
                ...process.env,
                NOOKLET_WORKER_ENTRY: workerEntry,
                NOOKLET_WORKER_HEARTBEAT_PATH: heartbeatPath,
                NOOKLET_WORKER_STALE_AFTER_MS: "60000",
            },
            stdio: ["ignore", "pipe", "pipe"],
        });

        childProcesses.push(supervisor);
        let output = "";

        supervisor.stdout?.on("data", (chunk) => {
            output += chunk.toString();
        });
        supervisor.stderr?.on("data", (chunk) => {
            output += chunk.toString();
        });

        await vi.waitFor(
            () => expect(output).toContain('"event":"worker_supervisor_worker_stale"'),
            { timeout: 8_000, interval: 50 },
        );
        await new Promise((resolve) => setTimeout(resolve, 1_500));

        expect(output.match(/fixture-stale-worker-started-/g)).toHaveLength(1);
        expect(output).not.toContain("background worker exited");
        expect(supervisor.exitCode).toBeNull();

        supervisor.kill("SIGTERM");
        await new Promise<void>((resolve) => supervisor.once("close", () => resolve()));
    }, 10_000);

    it("wires development and native scripts through their supervisors", () => {
        const packageJson = JSON.parse(
            readFileSync(path.resolve(process.cwd(), "package.json"), "utf8"),
        ) as { scripts: Record<string, string> };

        expect(packageJson.scripts.dev).toBe("node scripts/development-supervisor.mjs");
        expect(packageJson.scripts["start:web"]).toBe("next start");
        expect(packageJson.scripts["start:worker"]).toBe("node scripts/worker-supervisor.mjs");
    });
});
