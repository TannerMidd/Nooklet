import { describe, expect, it, vi } from "vitest";

import { SafeFetchAbortError, SsrfBlockedError, safeFetch } from "@/lib/security/safe-fetch";

describe("safeFetch host classification", () => {
  it("rejects non-http(s) schemes", async () => {
    await expect(safeFetch("file:///etc/passwd")).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it("rejects link-local / cloud metadata addresses", async () => {
    await expect(safeFetch("http://169.254.169.254/latest/meta-data")).rejects.toMatchObject({
      name: "SsrfBlockedError",
    });
  });

  it("rejects IPv4-mapped IPv6 link-local addresses", async () => {
    await expect(safeFetch("http://[::ffff:169.254.169.254]/")).rejects.toMatchObject({
      name: "SsrfBlockedError",
    });
  });

  it("rejects 0.0.0.0", async () => {
    await expect(safeFetch("http://0.0.0.0/")).rejects.toMatchObject({
      name: "SsrfBlockedError",
    });
  });

  it("rejects multicast", async () => {
    await expect(safeFetch("http://224.0.0.1/")).rejects.toMatchObject({
      name: "SsrfBlockedError",
    });
  });

  it("rejects IPv6 multicast", async () => {
    await expect(safeFetch("http://[ff02::1]/")).rejects.toMatchObject({
      name: "SsrfBlockedError",
    });
  });

  it("rejects private addresses when allowPrivateHosts is false", async () => {
    await expect(
      safeFetch("http://192.168.1.1/", { allowPrivateHosts: false }),
    ).rejects.toMatchObject({ name: "SsrfBlockedError" });

    await expect(
      safeFetch("http://10.0.0.1/", { allowPrivateHosts: false }),
    ).rejects.toMatchObject({ name: "SsrfBlockedError" });

    await expect(
      safeFetch("http://172.20.0.5/", { allowPrivateHosts: false }),
    ).rejects.toMatchObject({ name: "SsrfBlockedError" });

    await expect(
      safeFetch("http://127.0.0.1/", { allowPrivateHosts: false }),
    ).rejects.toMatchObject({ name: "SsrfBlockedError" });
  });

  it("rejects unresolvable hostnames", async () => {
    await expect(
      safeFetch("http://nonexistent.invalid/", { allowPrivateHosts: false }),
    ).rejects.toBeInstanceOf(Error);
  });
});

describe("safeFetch abort translation", () => {
  it("translates a request-level timeout into a stable timeout error", async () => {
    // Fake a slow upstream that only resolves once the abort signal fires so
    // the internal timer fires first and the AbortError is rethrown as a
    // SafeFetchAbortError("timeout"). Avoids depending on real network timing.
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = (init as RequestInit | undefined)?.signal;
          if (!signal) {
            return;
          }
          const onAbort = () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          };
          if (signal.aborted) {
            onAbort();
          } else {
            signal.addEventListener("abort", onAbort, { once: true });
          }
        }),
    );

    try {
      await expect(
        safeFetch("http://127.0.0.1/", { timeoutMs: 5, allowPrivateHosts: true }),
      ).rejects.toBeInstanceOf(SafeFetchAbortError);

      try {
        await safeFetch("http://127.0.0.1/", { timeoutMs: 5, allowPrivateHosts: true });
      } catch (error) {
        expect(error).toBeInstanceOf(SafeFetchAbortError);
        if (error instanceof SafeFetchAbortError) {
          expect(error.reason).toBe("timeout");
          expect(error.message).toMatch(/timed out/i);
        }
      }
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("translates an externally aborted request into a canceled error", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = (init as RequestInit | undefined)?.signal;
          if (!signal) {
            return;
          }
          const onAbort = () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          };
          if (signal.aborted) {
            onAbort();
          } else {
            signal.addEventListener("abort", onAbort, { once: true });
          }
        }),
    );

    const controller = new AbortController();
    controller.abort();

    try {
      try {
        await safeFetch("http://127.0.0.1/", {
          signal: controller.signal,
          timeoutMs: 5000,
          allowPrivateHosts: true,
        });
        throw new Error("Expected safeFetch to reject for an aborted signal.");
      } catch (error) {
        expect(error).toBeInstanceOf(SafeFetchAbortError);
        if (error instanceof SafeFetchAbortError) {
          expect(error.reason).toBe("canceled");
          expect(error.message).toMatch(/canceled/i);
        }
      }
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
