import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));
vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));
vi.mock("@/modules/service-connections/workflows/update-radarr-movie-monitoring", () => ({
  updateRadarrMovieMonitoringForUser: vi.fn(),
}));
vi.mock("@/modules/service-connections/workflows/update-radarr-movie-quality-profile", () => ({
  updateRadarrMovieQualityProfileForUser: vi.fn(),
}));
vi.mock("@/modules/service-connections/workflows/trigger-radarr-movie-search", () => ({
  triggerRadarrMovieSearchForUser: vi.fn(),
}));
vi.mock("@/modules/service-connections/workflows/delete-radarr-movie", () => ({
  deleteRadarrMovieForUser: vi.fn(),
}));

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { deleteRadarrMovieForUser } from "@/modules/service-connections/workflows/delete-radarr-movie";
import { triggerRadarrMovieSearchForUser } from "@/modules/service-connections/workflows/trigger-radarr-movie-search";
import { updateRadarrMovieMonitoringForUser } from "@/modules/service-connections/workflows/update-radarr-movie-monitoring";
import { updateRadarrMovieQualityProfileForUser } from "@/modules/service-connections/workflows/update-radarr-movie-quality-profile";

import {
  submitRadarrMovieDeleteAction,
  submitRadarrMovieMonitoringAction,
  submitRadarrMovieQualityProfileAction,
  submitRadarrMovieSearchAction,
} from "./radarr-library-actions";

const authMock = vi.mocked(auth);
const updateMock = vi.mocked(updateRadarrMovieMonitoringForUser);
const qualityProfileMock = vi.mocked(updateRadarrMovieQualityProfileForUser);
const searchMock = vi.mocked(triggerRadarrMovieSearchForUser);
const deleteMock = vi.mocked(deleteRadarrMovieForUser);
const revalidateMock = vi.mocked(revalidatePath);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("submitRadarrMovieMonitoringAction", () => {
  function validForm() {
    const formData = new FormData();
    formData.set("movieId", "12");
    formData.set("monitored", "true");
    formData.set("returnTo", "/radarr");
    return formData;
  }

  it("returns sign-in error when there is no session", async () => {
    authMock.mockResolvedValue(null as never);
    const result = await submitRadarrMovieMonitoringAction(
      { status: "idle" } as never,
      validForm(),
    );
    expect(result).toEqual({ status: "error", message: "You need to sign in again." });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("returns the could-not-update error when validation fails", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    const formData = new FormData();
    formData.set("movieId", "not-a-number");
    formData.set("returnTo", "/radarr");

    const result = await submitRadarrMovieMonitoringAction(
      { status: "idle" } as never,
      formData,
    );

    expect(result).toEqual({
      status: "error",
      message: "Could not update Radarr monitoring with the given input.",
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("returns success and revalidates the safe return path on workflow success", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    updateMock.mockResolvedValue({ ok: true, message: "Updated Radarr." } as never);

    const result = await submitRadarrMovieMonitoringAction(
      { status: "idle" } as never,
      validForm(),
    );

    expect(result).toEqual({ status: "success", message: "Updated Radarr." });
    expect(revalidateMock).toHaveBeenCalledWith("/radarr");
  });

  it("forwards the workflow error message verbatim on failure", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    updateMock.mockResolvedValue({ ok: false, message: "Radarr offline" } as never);

    const result = await submitRadarrMovieMonitoringAction(
      { status: "idle" } as never,
      validForm(),
    );

    expect(result).toEqual({ status: "error", message: "Radarr offline" });
  });
});

describe("submitRadarrMovieQualityProfileAction", () => {
  function validForm() {
    const formData = new FormData();
    formData.set("movieId", "12");
    formData.set("qualityProfileId", "4");
    formData.set("returnTo", "/radarr");
    return formData;
  }

  it("returns sign-in error when there is no session", async () => {
    authMock.mockResolvedValue(null as never);
    const result = await submitRadarrMovieQualityProfileAction(
      { status: "idle" } as never,
      validForm(),
    );
    expect(result).toEqual({ status: "error", message: "You need to sign in again." });
    expect(qualityProfileMock).not.toHaveBeenCalled();
  });

  it("returns a field error when validation fails", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    const formData = new FormData();
    formData.set("movieId", "12");
    formData.set("qualityProfileId", "bad");
    formData.set("returnTo", "/radarr");

    const result = await submitRadarrMovieQualityProfileAction(
      { status: "idle" } as never,
      formData,
    );

    expect(result).toEqual({
      status: "error",
      message: "Could not update Radarr quality profile with the given input.",
      fieldErrors: { qualityProfileId: "Select a valid quality profile." },
    });
  });

  it("returns success and revalidates the return path on workflow success", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    qualityProfileMock.mockResolvedValue({ ok: true, message: "Updated Radarr." } as never);

    const result = await submitRadarrMovieQualityProfileAction(
      { status: "idle" } as never,
      validForm(),
    );

    expect(qualityProfileMock).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ movieId: 12, qualityProfileId: 4 }),
    );
    expect(result).toEqual({ status: "success", message: "Updated Radarr." });
    expect(revalidateMock).toHaveBeenCalledWith("/radarr");
  });

  it("projects workflow quality profile field errors", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    qualityProfileMock.mockResolvedValue({
      ok: false,
      message: "Select a valid Radarr quality profile.",
      field: "qualityProfileId",
    } as never);

    const result = await submitRadarrMovieQualityProfileAction(
      { status: "idle" } as never,
      validForm(),
    );

    expect(result).toEqual({
      status: "error",
      message: "Select a valid Radarr quality profile.",
      fieldErrors: { qualityProfileId: "Select a valid Radarr quality profile." },
    });
  });
});

