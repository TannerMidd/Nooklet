import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/safe-fetch", () => ({
  safeFetch: vi.fn(),
}));

import { safeFetch } from "@/lib/security/safe-fetch";

import {
  addSabnzbdUrlToQueue,
  listSabnzbdHistory,
  listSabnzbdQueue,
  moveSabnzbdQueueItemToPosition,
  pauseSabnzbdQueue,
  pauseSabnzbdQueueItem,
  resumeSabnzbdQueue,
} from "./sabnzbd";

const mockedSafeFetch = vi.mocked(safeFetch);

describe("listSabnzbdQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes the SABnzbd queue snapshot and slot progress", async () => {
    mockedSafeFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          queue: {
            version: "4.5.2",
            status: "Downloading",
            paused: false,
            speed: "12.5 M",
            kbpersec: "12850.4",
            timeleft: "0:10:00",
            noofslots_total: 2,
            slots: [
              {
                nzo_id: "SABnzbd_nzo_1",
                filename: "Show.Name.S01E01.1080p",
                status: "Downloading",
                percentage: "37.5",
                timeleft: "0:04:10",
                cat: "tv",
                priority: "Normal",
                labels: ["PROPAGATING 5 min"],
                size: "10 GB",
                sizeleft: "6.2 GB",
                mb: "10240.0",
                mbleft: "6348.8",
              },
              {
                nzo_id: "SABnzbd_nzo_2",
                filename: "Movie.Name.2024.2160p",
                status: "Queued",
                percentage: "0",
                timeleft: "0:00:00",
              },
            ],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const snapshot = await listSabnzbdQueue({
      baseUrl: "http://localhost:8080",
      apiKey: "secret",
    });

    expect(snapshot).toEqual({
      version: "4.5.2",
      queueStatus: "Downloading",
      paused: false,
      speed: "12.5 M",
      kbPerSec: 12850.4,
      timeLeft: "0:10:00",
      activeQueueCount: 2,
      totalQueueCount: 2,
      items: [
        {
          id: "SABnzbd_nzo_1",
          title: "Show.Name.S01E01.1080p",
          status: "Downloading",
          progressPercent: 37.5,
          timeLeft: "0:04:10",
          category: "tv",
          priority: "Normal",
          labels: ["PROPAGATING 5 min"],
          sizeLabel: "10 GB",
          sizeLeftLabel: "6.2 GB",
          totalMb: 10240,
          remainingMb: 6348.8,
        },
        {
          id: "SABnzbd_nzo_2",
          title: "Movie.Name.2024.2160p",
          status: "Queued",
          progressPercent: 0,
          timeLeft: "0:00:00",
          category: null,
          priority: null,
          labels: [],
          sizeLabel: null,
          sizeLeftLabel: null,
          totalMb: null,
          remainingMb: null,
        },
      ],
    });
    expect(mockedSafeFetch.mock.calls[0]?.[1]).toMatchObject({ timeoutMs: 30_000 });
  });

  it("uses a caller-supplied timeout when provided", async () => {
    mockedSafeFetch.mockResolvedValue(
      new Response(JSON.stringify({ queue: { slots: [] } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await listSabnzbdQueue({
      baseUrl: "http://localhost:8080",
      apiKey: "secret",
      timeoutMs: 20000,
    });

    expect(mockedSafeFetch.mock.calls[0]?.[1]).toMatchObject({ timeoutMs: 20000 });
  });

  it("normalizes SABnzbd history items with completed storage paths", async () => {
    mockedSafeFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          history: {
            slots: [
              {
                nzo_id: "SABnzbd_nzo_3",
                name: "Movie.Name.2024.1080p",
                status: "Completed",
                cat: "movies",
                storage: "C:/Downloads/complete/Movie.Name.2024.1080p",
                completed: 1_778_112_000,
                size: "12 GB",
                bytes: 12_884_901_888,
              },
              {
                nzo_id: "SABnzbd_nzo_4",
                nzb_name: "Show.Name.S01E01.1080p",
                status: "Failed",
                path: "C:/Downloads/incomplete/Show.Name.S01E01.1080p",
                fail_message: "Repair failed",
              },
            ],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const snapshot = await listSabnzbdHistory({
      baseUrl: "http://localhost:8080",
      apiKey: "secret",
      limit: 10,
    });

    expect(snapshot.items).toEqual([
      {
        id: "SABnzbd_nzo_3",
        title: "Movie.Name.2024.1080p",
        status: "Completed",
        category: "movies",
        storagePath: "C:/Downloads/complete/Movie.Name.2024.1080p",
        completedAt: new Date("2026-05-07T00:00:00.000Z"),
        failMessage: null,
        sizeLabel: "12 GB",
        totalMb: 12288,
      },
      {
        id: "SABnzbd_nzo_4",
        title: "Show.Name.S01E01.1080p",
        status: "Failed",
        category: null,
        storagePath: "C:/Downloads/incomplete/Show.Name.S01E01.1080p",
        completedAt: null,
        failMessage: "Repair failed",
        sizeLabel: null,
        totalMb: null,
      },
    ]);

    const requestUrl = mockedSafeFetch.mock.calls[0]?.[0];

    expect(requestUrl).toBeInstanceOf(URL);
    expect((requestUrl as URL).toString()).toBe(
      "http://localhost:8080/api?mode=history&output=json&limit=10&apikey=secret",
    );
  });

  it("sends a pause command for a queue item", async () => {
    mockedSafeFetch.mockResolvedValue(
      new Response(JSON.stringify({ status: true, nzo_ids: ["SABnzbd_nzo_1"] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await pauseSabnzbdQueueItem({
      baseUrl: "http://localhost:8080",
      apiKey: "secret",
      itemId: "SABnzbd_nzo_1",
    });

    const requestUrl = mockedSafeFetch.mock.calls[0]?.[0];

    expect(requestUrl).toBeInstanceOf(URL);
    expect((requestUrl as URL).toString()).toBe(
      "http://localhost:8080/api?mode=queue&output=json&name=pause&value=SABnzbd_nzo_1&apikey=secret",
    );
  });

  it("adds a release URL to the queue", async () => {
    mockedSafeFetch.mockResolvedValue(
      new Response(JSON.stringify({ status: true, nzo_ids: ["SABnzbd_nzo_3"] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await addSabnzbdUrlToQueue({
      baseUrl: "http://localhost:8080",
      apiKey: "secret",
      url: "https://indexer.example/download?id=abc&apikey=not-this-one",
      title: "Movie.Name.2024.1080p",
      category: "movies",
    });

    const requestUrl = mockedSafeFetch.mock.calls[0]?.[0];

    expect(result).toEqual({ queueIds: ["SABnzbd_nzo_3"] });
    expect(requestUrl).toBeInstanceOf(URL);
    expect((requestUrl as URL).toString()).toBe(
      "http://localhost:8080/api?mode=addurl&output=json&name=https%3A%2F%2Findexer.example%2Fdownload%3Fid%3Dabc%26apikey%3Dnot-this-one&nzbname=Movie.Name.2024.1080p&cat=movies&apikey=secret",
    );
  });

  it("throws when SABnzbd rejects an add-url request", async () => {
    mockedSafeFetch.mockResolvedValue(
      new Response(JSON.stringify({ status: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(addSabnzbdUrlToQueue({
      baseUrl: "http://localhost:8080",
      apiKey: "secret",
      url: "https://indexer.example/download?id=abc",
    })).rejects.toThrow("SABnzbd could not add the release to the queue.");
  });

  it("sends a global pause command for the queue", async () => {
    mockedSafeFetch.mockResolvedValue(
      new Response(JSON.stringify({ status: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await pauseSabnzbdQueue({
      baseUrl: "http://localhost:8080",
      apiKey: "secret",
    });

    const requestUrl = mockedSafeFetch.mock.calls[0]?.[0];

    expect(requestUrl).toBeInstanceOf(URL);
    expect((requestUrl as URL).toString()).toBe(
      "http://localhost:8080/api?mode=pause&output=json&apikey=secret",
    );
  });

  it("sends a global resume command for the queue", async () => {
    mockedSafeFetch.mockResolvedValue(
      new Response(JSON.stringify({ status: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await resumeSabnzbdQueue({
      baseUrl: "http://localhost:8080",
      apiKey: "secret",
    });

    const requestUrl = mockedSafeFetch.mock.calls[0]?.[0];

    expect(requestUrl).toBeInstanceOf(URL);
    expect((requestUrl as URL).toString()).toBe(
      "http://localhost:8080/api?mode=resume&output=json&apikey=secret",
    );
  });

  it("moves a queue item to a specific position", async () => {
    mockedSafeFetch.mockResolvedValue(
      new Response(JSON.stringify({ result: { position: 2, priority: 0 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await moveSabnzbdQueueItemToPosition({
      baseUrl: "http://localhost:8080",
      apiKey: "secret",
      itemId: "SABnzbd_nzo_2",
      position: 2,
    });

    const requestUrl = mockedSafeFetch.mock.calls[0]?.[0];

    expect(requestUrl).toBeInstanceOf(URL);
    expect((requestUrl as URL).toString()).toBe(
      "http://localhost:8080/api?mode=switch&output=json&value=SABnzbd_nzo_2&value2=2&apikey=secret",
    );
  });
});