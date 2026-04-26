import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));
vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));
vi.mock("@/modules/service-connections/workflows/update-sonarr-series-season-monitoring", () => ({
  updateSonarrSeriesSeasonMonitoringForUser: vi.fn(),
}));
vi.mock("@/modules/service-connections/workflows/update-sonarr-series-episode-monitoring", () => ({
  updateSonarrSeriesEpisodeMonitoringForUser: vi.fn(),
}));
vi.mock("@/modules/service-connections/workflows/update-sonarr-series-monitoring", () => ({
  updateSonarrSeriesMonitoringForUser: vi.fn(),
}));
vi.mock("@/modules/service-connections/workflows/update-sonarr-series-quality-profile", () => ({
  updateSonarrSeriesQualityProfileForUser: vi.fn(),
}));
vi.mock("@/modules/service-connections/workflows/trigger-sonarr-series-search", () => ({
  triggerSonarrSeriesSearchForUser: vi.fn(),
}));
vi.mock("@/modules/service-connections/workflows/delete-sonarr-series", () => ({
  deleteSonarrSeriesForUser: vi.fn(),
}));
vi.mock("@/modules/service-connections/workflows/list-sonarr-series-episodes-for-user", () => ({
  listSonarrSeriesEpisodesForUser: vi.fn(),
}));

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { deleteSonarrSeriesForUser } from "@/modules/service-connections/workflows/delete-sonarr-series";
import { listSonarrSeriesEpisodesForUser } from "@/modules/service-connections/workflows/list-sonarr-series-episodes-for-user";
import { triggerSonarrSeriesSearchForUser } from "@/modules/service-connections/workflows/trigger-sonarr-series-search";
import { updateSonarrSeriesEpisodeMonitoringForUser } from "@/modules/service-connections/workflows/update-sonarr-series-episode-monitoring";
import { updateSonarrSeriesMonitoringForUser } from "@/modules/service-connections/workflows/update-sonarr-series-monitoring";
import { updateSonarrSeriesQualityProfileForUser } from "@/modules/service-connections/workflows/update-sonarr-series-quality-profile";
import { updateSonarrSeriesSeasonMonitoringForUser } from "@/modules/service-connections/workflows/update-sonarr-series-season-monitoring";

import {
  loadSonarrSeriesEpisodesForLibraryAction,
  submitSonarrSeriesDeleteAction,
  submitSonarrSeriesEpisodeMonitoringAction,
  submitSonarrSeriesMonitoringAction,
  submitSonarrSeriesQualityProfileAction,
  submitSonarrSeriesSearchAction,
  submitSonarrSeriesSeasonMonitoringAction,
} from "./sonarr-library-actions";

const authMock = vi.mocked(auth);
const seasonsMock = vi.mocked(updateSonarrSeriesSeasonMonitoringForUser);
const episodesMock = vi.mocked(updateSonarrSeriesEpisodeMonitoringForUser);
const seriesMock = vi.mocked(updateSonarrSeriesMonitoringForUser);
const qualityProfileMock = vi.mocked(updateSonarrSeriesQualityProfileForUser);
const searchMock = vi.mocked(triggerSonarrSeriesSearchForUser);
const deleteMock = vi.mocked(deleteSonarrSeriesForUser);
const listMock = vi.mocked(listSonarrSeriesEpisodesForUser);
const revalidateMock = vi.mocked(revalidatePath);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("submitSonarrSeriesSeasonMonitoringAction", () => {
  function validForm() {
    const formData = new FormData();
    formData.set("seriesId", "7");
    formData.append("monitoredSeasonNumbers", "1");
    formData.append("monitoredSeasonNumbers", "2");
    formData.set("returnTo", "/sonarr");
    return formData;
  }

  it("returns sign-in error when there is no session", async () => {
    authMock.mockResolvedValue(null as never);
    const result = await submitSonarrSeriesSeasonMonitoringAction(
      { status: "idle" } as never,
      validForm(),
    );
    expect(result).toEqual({ status: "error", message: "You need to sign in again." });
  });

  it("returns the validation message when seriesId is missing", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    const formData = new FormData();
    formData.set("returnTo", "/sonarr");

    const result = await submitSonarrSeriesSeasonMonitoringAction(
      { status: "idle" } as never,
      formData,
    );
    expect(result).toEqual({
      status: "error",
      message: "Pick a valid set of seasons and try again.",
    });
  });

  it("forwards parsed input to the workflow and revalidates returnTo on success", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    seasonsMock.mockResolvedValue({ ok: true, message: "Updated Sonarr." } as never);

    const result = await submitSonarrSeriesSeasonMonitoringAction(
      { status: "idle" } as never,
      validForm(),
    );

    expect(seasonsMock).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ seriesId: 7, monitoredSeasonNumbers: [1, 2] }),
    );
    expect(revalidateMock).toHaveBeenCalledWith("/sonarr");
    expect(result).toEqual({ status: "success", message: "Updated Sonarr." });
  });
});

