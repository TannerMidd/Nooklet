import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/recommendations/repositories/recommendation-repository", () => ({
  createRecommendationItemTimelineEvent: vi.fn(async () => undefined),
  findRecommendationItemForUser: vi.fn(),
  upsertRecommendationItemHiddenState: vi.fn(),
}));
vi.mock("@/modules/users/repositories/user-repository", () => ({
  createAuditEvent: vi.fn(),
}));

import {
  findRecommendationItemForUser,
  upsertRecommendationItemHiddenState,
} from "@/modules/recommendations/repositories/recommendation-repository";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";

import { updateRecommendationHiddenState } from "./update-recommendation-hidden-state";

const findMock = vi.mocked(findRecommendationItemForUser);
const upsertMock = vi.mocked(upsertRecommendationItemHiddenState);
const auditMock = vi.mocked(createAuditEvent);

describe("updateRecommendationHiddenState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertMock.mockResolvedValue(undefined as never);
    auditMock.mockResolvedValue(undefined as never);
  });

  it("returns false and writes nothing when the item is not owned by the user", async () => {
    findMock.mockResolvedValue(null);

    const result = await updateRecommendationHiddenState("user-1", "item-1", true);

    expect(result).toBe(false);
    expect(upsertMock).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("emits the 'hidden' event type and persists isHidden=true", async () => {
    findMock.mockResolvedValue({ id: "item-1" } as never);

    const result = await updateRecommendationHiddenState("user-1", "item-1", true);

    expect(upsertMock).toHaveBeenCalledWith("user-1", "item-1", true);
    expect(auditMock).toHaveBeenCalledWith({
      actorUserId: "user-1",
      eventType: "recommendations.item.hidden",
      subjectType: "recommendation-item",
      subjectId: "item-1",
    });
    expect(result).toBe(true);
  });

  it("emits the 'unhidden' event type and persists isHidden=false", async () => {
    findMock.mockResolvedValue({ id: "item-1" } as never);

    const result = await updateRecommendationHiddenState("user-1", "item-1", false);

    expect(upsertMock).toHaveBeenCalledWith("user-1", "item-1", false);
    expect(auditMock).toHaveBeenCalledWith({
      actorUserId: "user-1",
      eventType: "recommendations.item.unhidden",
      subjectType: "recommendation-item",
      subjectId: "item-1",
    });
    expect(result).toBe(true);
  });
});
