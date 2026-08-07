import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const drizzleRoot = path.resolve(process.cwd(), "drizzle");
const journalPath = path.join(drizzleRoot, "meta", "_journal.json");

// These timestamps were committed out of order before migration validation
// existed. Drizzle applies migrations by journal index, and changing the
// historical metadata would make shipped artifacts disagree with deployed
// installations. Keep the exceptions explicit and reject any new regression.
const historicalTimestampRegressions = new Set([
  "0014_curved_rhino",
  "0030_media_request_attempts",
]);

export function validateMigrationJournal({
  root = drizzleRoot,
  journal = JSON.parse(readFileSync(path.join(root, "meta", "_journal.json"), "utf8")),
  allowedTimestampRegressions = historicalTimestampRegressions,
} = {}) {
  const problems = [];
  const entries = Array.isArray(journal.entries) ? journal.entries : [];

  if (journal.dialect !== "sqlite") {
    problems.push(`Expected a sqlite journal, received ${String(journal.dialect)}.`);
  }

  if (entries.length === 0) {
    problems.push("Migration journal has no entries.");
    return problems;
  }

  const tags = new Set();
  let previousWhen = Number.NEGATIVE_INFINITY;

  for (const [position, entry] of entries.entries()) {
    if (!Number.isInteger(entry.idx) || entry.idx !== position) {
      problems.push(`Journal position ${position} must have contiguous idx ${position}.`);
    }

    const prefix = String(position).padStart(4, "0");
    if (typeof entry.tag !== "string" || !entry.tag.startsWith(`${prefix}_`)) {
      problems.push(`Journal idx ${position} must use a ${prefix}_ migration tag.`);
    }

    if (tags.has(entry.tag)) {
      problems.push(`Migration tag ${String(entry.tag)} is duplicated.`);
    }
    tags.add(entry.tag);

    if (!existsSync(path.join(root, `${entry.tag}.sql`))) {
      problems.push(`Migration ${String(entry.tag)} is missing its SQL file.`);
    }

    if (!Number.isSafeInteger(entry.when) || entry.when <= 0) {
      problems.push(`Migration ${String(entry.tag)} has an invalid timestamp.`);
    } else if (entry.when < previousWhen && !allowedTimestampRegressions.has(entry.tag)) {
      problems.push(
        `Migration ${entry.tag} regresses the journal timestamp; append migrations monotonically.`,
      );
    }

    if (Number.isSafeInteger(entry.when)) {
      previousWhen = Math.max(previousWhen, entry.when);
    }
  }

  for (const allowedTag of allowedTimestampRegressions) {
    if (!tags.has(allowedTag)) {
      problems.push(`Remove obsolete timestamp-regression exception ${allowedTag}.`);
    }
  }

  return problems;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const problems = validateMigrationJournal();

  if (problems.length > 0) {
    console.error("Migration validation failed:\n");
    for (const problem of problems) console.error(`- ${problem}`);
    process.exitCode = 1;
  } else {
    const journal = JSON.parse(readFileSync(journalPath, "utf8"));
    console.log(`Migration validation passed for ${journal.entries.length} entries.`);
  }
}
