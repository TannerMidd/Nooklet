import { mkdir } from "node:fs/promises";
import path from "node:path";

const serverOnlyMarkerPlugin = {
    name: "server-only-marker",
    setup(build) {
        build.onResolve({ filter: /^server-only$/ }, () => ({
            path: "server-only",
            namespace: "nooklet-marker",
        }));
        build.onLoad({ filter: /.*/, namespace: "nooklet-marker" }, () => ({
            contents: "",
            loader: "js",
        }));
    },
};

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
        plugins: [serverOnlyMarkerPlugin, ...plugins],
        logLevel: "info",
    };
}