describe("loadSonarrSeriesEpisodesForLibraryAction", () => {
  it("returns sign-in error when there is no session", async () => {
    authMock.mockResolvedValue(null as never);
    expect(await loadSonarrSeriesEpisodesForLibraryAction(7)).toEqual({
      ok: false,
      message: "You need to sign in again.",
    });
  });

  it("rejects non-positive or non-integer seriesIds without calling the workflow", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    expect(await loadSonarrSeriesEpisodesForLibraryAction(0)).toEqual({
      ok: false,
      message: "Invalid Sonarr series id.",
    });
    expect(await loadSonarrSeriesEpisodesForLibraryAction(1.5)).toEqual({
      ok: false,
      message: "Invalid Sonarr series id.",
    });
    expect(listMock).not.toHaveBeenCalled();
  });

  it("returns episodes on workflow success", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    listMock.mockResolvedValue({
      ok: true,
      episodes: [{ id: 1, seasonNumber: 1, episodeNumber: 1, title: "A", monitored: true, hasFile: false, airDate: null, overview: null }],
    } as never);

    const result = await loadSonarrSeriesEpisodesForLibraryAction(7);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.episodes).toHaveLength(1);
    }
  });

  it("forwards the workflow error message", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    listMock.mockResolvedValue({ ok: false, message: "503", reason: "request-failed" } as never);

    expect(await loadSonarrSeriesEpisodesForLibraryAction(7)).toEqual({
      ok: false,
      message: "503",
    });
  });
});

describe("submitSonarrSeriesEpisodeMonitoringAction", () => {
  function validForm() {
    const formData = new FormData();
    formData.set("seriesId", "7");
    formData.append("episodeIds", "1");
    formData.append("episodeIds", "2");
    formData.set("returnTo", "/sonarr");
    return formData;
  }

  it("returns sign-in error when there is no session", async () => {
    authMock.mockResolvedValue(null as never);
    const result = await submitSonarrSeriesEpisodeMonitoringAction(
      { status: "idle" } as never,
      validForm(),
    );
    expect(result).toEqual({ status: "error", message: "You need to sign in again." });
  });

  it("returns the workflow's error message verbatim on failure", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    episodesMock.mockResolvedValue({ ok: false, message: "Sonarr offline" } as never);

    const result = await submitSonarrSeriesEpisodeMonitoringAction(
      { status: "idle" } as never,
      validForm(),
    );

    expect(result).toEqual({ status: "error", message: "Sonarr offline" });
  });
});

describe("submitSonarrSeriesMonitoringAction", () => {
  function validForm() {
    const formData = new FormData();
    formData.set("seriesId", "7");
    formData.set("monitored", "true");
    formData.set("returnTo", "/sonarr");
    return formData;
  }

  it("defaults applyToAllSeasons to 'false' when omitted", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    seriesMock.mockResolvedValue({
      ok: true,
      message: "Updated.",
      monitored: true,
      monitoredSeasonCount: 0,
    } as never);

    await submitSonarrSeriesMonitoringAction({ status: "idle" } as never, validForm());

    expect(seriesMock).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ applyToAllSeasons: false }),
    );
  });

  it("returns success and revalidates the return path on workflow success", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    seriesMock.mockResolvedValue({
      ok: true,
      message: "Updated Sonarr.",
      monitored: true,
      monitoredSeasonCount: 0,
    } as never);

    const result = await submitSonarrSeriesMonitoringAction(
      { status: "idle" } as never,
      validForm(),
    );
    expect(result).toEqual({ status: "success", message: "Updated Sonarr." });
    expect(revalidateMock).toHaveBeenCalledWith("/sonarr");
  });
});

