import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/users/repositories/user-repository", () => ({
  countAdminUsers: vi.fn(),
}));

import { countAdminUsers } from "@/modules/users/repositories/user-repository";
import { getBootstrapStatus } from "./bootstrap-status";

const countAdminUsersMock = vi.mocked(countAdminUsers);

describe("getBootstrapStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports the bootstrap surface as open when there are no admins", async () => {
    countAdminUsersMock.mockResolvedValue(0);

    await expect(getBootstrapStatus()).resolves.toEqual({
      isOpen: true,
      adminCount: 0,
    });
  });

  it("closes the bootstrap surface as soon as a single admin exists", async () => {
    countAdminUsersMock.mockResolvedValue(1);

    await expect(getBootstrapStatus()).resolves.toEqual({
      isOpen: false,
      adminCount: 1,
    });
  });

  it("reports closed for any positive admin count", async () => {
    countAdminUsersMock.mockResolvedValue(7);

    await expect(getBootstrapStatus()).resolves.toEqual({
      isOpen: false,
      adminCount: 7,
    });
  });

  it("propagates repository errors instead of masking them as a closed bootstrap", async () => {
    const failure = new Error("database unavailable");
    countAdminUsersMock.mockRejectedValue(failure);

    await expect(getBootstrapStatus()).rejects.toThrow("database unavailable");
  });
});
