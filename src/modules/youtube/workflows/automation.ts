import { createImmediateJob, findJobByTarget, saveRecurringJob } from "@/modules/jobs/public";
import { resolveInstanceConfigurationOwnerId } from "@/modules/instance-config/resolve-instance-configuration-owner";
import { YouTubeDomainError } from "@/modules/youtube/errors";
import type { YouTubeAutomationSettingsDTO } from "@/modules/youtube/types";
import { createAuditEvent } from "@/modules/users/public";

export const defaultYouTubeScheduleMinutes = 360;
export const minimumYouTubeScheduleMinutes = 15;
export const maximumYouTubeScheduleMinutes = 7 * 24 * 60;

function toSettings(
    job: NonNullable<Awaited<ReturnType<typeof findJobByTarget>>>,
): YouTubeAutomationSettingsDTO {
    return {
        enabled: job.isEnabled,
        scheduleMinutes: job.scheduleMinutes,
        nextRunAt: job.nextRunAt,
        lastStartedAt: job.lastStartedAt,
        lastCompletedAt: job.lastCompletedAt,
        lastStatus: job.lastStatus,
        lastError: job.lastError,
    };
}

export async function getYouTubeAutomationSettingsWorkflow(userId: string) {
    const ownerUserId = await resolveInstanceConfigurationOwnerId(userId);
    const existing = await findJobByTarget(ownerUserId, "youtube-source-sync", "youtube", "all");

    if (existing) {
        return toSettings(existing);
    }

    return toSettings(
        await saveRecurringJob({
            userId: ownerUserId,
            jobType: "youtube-source-sync",
            targetType: "youtube",
            targetKey: "all",
            scheduleMinutes: defaultYouTubeScheduleMinutes,
            isEnabled: true,
        }),
    );
}

export async function configureYouTubeAutomationWorkflow(
    userId: string,
    input: { enabled: boolean; scheduleMinutes: number },
) {
    if (
        !Number.isInteger(input.scheduleMinutes) ||
        input.scheduleMinutes < minimumYouTubeScheduleMinutes ||
        input.scheduleMinutes > maximumYouTubeScheduleMinutes
    ) {
        throw new YouTubeDomainError(
            "YouTube sync must run between every 15 minutes and every 7 days.",
            "invalid_request",
        );
    }

    const ownerUserId = await resolveInstanceConfigurationOwnerId(userId);
    const job = await saveRecurringJob({
        userId: ownerUserId,
        jobType: "youtube-source-sync",
        targetType: "youtube",
        targetKey: "all",
        scheduleMinutes: input.scheduleMinutes,
        isEnabled: input.enabled,
    });

    await createAuditEvent({
        actorUserId: userId,
        eventType: "youtube.schedule.updated",
        subjectType: "youtube-schedule",
        subjectId: "all",
        payload: input,
    });

    return toSettings(job);
}

export async function runYouTubeSyncNowWorkflow(userId: string) {
    const ownerUserId = await resolveInstanceConfigurationOwnerId(userId);

    return createImmediateJob({
        userId: ownerUserId,
        jobType: "youtube-source-sync",
        targetType: "youtube-run-now",
        targetKey: `all:${Date.now()}`,
    });
}
