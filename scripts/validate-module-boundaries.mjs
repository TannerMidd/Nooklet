import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const privateImportPattern = /["']@\/modules\/([^/"']+)\/(repositories|adapters)\/[^"']+["']/g;

function listSourceFiles(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const entryPath = path.join(directory, entry.name);

        if (entry.isDirectory()) {
            return listSourceFiles(entryPath);
        }

        if (!entry.isFile() || !/\.(?:ts|tsx)$/.test(entry.name)) {
            return [];
        }

        if (/\.(?:test|spec)\.(?:ts|tsx)$/.test(entry.name)) {
            return [];
        }

        return [entryPath];
    });
}

export function findModuleBoundaryViolations(modulesDirectory) {
    const violations = [];

    for (const filePath of listSourceFiles(modulesDirectory)) {
        const relativePath = path.relative(modulesDirectory, filePath);
        const [sourceModule] = relativePath.split(path.sep);
        const source = readFileSync(filePath, "utf8");

        for (const match of source.matchAll(privateImportPattern)) {
            const targetModule = match[1];

            if (targetModule === sourceModule) {
                continue;
            }

            violations.push({
                file: relativePath.split(path.sep).join("/"),
                targetModule,
                importPath: match[0].slice(1, -1),
            });
        }
    }

    return violations.sort((left, right) =>
        `${left.file}:${left.importPath}`.localeCompare(`${right.file}:${right.importPath}`),
    );
}

function main() {
    const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const modulesDirectory = path.join(repositoryRoot, "src", "modules");
    const violations = findModuleBoundaryViolations(modulesDirectory);

    if (violations.length > 0) {
        console.error(
            [
                "Cross-module imports must use the target module's public API instead of repositories or adapters:",
                ...violations.map(({ file, importPath }) => `- src/modules/${file}: ${importPath}`),
            ].join("\n"),
        );
        process.exitCode = 1;

        return;
    }

    console.log("Module boundary validation passed.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main();
}
