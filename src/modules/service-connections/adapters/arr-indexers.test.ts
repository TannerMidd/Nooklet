import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/safe-fetch", () => ({
  safeFetch: vi.fn(),
}));

import { safeFetch } from "@/lib/security/safe-fetch";

import {
  createArrIndexer,
  deleteArrIndexer,
  listArrIndexerSchemas,
  listArrIndexers,
  testArrIndexer,
  updateArrIndexer,
  type ArrIndexerWritePayload,
} from "./arr-indexers";

const mockedSafeFetch = vi.mocked(safeFetch);

const sampleWritePayload: ArrIndexerWritePayload = {
  name: "MyIndexer",
  implementation: "Newznab",
  implementationName: "Newznab",
  configContract: "NewznabSettings",
  protocol: "usenet",
  priority: 25,
  enableRss: true,
  enableAutomaticSearch: true,
  enableInteractiveSearch: true,
  tags: [],
  fields: [
    { name: "baseUrl", value: "https://news.example" },
    { name: "apiKey", value: "secret" },
  ],
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  mockedSafeFetch.mockReset();
});

describe("listArrIndexers", () => {
  it("normalizes the upstream payload and trims trailing slashes", async () => {
    mockedSafeFetch.mockResolvedValue(
      jsonResponse([
        {
          id: 1,
          name: "Tracker",
          implementation: "Torznab",
          implementationName: "Torznab",
          configContract: "TorznabSettings",
          protocol: "torrent",
          priority: 25,
          enableRss: true,
          enableAutomaticSearch: false,
          enableInteractiveSearch: true,
          tags: [3, 5, "ignored"],
          fields: [
            {
              name: "baseUrl",
              label: "Base URL",
              helpText: "URL",
              type: "url",
              value: "https://tracker.example",
              advanced: false,
              hidden: false,
              selectOptions: [],
            },
          ],
        },
        {
          // missing id should be dropped silently.
          name: "Bad",
        },
      ]),
    );

    const result = await listArrIndexers({
      serviceType: "sonarr",
      baseUrl: "http://sonarr.local/",
      apiKey: "k",
    });

    expect(mockedSafeFetch).toHaveBeenCalledWith(
      "http://sonarr.local/api/v3/indexer",
      expect.objectContaining({
        headers: { "X-Api-Key": "k" },
        cache: "no-store",
        timeoutMs: expect.any(Number),
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
    expect(result.value[0]).toMatchObject({
      id: 1,
      name: "Tracker",
      protocol: "torrent",
      tags: [3, 5],
    });
    expect(result.value[0]?.fields[0]).toMatchObject({ name: "baseUrl", type: "url" });
  });

  it("surfaces upstream error messages on non-OK responses", async () => {
    mockedSafeFetch.mockResolvedValue(
      jsonResponse([{ errorMessage: "Forbidden" }], 401),
    );

    const result = await listArrIndexers({
      serviceType: "radarr",
      baseUrl: "http://radarr.local",
      apiKey: "k",
    });

    expect(result).toEqual({ ok: false, message: "Forbidden" });
  });
});

describe("listArrIndexerSchemas", () => {
  it("filters schema entries missing an implementation", async () => {
    mockedSafeFetch.mockResolvedValue(
      jsonResponse([
        {
          implementation: "Newznab",
          implementationName: "Newznab",
          configContract: "NewznabSettings",
          protocol: "usenet",
          fields: [],
        },
        { implementationName: "Missing impl" },
      ]),
    );

    const result = await listArrIndexerSchemas({
      serviceType: "sonarr",
      baseUrl: "http://sonarr.local",
      apiKey: "k",
    });

    expect(mockedSafeFetch).toHaveBeenCalledWith(
      "http://sonarr.local/api/v3/indexer/schema",
      expect.any(Object),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
    expect(result.value[0]?.implementation).toBe("Newznab");
  });
});

describe("createArrIndexer", () => {
  it("POSTs the payload as JSON and returns the normalized summary", async () => {
    mockedSafeFetch.mockResolvedValue(
      jsonResponse({
        id: 7,
        name: "MyIndexer",
        implementation: "Newznab",
        implementationName: "Newznab",
        configContract: "NewznabSettings",
        protocol: "usenet",
        priority: 25,
        enableRss: true,
        enableAutomaticSearch: true,
        enableInteractiveSearch: true,
        tags: [],
        fields: [],
      }),
    );

    const result = await createArrIndexer({
      serviceType: "radarr",
      baseUrl: "http://radarr.local",
      apiKey: "k",
      payload: sampleWritePayload,
    });

    const [, init] = mockedSafeFetch.mock.calls[0] ?? [];
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      "X-Api-Key": "k",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(init?.body))).toMatchObject({
      name: "MyIndexer",
      implementation: "Newznab",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe(7);
  });
});

describe("updateArrIndexer", () => {
  it("PUTs to /api/v3/indexer/{id} with the id merged into the body", async () => {
    mockedSafeFetch.mockResolvedValue(
      jsonResponse({
        id: 9,
        name: "MyIndexer",
        implementation: "Newznab",
        implementationName: "Newznab",
        configContract: "NewznabSettings",
        protocol: "usenet",
        priority: 25,
        enableRss: true,
        enableAutomaticSearch: true,
        enableInteractiveSearch: true,
        tags: [],
        fields: [],
      }),
    );

    const result = await updateArrIndexer({
      serviceType: "sonarr",
      baseUrl: "http://sonarr.local",
      apiKey: "k",
      id: 9,
      payload: sampleWritePayload,
    });

    const [url, init] = mockedSafeFetch.mock.calls[0] ?? [];
    expect(url).toBe("http://sonarr.local/api/v3/indexer/9");
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toMatchObject({ id: 9, name: "MyIndexer" });

    expect(result.ok).toBe(true);
  });
});

describe("deleteArrIndexer", () => {
  it("issues a DELETE request and returns success on a 200", async () => {
    mockedSafeFetch.mockResolvedValue(new Response(null, { status: 200 }));

    const result = await deleteArrIndexer({
      serviceType: "radarr",
      baseUrl: "http://radarr.local",
      apiKey: "k",
      id: 12,
    });

    const [url, init] = mockedSafeFetch.mock.calls[0] ?? [];
    expect(url).toBe("http://radarr.local/api/v3/indexer/12");
    expect(init?.method).toBe("DELETE");
    expect(result).toEqual({ ok: true, value: true });
  });
});

describe("testArrIndexer", () => {
  it("returns ok:true on a 200 response", async () => {
    mockedSafeFetch.mockResolvedValue(new Response("[]", { status: 200 }));

    const result = await testArrIndexer({
      serviceType: "sonarr",
      baseUrl: "http://sonarr.local",
      apiKey: "k",
      payload: sampleWritePayload,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ ok: true });
  });

  it("returns the parsed validation failures on a 400 response", async () => {
    mockedSafeFetch.mockResolvedValue(
      jsonResponse(
        [
          {
            propertyName: "BaseUrl",
            errorMessage: "Unable to connect.",
            severity: "error",
          },
        ],
        400,
      ),
    );

    const result = await testArrIndexer({
      serviceType: "sonarr",
      baseUrl: "http://sonarr.local",
      apiKey: "k",
      payload: sampleWritePayload,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      ok: false,
      failures: [
        {
          propertyName: "BaseUrl",
          errorMessage: "Unable to connect.",
          severity: "error",
        },
      ],
    });
  });

  it("falls back to the upstream error message on non-validation errors", async () => {
    mockedSafeFetch.mockResolvedValue(
      jsonResponse({ message: "Server exploded" }, 500),
    );

    const result = await testArrIndexer({
      serviceType: "sonarr",
      baseUrl: "http://sonarr.local",
      apiKey: "k",
      payload: sampleWritePayload,
    });

    expect(result).toEqual({ ok: false, message: "Server exploded" });
  });
});
