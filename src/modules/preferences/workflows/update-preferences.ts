import { createAuditEvent } from "@/modules/users/repositories/user-repository";
import { upsertPreferences } from "@/modules/preferences/repositories/preferences-repository";
import { type UpdatePreferencesInput } from "@/modules/preferences/schemas/preferences";

export async function updatePreferences(
  userId: string,
  input: UpdatePreferencesInput,
) {
  const record = await upsertPreferences({
    userId,
    ...input,
  });

  await createAuditEvent({
    actorUserId: userId,
    eventType: "preferences.updated",
    subjectType: "preferences",
    subjectId: userId,
    payloadJson: JSON.stringify({
      defaultMediaMode: input.defaultMediaMode,
      defaultResultCount: input.defaultResultCount,
      watchHistoryOnly: input.watchHistoryOnly,
      watchHistorySourceTypes: input.watchHistorySourceTypes,
    }),
  });

  return record;
}
