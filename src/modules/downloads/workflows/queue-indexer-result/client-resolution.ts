import {
    createDownloadClient,
    findDownloadClientByServiceConnectionId,
} from "@/modules/downloads/repositories/download-repository";
import { findServiceConnectionByType } from "@/modules/service-connections/queries/find-service-connection-by-type";

import { QueueIndexerResultWorkflowError } from "./errors";

type DownloadClientRecord = NonNullable<
    Awaited<ReturnType<typeof findDownloadClientByServiceConnectionId>>
>;

export type ResolvedDownloadClient = {
    client: DownloadClientRecord;
};

async function ensureClientRecord(input: {
    userId: string;
    serviceConnectionId: string;
}): Promise<DownloadClientRecord> {
    const existingClient = await findDownloadClientByServiceConnectionId(
        input.userId,
        input.serviceConnectionId,
    );
    const client =
        existingClient ??
        (await createDownloadClient({
            userId: input.userId,
            serviceConnectionId: input.serviceConnectionId,
            clientType: "nooklet",
            displayName: "Nooklet downloader",
            status: "verified",
            isDefault: true,
        }));

    if (!client) {
        throw new QueueIndexerResultWorkflowError(
            "download_request_failed",
            "Nooklet could not prepare the download client.",
        );
    }

    return client;
}

/** Resolve the built-in downloader backed by the configured Usenet server. */
export async function resolveDownloadClient(userId: string): Promise<ResolvedDownloadClient> {
    const usenetServer = await findServiceConnectionByType(userId, "usenet-server");

    if (!usenetServer?.connection.baseUrl) {
        throw new QueueIndexerResultWorkflowError(
            "downloader_not_connected",
            "Add a Usenet server under Settings → Connections before queueing releases.",
        );
    }

    if (usenetServer.connection.status !== "verified") {
        throw new QueueIndexerResultWorkflowError(
            "downloader_not_verified",
            usenetServer.connection.statusMessage ??
                "Verify the Usenet server before queueing releases.",
        );
    }

    return {
        client: await ensureClientRecord({
            userId,
            serviceConnectionId: usenetServer.connection.id,
        }),
    };
}
