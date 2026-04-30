import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));
vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));
vi.mock("@/modules/notifications/commands/add-notification-channel", () => ({
  addNotificationChannelCommand: vi.fn(),
}));
vi.mock("@/modules/notifications/commands/remove-notification-channel", () => ({
  removeNotificationChannelCommand: vi.fn(),
}));
vi.mock("@/modules/notifications/commands/test-notification-channel", () => ({
  testNotificationChannelCommand: vi.fn(),
}));
vi.mock("@/modules/notifications/commands/update-notification-channel", () => ({
  updateNotificationChannelCommand: vi.fn(),
}));

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { addNotificationChannelCommand } from "@/modules/notifications/commands/add-notification-channel";
import { removeNotificationChannelCommand } from "@/modules/notifications/commands/remove-notification-channel";
import { testNotificationChannelCommand } from "@/modules/notifications/commands/test-notification-channel";
import { updateNotificationChannelCommand } from "@/modules/notifications/commands/update-notification-channel";
import { NotificationChannelNotFoundError } from "@/modules/notifications/errors";

import {
  addNotificationChannelAction,
  removeNotificationChannelAction,
  testNotificationChannelAction,
  toggleNotificationChannelAction,
} from "./actions";

const authMock = vi.mocked(auth);
const addMock = vi.mocked(addNotificationChannelCommand);
const removeMock = vi.mocked(removeNotificationChannelCommand);
const testMock = vi.mocked(testNotificationChannelCommand);
const updateMock = vi.mocked(updateNotificationChannelCommand);
const revalidateMock = vi.mocked(revalidatePath);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("addNotificationChannelAction", () => {
  function validForm() {
    const form = new FormData();
    form.set("channelType", "webhook");
    form.set("displayName", "Ops alerts");
    form.set("targetUrl", "https://example.com/hook");
    form.set("isEnabled", "on");
    form.append("events", "recommendation_run_succeeded");
    form.append("events", "recommendation_run_failed");
    return form;
  }

  it("returns sign-in error when there is no session", async () => {
    authMock.mockResolvedValue(null as never);
    const result = await addNotificationChannelAction(
      { status: "idle", message: null },
      validForm(),
    );
    expect(result).toEqual({ status: "error", message: "You need to sign in again." });
    expect(addMock).not.toHaveBeenCalled();
  });

  it("rejects an unknown channel type", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    const form = validForm();
    form.set("channelType", "invalid");

    const result = await addNotificationChannelAction({ status: "idle", message: null }, form);
    expect(result).toEqual({ status: "error", message: "Choose a channel type." });
    expect(addMock).not.toHaveBeenCalled();
  });

  it("returns success and revalidates the settings page on happy path", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    addMock.mockResolvedValue(undefined as never);

    const result = await addNotificationChannelAction(
      { status: "idle", message: null },
      validForm(),
    );

    expect(addMock).toHaveBeenCalledWith("u1", expect.objectContaining({
      channelType: "webhook",
      displayName: "Ops alerts",
      targetUrl: "https://example.com/hook",
      events: ["recommendation_run_succeeded", "recommendation_run_failed"],
    }));
    expect(revalidateMock).toHaveBeenCalledWith("/settings/notifications");
    expect(result).toEqual({ status: "success", message: "Notification channel added." });
  });
});

describe("toggleNotificationChannelAction", () => {
  function form(id: string, enable: boolean) {
    const data = new FormData();
    data.set("id", id);
    data.set("enable", enable ? "1" : "0");
    return data;
  }

  it("does nothing without a session", async () => {
    authMock.mockResolvedValue(null as never);
    await toggleNotificationChannelAction(form("c1", true));
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("calls update with the parsed flag and revalidates", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    updateMock.mockResolvedValue(undefined as never);

    await toggleNotificationChannelAction(form("c1", true));

    expect(updateMock).toHaveBeenCalledWith("u1", { id: "c1", isEnabled: true });
    expect(revalidateMock).toHaveBeenCalledWith("/settings/notifications");
  });

  it("ignores requests with an empty id", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    await toggleNotificationChannelAction(form("", true));
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe("removeNotificationChannelAction", () => {
  function form(id: string) {
    const data = new FormData();
    data.set("id", id);
    return data;
  }

  it("does nothing without a session", async () => {
    authMock.mockResolvedValue(null as never);
    await removeNotificationChannelAction(form("c1"));
    expect(removeMock).not.toHaveBeenCalled();
  });

  it("calls remove and revalidates on happy path", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    removeMock.mockResolvedValue(undefined as never);

    await removeNotificationChannelAction(form("c1"));

    expect(removeMock).toHaveBeenCalledWith("u1", "c1");
    expect(revalidateMock).toHaveBeenCalledWith("/settings/notifications");
  });
});

describe("testNotificationChannelAction", () => {
  function form(id: string) {
    const data = new FormData();
    data.set("id", id);
    return data;
  }

  it("returns sign-in error when there is no session", async () => {
    authMock.mockResolvedValue(null as never);
    const result = await testNotificationChannelAction(
      { status: "idle", message: null },
      form("c1"),
    );
    expect(result).toEqual({ status: "error", message: "You need to sign in again." });
    expect(testMock).not.toHaveBeenCalled();
  });

  it("maps NotificationChannelNotFoundError to a friendly message", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    testMock.mockRejectedValue(new NotificationChannelNotFoundError("c1"));

    const result = await testNotificationChannelAction(
      { status: "idle", message: null },
      form("c1"),
    );

    expect(result).toEqual({ status: "error", message: "Notification channel not found." });
  });

  it("returns success when dispatch is ok", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    testMock.mockResolvedValue({ ok: true, message: "delivered" } as never);

    const result = await testNotificationChannelAction(
      { status: "idle", message: null },
      form("c1"),
    );

    expect(revalidateMock).toHaveBeenCalledWith("/settings/notifications");
    expect(result).toEqual({ status: "success", message: "Test notification delivered." });
  });

  it("forwards the dispatch error message on failure", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    testMock.mockResolvedValue({ ok: false, message: "endpoint refused" } as never);

    const result = await testNotificationChannelAction(
      { status: "idle", message: null },
      form("c1"),
    );

    expect(result).toEqual({ status: "error", message: "endpoint refused" });
  });
});
