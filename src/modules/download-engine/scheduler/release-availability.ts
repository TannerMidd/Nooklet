import {
  NntpClient,
  NntpError,
  type NntpServerOptions,
} from "@/modules/download-engine/nntp/nntp-client";
import { type ParsedNzb } from "@/modules/download-engine/nzb/parse-nzb";

/**
 * Cheap "is this release still on the server at all?" check, used before a
 * candidate is committed to the download queue.
 *
 * This is deliberately a narrower question than the transfer-time probe in
 * download-nzb.ts. That one estimates *partial* loss against the PAR2 recovery
 * budget and needs a large sample to bound its error. Here the only verdict
 * that matters is total unavailability, so the sample can be small and the
 * check exits on the first article the server does have — a healthy release
 * costs one round trip.
 */

export type ReleaseProbeClient = Pick<NntpClient, "connect" | "body" | "stat" | "quit" | "destroy">;

/** PAR2 recovery volumes are identifiable from the NZB subject line. */
export function isPar2Subject(subject: string) {
  return /\.par2\b/i.test(subject);
}

/** Uniform sample without replacement (partial Fisher–Yates). */
export function sampleWithoutReplacement<T>(source: readonly T[], count: number): T[] {
  const pool = [...source];
  const size = Math.min(count, pool.length);

  for (let index = 0; index < size; index += 1) {
    const pick = index + Math.floor(Math.random() * (pool.length - index));
    [pool[index], pool[pick]] = [pool[pick], pool[index]];
  }

  return pool.slice(0, size);
}

/** Below this many data segments the sample cannot say anything useful. */
const minDataSegments = 8;
const sampleSize = 24;
/** BODY requests used to confirm an all-missing STAT sample. */
const confirmationArticles = 3;

export type ReleaseAvailabilityProbeInput = {
  nzb: ParsedNzb;
  server: NntpServerOptions;
  /** Test seam — swap the socket client for a scripted fake. */
  clientFactory?: (options: NntpServerOptions) => ReleaseProbeClient;
};

/**
 * Resolves true only when the release is proven gone: every sampled data
 * article is missing *and* real BODY requests confirm it. Anything else —
 * a single present article, a server that rejects STAT, any connection
 * trouble — resolves false, because refusing a downloadable release is far
 * worse than spending one transfer attempt discovering it is not.
 */
export async function releaseIsWhollyUnavailable(
  input: ReleaseAvailabilityProbeInput,
): Promise<boolean> {
  const dataSegments = input.nzb.files
    .filter((file) => !isPar2Subject(file.subject))
    .flatMap((file) => file.segments);

  if (dataSegments.length < minDataSegments) {
    return false;
  }

  const client = (input.clientFactory ?? ((options) => new NntpClient(options)))(input.server);
  const sample = sampleWithoutReplacement(dataSegments, sampleSize);

  try {
    await client.connect();

    for (const segment of sample) {
      // One article the server has is enough to disprove the verdict, so a
      // healthy release almost always exits on the first STAT.
      if (await client.stat(segment.messageId)) {
        return false;
      }
    }

    for (const segment of sample.slice(0, confirmationArticles)) {
      try {
        await client.body(segment.messageId);
        // Fetchable after all: STAT is not usable for this release.
        return false;
      } catch (error) {
        if (!(error instanceof NntpError) || error.kind !== "article-not-found") {
          // Transport trouble proves nothing about the release.
          return false;
        }
      }
    }

    return true;
  } catch {
    // A probe that cannot run must never block a download.
    return false;
  } finally {
    await client.quit().catch(() => client.destroy());
  }
}
