"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { type RecommendationLibraryActionState } from "@/app/(workspace)/recommendation-action-state";
import { safeRevalidatePath } from "./recommendation-action-helpers";
import { updateSonarrSeriesSeasonMonitoringSchema } from "@/modules/service-connections/schemas/update-sonarr-series-season-monitoring";
import { updateSonarrSeriesSeasonMonitoringForUser } from "@/modules/service-connections/workflows/update-sonarr-series-season-monitoring";

export type SonarrLibraryActionState = RecommendationLibraryActionState;

export const initialSonarrLibraryActionState: SonarrLibraryActionState = {
  status: "idle",
};

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
