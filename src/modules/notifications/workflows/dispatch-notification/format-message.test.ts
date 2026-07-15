import { describe, expect, it } from "vitest";

import { formatNotificationMessage } from "./format-message";

describe("formatNotificationMessage download lifecycle events", () => {
  it("describes media as ready only after a successful library import", () => {
    expect(formatNotificationMessage({
      eventType: "download_import_succeeded",
      title: "Arrival",
      mediaType: "movie",
      fileCount: 1,
    })).toEqual({
      eventType: "download_import_succeeded",
      title: "\"Arrival\" is ready",
      body: "The movie download finished and Nooklet imported 1 file into your library.",
    });
  });

  it("makes a terminal download failure explicit", () => {
    const message = formatNotificationMessage({
      eventType: "download_failed",
      title: "Arrival",
      mediaType: "movie",
      message: "All candidate releases failed.",
    });

    expect(message.title).toBe("Download failed: \"Arrival\"");
    expect(message.body).toContain("No automatic retry is active.");
  });

  it("distinguishes an import failure from a transfer failure", () => {
    const message = formatNotificationMessage({
      eventType: "download_import_failed",
      title: "Severance",
      mediaType: "tv",
      message: "The TV destination is read-only.",
    });

    expect(message.title).toBe("Import failed: \"Severance\"");
    expect(message.body).toContain("download completed");
  });
});
