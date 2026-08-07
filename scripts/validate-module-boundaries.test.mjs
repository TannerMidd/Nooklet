import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { findModuleBoundaryViolations } from "./validate-module-boundaries.mjs";

function withModulesFixture(run) {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), "nooklet-boundaries-"));
  try {
    run(fixtureRoot);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

function writeFixture(root, relativePath, source) {
  const filePath = path.join(root, relativePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, source, "utf8");
}

test("reports cross-module repository and adapter imports", () => {
  withModulesFixture((root) => {
    writeFixture(
      root,
      "downloads/workflows/queue.ts",
      'import { findPath } from "@/modules/media-library/repositories/media-library-repository";\n' +
        'import { parse } from "@/modules/indexers/adapters/newznab-error-document";\n',
    );

    assert.deepEqual(findModuleBoundaryViolations(root), [
      {
        file: "downloads/workflows/queue.ts",
        targetModule: "indexers",
        importPath: "@/modules/indexers/adapters/newznab-error-document",
      },
      {
        file: "downloads/workflows/queue.ts",
        targetModule: "media-library",
        importPath: "@/modules/media-library/repositories/media-library-repository",
      },
    ]);
  });
});

test("allows same-module internals and another module's public API", () => {
  withModulesFixture((root) => {
    writeFixture(
      root,
      "downloads/workflows/queue.ts",
      'import { save } from "@/modules/downloads/repositories/download-repository";\n' +
        'import { findPath } from "@/modules/media-library/public";\n',
    );
    writeFixture(
      root,
      "downloads/workflows/queue.test.ts",
      'import { findPath } from "@/modules/media-library/repositories/media-library-repository";\n',
    );

    assert.deepEqual(findModuleBoundaryViolations(root), []);
  });
});
