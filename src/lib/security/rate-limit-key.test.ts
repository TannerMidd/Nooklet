import { describe, expect, it } from "vitest";

import { trustedClientAddressFromHeaders } from "@/lib/security/rate-limit-key";

describe("trustedClientAddressFromHeaders", () => {
  it("ignores forwarding headers unless proxy trust is explicitly enabled", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.10",
      "x-real-ip": "203.0.113.11",
    });

    expect(trustedClientAddressFromHeaders(headers)).toBeNull();
  });
});
