import { describe, expect, it } from "vitest";

import { classifyDownloadCapacityFailure } from "./errors";

describe("classifyDownloadCapacityFailure", () => {
  it("identifies active-download reservation contention", () => {
    expect(classifyDownloadCapacityFailure({
      availableBytes: 10_000,
      filesystemCapacityBytes: 100_000,
      requiredBytes: 20_000,
      activeReservationBytes: 12_000,
      activeRemainingBytes: 5_000,
      activeDownloadedBytes: 2_000,
    })).toBe("active_reservation_contention");
  });

  it("identifies a candidate that cannot fit an empty filesystem", () => {
    expect(classifyDownloadCapacityFailure({
      availableBytes: 10_000,
      filesystemCapacityBytes: 20_000,
      requiredBytes: 30_000,
      activeReservationBytes: 5_000,
      activeRemainingBytes: 2_000,
      activeDownloadedBytes: 1_000,
    })).toBe("candidate_oversized");
  });

  it("identifies unrelated disk usage or a wrong volume mapping", () => {
    expect(classifyDownloadCapacityFailure({
      availableBytes: 10_000,
      filesystemCapacityBytes: 100_000,
      requiredBytes: 30_000,
      activeReservationBytes: 5_000,
      activeRemainingBytes: 2_000,
      activeDownloadedBytes: 1_000,
    })).toBe("storage_insufficient");
  });

  it("does not burn a release when legacy capacity detail is ambiguous", () => {
    expect(classifyDownloadCapacityFailure(null)).toBe("storage_insufficient");
  });
});
