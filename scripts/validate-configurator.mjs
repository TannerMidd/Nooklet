import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

const coreSource = await readFile("engineering-dossier/configurator-core.js", "utf8");
const { createSetupCommand, normalizeHostPath, validateSetupInput } = await import(
    `data:text/javascript;base64,${Buffer.from(coreSource).toString("base64")}`
);

const randomSource = {
    calls: 0,
    getRandomValues(bytes) {
        this.calls += 1;
        bytes.fill(this.calls);

        return bytes;
    },
};

const windowsInput = {
    platform: "windows",
    libraries: [
        { type: "movies", path: "D:\\Media\\Movies", field: "drive-path-1" },
        { type: "tv", path: "E:/Media/TV", field: "drive-path-2" },
    ],
    downloadPath: "F:/Nooklet/Downloads",
};
const windowsSetup = createSetupCommand(windowsInput, randomSource);

assert.equal(windowsSetup.errors.length, 0);
assert.equal(randomSource.calls, 3);
assert.match(windowsSetup.command, /git clone https:\/\/github\.com\/TannerMidd\/Nooklet\.git/);
assert.match(windowsSetup.command, /@\('docker', 'compose', 'version'\)/);
assert.match(windowsSetup.command, /@\('docker', 'info', '--format', '\{\{\.OSType\}\}'\)/);
assert.match(windowsSetup.command, /Invoke-NookletNative/);
assert.ok(!windowsSetup.command.includes("Select-Object -First 1"));
assert.ok(!windowsSetup.command.includes("*> $null"));
assert.match(windowsSetup.command, /docker compose config --quiet/);
assert.match(windowsSetup.command, /docker compose build app/);
assert.match(windowsSetup.command, /docker compose run --rm --no-deps --entrypoint sh app/);
assert.match(windowsSetup.command, /docker compose up -d/);
assert.ok(!windowsSetup.command.includes("--wait-timeout"));
assert.match(windowsSetup.command, /docker compose ps/);
assert.match(windowsSetup.command, /BOOTSTRAP_TOKEN/);
assert.match(windowsSetup.command, /Reusing matching/);
assert.match(windowsSetup.command, /Keeping the existing \.env/);
assert.match(windowsSetup.command, /Replaced the \.env left behind/);
assert.match(windowsSetup.command, /Refusing to replace/);
assert.match(windowsSetup.command, /restart Docker Desktop/);
assert.match(windowsSetup.command, /Test-NookletRepository/);
assert.match(windowsSetup.command, /Test-NookletDockerArtifacts/);
assert.match(windowsSetup.command, /mktemp/);
assert.match(windowsSetup.command, /finally \{/);
assert.ok(!windowsSetup.command.includes("down -v"));
assert.ok(!windowsSetup.command.includes("D:/Media/Movies"));
assert.ok(!windowsSetup.command.includes("F:/Nooklet/Downloads"));
assert.ok(
    windowsSetup.command.indexOf("@('docker', 'compose', 'version')") <
        windowsSetup.command.indexOf("git clone https://github.com/TannerMidd/Nooklet.git Nooklet"),
);
assert.ok(
    windowsSetup.command.indexOf("Write-NookletGeneratedFile -Path '.env'") <
        windowsSetup.command.indexOf("docker compose build app"),
);
assert.ok(
    windowsSetup.command.indexOf("docker compose build app") <
        windowsSetup.command.indexOf("docker compose run --rm --no-deps --entrypoint sh app"),
);
assert.deepEqual(
    windowsSetup.mappings.map(({ target }) => target),
    ["/media/movies", "/media/tv", "/downloads"],
);

function extractPowerShellPayload(command, name) {
    const match = command.match(new RegExp(String.raw`\$${name} = '([A-Za-z0-9+/=]+)'`));

    assert.ok(match, `Expected ${name} payload.`);

    return Buffer.from(match[1], "base64").toString("utf8");
}

const mixedSetup = createSetupCommand(
    {
        platform: "windows",
        libraries: [
            { type: "movies", path: "G:/Media/Movies", field: "drive-path-1" },
            { type: "youtube", path: "H:/Media/YouTube", field: "drive-path-2" },
            { type: "tv", path: "I:/Media/TV", field: "drive-path-3" },
            { type: "youtube", path: "J:/Media/YouTube-Archive", field: "drive-path-4" },
            { type: "movies", path: "K:/Media/Movies-Archive", field: "drive-path-5" },
        ],
        downloadPath: "L:/Nooklet/Downloads",
    },
    {
        counter: 40,
        getRandomValues(bytes) {
            this.counter += 1;
            bytes.fill(this.counter);

            return bytes;
        },
    },
);

assert.equal(mixedSetup.errors.length, 0);
assert.deepEqual(
    mixedSetup.value.libraries.map(({ type, target }) => ({ type, target })),
    [
        { type: "movies", target: "/media/movies" },
        { type: "youtube", target: "/media/youtube" },
        { type: "tv", target: "/media/tv" },
        { type: "youtube", target: "/media/youtube-2" },
        { type: "movies", target: "/media/movies-2" },
    ],
);
assert.deepEqual(
    mixedSetup.mappings.map(({ label, target }) => ({ label, target })),
    [
        { label: "Movie library", target: "/media/movies" },
        { label: "YouTube library", target: "/media/youtube" },
        { label: "TV library", target: "/media/tv" },
        { label: "YouTube library", target: "/media/youtube-2" },
        { label: "Movie library", target: "/media/movies-2" },
        { label: "Completed-download staging", target: "/downloads" },
    ],
);

const mixedOverride = extractPowerShellPayload(mixedSetup.command, "GeneratedOverride");

assert.match(mixedOverride, /source: "H:\/Media\/YouTube"[\s\S]*target: "\/media\/youtube"/);
assert.match(
    mixedOverride,
    /source: "J:\/Media\/YouTube-Archive"[\s\S]*target: "\/media\/youtube-2"/,
);
assert.deepEqual(JSON.parse(extractPowerShellPayload(mixedSetup.command, "DockerHostPathsJson")), [
    "G:/Media/Movies",
    "H:/Media/YouTube",
    "I:/Media/TV",
    "J:/Media/YouTube-Archive",
    "K:/Media/Movies-Archive",
    "L:/Nooklet/Downloads",
]);

for (const type of [undefined, "", "podcasts"]) {
    const invalidType = createSetupCommand({
        platform: "windows",
        libraries: [{ type, path: "G:/Media/Unknown", field: "drive-path-1" }],
        downloadPath: "L:/Nooklet/Downloads",
    });

    assert.equal(invalidType.command, "");
    assert.equal(invalidType.value, null);
    assert.equal(invalidType.mappings.length, 0);
    assert.ok(
        invalidType.errors.some(
            ({ field, message }) =>
                field === "drive-path-1" && message === "Choose Movies, TV, or YouTube.",
        ),
    );
}

const generatedEnvironment = extractPowerShellPayload(windowsSetup.command, "GeneratedEnv");
const generatedOverride = extractPowerShellPayload(windowsSetup.command, "GeneratedOverride");
const generatedHostPaths = JSON.parse(
    extractPowerShellPayload(windowsSetup.command, "DockerHostPathsJson"),
);

assert.match(generatedEnvironment, /^AUTH_SECRET=[A-Za-z0-9+/]{64}$/m);
assert.match(generatedEnvironment, /^BOOTSTRAP_TOKEN=[A-Za-z0-9+/]{64}$/m);
assert.match(generatedEnvironment, /^DOWNLOAD_ENGINE_DIR=\/downloads\/nooklet-engine$/m);
assert.match(generatedOverride, /source: "D:\/Media\/Movies"/);
assert.match(generatedOverride, /target: "\/media\/movies"/);
assert.match(generatedOverride, /create_host_path: false/);
assert.deepEqual(generatedHostPaths, ["D:/Media/Movies", "E:/Media/TV", "F:/Nooklet/Downloads"]);

const linuxSetup = createSetupCommand(
    {
        platform: "linux",
        libraries: [{ type: "movies", path: "/srv/media/movies", field: "drive-path-1" }],
        downloadPath: "/mnt/downloads/nooklet",
    },
    {
        counter: 10,
        getRandomValues(bytes) {
            this.counter += 1;
            bytes.fill(this.counter);

            return bytes;
        },
    },
);

assert.match(linuxSetup.command, /base64 --decode/);
assert.match(linuxSetup.command, /^\(\s/m);
assert.match(linuxSetup.command, /umask 077/);
assert.match(linuxSetup.command, /nooklet_file_state/);
assert.match(linuxSetup.command, /nooklet_has_existing_artifacts/);
assert.match(linuxSetup.command, /mv -f "\$generated_temporary" "\$generated_path"/);
assert.match(linuxSetup.command, /mktemp "\$path\/\.nooklet-write-test\.XXXXXX"/);
assert.match(linuxSetup.command, /docker compose run --rm --no-deps --entrypoint sh app/);
assert.match(linuxSetup.command, /daemon is not reachable/);
assert.ok(!linuxSetup.command.includes("/srv/media/movies"));
assert.match(
    createSetupCommand(
        {
            platform: "macos",
            libraries: [{ type: "tv", path: "/Volumes/Media/TV", field: "drive-path-1" }],
            downloadPath: "/Volumes/Fast/Nooklet",
        },
        {
            counter: 20,
            getRandomValues(bytes) {
                this.counter += 1;
                bytes.fill(this.counter);

                return bytes;
            },
        },
    ).command,
    /base64 -D/,
);

assert.deepEqual(normalizeHostPath("f:\\Media\\Movies\\", "windows"), {
    value: "F:/Media/Movies",
});
assert.ok(normalizeHostPath("D:/Media/CON", "windows").error);
assert.ok(normalizeHostPath("D:/Media/Movies. ", "windows").error);
assert.ok(normalizeHostPath(" /srv/media/movies", "linux").error);
assert.ok(normalizeHostPath("//server/media", "linux").error);
assert.ok(normalizeHostPath("../media", "linux").error);
assert.ok(normalizeHostPath("/srv/${HOME}", "linux").error);
assert.ok(normalizeHostPath("D:/Media\nprivileged: true", "windows").error);
assert.ok(
    validateSetupInput({
        ...windowsInput,
        downloadPath: "D:/Media/Movies/Staging",
    }).errors.some(({ field }) => field === "quick-download-path"),
);
assert.throws(
    () => createSetupCommand(windowsInput, null),
    /Secure secret generation is unavailable/,
);

if (process.platform === "win32") {
    const parsedPowerShell = spawnSync(
        "powershell.exe",
        [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "$source = [Console]::In.ReadToEnd(); [void][scriptblock]::Create($source)",
        ],
        { input: windowsSetup.command, encoding: "utf8" },
    );

    assert.equal(
        parsedPowerShell.status,
        0,
        `Generated PowerShell did not parse:\n${parsedPowerShell.stderr}`,
    );
}

const parsedPosix = spawnSync("sh", ["-n"], {
    input: linuxSetup.command,
    encoding: "utf8",
});

if (!parsedPosix.error || parsedPosix.error.code !== "ENOENT") {
    assert.equal(
        parsedPosix.status,
        0,
        `Generated POSIX command did not parse:\n${parsedPosix.stderr}`,
    );

    if (process.platform !== "win32") {
        const fixtureRoot = await mkdtemp(join(tmpdir(), "nooklet-configurator-"));

        try {
            const fakeBin = join(fixtureRoot, "bin");
            const youtubePath = join(fixtureRoot, "media", "youtube");
            const downloadPath = join(fixtureRoot, "downloads");

            await mkdir(fakeBin, { recursive: true });
            await mkdir(youtubePath, { recursive: true });
            await mkdir(downloadPath, { recursive: true });
            await mkdir(join(fixtureRoot, ".git"));
            await writeFile(join(fixtureRoot, "docker-compose.yml"), "name: nooklet\n");
            await writeFile(join(fixtureRoot, "package.json"), "{}\n");

            const fakeDocker = join(fakeBin, "docker");

            await writeFile(
                fakeDocker,
                `#!/bin/sh
if [ "$1" = "info" ]; then printf 'linux\\n'; exit 0; fi
if [ "$1" = "container" ] || [ "$1" = "volume" ]; then
  if [ "\${FAKE_EXISTING_NOOKLET:-0}" = "1" ]; then exit 0; fi
  exit 1
fi
if [ "$1" = "compose" ] && [ "$2" = "run" ]; then exit 42; fi
exit 0
`,
            );
            await chmod(fakeDocker, 0o755);

            const fakeGit = join(fakeBin, "git");

            await writeFile(
                fakeGit,
                "#!/bin/sh\nprintf 'https://github.com/TannerMidd/Nooklet.git\\n'\n",
            );
            await chmod(fakeGit, 0o755);

            const runtimeSetup = createSetupCommand(
                {
                    platform: "linux",
                    libraries: [{ type: "youtube", path: youtubePath, field: "drive-path-1" }],
                    downloadPath,
                },
                {
                    counter: 30,
                    getRandomValues(bytes) {
                        this.counter += 1;
                        bytes.fill(this.counter);

                        return bytes;
                    },
                },
            );
            const runtimeEnvironment = {
                ...process.env,
                PATH: `${fakeBin}${delimiter}${process.env.PATH ?? ""}`,
            };
            const firstFailure = spawnSync("sh", ["-c", runtimeSetup.command], {
                cwd: fixtureRoot,
                env: runtimeEnvironment,
                encoding: "utf8",
            });

            assert.notEqual(firstFailure.status, 0);
            assert.match(firstFailure.stderr, /non-root container user/);
            assert.ok(!firstFailure.stderr.includes("AUTH_SECRET="));
            assert.ok(!firstFailure.stderr.includes("SECRET_BOX_KEY="));

            const exactRetry = spawnSync("sh", ["-c", runtimeSetup.command], {
                cwd: fixtureRoot,
                env: runtimeEnvironment,
                encoding: "utf8",
            });

            assert.notEqual(exactRetry.status, 0);
            assert.match(exactRetry.stdout, /Reusing matching \.env/);
            assert.match(exactRetry.stdout, /Reusing matching docker-compose\.override\.yml/);

            const replacementSetup = createSetupCommand(
                {
                    platform: "linux",
                    libraries: [{ type: "youtube", path: youtubePath, field: "drive-path-1" }],
                    downloadPath,
                },
                {
                    counter: 70,
                    getRandomValues(bytes) {
                        this.counter += 1;
                        bytes.fill(this.counter);

                        return bytes;
                    },
                },
            );
            const replacementRun = spawnSync("sh", ["-c", replacementSetup.command], {
                cwd: fixtureRoot,
                env: runtimeEnvironment,
                encoding: "utf8",
            });

            assert.notEqual(replacementRun.status, 0);
            assert.match(
                replacementRun.stdout,
                /Replaced the \.env left behind by an earlier incomplete setup/,
            );
            assert.match(replacementRun.stderr, /non-root container user/);
            const replacedEnv = await readFile(join(fixtureRoot, ".env"), "utf8");

            const keepRun = spawnSync("sh", ["-c", runtimeSetup.command], {
                cwd: fixtureRoot,
                env: { ...runtimeEnvironment, FAKE_EXISTING_NOOKLET: "1" },
                encoding: "utf8",
            });

            assert.notEqual(keepRun.status, 0);
            assert.match(keepRun.stdout, /Keeping the existing \.env/);
            assert.match(keepRun.stderr, /non-root container user/);
            assert.equal(await readFile(join(fixtureRoot, ".env"), "utf8"), replacedEnv);

            await rm(join(fixtureRoot, ".env"));
            await rm(join(fixtureRoot, "docker-compose.override.yml"));
            const artifactRefusal = spawnSync("sh", ["-c", replacementSetup.command], {
                cwd: fixtureRoot,
                env: { ...runtimeEnvironment, FAKE_EXISTING_NOOKLET: "1" },
                encoding: "utf8",
            });

            assert.notEqual(artifactRefusal.status, 0);
            assert.match(artifactRefusal.stderr, /container or data volume already exists/);
            assert.match(artifactRefusal.stderr, /do not delete the container or volume/);
            assert.match(artifactRefusal.stderr, /Restore the original \.env/);
            assert.doesNotMatch(artifactRefusal.stderr, /docker (?:rm|volume rm)/);
            await assert.rejects(readFile(join(fixtureRoot, ".env")));
            await assert.rejects(readFile(join(fixtureRoot, "docker-compose.override.yml")));
        } finally {
            await rm(fixtureRoot, { recursive: true, force: true });
        }
    }
}

const controllerSource = await readFile("engineering-dossier/configurator.js", "utf8");
const guideSource = await readFile("engineering-dossier/guide/index.html", "utf8");

assert.match(controllerSource, /youtubeOption\.value = "youtube"/);
assert.match(controllerSource, /D:\/Media\/YouTube/);
assert.match(controllerSource, /\/srv\/media\/youtube/);
assert.match(controllerSource, /\/Volumes\/Media\/YouTube/);
assert.match(controllerSource, /\.\/configurator-core\.js\?v=20260820-youtube/);

assert.match(guideSource, /id="docker-configurator"/);
assert.match(guideSource, /src="\.\.\/configurator\.js\?v=20260820-youtube"/);
assert.match(guideSource, /connect-src 'none'/);
assert.equal((guideSource.match(/<option value="youtube">YouTube<\/option>/g) ?? []).length, 2);

for (const forbiddenApi of [
    /\bfetch\s*\(/,
    /\bXMLHttpRequest\b/,
    /\bWebSocket\b/,
    /\bsendBeacon\b/,
    /\blocalStorage\b/,
    /\bsessionStorage\b/,
    /\bdocument\.cookie\b/,
]) {
    assert.ok(!forbiddenApi.test(controllerSource));
}

console.log("Docker setup command generator validation passed.");
