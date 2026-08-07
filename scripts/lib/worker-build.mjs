import { mkdir } from "node:fs/promises";
import path from "node:path";

export async function createWorkerBuildOptions({
    root = process.cwd(),
    outputDirectory = path.resolve(root, ".next", "worker"),
    plugins = [],
} = {}) {
    await mkdir(outputDirectory, { recursive: true });

    return {
        entryPoints: [path.resolve(root, "src", "lib", "jobs", "worker-entry.ts")],
        outfile: path.join(outputDirectory, "worker.cjs"),
        bundle: true,
        platform: "node",
        format: "cjs",
        target: "node24",
        sourcemap: true,
        packages: "bundle",
        external: ["better-sqlite3"],
        plugins,
        logLevel: "info",
    };
}
