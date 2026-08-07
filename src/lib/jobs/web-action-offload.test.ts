import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function readWorkspaceSource(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("web action filesystem isolation", () => {
  it("keeps completed-download import workflows out of the Activity server-action graph", () => {
    const source = readWorkspaceSource("src/app/(workspace)/in-progress/actions.ts");

    expect(source).not.toContain("workflows/import-completed-downloads");
    expect(source).not.toContain("workflows/import-completed-engine-downloads");
    expect(source).toContain('jobType: "download-import"');
  });

  it("keeps downloader reconciliation out of the season-cancellation web workflow", () => {
    const source = readWorkspaceSource(
      "src/modules/downloads/workflows/cancel-season-fulfillment.ts",
    );

    expect(source).not.toContain("reconcile-season-fulfillment-cancellations");
    expect(source).not.toContain("reconcile-season-fulfillment-cancellations");
    expect(source).toContain("checkpointExistingSeasonFulfillmentCancellation");
  });

  it("keeps on-disk title deletion out of the Library server-action graph", () => {
    const source = readWorkspaceSource("src/app/(workspace)/library/actions.ts");

    expect(source).not.toContain("workflows/delete-media-title-with-files");
    expect(source).toContain('jobType: "media-title-delete"');
    expect(source).toContain('targetType: "media-title-preserve-files"');
  });

  it("queues long-running library automation instead of executing it in a web request", () => {
    const source = readWorkspaceSource("src/app/(workspace)/library/actions.ts");

    expect(source).not.toContain("searchMissingMonitoredContentWorkflow");
    expect(source).not.toContain("refreshTvMetadataWorkflow");
    expect(source).toContain('jobType: "missing-content-search"');
    expect(source).toContain('jobType: "metadata-refresh"');
  });

  it("keeps stop-season available even when a plan can also be resumed", () => {
    const source = readWorkspaceSource(
      "src/app/(workspace)/in-progress/download-activity-panel.tsx",
    );

    expect(source).toContain("<CancelSeasonFulfillmentForm");
    expect(source).not.toContain('entry.retryAction !== "resume_season_recovery"');
  });
});
