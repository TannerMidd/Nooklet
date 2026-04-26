import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/recommendations/repositories/recommendation-repository", () => ({
  findRecommendationItemForUser: vi.fn(),
  upsertRecommendationFeedback: vi.fn(),
}));
vi.mock("@/modules/users/repositories/user-repository", () => ({
  createAuditEvent: vi.fn(),
}));

import {
  findRecommendationItemForUser,
  upsertRecommendationFeedback,
} from "@/modules/recommendations/repositories/recommendation-repository";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";

import { updateRecommendationFeedback } from "./update-recommendation-feedback";

const findMock = vi.mocked(findRecommendationItemForUser);
const upsertMock = vi.mocked(upsertRecommendationFeedback);
const auditMock = vi.mocked(createAuditEvent);

describe("updateRecommendationFeedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertMock.mockResolvedValue(undefined as never);
    auditMock.mockResolvedValue(undefined as never);
  });

  it("returns false and writes nothing when the item is not owned by the user", async () => {
    findMock.mockResolvedValue(null);

    const result = await updateRecommendationFeedback("user-1", "item-1", "like");

    expect(result).toBe(false);
    expect(upsertMock).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("upserts the feedback and emits an audit event when the item is owned by the user", async () => {
    findMock.mockResolvedValue({ id: "item-1" } as never);

    const result = await updateRecommendationFeedback("user-1", "item-1", "like");

    expect(findMock).toHaveBeenCalledWith("user-1", "item-1");
    expect(upsertMock).toHaveBeenCalledWith("user-1", "item-1", "like");
    expect(auditMock).toHaveBeenCalledWith({
      actorUserId: "user-1",
      eventType: "recommendations.feedback.updated",
      subjectType: "recommendation-item",
      subjectId: "item-1",
      payloadJson: JSON.stringify({ feedback: "like" }),
    });
    expect(result).toBe(true);
  });

  it.each(["like", "dislike"] as const)(
    "forwards the %s feedback value to the repository and audit payload",
    async (feedback) => {
      findMock.mockResolvedValue({ id: "item-1" } as never);

      await updateRecommendationFeedback("user-1", "item-1", feedback);

      expect(upsertMock).toHaveBeenCalledWith("user-1", "item-1", feedback);
      expect(auditMock.mock.calls[0]?.[0]?.payloadJson).toBe(JSON.stringify({ feedback }));
    },
  );
});
