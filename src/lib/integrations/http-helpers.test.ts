import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { fetchJsonWithTimeout, fetchWithTimeout, trimTrailingSlash } from "./http-helpers";

vi.mock("@/lib/security/safe-fetch", () => ({
  safeFetch: vi.fn(),
}));

import { safeFetch } from "@/lib/security/safe-fetch";

const safeFetchMock = vi.mocked(safeFetch);

describe("trimTrailingSlash", () => {
  it("removes a single trailing slash", () => {
    expect(trimTrailingSlash("https://example.com/")).toBe("https://example.com");
  });

  it("removes multiple trailing slashes", () => {
    expect(trimTrailingSlash("https://example.com////")).toBe("https://example.com");
  });

  it("returns the value unchanged when there is no trailing slash", () => {
    expect(trimTrailingSlash("https://example.com/path")).toBe("https://example.com/path");
  });

  it("returns an empty string when given only slashes", () => {
    expect(trimTrailingSlash("///")).toBe("");
  });
});

describe("fetchWithTimeout", () => {
  beforeEach(() => {
    safeFetchMock.mockReset();
  });

  afterEach(() => {
    safeFetchMock.mockReset();
  });

  it("forwards a string URL and applies the default 5s timeout", async () => {
    safeFetchMock.mockResolvedValue(new Response("ok"));

    await fetchWithTimeout("https://example.com");

    expect(safeFetchMock).toHaveBeenCalledWith("https://example.com", { timeoutMs: 5000 });
  });

  it("merges init options and uses a caller-supplied timeout", async () => {
    safeFetchMock.mockResolvedValue(new Response("ok"));

    await fetchWithTimeout(
      "https://example.com",
      { method: "POST", headers: { "X-Test": "1" } },
      10000,
    );

    expect(safeFetchMock).toHaveBeenCalledWith("https://example.com", {
      method: "POST",
      headers: { "X-Test": "1" },
      timeoutMs: 10000,
    });
  });

  it("extracts the URL from a Request input", async () => {
    safeFetchMock.mockResolvedValue(new Response("ok"));

    await fetchWithTimeout(new Request("https://example.com/api"));

    expect(safeFetchMock).toHaveBeenCalledWith("https://example.com/api", { timeoutMs: 5000 });
  });
});

describe("fetchJsonWithTimeout", () => {
  beforeEach(() => {
    safeFetchMock.mockReset();
  });

  afterEach(() => {
    safeFetchMock.mockReset();
  });

  it("returns parsed JSON when the response is OK", async () => {
    safeFetchMock.mockResolvedValue(
      new Response(JSON.stringify({ value: 42 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await fetchJsonWithTimeout<{ value: number }>("https://example.com");

    expect(result).toEqual({ value: 42 });
  });

  it("throws with the response status when the request fails", async () => {
    safeFetchMock.mockResolvedValue(new Response("nope", { status: 503 }));

    await expect(fetchJsonWithTimeout("https://example.com")).rejects.toThrow(
      "Request failed with status 503.",
    );
  });
});
