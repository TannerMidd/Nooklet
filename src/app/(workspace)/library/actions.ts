"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import {
  addLibraryPathCommand,
  LibraryPathCommandError,
} from "@/modules/media-library/commands/add-library-path";
import { addLibraryPathInputSchema } from "@/modules/media-library/schemas/library-path";

export type LibraryPathActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
};

export const initialLibraryPathActionState: LibraryPathActionState = {
  status: "idle",
  message: null,
};

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
