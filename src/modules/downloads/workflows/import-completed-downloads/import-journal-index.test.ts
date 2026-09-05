import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile, lstat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
    importJournalIndexPath,
    initializeImportJournalIndex,
    readImportJournalIndexHealth,
    readImportJournalRecoveryPage,
    recordImportJournalRecoveryObservation,
    type ImportJournalIndexObservation,
} from "./import-journal-index";
import {
    createImportJournal,
    importDestinationClaimPath,
    initializeImportJournalRecovery,
    recoverImportJournals,
} from "./import-journal";
import { transferImportFile } from "./file-transfer";

const fault = vi.hoisted(() => ({ denyRebuild: false }));

vi.mock("node:fs/promises", async (importOriginal) => {
    const actual = await importOriginal<typeof import("node:fs/promises")>();

    return {
        ...actual,
        open: (...args: Parameters<typeof actual.open>) => {
            if (
                fault.denyRebuild &&
                String(args[0]).includes(".import-journal-index-rebuild-") &&
                String(args[0]).endsWith("catalog.sqlite") &&
                args[1] === "wx"
            ) {
                return Promise.reject(
                    Object.assign(new Error("injected rebuild denial"), { code: "EACCES" }),
                );
            }

            return actual.open(...args);
        },
    };
});

const roots: string[] = [];

