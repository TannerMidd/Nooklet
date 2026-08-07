import { spawn } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import process from "node:process";

const workspaceRoot = process.cwd();
const temporaryRoot = path.join(workspaceRoot, ".codex-tmp", `e2e-${process.pid}`);
const databasePath = path.join(temporaryRoot, "nooklet.db");
const completionPath = path.join(temporaryRoot, "playwright-completion.json");
const nextCli = path.join(workspaceRoot, "node_modules", "next", "dist", "bin", "next");
const playwrightCli = path.join(workspaceRoot, "node_modules", "@playwright", "test", "cli.js");

function reservePort() {
    return new Promise((resolve, reject) => {
        const socket = net.createServer();

        socket.unref();
        socket.once("error", reject);
        socket.listen(0, "127.0.0.1", () => {
            const address = socket.address();

            if (!address || typeof address === "string") {
                socket.close();
                reject(new Error("Could not reserve an E2E server port."));

                return;
            }

            socket.close((error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(address.port);
                }
            });
        });
    });
}

function waitForExit(child) {
    if (child.exitCode !== null || child.signalCode !== null) {
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        child.once("exit", resolve);
        child.once("error", resolve);
    });
}

async function waitForServer(url, child, timeoutMs = 120_000) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        if (child.exitCode !== null || child.signalCode !== null) {
            throw new Error(
                `The E2E web server exited before it became ready (code ${child.exitCode ?? child.signalCode}).`,
            );
        }

        try {
            const response = await fetch(url, {
                redirect: "manual",
                signal: AbortSignal.timeout(2_000),
            });

            if (response.status >= 200 && response.status < 500) {
                return;
            }
        } catch {
            // The development server is still compiling or has not bound its port.
        }

        await new Promise((resolve) => setTimeout(resolve, 250));
    }

    throw new Error(`The E2E web server was not ready after ${timeoutMs / 1_000} seconds.`);
}

async function waitForTestResult(child, timeoutMs = 600_000) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        try {
            const result = JSON.parse(await readFile(completionPath, "utf8"));

            if (typeof result.status === "string") {
                return result.status;
            }
        } catch (error) {
            if (!(
                error &&
                typeof error === "object" &&
                "code" in error &&
                error.code === "ENOENT"
            )) {
                throw error;
            }
        }

        if (child.exitCode !== null || child.signalCode !== null) {
            if (child.exitCode !== 0) {
                return "failed";
            }

            throw new Error("The E2E test runner exited without reporting its final result.");
        }

        await new Promise((resolve) => setTimeout(resolve, 100));
    }

    throw new Error(`The E2E test runner did not finish after ${timeoutMs / 1_000} seconds.`);
}

async function stopProcessTree(child) {
    if (!child || child.exitCode !== null || child.signalCode !== null) {
        return;
    }

    if (process.platform === "win32") {
        // Prefer the full tree. If a constrained environment blocks taskkill,
        // still terminate the direct child and let bounded cleanup report any
        // descendant that failed to exit with Playwright.
        const taskkill = spawn("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], {
            stdio: "ignore",
            windowsHide: true,
        });

        await Promise.race([
            waitForExit(taskkill),
            new Promise((resolve) => setTimeout(resolve, 5_000)),
        ]);

        if (child.exitCode === null && child.signalCode === null) {
            child.kill("SIGKILL");
        }

        await Promise.race([
            waitForExit(child),
            new Promise((resolve) => setTimeout(resolve, 5_000)),
        ]);

        return;
    }

    try {
        process.kill(-child.pid, "SIGTERM");
    } catch {
        child.kill("SIGTERM");
    }

    await Promise.race([waitForExit(child), new Promise((resolve) => setTimeout(resolve, 5_000))]);

    if (child.exitCode === null && child.signalCode === null) {
        try {
            process.kill(-child.pid, "SIGKILL");
        } catch {
            child.kill("SIGKILL");
        }

        await waitForExit(child);
    }
}

let webServer;
let testRunner;
let stopping = false;

async function stopChildren() {
    if (stopping) {
        return;
    }

    stopping = true;
    await stopProcessTree(testRunner);
    await stopProcessTree(webServer);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, async () => {
        await stopChildren();
        process.exitCode = 1;
    });
}

let exitCode = 1;

try {
    await mkdir(temporaryRoot, { recursive: true });
    const port = await reservePort();
    const baseURL = `http://127.0.0.1:${port}`;
    const serverEnvironment = {
        ...process.env,
        APP_URL: baseURL,
        DATABASE_URL: `file:${databasePath}`,
        AUTH_SECRET: "e2e-auth-secret-generated-only-for-tests-0000000000001",
        SECRET_BOX_KEY: "e2e-box-secret-generated-only-for-tests-00000000000002",
        BOOTSTRAP_TOKEN: "e2e-bootstrap-token-generated-only-for-tests-0000003",
        OPERATIONAL_RETENTION_DAYS: "365",
    };

    webServer = spawn(
        process.execPath,
        [nextCli, "dev", "--hostname", "127.0.0.1", "--port", String(port)],
        {
            cwd: workspaceRoot,
            env: serverEnvironment,
            stdio: "inherit",
            detached: process.platform !== "win32",
            windowsHide: true,
        },
    );

    await waitForServer(`${baseURL}/bootstrap`, webServer);

    testRunner = spawn(process.execPath, [playwrightCli, "test", ...process.argv.slice(2)], {
        cwd: workspaceRoot,
        env: {
            ...serverEnvironment,
            NOOKLET_E2E_BASE_URL: baseURL,
            NOOKLET_E2E_COMPLETION_FILE: completionPath,
            NOOKLET_E2E_EXTERNAL_SERVER: "1",
        },
        stdio: "inherit",
        detached: process.platform !== "win32",
        windowsHide: true,
    });

    const status = await waitForTestResult(testRunner);

    // `onEnd` is authoritative once emitted even if Playwright keeps a browser or
    // reporter alive. A concrete nonzero exit still overrides it; otherwise the
    // process-tree cleanup in `finally` terminates a runner that outlives this grace.
    await Promise.race([
        waitForExit(testRunner),
        new Promise((resolve) => setTimeout(resolve, 2_000)),
    ]);
    const runnerExitedWithFailure =
        (testRunner.exitCode !== null && testRunner.exitCode !== 0) ||
        testRunner.signalCode !== null;

    exitCode = status === "passed" && !runnerExitedWithFailure ? 0 : 1;
} catch (error) {
    console.error(error instanceof Error ? error.message : error);
} finally {
    await stopChildren();
    await rm(temporaryRoot, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 250,
    });
}

process.exitCode = exitCode;
