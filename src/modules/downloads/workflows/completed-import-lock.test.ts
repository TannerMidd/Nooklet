import { describe, expect, it } from "vitest";

import { withCompletedImportLock } from "./completed-import-lock";

describe("withCompletedImportLock", () => {
  it("serializes import filesystem work for the same user", async () => {
    const events: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const first = withCompletedImportLock("user-1", async () => {
      events.push("first-start");
      await firstGate;
      events.push("first-end");
    });
    const second = withCompletedImportLock("user-1", async () => {
      events.push("second-start");
      events.push("second-end");
    });

    await Promise.resolve();
    expect(events).toEqual(["first-start"]);
    releaseFirst();
    await Promise.all([first, second]);
    expect(events).toEqual(["first-start", "first-end", "second-start", "second-end"]);
  });
});
