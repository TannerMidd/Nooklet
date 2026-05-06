"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import {
  addLibraryPathCommand,
  LibraryPathCommandError,
} from "@/modules/media-library/commands/add-library-path";
import {
  removeLibraryPathCommand,
  RemoveLibraryPathCommandError,
} from "@/modules/media-library/commands/remove-library-path";
import {
  updateLibraryPathCommand,
  UpdateLibraryPathCommandError,
} from "@/modules/media-library/commands/update-library-path";
import {
  addLibraryPathInputSchema,
  removeLibraryPathInputSchema,
  updateLibraryPathInputSchema,
} from "@/modules/media-library/schemas/library-path";
import {
  scanMediaLibraryInputSchema,
  scanMediaLibraryWorkflow,
  ScanMediaLibraryWorkflowError,
} from "@/modules/media-library/workflows/scan-library";
import {
  initialScanLibraryActionState,
  type LibraryPathActionState,
  type LibraryPathMutationActionState,
  type ScanLibraryActionState,
} from "./action-state";

export async function addLibraryPathAction(
  _previous: LibraryPathActionState,
  formData: FormData,
): Promise<LibraryPathActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return { status: "error", message: "You need to sign in again." };
  }

  const parsed = addLibraryPathInputSchema.safeParse({
    mediaType: formData.get("mediaType"),
    libraryName: formData.get("libraryName"),
    path: formData.get("path"),
    label: formData.get("label") || undefined,
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "Review the library folder and try again.";
    return { status: "error", message: firstIssue };
  }

  try {
    await addLibraryPathCommand(session.user.id, parsed.data);
  } catch (error) {
    if (error instanceof LibraryPathCommandError) {
      return { status: "error", message: error.message };
    }

    return { status: "error", message: "Failed to add library folder." };
  }

  revalidatePath("/library");
  return { status: "success", message: "Library folder added." };
}

export async function scanLibraryAction(
  _previous: ScanLibraryActionState = initialScanLibraryActionState,
  _formData?: FormData,
): Promise<ScanLibraryActionState> {
  void _previous;
  void _formData;

  const session = await auth();

  if (!session?.user?.id) {
    return { status: "error", message: "You need to sign in again." };
  }

  const parsed = scanMediaLibraryInputSchema.safeParse({});

  if (!parsed.success) {
    return { status: "error", message: "Nooklet could not start the scan." };
  }

  try {
    const result = await scanMediaLibraryWorkflow(session.user.id, parsed.data);

    revalidatePath("/library");
    return {
      status: "success",
      message: `Scan finished: ${result.discoveredFileCount} file${result.discoveredFileCount === 1 ? "" : "s"}, ${result.matchedTitleCount} title${result.matchedTitleCount === 1 ? "" : "s"}.`,
    };
  } catch (error) {
    if (error instanceof ScanMediaLibraryWorkflowError) {
      return { status: "error", message: error.message };
    }

    return { status: "error", message: "Nooklet could not scan the library." };
  }
}

export async function updateLibraryPathAction(
  _previous: LibraryPathMutationActionState,
  formData: FormData,
): Promise<LibraryPathMutationActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return { status: "error", message: "You need to sign in again." };
  }

  const parsed = updateLibraryPathInputSchema.safeParse({
    pathId: formData.get("pathId"),
    mediaType: formData.get("mediaType"),
    libraryName: formData.get("libraryName"),
    path: formData.get("path"),
    label: formData.get("label") || undefined,
    status: formData.get("status"),
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "Review the library folder and try again.";
    return { status: "error", message: firstIssue };
  }

  try {
    await updateLibraryPathCommand(session.user.id, parsed.data);
  } catch (error) {
    if (error instanceof UpdateLibraryPathCommandError) {
      return { status: "error", message: error.message };
    }

    return { status: "error", message: "Failed to update library folder." };
  }

  revalidatePath("/library");
  return { status: "success", message: "Library folder updated." };
}

export async function removeLibraryPathAction(
  _previous: LibraryPathMutationActionState,
  formData: FormData,
): Promise<LibraryPathMutationActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return { status: "error", message: "You need to sign in again." };
  }

  const parsed = removeLibraryPathInputSchema.safeParse({
    pathId: formData.get("pathId"),
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "Choose a library folder.";
    return { status: "error", message: firstIssue };
  }

  try {
    await removeLibraryPathCommand(session.user.id, parsed.data);
  } catch (error) {
    if (error instanceof RemoveLibraryPathCommandError) {
      return { status: "error", message: error.message };
    }

    return { status: "error", message: "Failed to remove library folder." };
  }

  revalidatePath("/library");
  return { status: "success", message: "Library folder removed." };
}
