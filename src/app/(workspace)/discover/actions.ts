"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import {
  RequestMediaTitleCommandError,
  requestMediaTitleCommand,
} from "@/modules/media-library/commands/request-media-title";
import { requestMediaTitleInputSchema } from "@/modules/media-library/schemas/request-media-title";

export type DiscoverTitleRequestActionState = {
  status: "idle" | "error" | "success";
  message?: string;
};

export const initialDiscoverTitleRequestActionState: DiscoverTitleRequestActionState = {
  status: "idle",
};

const discoverTitleRequestActionSchema = requestMediaTitleInputSchema.extend({
  returnTo: z.string().min(1),
});

function safeRevalidatePath(value: string) {
  return value.startsWith("/") ? value.split("?")[0] : "/discover";
}

export async function submitDiscoverTitleRequestAction(
  _previousState: DiscoverTitleRequestActionState,
  formData: FormData,
): Promise<DiscoverTitleRequestActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      status: "error",
      message: "You need to sign in again.",
    };
  }

  const parsedInput = discoverTitleRequestActionSchema.safeParse({
    mediaType: formData.get("mediaType"),
    tmdbId: formData.get("tmdbId"),
    title: formData.get("title"),
    year: formData.get("year"),
    monitored: true,
    qualityProfile: formData.get("qualityProfile") ?? undefined,
    overview: formData.get("overview"),
    posterUrl: formData.get("posterUrl"),
    backdropUrl: formData.get("backdropUrl"),
    runtimeMinutes: formData.get("runtimeMinutes"),
    originalLanguage: formData.get("originalLanguage"),
    returnTo: formData.get("returnTo"),
  });

  if (!parsedInput.success) {
    return {
      status: "error",
      message: "Nooklet could not request that title with the provided details.",
    };
  }

  const { returnTo, ...requestInput } = parsedInput.data;

  try {
    await requestMediaTitleCommand(session.user.id, requestInput);
  } catch (error) {
    return {
      status: "error",
      message: error instanceof RequestMediaTitleCommandError
        ? error.message
        : "Nooklet could not request that title.",
    };
  }

  revalidatePath("/library");
  revalidatePath(safeRevalidatePath(returnTo));

  return {
    status: "success",
    message: `${parsedInput.data.title} was requested in your Nooklet library.`,
  };
}
