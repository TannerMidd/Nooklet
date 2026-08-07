import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const temporaryDirectories: string[] = [];
const childProcesses: ReturnType<typeof spawn>[] = [];

afterEach(async () => {
    for (const child of childProcesses.splice(0)) {
        if (child.exitCode === null && child.signalCode === null) {
            child.kill("SIGTERM");
        }
    }

    for (const directory of temporaryDirectories.splice(0)) {
        rmSync(directory, { recursive: true, force: true });
    }
});

describe("container supervisor", () => {
    it("keeps the web process alive and restarts a failed worker", async () => {
        const directory = mkdtempSync(path.join(tmpdir(), "nooklet-supervisor-"));

        temporaryDirectories.push(directory);
        const webEntry = path.join(directory, "web.mjs");
        const workerEntry = path.join(directory, "worker.mjs");
        const heartbeatPath = path.join(directory, "worker-heartbeat.json");

        writeFileSync(
            path.join(directory, ".env"),
            "SUPERVISOR_FILE_ENV=loaded\nSUPERVISOR_PRECEDENCE=file\n",
            "utf8",
        );
        writeFileSync(
            webEntry,
            "console.log('fixture-web-ready'); setInterval(() => {}, 1000);\n",
            "utf8",
        );
        writeFileSync(
            workerEntry,
            [
                "if (process.argv.includes('--migrate-only')) { console.log(`fixture-env-${process.env.SUPERVISOR_FILE_ENV}-${process.env.SUPERVISOR_PRECEDENCE}-${process.env.NODE_ENV}`); process.exit(0); }",
                "if (process.argv.includes('--refresh-storage-snapshots')) { console.log('fixture-storage-probe'); process.exit(0); }",
                "console.log('fixture-worker-started');",
                "process.exit(7);",
            ].join("\n"),
            "utf8",
        );

        const supervisorPath = path.resolve(process.cwd(), "scripts", "container-supervisor.mjs");
        const supervisor = spawn(process.execPath, [supervisorPath], {
            cwd: directory,
            env: {
                ...process.env,
                NODE_ENV: "development",
                NOOKLET_WEB_ENTRY: webEntry,
                NOOKLET_WORKER_ENTRY: workerEntry,
                NOOKLET_WORKER_HEARTBEAT_PATH: heartbeatPath,
                SUPERVISOR_PRECEDENCE: "service",
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
                expect(output).toContain("fixture-web-ready");
                expect(output).toContain("fixture-worker-started");
                expect(output).toContain("fixture-storage-probe");
                expect(output).toContain("fixture-env-loaded-service-production");
                expect(output).toContain("background worker exited (7); restarting in 1000ms");
            },
            { timeout: 8_000, interval: 50 },
        );

        expect(supervisor.exitCode).toBeNull();
        supervisor.kill("SIGTERM");
        await new Promise<void>((resolve) => supervisor.once("close", () => resolve()));
    });
});
