import { decryptSecret } from "@/lib/security/secret-box";
import { type RecommendationMediaType } from "@/lib/database/schema";
import { getPreferencesByUserId } from "@/modules/preferences/repositories/preferences-repository";
import { generateOpenAiCompatibleRecommendations } from "@/modules/recommendations/adapters/openai-compatible-recommendations";
import {
  completeRecommendationRun,
  createRecommendationRun,
  markRecommendationRunFailed,
} from "@/modules/recommendations/repositories/recommendation-repository";
import { type RecommendationRequestInput } from "@/modules/recommendations/schemas/recommendation-request";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";

type CreateRecommendationRunResult =
  | { ok: true; runId: string }
  | { ok: false; message: string };

function dedupeGeneratedItems(
  items: Awaited<ReturnType<typeof generateOpenAiCompatibleRecommendations>>,
  mediaType: RecommendationMediaType,
) {
  const seenKeys = new Set<string>();

  return items
    .filter((item) => {
      const key = `${item.title.trim().toLowerCase()}::${item.year ?? "unknown"}`;

      if (seenKeys.has(key)) {
        return false;
      }

      seenKeys.add(key);
      return true;
    })
    .map((item, index) => ({
      mediaType,
      position: index + 1,
      title: item.title,
      year: item.year,
      rationale: item.rationale,
      confidenceLabel: item.confidenceLabel,
      providerMetadataJson: JSON.stringify(item.providerMetadata),
    }));
}

export async function createRecommendationRunWorkflow(
  userId: string,
  input: RecommendationRequestInput,
): Promise<CreateRecommendationRunResult> {
  const preferences = await getPreferencesByUserId(userId);
  const aiProvider = await findServiceConnectionByType(userId, "ai-provider");

  if (!aiProvider?.secret) {
    return {
      ok: false,
      message: "Configure the AI provider connection before requesting recommendations.",
    };
  }

  if (aiProvider.connection.status !== "verified") {
    return {
      ok: false,
      message: "Verify the AI provider connection before requesting recommendations.",
    };
  }

  const aiModel =
    typeof aiProvider.metadata?.model === "string" && aiProvider.metadata.model.trim().length > 0
      ? (aiProvider.metadata.model as string)
      : "gpt-4.1-mini";

  const run = await createRecommendationRun({
    userId,
    mediaType: input.mediaType,
    requestPrompt: input.requestPrompt,
    requestedCount: input.requestedCount,
    aiModel,
    watchHistoryOnly: preferences.watchHistoryOnly,
  });

  if (!run) {
    return {
      ok: false,
      message: "Unable to create a recommendation run.",
    };
  }

  await createAuditEvent({
    actorUserId: userId,
    eventType: "recommendations.run.created",
    subjectType: "recommendation-run",
    subjectId: run.id,
    payloadJson: JSON.stringify({
      mediaType: input.mediaType,
      requestedCount: input.requestedCount,
    }),
  });

  try {
    const generatedItems = await generateOpenAiCompatibleRecommendations({
      baseUrl: aiProvider.connection.baseUrl ?? "",
      apiKey: decryptSecret(aiProvider.secret.encryptedValue),
      model: aiModel,
      mediaType: input.mediaType,
      requestPrompt: input.requestPrompt,
      requestedCount: input.requestedCount,
      watchHistoryOnly: preferences.watchHistoryOnly,
    });

    const normalizedItems = dedupeGeneratedItems(generatedItems, input.mediaType);

    if (normalizedItems.length === 0) {
      throw new Error("The AI provider returned no usable recommendations.");
    }

    await completeRecommendationRun(run.id, normalizedItems);
    await createAuditEvent({
      actorUserId: userId,
      eventType: "recommendations.run.succeeded",
      subjectType: "recommendation-run",
      subjectId: run.id,
      payloadJson: JSON.stringify({
        mediaType: input.mediaType,
        itemCount: normalizedItems.length,
      }),
    });

    return {
      ok: true,
      runId: run.id,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Recommendation generation failed.";

    await markRecommendationRunFailed(run.id, message);
    await createAuditEvent({
      actorUserId: userId,
      eventType: "recommendations.run.failed",
      subjectType: "recommendation-run",
      subjectId: run.id,
      payloadJson: JSON.stringify({
        mediaType: input.mediaType,
        error: message,
      }),
    });

    return {
      ok: false,
      message,
    };
  }
}
