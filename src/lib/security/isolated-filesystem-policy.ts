import { spawn } from "node:child_process";
import path from "node:path";

import { env } from "@/lib/env";

const defaultValidationDeadlineMs = 5_000;
const maximumResponseBytes = 64 * 1024;

type ValidationResponse = { ok: true; canonicalPath: string } | { ok: false; message: string };

export class IsolatedFilesystemPolicyError extends Error {
    constructor(
        message: string,
        public readonly code: "invalid" | "timeout" | "unavailable" = "invalid",
    ) {
        super(message);
        this.name = "IsolatedFilesystemPolicyError";
    }
}

function validationHelperPath() {
    return path.join(process.cwd(), "scripts", "validate-media-directory.mjs");
}

function configuredMediaRoots(rawValue: string = env.APPROVED_MEDIA_ROOTS) {
    return rawValue
        .split(/[;\r\n]+/)
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function parseResponse(stdout: string): ValidationResponse {
    try {
        const parsed = JSON.parse(stdout) as Partial<ValidationResponse>;

        if (parsed.ok === true && typeof parsed.canonicalPath === "string") {
            return { ok: true, canonicalPath: parsed.canonicalPath };
        }

        if (parsed.ok === false && typeof parsed.message === "string") {
            return { ok: false, message: parsed.message };
        }
    } catch {
        // Fall through to a stable public error. Child stderr is intentionally not
        // reflected because paths and runtime details can be sensitive.
    }

    throw new IsolatedFilesystemPolicyError(
        "Nooklet could not validate that library folder.",
        "unavailable",
    );
}

/**
 * Canonicalize and validate an operator-supplied media directory in a child
 * process. Docker Desktop mount calls can enter an uninterruptible kernel
 * wait; abandoning the child at the deadline keeps the web event loop and its
 * libuv pool available even when that happens.
 */
export function resolveApprovedMediaDirectoryIsolated(
    candidate: string,
    configuredRoots: readonly string[] = configuredMediaRoots(),
    deadlineMs = defaultValidationDeadlineMs,
    helperPath = validationHelperPath(),
): Promise<string> {
    const effectiveRoots =
        configuredRoots.length === 0 && env.NODE_ENV === "test"
            ? [path.dirname(candidate)]
            : [...configuredRoots];
    const payload = Buffer.from(
        JSON.stringify({
            candidate,
            configuredRoots: effectiveRoots,
        }),
    ).toString("base64url");

    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [helperPath, payload], {
            stdio: ["ignore", "pipe", "ignore"],
            windowsHide: true,
        });
        const chunks: Buffer[] = [];
        let responseBytes = 0;
        let settled = false;

        const finish = (callback: () => void) => {
            if (settled) {
                return;
            }

            settled = true;
            clearTimeout(deadline);
            child.stdout?.removeAllListeners();
            child.removeAllListeners();
            callback();
        };

        const abandonChild = () => {
            // A Docker Desktop FUSE syscall can remain in an uninterruptible kernel
            // wait even after SIGKILL. Detach the pipe and process handle as well so
            // that abandoned validation cannot retain resources in the web process.
            child.stdout?.destroy();
            child.kill("SIGKILL");
            child.unref();
        };

        const deadline = setTimeout(() => {
            finish(() => {
                abandonChild();
                reject(
                    new IsolatedFilesystemPolicyError(
                        "The library folder did not respond within 5 seconds. Check the drive or mount, then try again.",
                        "timeout",
                    ),
                );
            });
        }, deadlineMs);

        child.once("error", () => {
            finish(() =>
                reject(
                    new IsolatedFilesystemPolicyError(
                        "Nooklet could not start isolated library-folder validation.",
                        "unavailable",
                    ),
                ),
            );
        });

        child.stdout?.on("data", (chunk: Buffer) => {
            responseBytes += chunk.length;

            if (responseBytes > maximumResponseBytes) {
                finish(() => {
                    abandonChild();
                    reject(
                        new IsolatedFilesystemPolicyError(
                            "Nooklet received an invalid library-folder validation response.",
                            "unavailable",
                        ),
                    );
                });

                return;
            }

            chunks.push(chunk);
        });

        child.once("close", () => {
            finish(() => {
                try {
                    const response = parseResponse(Buffer.concat(chunks).toString("utf8"));

                    if (response.ok) {
                        resolve(response.canonicalPath);
                    } else {
                        reject(new IsolatedFilesystemPolicyError(response.message));
                    }
                } catch (error) {
                    reject(error);
                }
            });
        });
    });
}
