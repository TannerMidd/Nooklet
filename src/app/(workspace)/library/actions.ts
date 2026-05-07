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
  updateMediaTitlePreferencesCommand,
  UpdateMediaTitlePreferencesCommandError,
} from "@/modules/media-library/commands/update-media-title-preferences";
import {
  updateTvEpisodeMonitoringCommand,
  UpdateTvEpisodeMonitoringCommandError,
} from "@/modules/media-library/commands/update-tv-episode-monitoring";
import {
  addLibraryPathInputSchema,
  removeLibraryPathInputSchema,
  updateLibraryPathInputSchema,
} from "@/modules/media-library/schemas/library-path";
import { updateMediaTitlePreferencesInputSchema } from "@/modules/media-library/schemas/media-title-preferences";
import { updateTvEpisodeMonitoringInputSchema } from "@/modules/media-library/schemas/tv-episode-preferences";
import {
  scanMediaLibraryInputSchema,
  scanMediaLibraryWorkflow,
  ScanMediaLibraryWorkflowError,
} from "@/modules/media-library/workflows/scan-library";
import {
  initialMediaTitlePreferenceActionState,
  initialScanLibraryActionState,
  initialTvEpisodeMonitoringActionState,
  type LibraryPathActionState,
  type LibraryPathMutationActionState,
  type MediaTitlePreferenceActionState,
  type ScanLibraryActionState,
  type TvEpisodeMonitoringActionState,
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

export async function updateMediaTitlePreferencesAction(
  _previous: MediaTitlePreferenceActionState,
  formData: FormData,
): Promise<MediaTitlePreferenceActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return { ...initialMediaTitlePreferenceActionState, status: "error", message: "You need to sign in again." };
  }

  const parsed = updateMediaTitlePreferencesInputSchema.safeParse({
    titleId: formData.get("titleId"),
    monitored: formData.get("monitored") === "on",
    qualityProfile: formData.get("qualityProfile"),
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "Review the title options and try again.";
    return { ...initialMediaTitlePreferenceActionState, status: "error", message: firstIssue };
  }

  try {
    const title = await updateMediaTitlePreferencesCommand(session.user.id, parsed.data);

    revalidatePath("/library");
    revalidatePath(title.mediaType === "tv" ? "/library/tv" : "/library/movies");

    return { status: "success", message: "Title preferences updated." };
  } catch (error) {
    if (error instanceof UpdateMediaTitlePreferencesCommandError) {
      return { ...initialMediaTitlePreferenceActionState, status: "error", message: error.message };
    }

    return {
      ...initialMediaTitlePreferenceActionState,
      status: "error",
      message: "Nooklet could not update that title.",
    };
  }
}

export async function updateTvEpisodeMonitoringAction(
  _previous: TvEpisodeMonitoringActionState,
  formData: FormData,
): Promise<TvEpisodeMonitoringActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return { ...initialTvEpisodeMonitoringActionState, status: "error", message: "You need to sign in again." };
  }

  const parsed = updateTvEpisodeMonitoringInputSchema.safeParse({
    episodeId: formData.get("episodeId"),
    monitored: formData.get("monitored") === "on",
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "Review the episode options and try again.";
    return { ...initialTvEpisodeMonitoringActionState, status: "error", message: firstIssue };
  }

  try {
    const result = await updateTvEpisodeMonitoringCommand(session.user.id, parsed.data);

    revalidatePath("/library/tv");
    revalidatePath(`/library/tv/${result.title.id}`);

    return { status: "success", message: "Episode monitoring updated." };
  } catch (error) {
    if (error instanceof UpdateTvEpisodeMonitoringCommandError) {
      return { ...initialTvEpisodeMonitoringActionState, status: "error", message: error.message };
    }

    return {
      ...initialTvEpisodeMonitoringActionState,
      status: "error",
      message: "Nooklet could not update that episode.",
    };
  }
}
