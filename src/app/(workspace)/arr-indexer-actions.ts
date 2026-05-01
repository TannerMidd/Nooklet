"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { safeRevalidatePath } from "./recommendation-action-helpers";
import { deleteArrIndexerSchema } from "@/modules/service-connections/schemas/delete-arr-indexer";
import { arrIndexerWriteSchema } from "@/modules/service-connections/schemas/save-arr-indexer";
import { arrIndexerTestSchema } from "@/modules/service-connections/schemas/test-arr-indexer";
import { deleteArrIndexerForUser } from "@/modules/service-connections/workflows/delete-arr-indexer";
import { saveArrIndexerForUser } from "@/modules/service-connections/workflows/save-arr-indexer";
import { testArrIndexerForUser } from "@/modules/service-connections/workflows/test-arr-indexer";

import { type ArrIndexerActionState } from "./arr-indexer-action-state";

function safeJsonParse(raw: FormDataEntryValue | null): unknown {
  if (typeof raw !== "string" || raw.length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function readWriteFormFields(formData: FormData) {
  return {
    serviceType: formData.get("serviceType"),
    id: formData.get("id") || undefined,
    name: formData.get("name"),
    implementation: formData.get("implementation"),
    implementationName: formData.get("implementationName"),
    configContract: formData.get("configContract"),
    protocol: formData.get("protocol"),
    priority: formData.get("priority") ?? 25,
    enableRss: formData.get("enableRss") ?? "false",
    enableAutomaticSearch: formData.get("enableAutomaticSearch") ?? "false",
    enableInteractiveSearch: formData.get("enableInteractiveSearch") ?? "false",
    tags: safeJsonParse(formData.get("tags")) ?? [],
    fields: safeJsonParse(formData.get("fields")) ?? [],
  };
}

export async function submitSaveArrIndexerAction(
  _previousState: ArrIndexerActionState,
  formData: FormData,
): Promise<ArrIndexerActionState> {
  const session = await auth();
  if (!session?.user?.id) {
    return { status: "error", message: "You need to sign in again." };
  }

  const parsed = arrIndexerWriteSchema.safeParse({
    ...readWriteFormFields(formData),
    returnTo: formData.get("returnTo"),
  });
  if (!parsed.success) {
    return { status: "error", message: "Could not save the indexer with the given input." };
  }

  const { returnTo, ...workflowInput } = parsed.data;
  const result = await saveArrIndexerForUser(session.user.id, workflowInput);

  revalidatePath(safeRevalidatePath(returnTo));

  if (!result.ok) {
    return { status: "error", message: result.message };
  }
  return { status: "success", message: result.message };
}

export async function submitDeleteArrIndexerAction(
  _previousState: ArrIndexerActionState,
  formData: FormData,
): Promise<ArrIndexerActionState> {
  const session = await auth();
  if (!session?.user?.id) {
    return { status: "error", message: "You need to sign in again." };
  }

  const parsed = deleteArrIndexerSchema.safeParse({
    serviceType: formData.get("serviceType"),
    id: formData.get("id"),
    returnTo: formData.get("returnTo"),
  });
  if (!parsed.success) {
    return { status: "error", message: "Could not delete the indexer with the given input." };
  }

  const result = await deleteArrIndexerForUser(session.user.id, {
    serviceType: parsed.data.serviceType,
    id: parsed.data.id,
  });

  revalidatePath(safeRevalidatePath(parsed.data.returnTo));

  if (!result.ok) {
    return { status: "error", message: result.message };
  }
  return { status: "success", message: result.message };
}

export async function submitTestArrIndexerAction(
  _previousState: ArrIndexerActionState,
  formData: FormData,
): Promise<ArrIndexerActionState> {
  const session = await auth();
  if (!session?.user?.id) {
    return { status: "error", message: "You need to sign in again." };
  }

  const parsed = arrIndexerTestSchema.safeParse(readWriteFormFields(formData));
  if (!parsed.success) {
    return { status: "error", message: "Could not test the indexer with the given input." };
  }

  const result = await testArrIndexerForUser(session.user.id, parsed.data);
  if (!result.ok) {
    return { status: "error", message: result.message };
  }
  if (!result.value.ok) {
    return {
      status: "test-failed",
      message: "Indexer reported validation errors.",
      testFailures: result.value.failures,
    };
  }
  return { status: "success", message: "Indexer test succeeded." };
}
