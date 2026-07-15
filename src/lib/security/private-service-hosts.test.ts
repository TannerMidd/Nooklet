import { describe, expect, it } from "vitest";

import {
  isPrivateServiceHostAllowlisted,
  isValidPrivateServiceHost,
  parsePrivateServiceHostAllowlist,
} from "@/lib/security/private-service-hosts";

describe("private service host allowlist", () => {
  it("normalizes and exactly matches configured hostnames and addresses", () => {
    const configured = " Plex.Local. ;192.168.1.65\n[fd00::10] ";

    expect(parsePrivateServiceHostAllowlist(configured)).toEqual([
      "plex.local",
      "192.168.1.65",
      "fd00::10",
    ]);
    expect(isPrivateServiceHostAllowlisted("PLEX.LOCAL", configured)).toBe(true);
    expect(isPrivateServiceHostAllowlisted("192.168.1.65", configured)).toBe(true);
    expect(isPrivateServiceHostAllowlisted("sub.plex.local", configured)).toBe(false);
    expect(isPrivateServiceHostAllowlisted("192.168.1.66", configured)).toBe(false);
  });

  it("accepts exact hosts but rejects URL, port, CIDR, and wildcard syntax", () => {
    expect(isValidPrivateServiceHost("plex.local")).toBe(true);
    expect(isValidPrivateServiceHost("192.168.1.65")).toBe(true);
    expect(isValidPrivateServiceHost("fd00::10")).toBe(true);
    expect(isValidPrivateServiceHost("http://plex.local")).toBe(false);
    expect(isValidPrivateServiceHost("plex.local:32400")).toBe(false);
    expect(isValidPrivateServiceHost("192.168.1.0/24")).toBe(false);
    expect(isValidPrivateServiceHost("*.local")).toBe(false);
  });
});
