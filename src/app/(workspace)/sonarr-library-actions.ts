"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { type RecommendationLibraryActionState } from "@/app/(workspace)/recommendation-action-state";
import { safeRevalidatePath } from "./recommendation-action-helpers";
import { updateSonarrSeriesSeasonMonitoringSchema } from "@/modules/service-connections/schemas/update-sonarr-series-season-monitoring";
import { updateSonarrSeriesSeasonMonitoringForUser } from "@/modules/service-connections/workflows/update-sonarr-series-season-monitoring";
import { updateSonarrSeriesEpisodeMonitoringSchema } from "@/modules/service-connections/schemas/update-sonarr-series-episode-monitoring";
import { updateSonarrSeriesEpisodeMonitoringForUser } from "@/modules/service-connections/workflows/update-sonarr-series-episode-monitoring";
import { updateSonarrSeriesMonitoringSchema } from "@/modules/service-connections/schemas/update-sonarr-series-monitoring";
import { updateSonarrSeriesMonitoringForUser } from "@/modules/service-connections/workflows/update-sonarr-series-monitoring";
import { deleteSonarrSeriesSchema } from "@/modules/service-connections/schemas/delete-sonarr-series";
import { deleteSonarrSeriesForUser } from "@/modules/service-connections/workflows/delete-sonarr-series";
import { listSonarrSeriesEpisodesForUser } from "@/modules/service-connections/workflows/list-sonarr-series-episodes-for-user";
import { type SonarrEpisode } from "@/modules/service-connections/adapters/sonarr-episodes";

export type SonarrLibraryActionState = RecommendationLibraryActionState;

export type LoadSonarrSeriesEpisodesActionResult =
  | { ok: true; episodes: SonarrEpisode[] }
  | { ok: false; message: string };

export async function submitSonarrSeriesSeasonMonitoringAction(
  _previousState: SonarrLibraryActionState,
  formData: FormData,
): Promise<SonarrLibraryActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      status: "error",
      message: "You need to sign in again.",
    };
  }

  const parsedInput = updateSonarrSeriesSeasonMonitoringSchema.safeParse({
    seriesId: formData.get("seriesId"),
    monitoredSeasonNumbers: formData.getAll("monitoredSeasonNumbers"),
    returnTo: formData.get("returnTo"),
  });

  if (!parsedInput.success) {
    return {
      status: "error",
      message: "Pick a valid set of seasons and try again.",
    };
  }

  const result = await updateSonarrSeriesSeasonMonitoringForUser(
    session.user.id,
    parsedInput.data,
  );

  revalidatePath(safeRevalidatePath(parsedInput.data.returnTo));

  if (!result.ok) {
    return {
      status: "error",
      message: result.message,
    };
  }

  return {
    status: "success",
    message: result.message,
  };
}

export async function loadSonarrSeriesEpisodesForLibraryAction(
  seriesId: number,
): Promise<LoadSonarrSeriesEpisodesActionResult> {
  const session = await auth();

  if (!session?.user?.id) {
    return { ok: false, message: "You need to sign in again." };
  }

  if (!Number.isInteger(seriesId) || seriesId <= 0) {
    return { ok: false, message: "Invalid Sonarr series id." };
  }

  const result = await listSonarrSeriesEpisodesForUser(session.user.id, seriesId);

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  return { ok: true, episodes: result.episodes };
}

export async function submitSonarrSeriesEpisodeMonitoringAction(
  _previousState: SonarrLibraryActionState,
  formData: FormData,
): Promise<SonarrLibraryActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      status: "error",
      message: "You need to sign in again.",
    };
  }

  const parsedInput = updateSonarrSeriesEpisodeMonitoringSchema.safeParse({
    seriesId: formData.get("seriesId"),
    episodeIds: formData.getAll("episodeIds"),
    returnTo: formData.get("returnTo"),
  });

  if (!parsedInput.success) {
    return {
      status: "error",
      message: "Pick a valid set of episodes and try again.",
    };
  }

  const result = await updateSonarrSeriesEpisodeMonitoringForUser(
    session.user.id,
    parsedInput.data,
  );

  revalidatePath(safeRevalidatePath(parsedInput.data.returnTo));

  if (!result.ok) {
    return {
      status: "error",
      message: result.message,
    };
  }

  return {
    status: "success",
    message: result.message,
  };
}

export async function submitSonarrSeriesMonitoringAction(
  _previousState: SonarrLibraryActionState,
  formData: FormData,
): Promise<SonarrLibraryActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return { status: "error", message: "You need to sign in again." };
  }

  const parsedInput = updateSonarrSeriesMonitoringSchema.safeParse({
    seriesId: formData.get("seriesId"),
    monitored: formData.get("monitored"),
    applyToAllSeasons: formData.get("applyToAllSeasons") ?? "false",
    returnTo: formData.get("returnTo"),
  });

  if (!parsedInput.success) {
    return {
      status: "error",
      message: "Could not update Sonarr monitoring with the given input.",
    };
  }

  const result = await updateSonarrSeriesMonitoringForUser(session.user.id, parsedInput.data);

  revalidatePath(safeRevalidatePath(parsedInput.data.returnTo));

  if (!result.ok) {
    return { status: "error", message: result.message };
  }

  return { status: "success", message: result.message };
}

export async function submitSonarrSeriesDeleteAction(
  _previousState: SonarrLibraryActionState,
  formData: FormData,
): Promise<SonarrLibraryActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return { status: "error", message: "You need to sign in again." };
  }

  const parsedInput = deleteSonarrSeriesSchema.safeParse({
    seriesId: formData.get("seriesId"),
    deleteFiles: formData.get("deleteFiles") ?? "false",
    returnTo: formData.get("returnTo"),
  });

  if (!parsedInput.success) {
    return {
      status: "error",
      message: "Could not delete the Sonarr series with the given input.",
    };
  }

  const result = await deleteSonarrSeriesForUser(session.user.id, parsedInput.data);

  revalidatePath(safeRevalidatePath(parsedInput.data.returnTo));

  if (!result.ok) {
    return { status: "error", message: result.message };
  }

  return { status: "success", message: result.message };
}
