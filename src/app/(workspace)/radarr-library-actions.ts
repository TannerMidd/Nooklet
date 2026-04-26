"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { type RecommendationLibraryActionState } from "@/app/(workspace)/recommendation-action-state";
import { safeRevalidatePath } from "./recommendation-action-helpers";
import { updateRadarrMovieMonitoringSchema } from "@/modules/service-connections/schemas/update-radarr-movie-monitoring";
import { updateRadarrMovieMonitoringForUser } from "@/modules/service-connections/workflows/update-radarr-movie-monitoring";
import { deleteRadarrMovieSchema } from "@/modules/service-connections/schemas/delete-radarr-movie";
import { deleteRadarrMovieForUser } from "@/modules/service-connections/workflows/delete-radarr-movie";

export type RadarrLibraryActionState = RecommendationLibraryActionState;

export async function submitRadarrMovieMonitoringAction(
  _previousState: RadarrLibraryActionState,
  formData: FormData,
): Promise<RadarrLibraryActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return { status: "error", message: "You need to sign in again." };
  }

  const parsedInput = updateRadarrMovieMonitoringSchema.safeParse({
    movieId: formData.get("movieId"),
    monitored: formData.get("monitored"),
    returnTo: formData.get("returnTo"),
  });

  if (!parsedInput.success) {
    return {
      status: "error",
      message: "Could not update Radarr monitoring with the given input.",
    };
  }

  const result = await updateRadarrMovieMonitoringForUser(session.user.id, parsedInput.data);

  revalidatePath(safeRevalidatePath(parsedInput.data.returnTo));

  if (!result.ok) {
    return { status: "error", message: result.message };
  }

  return { status: "success", message: result.message };
}

export async function submitRadarrMovieDeleteAction(
  _previousState: RadarrLibraryActionState,
  formData: FormData,
): Promise<RadarrLibraryActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return { status: "error", message: "You need to sign in again." };
  }

  const parsedInput = deleteRadarrMovieSchema.safeParse({
    movieId: formData.get("movieId"),
    deleteFiles: formData.get("deleteFiles") ?? "false",
    returnTo: formData.get("returnTo"),
  });

  if (!parsedInput.success) {
    return {
      status: "error",
      message: "Could not delete the Radarr movie with the given input.",
    };
  }

  const result = await deleteRadarrMovieForUser(session.user.id, parsedInput.data);

  revalidatePath(safeRevalidatePath(parsedInput.data.returnTo));

  if (!result.ok) {
    return { status: "error", message: result.message };
  }

  return { status: "success", message: result.message };
}
