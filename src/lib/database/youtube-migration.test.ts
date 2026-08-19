import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { describe, expect, it } from "vitest";

const migrationsFolder = path.join(process.cwd(), "drizzle");

describe("YouTube library migration", () => {
    it("creates user-scoped sources, videos, membership, and durable downloads", () => {
        const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "nooklet-youtube-migration-"));
        const sqlite = new Database(path.join(sandbox, "youtube.db"));

        try {
            sqlite.pragma("foreign_keys = ON");
            migrate(drizzle(sqlite), { migrationsFolder });

            const tables = sqlite
                .prepare(
                    `SELECT name FROM sqlite_master
                     WHERE type = 'table' AND name LIKE 'youtube_%'
                     ORDER BY name`,
                )
                .all();

            expect(tables).toEqual([
                { name: "youtube_downloads" },
                { name: "youtube_source_selections" },
                { name: "youtube_source_videos" },
                { name: "youtube_sources" },
                { name: "youtube_videos" },
            ]);

            for (const userId of ["user-a", "user-b"]) {
                sqlite
                    .prepare(
                        `INSERT INTO users (id, email, display_name, password_hash)
                         VALUES (?, ?, ?, 'test-hash')`,
                    )
                    .run(userId, `${userId}@example.test`, userId);
            }

            sqlite
                .prepare(
                    `INSERT INTO media_libraries (id, user_id, media_type, name)
                     VALUES ('youtube-library', 'user-a', 'youtube', 'YouTube')`,
                )
                .run();
            sqlite
                .prepare(
                    `INSERT INTO media_library_paths (id, library_id, user_id, path, label)
                     VALUES ('youtube-root', 'youtube-library', 'user-a', '/media/youtube', 'YouTube')`,
                )
                .run();

            const insertSource = sqlite.prepare(
                `INSERT INTO youtube_sources (
                    id, user_id, source_kind, youtube_source_id, canonical_url,
                    title, library_path_id, quality_profile
                 ) VALUES (?, ?, 'playlist', 'PL123', 'https://www.youtube.com/playlist?list=PL123',
                    'Playlist', 'youtube-root', 'mp4-1080p')`,
            );
            const insertVideo = sqlite.prepare(
                `INSERT INTO youtube_videos (
                    id, user_id, youtube_video_id, title, webpage_url, content_kind
                 ) VALUES (?, ?, 'video123456', 'Video',
                    'https://www.youtube.com/watch?v=video123456', 'regular')`,
            );

            insertSource.run("source-a", "user-a");
            insertVideo.run("video-a", "user-a");
            insertSource.run("source-b", "user-b");
            insertVideo.run("video-b", "user-b");

            expect(() => insertSource.run("source-a-duplicate", "user-a")).toThrow(
                /UNIQUE constraint failed/,
            );
            expect(() => insertVideo.run("video-a-duplicate", "user-a")).toThrow(
                /UNIQUE constraint failed/,
            );

            sqlite
                .prepare(
                    `INSERT INTO youtube_source_selections (source_id, youtube_video_id)
                     VALUES ('source-a', 'video123456')`,
                )
                .run();
            expect(() =>
                sqlite
                    .prepare(
                        `INSERT INTO youtube_source_selections (source_id, youtube_video_id)
                         VALUES ('source-a', 'video123456')`,
                    )
                    .run(),
            ).toThrow(/UNIQUE constraint failed/);

            sqlite
                .prepare(
                    `INSERT INTO youtube_source_videos (source_id, video_id)
                     VALUES ('source-a', 'video-a')`,
                )
                .run();
            sqlite
                .prepare(
                    `INSERT INTO youtube_downloads (
                        id, user_id, video_id, source_id, library_path_id,
                        quality_profile, status, final_path
                     ) VALUES (
                        'download-a', 'user-a', 'video-a', 'source-a', 'youtube-root',
                        'mp4-1080p', 'completed', '/media/youtube/channel/2026/video.mp4'
                     )`,
                )
                .run();

            expect(() =>
                sqlite
                    .prepare(
                        `INSERT INTO youtube_downloads (
                            id, user_id, video_id, library_path_id, quality_profile
                         ) VALUES (
                            'download-a-duplicate', 'user-a', 'video-a',
                            'youtube-root', 'mp4-1080p'
                         )`,
                    )
                    .run(),
            ).toThrow(/UNIQUE constraint failed/);

            expect(() =>
                sqlite.prepare("DELETE FROM media_library_paths WHERE id = 'youtube-root'").run(),
            ).toThrow(/FOREIGN KEY constraint failed/);

            sqlite.prepare("DELETE FROM youtube_sources WHERE id = 'source-a'").run();

            expect(
                sqlite
                    .prepare(
                        "SELECT COUNT(*) AS count FROM youtube_source_selections WHERE source_id = 'source-a'",
                    )
                    .get(),
            ).toEqual({ count: 0 });
            expect(
                sqlite
                    .prepare(
                        "SELECT COUNT(*) AS count FROM youtube_source_videos WHERE source_id = 'source-a'",
                    )
                    .get(),
            ).toEqual({ count: 0 });
            expect(
                sqlite
                    .prepare(
                        "SELECT source_id AS sourceId, final_path AS finalPath FROM youtube_downloads WHERE id = 'download-a'",
                    )
                    .get(),
            ).toEqual({
                sourceId: null,
                finalPath: "/media/youtube/channel/2026/video.mp4",
            });
            expect(sqlite.pragma("foreign_key_check")).toEqual([]);
            expect(sqlite.pragma("integrity_check", { simple: true })).toBe("ok");
        } finally {
            sqlite.close();
            fs.rmSync(sandbox, { recursive: true, force: true });
        }
    });
});
