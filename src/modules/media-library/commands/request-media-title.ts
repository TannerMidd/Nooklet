import {
    findMediaLibraryByIdForUser,
    findMediaLibraryPathByIdForUser,
    upsertMediaTitleWithExternalIds,
    type MediaTitleRecord,
} from "@/modules/media-library/repositories/media-library-repository";
import { logger } from "@/lib/observability/logger";
import {
    requestMediaTitleInputSchema,
    type RequestMediaTitleInput,
} from "@/modules/media-library/schemas/request-media-title";
import { recordAuditEvent } from "@/modules/users/commands/record-audit-event";

export class RequestMediaTitleCommandError extends Error {
    constructor(
        message: string,
        public readonly code: "library_not_found" | "target_path_not_found" | "title_not_created",
    ) {
        super(message);
        this.name = "RequestMediaTitleCommandError";
    }
}

function titleKey(value: string) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .replace(/\s+/g, " ");
}

function buildNormalizedKey(input: { title: string; year?: number | null }) {
    return `${titleKey(input.title)}::${input.year ?? "unknown"}`;
}

function describeAuditError(error: unknown) {
    if (!(error instanceof Error)) {
        return { name: "UnknownError" };
    }

    const code =
        "code" in error && typeof error.code === "string" ? error.code.slice(0, 64) : undefined;

    return code ? { name: error.name, code } : { name: error.name };
}

async function recordTitleRequestAudit(input: Parameters<typeof recordAuditEvent>[0]) {
    try {
        await recordAuditEvent(input);
    } catch (error) {
        logger.warn("media_library_title_request_audit_failed", {
            subjectId: input.subjectId,
            error: describeAuditError(error),
        });
    }
}

export async function requestMediaTitleCommand(
    userId: string,
    input: RequestMediaTitleInput,
): Promise<MediaTitleRecord> {
    const parsed = requestMediaTitleInputSchema.parse(input);
    const targetPath = parsed.targetLibraryPathId
        ? await findMediaLibraryPathByIdForUser(userId, parsed.targetLibraryPathId)
        : null;

    if (parsed.targetLibraryPathId && !targetPath) {
        throw new RequestMediaTitleCommandError(
            "Choose a matching active library folder before adding that title.",
            "target_path_not_found",
        );
    }

    const targetPathLibrary = targetPath
        ? await findMediaLibraryByIdForUser(userId, targetPath.libraryId)
        : null;

    if (
        targetPath &&
        (!targetPathLibrary ||
            targetPath.status !== "active" ||
            targetPathLibrary.mediaType !== parsed.mediaType)
    ) {
        throw new RequestMediaTitleCommandError(
            "Choose a matching active library folder before adding that title.",
            "target_path_not_found",
        );
    }

    if (targetPathLibrary && parsed.libraryId && parsed.libraryId !== targetPathLibrary.id) {
        throw new RequestMediaTitleCommandError(
            "Choose a matching active library folder before adding that title.",
            "target_path_not_found",
        );
    }

    const library =
        targetPathLibrary ??
        (parsed.libraryId ? await findMediaLibraryByIdForUser(userId, parsed.libraryId) : null);

    if (parsed.libraryId && (!library || library.mediaType !== parsed.mediaType)) {
        throw new RequestMediaTitleCommandError(
            "Choose a matching library before adding that title.",
            "library_not_found",
        );
    }

    const mediaTitle = await upsertMediaTitleWithExternalIds({
        userId,
        libraryId: library?.id ?? null,
        mediaType: parsed.mediaType,
        title: parsed.title,
        sortTitle: titleKey(parsed.title),
        year: parsed.year ?? null,
        normalizedKey: buildNormalizedKey(parsed),
        status: "requested",
        monitored: parsed.monitored,
        qualityProfile: parsed.qualityProfile,
        overview: parsed.overview ?? null,
        posterUrl: parsed.posterUrl ?? null,
        backdropUrl: parsed.backdropUrl ?? null,
        runtimeMinutes: parsed.runtimeMinutes ?? null,
        originalLanguage: parsed.originalLanguage ?? null,
        ...(parsed.tmdbId
            ? { externalIds: [{ source: "tmdb" as const, value: String(parsed.tmdbId) }] }
            : {}),
    });

    if (!mediaTitle) {
        throw new RequestMediaTitleCommandError(
            "Nooklet could not add that title.",
            "title_not_created",
        );
    }

    await recordTitleRequestAudit({
        actorUserId: userId,
        eventType: "media-library.title.requested",
        subjectType: "media-title",
        subjectId: mediaTitle.id,
        payload: {
            mediaType: parsed.mediaType,
            libraryId: library?.id ?? null,
            targetLibraryPathId: targetPath?.id ?? null,
            monitored: parsed.monitored,
            qualityProfile: parsed.qualityProfile,
            tmdbId: parsed.tmdbId ?? null,
        },
    });

    return mediaTitle;
}
