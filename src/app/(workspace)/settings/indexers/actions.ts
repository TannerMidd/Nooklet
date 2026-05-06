"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { type RecommendationMediaType } from "@/lib/database/schema";
import { addIndexerCommand } from "@/modules/indexers/commands/add-indexer";
import { addIndexerInputSchema } from "@/modules/indexers/schemas/indexer-input";
import { type IndexerActionState } from "./action-state";

const categoryMediaTypes = ["movie", "tv"] as const satisfies readonly RecommendationMediaType[];

function parseCategoryList(value: FormDataEntryValue | null, mediaType: RecommendationMediaType) {
  if (typeof value !== "string") {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((categoryId) => ({
      mediaType,
      categoryId,
      label: mediaType === "tv" ? "TV" : "Movies",
    }));
}

export async function addIndexerAction(
  _previous: IndexerActionState,
  formData: FormData,
): Promise<IndexerActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return { status: "error", message: "You need to sign in again." };
  }

  const categories = categoryMediaTypes.flatMap((mediaType) => (
    parseCategoryList(formData.get(`${mediaType}Categories`), mediaType)
  ));
  const parsed = addIndexerInputSchema.safeParse({
    name: formData.get("name"),
    protocol: formData.get("protocol"),
    baseUrl: formData.get("baseUrl"),
    apiPath: formData.get("apiPath") || "/api",
    apiKey: formData.get("apiKey"),
    isEnabled: formData.get("isEnabled") === "on",
    priority: formData.get("priority") || 0,
    categories,
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "Review the indexer settings and try again.";
    return { status: "error", message: firstIssue };
  }

  try {
    await addIndexerCommand(session.user.id, parsed.data);
  } catch {
    return { status: "error", message: "Failed to add indexer." };
  }

  revalidatePath("/settings/indexers");
  return { status: "success", message: "Indexer added." };
}
