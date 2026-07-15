"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { type RecommendationMediaType } from "@/lib/database/schema";
import { addIndexerCommand } from "@/modules/indexers/commands/add-indexer";
import {
  removeIndexerCommand,
  RemoveIndexerCommandError,
} from "@/modules/indexers/commands/remove-indexer";
import { updateIndexerCommand } from "@/modules/indexers/commands/update-indexer";
import {
  addIndexerInputSchema,
  testIndexerInputSchema,
  updateIndexerInputSchema,
} from "@/modules/indexers/schemas/indexer-input";
import {
  testIndexerWorkflow,
  TestIndexerWorkflowError,
} from "@/modules/indexers/workflows/test-indexer";
import {
  testAndSaveIndexer,
  TestAndSaveIndexerError,
} from "@/modules/indexers/workflows/test-and-save-indexer";
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

function readCategories(formData: FormData, mediaType: RecommendationMediaType) {
  const friendlyCategories = formData
    .getAll(`${mediaType}Category`)
    .flatMap((value) => parseCategoryList(value, mediaType));
  const customCategories = parseCategoryList(formData.get(`${mediaType}CustomCategories`), mediaType);
  const legacyCategories = parseCategoryList(formData.get(`${mediaType}Categories`), mediaType);

  return Array.from(
    new Map(
      [...friendlyCategories, ...customCategories, ...legacyCategories]
        .map((category) => [category.categoryId, category]),
    ).values(),
  );
}

function parseOptionalApiKey(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function readIndexerFormInput(formData: FormData) {
  const categories = categoryMediaTypes.flatMap((mediaType) => (
    readCategories(formData, mediaType)
  ));

  return {
    name: formData.get("name"),
    protocol: formData.get("protocol"),
    baseUrl: formData.get("baseUrl"),
    apiPath: formData.get("apiPath") || "/api",
    isEnabled: formData.get("isEnabled") === "on",
    priority: formData.get("priority") || 0,
    categories,
  };
}

export async function addIndexerAction(
  _previous: IndexerActionState,
  formData: FormData,
): Promise<IndexerActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return { status: "error", message: "You need to sign in again." };
  }

  if (session.user.role !== "admin") {
    return { status: "error", message: "Only an administrator can manage indexers." };
  }

  const parsed = addIndexerInputSchema.safeParse({
    ...readIndexerFormInput(formData),
    apiKey: formData.get("apiKey"),
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "Review the indexer settings and try again.";
    return { status: "error", message: firstIssue };
  }

  try {
    if (formData.get("intent") === "test-save") {
      const result = await testAndSaveIndexer(session.user.id, parsed.data);
      revalidatePath("/settings/indexers");
      return { status: result.ok ? "success" : "error", message: result.message };
    }

    await addIndexerCommand(session.user.id, parsed.data);
  } catch (error) {
    if (error instanceof TestAndSaveIndexerError) {
      return { status: "error", message: error.message };
    }
    return { status: "error", message: "Failed to add indexer." };
  }

  revalidatePath("/settings/indexers");
  return { status: "success", message: "Indexer added." };
}

export async function updateIndexerAction(
  _previous: IndexerActionState,
  formData: FormData,
): Promise<IndexerActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return { status: "error", message: "You need to sign in again." };
  }

  if (session.user.role !== "admin") {
    return { status: "error", message: "Only an administrator can manage indexers." };
  }

  const parsed = updateIndexerInputSchema.safeParse({
    id: formData.get("id"),
    ...readIndexerFormInput(formData),
    apiKey: parseOptionalApiKey(formData.get("apiKey")),
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "Review the indexer settings and try again.";
    return { status: "error", message: firstIssue };
  }

  try {
    if (formData.get("intent") === "test-save") {
      const result = await testAndSaveIndexer(session.user.id, parsed.data);
      revalidatePath("/settings/indexers");
      return { status: result.ok ? "success" : "error", message: result.message };
    }

    await updateIndexerCommand(session.user.id, parsed.data);
  } catch (error) {
    if (error instanceof TestAndSaveIndexerError) {
      return { status: "error", message: error.message };
    }
    return { status: "error", message: "Failed to save indexer." };
  }

  revalidatePath("/settings/indexers");
  return { status: "success", message: "Indexer saved." };
}

export async function testIndexerAction(
  _previous: IndexerActionState,
  formData: FormData,
): Promise<IndexerActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return { status: "error", message: "You need to sign in again." };
  }

  if (session.user.role !== "admin") {
    return { status: "error", message: "Only an administrator can manage indexers." };
  }

  const parsed = testIndexerInputSchema.safeParse({ id: formData.get("id") });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "Choose an indexer to test.";
    return { status: "error", message: firstIssue };
  }

  try {
    const result = await testIndexerWorkflow(session.user.id, parsed.data);

    revalidatePath("/settings/indexers");
    return { status: result.ok ? "success" : "error", message: result.message };
  } catch (error) {
    if (error instanceof TestIndexerWorkflowError) {
      revalidatePath("/settings/indexers");
      return { status: "error", message: error.message };
    }

    return {
      status: "error",
      message: "Indexer test failed.",
    };
  }
}

export async function removeIndexerAction(
  _previous: IndexerActionState,
  formData: FormData,
): Promise<IndexerActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return { status: "error", message: "You need to sign in again." };
  }

  if (session.user.role !== "admin") {
    return { status: "error", message: "Only an administrator can manage indexers." };
  }

  const parsed = testIndexerInputSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { status: "error", message: "Choose an indexer to remove." };
  }

  try {
    const result = await removeIndexerCommand(session.user.id, parsed.data.id);
    revalidatePath("/settings/indexers");
    return { status: "success", message: `${result.name} removed.` };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof RemoveIndexerCommandError
        ? error.message
        : "Indexer could not be removed.",
    };
  }
}
