import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/safe-fetch", () => ({
  safeFetch: vi.fn(),
}));

import { safeFetch } from "@/lib/security/safe-fetch";

import { listSabnzbdQueue } from "./sabnzbd";

const mockedSafeFetch = vi.mocked(safeFetch);

describe("listSabnzbdQueue", () => {
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
  });
});