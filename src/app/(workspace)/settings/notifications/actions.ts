"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import {
  notificationChannelTypes,
  notificationEventTypes,
  type NotificationChannelType,
  type NotificationEventType,
} from "@/lib/database/schema";
import { addNotificationChannelCommand } from "@/modules/notifications/commands/add-notification-channel";
import { removeNotificationChannelCommand } from "@/modules/notifications/commands/remove-notification-channel";
import { testNotificationChannelCommand } from "@/modules/notifications/commands/test-notification-channel";
import { updateNotificationChannelCommand } from "@/modules/notifications/commands/update-notification-channel";
import { NotificationChannelNotFoundError } from "@/modules/notifications/errors";
import {
  addNotificationChannelInputSchema,
  deleteNotificationChannelInputSchema,
  testNotificationChannelInputSchema,
} from "@/modules/notifications/schemas/notification-channel-input";

export type NotificationChannelActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
};

const idleState: NotificationChannelActionState = { status: "idle", message: null };

function readChannelType(value: FormDataEntryValue | null): NotificationChannelType | null {
  if (typeof value !== "string") {
    return null;
  }

  return notificationChannelTypes.find((entry) => entry === value) ?? null;
}

function readEventTypes(values: FormDataEntryValue[]): NotificationEventType[] {
  const allowed = new Set<NotificationEventType>(notificationEventTypes);
  const result: NotificationEventType[] = [];
  const seen = new Set<NotificationEventType>();

  for (const entry of values) {
    if (typeof entry !== "string") {
      continue;
    }

    const event = entry as NotificationEventType;

    if (allowed.has(event) && !seen.has(event)) {
      result.push(event);
      seen.add(event);
    }
  }

  return result;
}

export async function addNotificationChannelAction(
  _previous: NotificationChannelActionState,
  formData: FormData,
): Promise<NotificationChannelActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return { status: "error", message: "You need to sign in again." };
  }

  const channelType = readChannelType(formData.get("channelType"));

  if (!channelType) {
    return { status: "error", message: "Choose a channel type." };
  }

  const parsed = addNotificationChannelInputSchema.safeParse({
    channelType,
    displayName: formData.get("displayName"),
    targetUrl: formData.get("targetUrl"),
    isEnabled: formData.get("isEnabled") !== "off",
    events: readEventTypes(formData.getAll("events")),
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "Review the form and try again.";
    return { status: "error", message: firstIssue };
  }

  try {
    await addNotificationChannelCommand(session.user.id, parsed.data);
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Failed to add notification channel.",
    };
  }

  revalidatePath("/settings/notifications");
  return { status: "success", message: "Notification channel added." };
}

export async function toggleNotificationChannelAction(formData: FormData): Promise<void> {
  const session = await auth();

  if (!session?.user?.id) {
    return;
  }

  const parsed = deleteNotificationChannelInputSchema.safeParse({
    id: formData.get("id"),
  });

  if (!parsed.success) {
    return;
  }

  const enable = formData.get("enable") === "1";

  await updateNotificationChannelCommand(session.user.id, { id: parsed.data.id, isEnabled: enable });
  revalidatePath("/settings/notifications");
}

export async function removeNotificationChannelAction(formData: FormData): Promise<void> {
  const session = await auth();

  if (!session?.user?.id) {
    return;
  }

  const parsed = deleteNotificationChannelInputSchema.safeParse({
    id: formData.get("id"),
  });

  if (!parsed.success) {
    return;
  }

  await removeNotificationChannelCommand(session.user.id, parsed.data.id);
  revalidatePath("/settings/notifications");
}

export async function testNotificationChannelAction(
  _previous: NotificationChannelActionState,
  formData: FormData,
): Promise<NotificationChannelActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return { status: "error", message: "You need to sign in again." };
  }

  const parsed = testNotificationChannelInputSchema.safeParse({
    id: formData.get("id"),
  });

  if (!parsed.success) {
    return { status: "error", message: "Notification channel reference was invalid." };
  }

  let result;
  try {
    result = await testNotificationChannelCommand(session.user.id, parsed.data.id);
  } catch (error) {
    if (error instanceof NotificationChannelNotFoundError) {
      return { status: "error", message: "Notification channel not found." };
    }
    throw error;
  }

  revalidatePath("/settings/notifications");

  if (!result.ok) {
    return {
      status: "error",
      message: result.message,
    };
  }

  return { status: "success", message: "Test notification delivered." };
}

export const initialNotificationChannelActionState = idleState;
