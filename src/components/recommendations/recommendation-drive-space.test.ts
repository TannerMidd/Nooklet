import { describe, expect, it } from "vitest";

import {
  LOW_DRIVE_SPACE_THRESHOLD_BYTES,
  formatDriveSpaceBytes,
  getDriveSpaceUsagePercent,
  isLowDriveSpace,
} from "./recommendation-drive-space";

describe("recommendation-drive-space", () => {
  it("formats byte counts as whole or fractional GB labels", () => {
    expect(formatDriveSpaceBytes(150 * 1024 ** 3)).toBe("150 GB");
    expect(formatDriveSpaceBytes(93.5 * 1024 ** 3)).toBe("93.5 GB");
    expect(formatDriveSpaceBytes(null)).toBeNull();
  });

  it("flags selected root folders below the 100 GB free-space threshold", () => {
    expect(isLowDriveSpace({ freeSpaceBytes: LOW_DRIVE_SPACE_THRESHOLD_BYTES - 1 })).toBe(true);
    expect(isLowDriveSpace({ freeSpaceBytes: LOW_DRIVE_SPACE_THRESHOLD_BYTES })).toBe(false);
    expect(isLowDriveSpace({})).toBe(false);
  });

  it("calculates a clamped used-space percentage when total space is known", () => {
    expect(
      getDriveSpaceUsagePercent({
        freeSpaceBytes: 25 * 1024 ** 3,
        totalSpaceBytes: 100 * 1024 ** 3,
      }),
    ).toBe(75);
    expect(
      getDriveSpaceUsagePercent({
        freeSpaceBytes: 150 * 1024 ** 3,
        totalSpaceBytes: 100 * 1024 ** 3,
      }),
    ).toBe(0);
    expect(getDriveSpaceUsagePercent({ freeSpaceBytes: 10 })).toBeNull();
  });
});
