import { describe, expect, it } from "vitest";

import { NntpError, type NntpServerOptions } from "@/modules/download-engine/nntp/nntp-client";
import { parseNzb } from "@/modules/download-engine/nzb/parse-nzb";
import {
  isPar2Subject,
  releaseIsWhollyUnavailable,
  type ReleaseProbeClient,
} from "@/modules/download-engine/scheduler/release-availability";

const server: NntpServerOptions = { host: "news.example", port: 563 };

function nzbWith(segmentCount: number, subject = '"feature.mkv"') {
  const segments = Array.from({ length: segmentCount }, (_, index) =>
    `<segment bytes="700000" number="${index + 1}">seg-${index + 1}@test</segment>`).join("");

  return parseNzb(
    `<nzb><file subject="${subject.replaceAll('"', "&quot;")}"><groups><group>a.b.c</group></groups>`
    + `<segments>${segments}</segments></file></nzb>`,
  );
}

function probeClient(overrides: Partial<ReleaseProbeClient> = {}) {
  const calls = { stat: 0, body: 0 };
  const client: ReleaseProbeClient = {
    connect: async () => undefined,
    stat: async () => { calls.stat += 1; return false; },
    body: async () => {
      calls.body += 1;
      throw new NntpError("article-not-found", "430", true);
    },
    quit: async () => undefined,
    destroy: () => undefined,
    ...overrides,
  };

  return { client, calls };
}

describe("releaseIsWhollyUnavailable", () => {
  it("condemns a release whose articles STAT missing and BODY confirms gone", async () => {
    const { client, calls } = probeClient();

    await expect(releaseIsWhollyUnavailable({
      nzb: nzbWith(40),
      server,
      clientFactory: () => client,
    })).resolves.toBe(true);

    expect(calls.body).toBe(3);
  });

  it("clears a healthy release on the first present article", async () => {
    const { client, calls } = probeClient({ stat: async () => true });

    await expect(releaseIsWhollyUnavailable({
      nzb: nzbWith(40),
      server,
      clientFactory: () => client,
    })).resolves.toBe(false);

    // A healthy release must not pay for the whole sample.
    expect(calls.body).toBe(0);
  });

  it("clears a release the server serves despite STAT reporting it missing", async () => {
    // The failure mode the BODY confirmation exists for: STAT is unusable here,
    // but the articles are perfectly fetchable.
    const { client } = probeClient({ body: async () => Buffer.from("=ybegin") });

    await expect(releaseIsWhollyUnavailable({
      nzb: nzbWith(40),
      server,
      clientFactory: () => client,
    })).resolves.toBe(false);
  });

  it("never condemns a release on connection trouble", async () => {
    const { client } = probeClient({
      body: async () => { throw new NntpError("timeout", "Timed out."); },
    });

    await expect(releaseIsWhollyUnavailable({
      nzb: nzbWith(40),
      server,
      clientFactory: () => client,
    })).resolves.toBe(false);

    const failing = probeClient({
      connect: async () => { throw new NntpError("connect-failed", "No route."); },
    });

    await expect(releaseIsWhollyUnavailable({
      nzb: nzbWith(40),
      server,
      clientFactory: () => failing.client,
    })).resolves.toBe(false);
  });

  it("skips releases too small for the sample to mean anything", async () => {
    const { client, calls } = probeClient();

    await expect(releaseIsWhollyUnavailable({
      nzb: nzbWith(4),
      server,
      clientFactory: () => client,
    })).resolves.toBe(false);

    expect(calls.stat).toBe(0);
  });

  it("ignores PAR2 volumes when deciding there is nothing left to fetch", async () => {
    const { client, calls } = probeClient();

    await expect(releaseIsWhollyUnavailable({
      nzb: nzbWith(40, '"feature.vol000+01.par2"'),
      server,
      clientFactory: () => client,
    })).resolves.toBe(false);

    expect(calls.stat).toBe(0);
  });

  it("identifies PAR2 subjects", () => {
    expect(isPar2Subject('"release.vol000+01.par2" yEnc')).toBe(true);
    expect(isPar2Subject('"release.mkv" yEnc')).toBe(false);
  });
});
