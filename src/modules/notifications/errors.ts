export class NotificationChannelNotFoundError extends Error {
  constructor(id: string) {
    super(`Notification channel ${id} was not found.`);
    this.name = "NotificationChannelNotFoundError";
  }
}