describe("submitSonarrSeriesQualityProfileAction", () => {
  function validForm() {
    const formData = new FormData();
    formData.set("seriesId", "7");
    formData.set("qualityProfileId", "2");
    formData.set("returnTo", "/sonarr");
    return formData;
  }

  it("returns sign-in error when there is no session", async () => {
    authMock.mockResolvedValue(null as never);
    const result = await submitSonarrSeriesQualityProfileAction(
      { status: "idle" } as never,
      validForm(),
    );
    expect(result).toEqual({ status: "error", message: "You need to sign in again." });
    expect(qualityProfileMock).not.toHaveBeenCalled();
  });

  it("returns a field error when validation fails", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    const formData = new FormData();
    formData.set("seriesId", "7");
    formData.set("qualityProfileId", "bad");
    formData.set("returnTo", "/sonarr");

    const result = await submitSonarrSeriesQualityProfileAction(
      { status: "idle" } as never,
      formData,
    );

    expect(result).toEqual({
      status: "error",
      message: "Could not update Sonarr quality profile with the given input.",
      fieldErrors: { qualityProfileId: "Select a valid quality profile." },
    });
  });

  it("returns success and revalidates the return path on workflow success", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    qualityProfileMock.mockResolvedValue({ ok: true, message: "Updated Sonarr." } as never);

    const result = await submitSonarrSeriesQualityProfileAction(
      { status: "idle" } as never,
      validForm(),
    );

    expect(qualityProfileMock).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ seriesId: 7, qualityProfileId: 2 }),
    );
    expect(result).toEqual({ status: "success", message: "Updated Sonarr." });
    expect(revalidateMock).toHaveBeenCalledWith("/sonarr");
  });

  it("projects workflow quality profile field errors", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    qualityProfileMock.mockResolvedValue({
      ok: false,
      message: "Select a valid Sonarr quality profile.",
      field: "qualityProfileId",
    } as never);

    const result = await submitSonarrSeriesQualityProfileAction(
      { status: "idle" } as never,
      validForm(),
    );

    expect(result).toEqual({
      status: "error",
      message: "Select a valid Sonarr quality profile.",
      fieldErrors: { qualityProfileId: "Select a valid Sonarr quality profile." },
    });
  });
});

describe("submitSonarrSeriesSearchAction", () => {
  function validForm() {
    const formData = new FormData();
    formData.set("seriesId", "7");
    formData.set("returnTo", "/sonarr");
    return formData;
  }

  it("returns sign-in error when there is no session", async () => {
    authMock.mockResolvedValue(null as never);
    const result = await submitSonarrSeriesSearchAction(
      { status: "idle" } as never,
      validForm(),
    );
    expect(result).toEqual({ status: "error", message: "You need to sign in again." });
    expect(searchMock).not.toHaveBeenCalled();
  });

  it("returns success and revalidates the return path on workflow success", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    searchMock.mockResolvedValue({ ok: true, message: "Search queued." } as never);

    const result = await submitSonarrSeriesSearchAction(
      { status: "idle" } as never,
      validForm(),
    );

    expect(searchMock).toHaveBeenCalledWith("u1", expect.objectContaining({ seriesId: 7 }));
    expect(result).toEqual({ status: "success", message: "Search queued." });
    expect(revalidateMock).toHaveBeenCalledWith("/sonarr");
  });
});

describe("submitSonarrSeriesDeleteAction", () => {
  function validForm() {
    const formData = new FormData();
    formData.set("seriesId", "7");
    formData.set("deleteFiles", "true");
    formData.set("returnTo", "/sonarr");
    return formData;
  }

  it("returns sign-in error when there is no session", async () => {
    authMock.mockResolvedValue(null as never);
    const result = await submitSonarrSeriesDeleteAction(
      { status: "idle" } as never,
      validForm(),
    );
    expect(result).toEqual({ status: "error", message: "You need to sign in again." });
  });

  it("defaults deleteFiles to 'false' when omitted from the form", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    deleteMock.mockResolvedValue({ ok: true, message: "Removed series." } as never);

    const formData = new FormData();
    formData.set("seriesId", "7");
    formData.set("returnTo", "/sonarr");
    await submitSonarrSeriesDeleteAction({ status: "idle" } as never, formData);

    expect(deleteMock).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ deleteFiles: false }),
    );
  });

  it("returns success on workflow success and revalidates the return path", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    deleteMock.mockResolvedValue({ ok: true, message: "Deleted." } as never);

    const result = await submitSonarrSeriesDeleteAction(
      { status: "idle" } as never,
      validForm(),
    );
    expect(result).toEqual({ status: "success", message: "Deleted." });
    expect(revalidateMock).toHaveBeenCalledWith("/sonarr");
  });
});