describe("submitRadarrMovieSearchAction", () => {
  function validForm() {
    const formData = new FormData();
    formData.set("movieId", "12");
    formData.set("returnTo", "/radarr");
    return formData;
  }

  it("returns sign-in error when there is no session", async () => {
    authMock.mockResolvedValue(null as never);
    const result = await submitRadarrMovieSearchAction(
      { status: "idle" } as never,
      validForm(),
    );
    expect(result).toEqual({ status: "error", message: "You need to sign in again." });
    expect(searchMock).not.toHaveBeenCalled();
  });

  it("returns success and revalidates the return path on workflow success", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    searchMock.mockResolvedValue({ ok: true, message: "Search queued." } as never);

    const result = await submitRadarrMovieSearchAction(
      { status: "idle" } as never,
      validForm(),
    );

    expect(searchMock).toHaveBeenCalledWith("u1", expect.objectContaining({ movieId: 12 }));
    expect(result).toEqual({ status: "success", message: "Search queued." });
    expect(revalidateMock).toHaveBeenCalledWith("/radarr");
  });
});

describe("submitRadarrMovieDeleteAction", () => {
  function validForm() {
    const formData = new FormData();
    formData.set("movieId", "12");
    formData.set("deleteFiles", "true");
    formData.set("returnTo", "/radarr");
    return formData;
  }

  it("returns sign-in error when there is no session", async () => {
    authMock.mockResolvedValue(null as never);
    const result = await submitRadarrMovieDeleteAction(
      { status: "idle" } as never,
      validForm(),
    );
    expect(result).toEqual({ status: "error", message: "You need to sign in again." });
  });

  it("defaults deleteFiles to 'false' when omitted from the form", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    deleteMock.mockResolvedValue({ ok: true, message: "Removed movie." } as never);

    const formData = new FormData();
    formData.set("movieId", "12");
    formData.set("returnTo", "/radarr");

    await submitRadarrMovieDeleteAction({ status: "idle" } as never, formData);

    expect(deleteMock).toHaveBeenCalledWith("u1", expect.objectContaining({
      deleteFiles: false,
    }));
  });

  it("returns success on workflow success and revalidates the return path", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    deleteMock.mockResolvedValue({ ok: true, message: "Removed movie." } as never);

    const result = await submitRadarrMovieDeleteAction(
      { status: "idle" } as never,
      validForm(),
    );
    expect(result).toEqual({ status: "success", message: "Removed movie." });
    expect(revalidateMock).toHaveBeenCalledWith("/radarr");
  });

  it("forwards workflow failure messages verbatim", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    deleteMock.mockResolvedValue({ ok: false, message: "movie not found" } as never);

    const result = await submitRadarrMovieDeleteAction(
      { status: "idle" } as never,
      validForm(),
    );
    expect(result).toEqual({ status: "error", message: "movie not found" });
  });
});