afterEach(async () => {
    fault.denyRebuild = false;
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function root() {
    const directory = await mkdtemp(path.join(os.tmpdir(), "nooklet-journal-index-"));

    roots.push(directory);

    return directory;
}

function observations(count: number): ImportJournalIndexObservation[] {
    return Array.from({ length: count }, (_, index) => ({
        relativePath: "download-" + index + "/attempt",
        downloadId: "download-" + index,
        attemptId: "attempt",
        userId: index % 2 ? "user-a" : "user-b",
        classification: "journal",
        state: "retained",
    }));
}

async function* stream(entries: ImportJournalIndexObservation[]) {
    yield* entries;
}

async function journalInput(directory: string, name: string) {
    const sourceRootPath = path.join(directory, "source");
    const destinationRootPath = path.join(directory, "library");
    const sourcePath = path.join(sourceRootPath, name + ".mkv");
    const destinationPath = path.join(destinationRootPath, name + ".mkv");

    await mkdir(sourceRootPath, { recursive: true });
    await mkdir(destinationRootPath, { recursive: true });
    await writeFile(sourcePath, "sentinel movie " + name);
    const source = await lstat(sourcePath);

    return {
        rootPath: directory,
        downloadId: randomUUID(),
        requestId: randomUUID(),
        attemptId: randomUUID(),
        userId: "user-a",
        sourceRootPath,
        destinationRootPath,
        files: [
            {
                sourcePath,
                destinationPath,
                sourceSizeBytes: source.size,
                sourceMtimeMs: source.mtimeMs,
            },
        ],
    };
}

async function damageCatalog(
    directory: string,
    damage: "missing" | "corrupt" | "sidecars" | "schema" | "status",
) {
    const catalog = importJournalIndexPath(directory);

    if (damage === "missing") {
        await rm(catalog);
    } else if (damage === "corrupt") {
        await writeFile(catalog, "corrupt catalogue sentinel");
    } else if (damage === "sidecars") {
        for (const suffix of ["-journal", "-wal", "-shm"]) {
            await writeFile(catalog + suffix, suffix + " sentinel");
        }
    } else if (damage === "schema") {
        const database = new Database(catalog);

        database.exec("DROP TABLE entries");
        database.close();
    } else {
        await writeFile(
            path.join(directory, "import-journal-index-status.json"),
            JSON.stringify({ version: 1, status: "building", at: Date.now() }),
        );
    }

    const evidence = new Map<string, Buffer>();

    for (const name of await readdir(path.dirname(catalog))) {
        evidence.set(name, await readFile(path.join(path.dirname(catalog), name)));
    }

    return evidence;
}

async function expectRetainedCatalog(directory: string, evidence: Map<string, Buffer>) {
    const retained = (await readdir(directory)).filter((name) =>
        name.startsWith("import-journal-index-retained-"),
    );

    expect(retained).toHaveLength(1);

    for (const [name, bytes] of evidence) {
        await expect(readFile(path.join(directory, retained[0], name))).resolves.toEqual(bytes);
    }
}

describe("durable journal recovery catalogue", () => {
    it.each(
        (["missing", "corrupt", "sidecars", "schema", "status"] as const).flatMap((damage) =>
            (["recovery", "fresh creation"] as const).map((operation) => ({ damage, operation })),
        ),
    )(
        "repairs cached $damage metadata through ordinary $operation without restarting",
        async ({ damage, operation }) => {
            const directory = await root();
            const input = await journalInput(directory, "retained");
            const journal = await createImportJournal(input);
            const file = input.files[0];

            await transferImportFile(file.sourcePath, file.destinationPath, {
                journal,
                journalFileIndex: 0,
            });
            const retainedEvidence = new Map<string, Buffer>();

            for (const filePath of [
                journal.planPath,
                file.sourcePath,
                file.destinationPath,
                importDestinationClaimPath(file.destinationPath),
            ]) {
                retainedEvidence.set(filePath, await readFile(filePath));
            }

            const catalogEvidence = await damageCatalog(directory, damage);

            if (operation === "recovery") {
                const recovered = await recoverImportJournals({ rootPath: directory });

                expect(recovered.inspectedKeys).toHaveLength(1);
                expect(recovered.unresolvedCount).toBe(1);
            } else {
                const freshInput = await journalInput(directory, "fresh");
                const freshJournal = await createImportJournal(freshInput);
                const freshFile = freshInput.files[0];

                await transferImportFile(freshFile.sourcePath, freshFile.destinationPath, {
                    journal: freshJournal,
                    journalFileIndex: 0,
                });
                await expect(readFile(freshFile.destinationPath, "utf8")).resolves.toBe(
                    "sentinel movie fresh",
                );
            }

            expect(readImportJournalIndexHealth(directory)).toMatchObject({
                total: operation === "recovery" ? 1 : 2,
                error: undefined,
            });

            for (const [filePath, bytes] of retainedEvidence) {
                await expect(readFile(filePath)).resolves.toEqual(bytes);
            }

            if (damage !== "status") {
                await expectRetainedCatalog(directory, catalogEvidence);
            } else {
                expect(
                    (await readdir(directory)).filter((name) =>
                        name.startsWith("import-journal-index-retained-"),
                    ),
                ).toEqual([]);
            }
        },
    );

    it("shares one rebuild between concurrent cached callers, including explicit reconciliation", async () => {
        const directory = await root();
        const entries = observations(4);

        await initializeImportJournalIndex(directory, () => stream(entries));
        const evidence = await damageCatalog(directory, "corrupt");
        let signalEntered!: () => void;
        let release!: () => void;
        const entered = new Promise<void>((resolve) => {
            signalEntered = resolve;
        });
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        let discoveries = 0;

        const discover = async function* () {
            discoveries += 1;
            signalEntered();
            await gate;
            yield* entries;
        };

        const calls = [
            initializeImportJournalIndex(directory, discover),
            initializeImportJournalIndex(directory, discover),
            initializeImportJournalIndex(directory, discover, true),
        ];

        await entered;
        expect(discoveries).toBe(1);
        release();
        await Promise.all(calls);
        await initializeImportJournalIndex(directory, discover);
        expect(discoveries).toBe(1);
        expect(readImportJournalIndexHealth(directory)).toMatchObject({
            total: 4,
            error: undefined,
        });
        await expectRetainedCatalog(directory, evidence);
    });

    it.each(["recovery", "fresh creation"] as const)(
        "fails closed on repair denial and retries ordinary %s in the same process",
        async (operation) => {
            const directory = await root();
            const existing = await createImportJournal(await journalInput(directory, "existing"));
            const plan = await readFile(existing.planPath);
            const freshInput = await journalInput(directory, "fresh");
            const evidence = await damageCatalog(directory, "sidecars");
            const perform = () =>
                operation === "recovery"
                    ? recoverImportJournals({ rootPath: directory })
                    : createImportJournal(freshInput);

            fault.denyRebuild = true;
            const attempts = await Promise.allSettled([perform(), perform()]);

            for (const result of attempts) {
                expect(result.status).toBe("rejected");
                expect(result.status === "rejected" && result.reason).toMatchObject({
                    code: "EACCES",
                });
            }

            expect(readImportJournalIndexHealth(directory).error).toBeDefined();

            for (const [name, bytes] of evidence) {
                await expect(
                    readFile(path.join(path.dirname(importJournalIndexPath(directory)), name)),
                ).resolves.toEqual(bytes);
            }

            await expect(lstat(freshInput.files[0].destinationPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
            await expect(
                lstat(importDestinationClaimPath(freshInput.files[0].destinationPath)),
            ).rejects.toMatchObject({ code: "ENOENT" });
            await expect(
                lstat(path.join(directory, "import-journals", freshInput.downloadId)),
            ).rejects.toMatchObject({ code: "ENOENT" });
            await expect(readFile(existing.planPath)).resolves.toEqual(plan);
            fault.denyRebuild = false;
            const result = await perform();

            expect(readImportJournalIndexHealth(directory)).toMatchObject({
                total: operation === "recovery" ? 1 : 2,
                error: undefined,
            });
            await expectRetainedCatalog(directory, evidence);

            const fresh = "plan" in result ? result : await createImportJournal(freshInput);

            await transferImportFile(
                freshInput.files[0].sourcePath,
                freshInput.files[0].destinationPath,
                { journal: fresh, journalFileIndex: 0 },
            );
            await expect(readFile(freshInput.files[0].destinationPath, "utf8")).resolves.toBe(
                "sentinel movie fresh",
            );
        },
    );

    it("keeps a new installation healthy while missing metadata with actual journals stays visible", async () => {
        const directory = await root();

        expect(readImportJournalIndexHealth(directory)).toMatchObject({
            total: 0,
            error: undefined,
        });
        await mkdir(path.join(directory, "import-journals"));
        expect(readImportJournalIndexHealth(directory)).toMatchObject({
            total: 0,
            error: undefined,
        });
        await writeFile(path.join(directory, "import-journals", "foreign"), "sentinel");
        expect(readImportJournalIndexHealth(directory).error).toContain("unavailable");
    });

    it("pages past 600 unresolved entries and preserves progress across startup reconciliation", async () => {
        const directory = await root();
        const entries = observations(601);

        await initializeImportJournalIndex(directory, () => stream(entries));
        const seen = new Set<string>();
        let cursor = "";

        for (let turn = 0; turn < 3; turn += 1) {
            await initializeImportJournalIndex(directory, () => stream(entries), true);
            const page = readImportJournalRecoveryPage(directory);

            expect(page.cursor).toBe(cursor);
            expect(page.rows).toHaveLength(256);

            for (const row of page.rows) {
                recordImportJournalRecoveryObservation(
                    directory,
                    row.entry_key,
                    entries.find((entry) => entry.relativePath === row.relative_path)!,
                );
                seen.add(row.entry_key);
            }

            cursor = page.rows.at(-1)!.entry_key;
        }

        expect(seen.size).toBe(601);
        const before = new Database(importJournalIndexPath(directory), { readonly: true });
        const inspected = before
            .prepare("SELECT COUNT(*) AS count FROM entries WHERE inspected_at IS NOT NULL")
            .get();

        before.close();
        await initializeImportJournalIndex(directory, () => stream(entries), true);
        const after = new Database(importJournalIndexPath(directory), { readonly: true });

        expect(
            after
                .prepare("SELECT COUNT(*) AS count FROM entries WHERE inspected_at IS NOT NULL")
                .get(),
        ).toEqual(inspected);
        after.close();
        expect(
            (await readdir(directory)).filter((name) =>
                name.startsWith("import-journal-index-retained-"),
            ),
        ).toEqual([]);
    }, 20000);

    it("filters completed history and user ownership before the health limit, without writing a cursor", async () => {
        const directory = await root();
        const entries = observations(900).map((entry, index) => ({
            ...entry,
            state: index < 620 ? "committed" : "retained",
            userId: index < 898 ? "history-user" : "late-user",
        }));

        await initializeImportJournalIndex(directory, () => stream(entries));
        const cursor = readImportJournalRecoveryPage(directory).cursor;
        const global = readImportJournalIndexHealth(directory);

        expect(global).toMatchObject({ total: 280, overflow: 24, error: undefined });
        expect(global.rows).toHaveLength(256);
        expect(readImportJournalIndexHealth(directory, "late-user")).toMatchObject({
            total: 2,
            overflow: 0,
        });
        expect(readImportJournalRecoveryPage(directory).cursor).toBe(cursor);
    });

    it("preserves a corrupt catalogue and all sidecars before replacement", async () => {
        const directory = await root();
        const indexDirectory = path.join(directory, "import-journal-index");

        await mkdir(indexDirectory);
        await writeFile(path.join(indexDirectory, "catalog.sqlite"), "corrupt database sentinel");
        await writeFile(path.join(indexDirectory, "catalog.sqlite-journal"), "journal sentinel");
        await writeFile(path.join(indexDirectory, "catalog.sqlite-wal"), "wal sentinel");
        await writeFile(path.join(indexDirectory, "catalog.sqlite-shm"), "shm sentinel");
        await initializeImportJournalIndex(directory, () => stream(observations(3)));
        const retained = (await readdir(directory)).find((name) =>
            name.startsWith("import-journal-index-retained-"),
        )!;

        for (const [file, content] of [
            ["catalog.sqlite", "corrupt database sentinel"],
            ["catalog.sqlite-journal", "journal sentinel"],
            ["catalog.sqlite-wal", "wal sentinel"],
            ["catalog.sqlite-shm", "shm sentinel"],
        ]) {
            await expect(readFile(path.join(directory, retained, file), "utf8")).resolves.toBe(
                content,
            );
        }

        expect(readImportJournalIndexHealth(directory).total).toBe(3);
    });

    it("reports failed discovery, preserves the prior catalogue, and retries successfully", async () => {
        const directory = await root();
        const entries = observations(4);

        await initializeImportJournalIndex(directory, () => stream(entries));

        const failing = async function* () {
            yield entries[0];

            throw new Error("interrupted discovery");
        };

        await expect(initializeImportJournalIndex(directory, failing, true)).rejects.toThrow(
            "interrupted discovery",
        );
        expect(readImportJournalIndexHealth(directory)).toMatchObject({
            total: 4,
            error: expect.stringContaining("failed"),
        });
        await initializeImportJournalIndex(directory, () => stream(entries), true);
        expect(readImportJournalIndexHealth(directory)).toMatchObject({
            total: 4,
            error: undefined,
        });
    });

    it("blocks publication when durable registration fails and user recovery leaves the global cursor alone", async () => {
        const directory = await root();
        const sourceRootPath = path.join(directory, "source");
        const destinationRootPath = path.join(directory, "library");

        await mkdir(sourceRootPath);
        await mkdir(destinationRootPath);
        const sourcePath = path.join(sourceRootPath, "movie.mkv");
        const destinationPath = path.join(destinationRootPath, "movie.mkv");

        await writeFile(sourcePath, "sentinel movie");
        const source = await lstat(sourcePath);
        const journal = await createImportJournal({
            rootPath: directory,
            downloadId: randomUUID(),
            requestId: randomUUID(),
            userId: "user-a",
            sourceRootPath,
            destinationRootPath,
            files: [
                {
                    sourcePath,
                    destinationPath,
                    sourceSizeBytes: source.size,
                    sourceMtimeMs: source.mtimeMs,
                },
            ],
        });

        await initializeImportJournalRecovery(directory);
        const cursor = readImportJournalRecoveryPage(directory).cursor;

        await recoverImportJournals({ rootPath: directory, userId: "user-b" });
        expect(readImportJournalRecoveryPage(directory).cursor).toBe(cursor);
        const database = new Database(importJournalIndexPath(directory));

        database.exec(
            "CREATE TRIGGER reject_registration BEFORE INSERT ON entries BEGIN SELECT RAISE(ABORT,'registration failed'); END",
        );
        database.close();
        await expect(
            transferImportFile(sourcePath, destinationPath, { journal, journalFileIndex: 0 }),
        ).rejects.toThrow("registration failed");
        await expect(lstat(destinationPath)).rejects.toMatchObject({ code: "ENOENT" });
        await expect(readFile(sourcePath, "utf8")).resolves.toBe("sentinel movie");
    });
});
