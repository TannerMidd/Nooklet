import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  assertNoActiveLegacyDownloadWork,
  UnsupportedLegacyDownloadWorkError,
} from "./legacy-download-preflight";

let sandbox: string;
let sqlite: Database.Database;

function seedClient(clientType: "nooklet" | "sabnzbd", id = `${clientType}-client`) {
  sqlite.prepare(`
    INSERT INTO download_clients (
      id, user_id, service_connection_id, client_type, display_name
    ) VALUES (?, 'user-1', ?, ?, ?)
  `).run(id, `${id}-connection`, clientType, id);
  return id;
}

function seedRequest(input: {
  id: string;
  status: string;
  clientId?: string | null;
  externalJobId?: string | null;
}) {
  sqlite.prepare(`
    INSERT INTO download_requests (
      id, user_id, client_id, media_type, status, requested_title, external_job_id
    ) VALUES (?, 'user-1', ?, 'movie', ?, ?, ?)
  `).run(
    input.id,
    input.clientId ?? null,
    input.status,
    input.id,
    input.externalJobId ?? null,
  );
}

function seedQueueItem(input: {
  requestId: string;
  externalQueueId: string;
  status: string;
  clientId?: string | null;
}) {
  sqlite.prepare(`
    INSERT INTO download_queue_items (
      id, request_id, user_id, client_id, external_queue_id, status
    ) VALUES (?, ?, 'user-1', ?, ?, ?)
  `).run(
    `${input.requestId}-queue`,
    input.requestId,
    input.clientId ?? null,
    input.externalQueueId,
    input.status,
  );
}

describe("legacy download upgrade preflight", () => {
  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), "nooklet-legacy-download-preflight-"));
    sqlite = new Database(join(sandbox, "nooklet.db"));
    migrate(drizzle(sqlite), { migrationsFolder: join(process.cwd(), "drizzle") });
    // Test fixtures intentionally omit unrelated parent rows. Production keeps
    // foreign keys enabled; attribution logic itself does not depend on them.
    sqlite.pragma("foreign_keys = OFF");
  });

  afterEach(() => {
    sqlite.close();
    rmSync(sandbox, { recursive: true, force: true });
  });

  it("blocks an active request attributed to the retired external client", () => {
    const clientId = seedClient("sabnzbd");
    seedRequest({ id: "active-legacy", status: "downloading", clientId });
    seedQueueItem({
      requestId: "active-legacy",
      externalQueueId: "legacy-queue-id",
      status: "downloading",
      clientId,
    });

    expect(() => assertNoActiveLegacyDownloadWork(sqlite)).toThrowError(
      expect.objectContaining({
        name: "UnsupportedLegacyDownloadWorkError",
        requestIds: ["active-legacy"],
      }),
    );
  });

  it("allows terminal legacy rows to remain as read-only history", () => {
    const clientId = seedClient("sabnzbd");
    seedRequest({ id: "legacy-history", status: "succeeded", clientId });
    seedQueueItem({
      requestId: "legacy-history",
      externalQueueId: "legacy-history-id",
      status: "completed",
      clientId,
    });

    expect(() => assertNoActiveLegacyDownloadWork(sqlite)).not.toThrow();
  });

  it("blocks orphaned external work after its client row was deleted", () => {
    seedRequest({ id: "orphaned-legacy", status: "queued" });
    seedQueueItem({
      requestId: "orphaned-legacy",
      externalQueueId: "external-client-job",
      status: "queued",
    });

    expect(() => assertNoActiveLegacyDownloadWork(sqlite)).toThrow(
      UnsupportedLegacyDownloadWorkError,
    );
  });

  it("blocks an unattributed active reservation before it receives a queue id", () => {
    seedRequest({ id: "ambiguous-reservation", status: "pending" });

    expect(() => assertNoActiveLegacyDownloadWork(sqlite)).toThrowError(
      expect.objectContaining({ requestIds: ["ambiguous-reservation"] }),
    );
  });

  it("recognizes an unattributed native request only from its tenant-scoped engine row", () => {
    const nativeId = "f5073eb2-faea-4a62-9720-e528993df9b3";
    seedRequest({ id: "orphaned-native", status: "queued", externalJobId: nativeId });
    seedQueueItem({
      requestId: "orphaned-native",
      externalQueueId: nativeId,
      status: "queued",
    });
    sqlite.prepare(`
      INSERT INTO engine_downloads (id, user_id, name, nzb_xml)
      VALUES (?, 'user-1', 'Native download', '<nzb />')
    `).run(nativeId);

    expect(() => assertNoActiveLegacyDownloadWork(sqlite)).not.toThrow();
  });

  it("does not let another user's engine id make ambiguous work look native", () => {
    const nativeId = "deea9508-b651-47a2-87f7-e7e01d518f91";
    seedRequest({ id: "cross-tenant-orphan", status: "queued", externalJobId: nativeId });
    seedQueueItem({
      requestId: "cross-tenant-orphan",
      externalQueueId: nativeId,
      status: "queued",
    });
    sqlite.prepare(`
      INSERT INTO engine_downloads (id, user_id, name, nzb_xml)
      VALUES (?, 'user-2', 'Other tenant download', '<nzb />')
    `).run(nativeId);

    expect(() => assertNoActiveLegacyDownloadWork(sqlite)).toThrowError(
      expect.objectContaining({ requestIds: ["cross-tenant-orphan"] }),
    );
  });

  it("blocks a pending import retry even when the legacy request and queue are failed", () => {
    const clientId = seedClient("sabnzbd");
    seedRequest({ id: "legacy-import", status: "failed", clientId });
    seedQueueItem({
      requestId: "legacy-import",
      externalQueueId: "legacy-import-id",
      status: "failed",
      clientId,
    });
    sqlite.prepare(`
      INSERT INTO download_import_runs (
        id, request_id, user_id, status, source_root_path
      ) VALUES ('import-1', 'legacy-import', 'user-1', 'pending', '/legacy/output')
    `).run();

    expect(() => assertNoActiveLegacyDownloadWork(sqlite)).toThrow(
      UnsupportedLegacyDownloadWorkError,
    );
  });
});
