import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/media-library/repositories/media-request-attempts-repository", () => ({
  acquireMediaRequestAttempt: vi.fn(),
}));

import { acquireMediaRequestAttempt } from "@/modules/media-library/repositories/media-request-attempts-repository";

import { type MissingContentCandidate } from "./candidate-selection";
import {
  budgetMissingContentCandidates,
  MISSING_SEARCH_BACKOFF_MS,
  missingSearchAttemptKey,
} from "./search-budgeting";

const acquireMock = vi.mocked(acquireMediaRequestAttempt);

const movieCandidate: MissingContentCandidate = {
  kind: "movie",
  titleId: "title1",
  episodeId: null,
  label: "Arrival",
};
const episodeCandidate: MissingContentCandidate = {
  kind: "episode",
  titleId: "show1",
  episodeId: "episode1",
  label: "Severance S01E02",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("missingSearchAttemptKey", () => {
  it("keys movies by title and episodes by episode", () => {
    expect(missingSearchAttemptKey(movieCandidate)).toBe("auto-search:title:title1");
    expect(missingSearchAttemptKey(episodeCandidate)).toBe("auto-search:episode:episode1");
  });
});

describe("budgetMissingContentCandidates", () => {
  it("keeps only candidates whose backoff lock was acquired", async () => {
    acquireMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const budgeted = await budgetMissingContentCandidates("user1", [
      movieCandidate,
      episodeCandidate,
    ]);

    expect(budgeted).toEqual([movieCandidate]);
    expect(acquireMock).toHaveBeenCalledWith(
      "user1",
      "auto-search:title:title1",
      MISSING_SEARCH_BACKOFF_MS,
    );
    expect(acquireMock).toHaveBeenCalledWith(
      "user1",
      "auto-search:episode:episode1",
      MISSING_SEARCH_BACKOFF_MS,
    );
  });
});
