import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";

const standaloneRoot = path.resolve(process.cwd(), ".next", "standalone");
const removed = [];

function relativePath(filePath) {
  return path.relative(standaloneRoot, filePath).replaceAll(path.sep, "/");
}

function removePath(filePath) {
  if (!existsSync(filePath)) {
    return;
  }

  removed.push(relativePath(filePath));
  rmSync(filePath, { recursive: true, force: true });
}

function isEnvironmentFile(name) {
  return name === ".env" || name.startsWith(".env.");
}

function isTestFile(name) {
  return /\.(?:test|spec)\.[^.]+$/i.test(name);
}

function isRuntimeDatabaseFile(name) {
  return /\.(?:db|sqlite\d*)(?:-(?:wal|shm|journal))?$/i.test(name);
}

function isLocalSecretFile(relative, name) {
  if (relative.startsWith("node_modules/")) {
    return false;
  }

  return /\.(?:key|pem|p12)$/i.test(name);
}

function sanitizeFiles(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    const relative = relativePath(entryPath);

    if (entry.isDirectory()) {
      sanitizeFiles(entryPath);
      continue;
    }

    if (
      isEnvironmentFile(entry.name)
      || isTestFile(entry.name)
      || (!relative.startsWith("node_modules/") && isRuntimeDatabaseFile(entry.name))
      || isLocalSecretFile(relative, entry.name)
    ) {
      removePath(entryPath);
    }
  }
}

function collectViolations(directory, violations = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    const relative = relativePath(entryPath);

    if (entry.isDirectory()) {
      collectViolations(entryPath, violations);
      continue;
    }

    if (
      isEnvironmentFile(entry.name)
      || isTestFile(entry.name)
      || (!relative.startsWith("node_modules/") && isRuntimeDatabaseFile(entry.name))
      || isLocalSecretFile(relative, entry.name)
    ) {
      violations.push(relative);
    }
  }

  return violations;
}

function verifyMigrations() {
  const drizzleRoot = path.join(standaloneRoot, "drizzle");
  const journalPath = path.join(drizzleRoot, "meta", "_journal.json");
  if (!existsSync(journalPath)) {
    throw new Error("Standalone output is missing drizzle/meta/_journal.json.");
  }

  const journal = JSON.parse(readFileSync(journalPath, "utf8"));
  if (!Array.isArray(journal.entries) || journal.entries.length === 0) {
    throw new Error("Standalone migration journal has no entries.");
  }

  const missingMigrations = journal.entries
    .map((entry) => entry?.tag)
    .filter((tag) => typeof tag !== "string" || !existsSync(path.join(drizzleRoot, `${tag}.sql`)));
  if (missingMigrations.length > 0) {
    throw new Error(`Standalone output is missing migration SQL for: ${missingMigrations.join(", ")}`);
  }
}

if (!existsSync(standaloneRoot) || !statSync(standaloneRoot).isDirectory()) {
  throw new Error("Next.js standalone output was not created; refusing to publish an unverified build.");
}

for (const directory of [
  "src",
  "docs",
  "coverage",
  "data",
  "secrets",
  ".git",
  ".claude",
  ".codex-tmp",
]) {
  removePath(path.join(standaloneRoot, directory));
}

for (const file of ["vitest.config.ts", "vitest.config.js", "vitest.setup.ts", "vitest.setup.js"]) {
  removePath(path.join(standaloneRoot, file));
}

sanitizeFiles(standaloneRoot);
verifyMigrations();

const forbiddenDirectories = ["src", "docs", "coverage", "data", "secrets", ".git", ".claude", ".codex-tmp"]
  .filter((directory) => existsSync(path.join(standaloneRoot, directory)));
const violations = collectViolations(standaloneRoot);
if (forbiddenDirectories.length > 0 || violations.length > 0) {
  throw new Error(
    `Standalone sanitization failed. Remaining artifacts: ${[
      ...forbiddenDirectories,
      ...violations,
    ].join(", ")}`,
  );
}

console.log(`Standalone artifact sanitized and verified (${removed.length} path${removed.length === 1 ? "" : "s"} removed).`);
