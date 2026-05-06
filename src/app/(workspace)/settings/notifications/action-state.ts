export type NotificationChannelActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
};

export const initialNotificationChannelActionState: NotificationChannelActionState = {
  status: "idle",
  message: null,
};
