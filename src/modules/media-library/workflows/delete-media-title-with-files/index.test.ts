import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./request-validation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./request-validation")>();
  return {
    ...actual,
    validateDeleteMediaTitleWithFilesRequest: vi.fn(),
  };
});
vi.mock("./list-files", () => ({ listFilesForTitleCleanup: vi.fn() }));
vi.mock("./delete-files-on-disk", () => ({ deleteFilesOnDisk: vi.fn() }));
vi.mock("./delete-title-record", () => ({ deleteTitleRecord: vi.fn() }));
vi.mock("./audit", () => ({ auditTitleRemoval: vi.fn() }));
vi.mock("@/modules/downloads/queries/has-active-download-association", () => ({
  hasActiveDownloadAssociationForTitle: vi.fn(),
}));

import { hasActiveDownloadAssociationForTitle } from "@/modules/downloads/queries/has-active-download-association";
import { auditTitleRemoval } from "./audit";
import { deleteFilesOnDisk } from "./delete-files-on-disk";
import { deleteTitleRecord } from "./delete-title-record";
import {
  deleteMediaTitleWithFilesWorkflow,
  DeleteMediaTitleWithFilesError,
} from "./index";
import { listFilesForTitleCleanup } from "./list-files";
import { validateDeleteMediaTitleWithFilesRequest } from "./request-validation";

const validateMock = vi.mocked(validateDeleteMediaTitleWithFilesRequest);
const listFilesMock = vi.mocked(listFilesForTitleCleanup);
const deleteOnDiskMock = vi.mocked(deleteFilesOnDisk);
const deleteRecordMock = vi.mocked(deleteTitleRecord);
const auditMock = vi.mocked(auditTitleRemoval);
const activeDownloadMock = vi.mocked(hasActiveDownloadAssociationForTitle);

beforeEach(() => {
  vi.clearAllMocks();
  activeDownloadMock.mockResolvedValue(false);
});

describe("deleteMediaTitleWithFilesWorkflow", () => {
  it("calls phases in order and audits the deletion", async () => {
    const calls: string[] = [];
    const request = { titleId: "t1", deleteFiles: true };
    const files = [{ id: "f1", filePath: "/a/b.mkv", libraryRootPath: "/a" }];
    const removedTitle = { id: "t1", mediaType: "tv", libraryId: null, title: "Show", year: 2020 };

    validateMock.mockImplementation(() => {
      calls.push("validate");
      return request as never;
    });
    activeDownloadMock.mockImplementation(async () => {
      calls.push("check-active");
      return false;
    });
    listFilesMock.mockImplementation(async () => {
      calls.push("list-files");
      return files;
    });
    deleteOnDiskMock.mockImplementation(async () => {
      calls.push("delete-on-disk");
      return [{ filePath: "/a/b.mkv", status: "deleted" }];
    });
    deleteRecordMock.mockImplementation(async () => {
      calls.push("delete-record");
      return removedTitle as never;
    });
    auditMock.mockImplementation(async () => {
      calls.push("audit");
    });

    const result = await deleteMediaTitleWithFilesWorkflow("u1", request);

    expect(calls).toEqual(["validate", "check-active", "list-files", "delete-on-disk", "delete-record", "audit"]);
    expect(deleteOnDiskMock).toHaveBeenCalledWith(files);
    expect(deleteRecordMock).toHaveBeenCalledWith("u1", "t1");
    expect(auditMock).toHaveBeenCalledWith({
      userId: "u1",
      title: removedTitle,
      fileOutcomes: [{ filePath: "/a/b.mkv", status: "deleted" }],
      filesRequestedForDeletion: true,
    });
    expect(result.removedTitle).toBe(removedTitle);
  });

  it("skips on-disk deletion when deleteFiles=false", async () => {
    const request = { titleId: "t1", deleteFiles: false };
    validateMock.mockReturnValue(request as never);
    listFilesMock.mockResolvedValue([
      { id: "f1", filePath: "/a/b.mkv", libraryRootPath: "/a" },
    ]);
    deleteRecordMock.mockResolvedValue({ id: "t1" } as never);
    auditMock.mockResolvedValue(undefined);

    await deleteMediaTitleWithFilesWorkflow("u1", request);

    expect(deleteOnDiskMock).not.toHaveBeenCalled();
  });

  it("throws when the title cannot be found", async () => {
    validateMock.mockReturnValue({ titleId: "t1", deleteFiles: false } as never);
    listFilesMock.mockResolvedValue([]);
    deleteRecordMock.mockResolvedValue(null);

    await expect(
      deleteMediaTitleWithFilesWorkflow("u1", { titleId: "t1", deleteFiles: false }),
    ).rejects.toBeInstanceOf(DeleteMediaTitleWithFilesError);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("does not delete files or records while the title has an active download", async () => {
    validateMock.mockReturnValue({ titleId: "t1", deleteFiles: true } as never);
    activeDownloadMock.mockResolvedValue(true);

    await expect(
      deleteMediaTitleWithFilesWorkflow("u1", { titleId: "t1", deleteFiles: true }),
    ).rejects.toMatchObject({ code: "active_download" });

    expect(listFilesMock).not.toHaveBeenCalled();
    expect(deleteOnDiskMock).not.toHaveBeenCalled();
    expect(deleteRecordMock).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });
});
