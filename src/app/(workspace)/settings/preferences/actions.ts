"use server";

import { auth } from "@/auth";
import { updatePreferencesInputSchema } from "@/modules/preferences/schemas/preferences";
import { updatePreferences } from "@/modules/preferences/workflows/update-preferences";

export type UpdatePreferencesActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Partial<Record<"defaultMediaMode" | "defaultResultCount", string>>;
};

export const initialUpdatePreferencesActionState: UpdatePreferencesActionState = {
  status: "idle",
};

function checkboxValue(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

export async function submitUpdatePreferencesAction(
  _previousState: UpdatePreferencesActionState,
  formData: FormData,
): Promise<UpdatePreferencesActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      status: "error",
      message: "You need to sign in again.",
    };
  }

  const parsedInput = updatePreferencesInputSchema.safeParse({
    defaultMediaMode: formData.get("defaultMediaMode"),
    defaultResultCount: formData.get("defaultResultCount"),
    watchHistoryOnly: checkboxValue(formData, "watchHistoryOnly"),
    historyHideExisting: checkboxValue(formData, "historyHideExisting"),
    historyHideLiked: checkboxValue(formData, "historyHideLiked"),
    historyHideDisliked: checkboxValue(formData, "historyHideDisliked"),
    historyHideHidden: checkboxValue(formData, "historyHideHidden"),
  });

  if (!parsedInput.success) {
    const flattenedErrors = parsedInput.error.flatten().fieldErrors;

    return {
      status: "error",
      message: "Review the highlighted fields and try again.",
      fieldErrors: {
        defaultMediaMode: flattenedErrors.defaultMediaMode?.[0],
        defaultResultCount: flattenedErrors.defaultResultCount?.[0],
      },
    };
  }

  await updatePreferences(session.user.id, parsedInput.data);

  return {
    status: "success",
    message: "Preferences updated.",
  };
}
