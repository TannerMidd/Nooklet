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

describe("safeFetch redirect refusal", () => {
  // Redirect handling is set to "manual" so a 3xx response from the upstream
  // becomes a thrown SsrfBlockedError. This is critical: a permitted public
  // host must not be able to bounce us into a private/metadata target after
  // the host check has already passed.
  it.each([301, 302, 303, 307, 308])(
    "refuses to follow %s redirects to a different host",
    async (status) => {
      const response = new Response(null, {
        status,
        headers: { location: "http://169.254.169.254/latest/meta-data" },
      });
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(response);

      try {
        await expect(
          safeFetch("http://127.0.0.1/", { allowPrivateHosts: true }),
        ).rejects.toBeInstanceOf(SsrfBlockedError);
      } finally {
        fetchSpy.mockRestore();
      }
    },
  );

  it("includes the redirect target in the SsrfBlockedError message for diagnostics", async () => {
    const response = new Response(null, {
      status: 302,
      headers: { location: "http://internal.example/" },
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(response);

    try {
      await expect(
        safeFetch("http://127.0.0.1/", { allowPrivateHosts: true }),
      ).rejects.toThrow(/internal\.example/);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("passes the manual redirect mode to the underlying fetch call", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("ok", { status: 200 }));

    try {
      await safeFetch("http://127.0.0.1/", { allowPrivateHosts: true });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const init = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
      expect(init?.redirect).toBe("manual");
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe("safeFetch body size limit", () => {
  it("rejects when the response body exceeds maxBytes", async () => {
    const oversized = new Uint8Array(2048).fill(0x41);
    const response = new Response(oversized, {
      status: 200,
      headers: { "content-type": "application/octet-stream" },
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(response);

    try {
      await expect(
        safeFetch("http://127.0.0.1/", {
          allowPrivateHosts: true,
          maxBytes: 1024,
        }),
      ).rejects.toBeInstanceOf(SsrfBlockedError);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("returns the full body when it stays within maxBytes", async () => {
    const payload = new Uint8Array(512).fill(0x42);
    const response = new Response(payload, {
      status: 200,
      headers: { "content-type": "application/octet-stream" },
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(response);

    try {
      const result = await safeFetch("http://127.0.0.1/", {
        allowPrivateHosts: true,
        maxBytes: 1024,
      });
      expect(result.status).toBe(200);
      const buffer = new Uint8Array(await result.arrayBuffer());
      expect(buffer.byteLength).toBe(512);
      expect(buffer.every((byte) => byte === 0x42)).toBe(true);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("preserves status and headers when wrapping the body", async () => {
    const response = new Response("payload", {
      status: 201,
      statusText: "Created",
      headers: { "x-custom": "value", "content-type": "text/plain" },
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(response);

    try {
      const result = await safeFetch("http://127.0.0.1/", {
        allowPrivateHosts: true,
      });
      expect(result.status).toBe(201);
      expect(result.headers.get("x-custom")).toBe("value");
      expect(await result.text()).toBe("payload");
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe("safeFetch private host override", () => {
  it("allows private targets when allowPrivateHosts is true", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("ok", { status: 200 }));

    try {
      const result = await safeFetch("http://192.168.1.10/", {
        allowPrivateHosts: true,
      });
      expect(result.status).toBe(200);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("never overrides the always-blocked classifications even with allowPrivateHosts", async () => {
    // Cloud metadata stays blocked regardless of override - critical guarantee.
    await expect(
      safeFetch("http://169.254.169.254/", { allowPrivateHosts: true }),
    ).rejects.toBeInstanceOf(SsrfBlockedError);

    await expect(
      safeFetch("http://224.0.0.1/", { allowPrivateHosts: true }),
    ).rejects.toBeInstanceOf(SsrfBlockedError);

    await expect(
      safeFetch("http://0.0.0.0/", { allowPrivateHosts: true }),
    ).rejects.toBeInstanceOf(SsrfBlockedError);
  });
});
