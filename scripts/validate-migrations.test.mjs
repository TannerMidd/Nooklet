import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { validateMigrationJournal } from "./validate-migrations.mjs";

const temporaryDirectories = [];

function migrationFixture(entries) {
  const root = mkdtempSync(path.join(tmpdir(), "nooklet-migrations-"));
  temporaryDirectories.push(root);
  mkdirSync(path.join(root, "meta"), { recursive: true });
  for (const entry of entries) {
    writeFileSync(path.join(root, `${entry.tag}.sql`), "SELECT 1;\n", "utf8");
  }
  return root;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("migration journal validation", () => {
  it("accepts contiguous, monotonic entries with matching SQL files", () => {
    const entries = [
      { idx: 0, tag: "0000_initial", when: 1 },
      { idx: 1, tag: "0001_next", when: 2 },
    ];
    const root = migrationFixture(entries);

    expect(validateMigrationJournal({
      root,
      journal: { dialect: "sqlite", entries },
      allowedTimestampRegressions: new Set(),
    })).toEqual([]);
  });

  it("rejects index, filename, duplicate-tag, and new timestamp regressions", () => {
    const entries = [
      { idx: 0, tag: "0000_initial", when: 2 },
      { idx: 2, tag: "0000_initial", when: 1 },
    ];
    const root = migrationFixture(entries);

    const problems = validateMigrationJournal({
      root,
      journal: { dialect: "sqlite", entries },
      allowedTimestampRegressions: new Set(),
    });

    expect(problems).toEqual(expect.arrayContaining([
      expect.stringContaining("contiguous idx 1"),
      expect.stringContaining("0001_ migration tag"),
      expect.stringContaining("duplicated"),
      expect.stringContaining("regresses the journal timestamp"),
    ]));
  });
});
