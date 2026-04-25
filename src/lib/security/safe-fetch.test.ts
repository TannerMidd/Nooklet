import { describe, expect, it } from "vitest";

import { SsrfBlockedError, safeFetch } from "@/lib/security/safe-fetch";

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
