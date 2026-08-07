import fs from "node:fs";
import path from "node:path";

function fail(message) {
    process.stdout.write(JSON.stringify({ ok: false, message }));
    process.exitCode = 1;
}

function rejectNetworkOrDevicePath(candidate) {
    const normalized = candidate.replaceAll("/", "\\");

    if (
        normalized.startsWith("\\\\") ||
        normalized.startsWith("\\?\\") ||
        normalized.startsWith("\\.\\")
    ) {
        throw new Error("Network shares and device paths are not allowed as media roots.");
    }
}

function canonicalDirectory(candidate) {
    rejectNetworkOrDevicePath(candidate);

    let canonical;

    try {
        canonical = fs.realpathSync.native(candidate);
    } catch {
        throw new Error("Library folder does not exist or is not readable by Nooklet.");
    }

    let stats;

    try {
        stats = fs.statSync(canonical);
    } catch {
        throw new Error("Library folder does not exist or is not readable by Nooklet.");
    }

    if (!stats.isDirectory()) {
        throw new Error("Library path must resolve to a directory.");
    }

    return canonical;
}

function normalizedForComparison(value) {
    const resolved = path.resolve(value);

    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isContained(root, candidate) {
    const relative = path.relative(
        normalizedForComparison(root),
        normalizedForComparison(candidate),
    );

    return (
        relative === "" ||
        (relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative))
    );
}

function validate(input) {
    const canonical = canonicalDirectory(input.candidate);

    if (!Array.isArray(input.configuredRoots) || input.configuredRoots.length === 0) {
        throw new Error(
            "No approved media roots are configured. Set APPROVED_MEDIA_ROOTS on the server.",
        );
    }

    const approved = input.configuredRoots.map((root) => {
        const canonicalRoot = canonicalDirectory(root);

        if (
            normalizedForComparison(canonicalRoot) ===
            normalizedForComparison(path.parse(canonicalRoot).root)
        ) {
            throw new Error("The filesystem root cannot be used as an approved media root.");
        }

        return canonicalRoot;
    });

    if (!approved.some((root) => isContained(root, canonical))) {
        throw new Error("Library folder is outside the server's approved media roots.");
    }

    return canonical;
}

try {
    const encoded = process.argv[2];

    if (!encoded) {
        fail("The filesystem validation request was empty.");
    } else {
        const input = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
        const canonicalPath = validate(input);

        process.stdout.write(JSON.stringify({ ok: true, canonicalPath }));
    }
} catch (error) {
    fail(error instanceof Error ? error.message : "Library folder validation failed.");
}
