import { inArray } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import { storageSnapshotKinds, storageSnapshots } from "@/lib/database/schema";

export type StorageSnapshotKind = (typeof storageSnapshotKinds)[number];
export type StorageSnapshotRecord = typeof storageSnapshots.$inferSelect;

export const downloadWorkspaceSnapshotId = "download-workspace";
export const downloadEngineWorkSnapshotId = "download-engine-workspace";

export function libraryDestinationSnapshotId(pathId: string) {
    return `library-destination:${pathId}`;
}

export async function findStorageSnapshot(id: string) {
    return (
        ensureDatabaseReady()
            .select()
            .from(storageSnapshots)
            .where(inArray(storageSnapshots.id, [id]))
            .get() ?? null
    );
}

export async function listStorageSnapshots(ids: string[]) {
    if (ids.length === 0) {
        return [];
    }

    return ensureDatabaseReady()
        .select()
        .from(storageSnapshots)
        .where(inArray(storageSnapshots.id, ids))
        .all();
}

export async function upsertStorageSnapshot(input: {
    id: string;
    kind: StorageSnapshotKind;
    path: string;
    exists: boolean;
    reachable: boolean;
    readable: boolean;
    writable: boolean;
    freeSpaceBytes: number | null;
    totalSpaceBytes: number | null;
    errorMessage: string | null;
    checkedAt?: Date;
}) {
    const database = ensureDatabaseReady();
    const existing = database
        .select()
        .from(storageSnapshots)
        .where(inArray(storageSnapshots.id, [input.id]))
        .get();
    const checkedAt = input.checkedAt ?? new Date();

    // A failed probe is still useful health information, but it must not erase
    // the last successful capacity measurement shown as stale in the UI.
    const previousForSamePath = existing?.path === input.path ? existing : null;
    const freeSpaceBytes = input.freeSpaceBytes ?? previousForSamePath?.freeSpaceBytes ?? null;
    const totalSpaceBytes = input.totalSpaceBytes ?? previousForSamePath?.totalSpaceBytes ?? null;

    database
        .insert(storageSnapshots)
        .values({
            ...input,
            freeSpaceBytes,
            totalSpaceBytes,
            checkedAt,
            updatedAt: checkedAt,
        })
        .onConflictDoUpdate({
            target: storageSnapshots.id,
            set: {
                kind: input.kind,
                path: input.path,
                exists: input.exists,
                reachable: input.reachable,
                readable: input.readable,
                writable: input.writable,
                freeSpaceBytes,
                totalSpaceBytes,
                errorMessage: input.errorMessage,
                checkedAt,
                updatedAt: checkedAt,
            },
        })
        .run();

    return database
        .select()
        .from(storageSnapshots)
        .where(inArray(storageSnapshots.id, [input.id]))
        .get()!;
}
