const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const ENV_REFERENCE = /\$(?:\{[^}]*\}|[A-Za-z_][A-Za-z0-9_]*|\()|%[^%]+%/;
const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const LIBRARY_TYPES = ["movies", "tv", "youtube"];
const LIBRARY_LABELS = {
    movies: "Movie library",
    tv: "TV library",
    youtube: "YouTube library",
};

function error(field, message) {
    return { field, message };
}

export function normalizeHostPath(rawValue, platform, field = "path") {
    const supplied = String(rawValue ?? "");
    const raw = supplied.trim();

    if (!raw) {
        return { error: error(field, "Enter an absolute host folder.") };
    }

    if (supplied !== raw) {
        return {
            error: error(field, "Remove spaces from the beginning or end of this folder."),
        };
    }

    if (CONTROL_CHARACTERS.test(raw) || ENV_REFERENCE.test(raw)) {
        return {
            error: error(
                field,
                "Enter the full folder path without control characters or environment variables.",
            ),
        };
    }

    if (platform === "windows") {
        if (raw.startsWith("\\\\") || raw.startsWith("//")) {
            return {
                error: error(
                    field,
                    "Mount network storage in Windows first, then use its drive-letter path.",
                ),
            };
        }

        let path = raw.replaceAll("\\", "/").replace(/\/+/g, "/").replace(/\/$/, "");

        if (!/^[A-Za-z]:\/[^/]/.test(path)) {
            return {
                error: error(field, "Use an absolute folder such as D:/Media/Movies."),
            };
        }

        path = `${path[0].toUpperCase()}${path.slice(1)}`;
        const invalidWindowsName = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i;

        if (
            path
                .slice(3)
                .split("/")
                .some(
                    (part) =>
                        !part ||
                        part === "." ||
                        part === ".." ||
                        /[<>:"|?*]/.test(part) ||
                        /[. ]$/.test(part) ||
                        invalidWindowsName.test(part),
                )
        ) {
            return { error: error(field, "This Windows folder contains an invalid segment.") };
        }

        return { value: path };
    }

    if (platform === "linux" || platform === "macos") {
        if (raw.startsWith("//")) {
            return {
                error: error(
                    field,
                    "Mount network storage first, then use its local absolute path.",
                ),
            };
        }

        const path = raw.replace(/\/+/g, "/").replace(/\/$/, "") || "/";

        if (!path.startsWith("/") || path === "/") {
            return {
                error: error(field, "Use an absolute folder such as /srv/media/movies."),
            };
        }

        if (
            path
                .slice(1)
                .split("/")
                .some((part) => !part || part === "." || part === "..")
        ) {
            return { error: error(field, "Remove dot segments or traversal from this folder.") };
        }

        return { value: path };
    }

    return { error: error("platform", "Choose the operating system that runs Docker.") };
}

function pathsOverlap(left, right, platform) {
    const normalize = (value) => (platform === "windows" ? value.toLowerCase() : value);
    const a = normalize(left);
    const b = normalize(right);

    return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

export function validateSetupInput(input) {
    const platform = String(input?.platform ?? "");
    const errors = [];

    if (!["windows", "linux", "macos"].includes(platform)) {
        errors.push(error("platform", "Choose Windows, Linux, or macOS."));
    }

    const libraries = [];

    for (const [index, item] of (input?.libraries ?? []).entries()) {
        const field = String(item?.field ?? `drive-path-${index + 1}`);
        const typeField = String(item?.typeField ?? field);

        if (!LIBRARY_TYPES.includes(item?.type)) {
            errors.push(error(typeField, "Choose Movies, TV, or YouTube."));
            continue;
        }

        if (!String(item?.path ?? "").trim()) {
            continue;
        }

        const normalized = normalizeHostPath(item.path, platform, field);

        if (normalized.error) {
            errors.push(normalized.error);
        } else {
            libraries.push({ field, type: item.type, path: normalized.value });
        }
    }

    if (libraries.length === 0) {
        errors.push(error("libraries", "Add at least one movie, TV, or YouTube folder."));
    }

    const download = normalizeHostPath(input?.downloadPath, platform, "quick-download-path");

    if (download.error) {
        errors.push(download.error);
    }

    for (let left = 0; left < libraries.length; left += 1) {
        for (let right = left + 1; right < libraries.length; right += 1) {
            if (pathsOverlap(libraries[left].path, libraries[right].path, platform)) {
                errors.push(
                    error(libraries[right].field, "This folder overlaps another library folder."),
                );
            }
        }

        if (download.value && pathsOverlap(libraries[left].path, download.value, platform)) {
            errors.push(
                error(
                    "quick-download-path",
                    "Keep downloads outside the media library so partial files are not scanned.",
                ),
            );
        }
    }

    if (errors.length) {
        return { errors, value: null };
    }

    const counts = { movies: 0, tv: 0, youtube: 0 };

    return {
        errors,
        value: {
            platform,
            downloadPath: download.value,
            libraries: libraries.map((library) => {
                counts[library.type] += 1;
                const suffix = counts[library.type] === 1 ? "" : `-${counts[library.type]}`;

                return { ...library, target: `/media/${library.type}${suffix}` };
            }),
        },
    };
}

function bytesToBase64(bytes) {
    let output = "";

    for (let index = 0; index < bytes.length; index += 3) {
        const first = bytes[index];
        const second = bytes[index + 1];
        const third = bytes[index + 2];
        const combined = (first << 16) | ((second ?? 0) << 8) | (third ?? 0);

        output += BASE64[(combined >> 18) & 63];
        output += BASE64[(combined >> 12) & 63];
        output += second === undefined ? "=" : BASE64[(combined >> 6) & 63];
        output += third === undefined ? "=" : BASE64[combined & 63];
    }

    return output;
}

function generateSecrets(randomSource) {
    if (!randomSource || typeof randomSource.getRandomValues !== "function") {
        throw new Error("Secure secret generation is unavailable in this browser.");
    }

    const makeSecret = () => {
        const bytes = new Uint8Array(48);

        randomSource.getRandomValues(bytes);

        return bytesToBase64(bytes);
    };

    const secrets = [makeSecret(), makeSecret(), makeSecret()];

    if (new Set(secrets).size !== 3) {
        throw new Error("Secure secret generation did not produce independent values.");
    }

    return secrets;
}

function buildEnvironment([authSecret, bootstrapToken, secretBoxKey]) {
    return `APP_URL=http://localhost:42021
DATABASE_URL=file:./data/nooklet.db
APP_BIND_ADDRESS=127.0.0.1
APP_PORT=42021
AUTH_SECRET=${authSecret}
BOOTSTRAP_TOKEN=${bootstrapToken}
SECRET_BOX_KEY=${secretBoxKey}
APPROVED_MEDIA_ROOTS=/media
DOWNLOAD_ENGINE_DIR=/downloads/nooklet-engine
DOWNLOAD_ENGINE_WORK_DIR=/app/data/engine-work
TRUST_PROXY_HEADERS=false
PRIVATE_SERVICE_HOST_ALLOWLIST=
ALLOW_PRIVATE_SERVICE_HOSTS=false
AI_RECOMMENDATIONS_TIMEOUT_MS=1800000
OPERATIONAL_RETENTION_DAYS=365
`;
}

function yamlString(value) {
    return JSON.stringify(String(value).split("$").join("$$"));
}

function buildOverride(configuration) {
    const mounts = [
        ...configuration.libraries,
        { path: configuration.downloadPath, target: "/downloads" },
    ];
    const lines = ["services:", "  app:", "    volumes:"];

    for (const mount of mounts) {
        lines.push(
            "      - type: bind",
            `        source: ${yamlString(mount.path)}`,
            `        target: ${yamlString(mount.target)}`,
            "        bind:",
            "          create_host_path: false",
        );
    }

    return `${lines.join("\n")}\n`;
}

function encodeText(value) {
    return bytesToBase64(new TextEncoder().encode(value));
}

function selectedHostPaths(configuration) {
    return [...configuration.libraries.map(({ path }) => path), configuration.downloadPath];
}

function mountProbe(configuration) {
    const targets = [...configuration.libraries.map(({ target }) => target), "/downloads"];

    return `set -eu; probe=""; cleanup() { if [ -n "$probe" ]; then rm -f -- "$probe"; fi; }; trap cleanup EXIT HUP INT TERM; for path in ${targets.join(
        " ",
    )}; do test -d "$path" || { echo "Mapped folder is unavailable: $path" >&2; exit 1; }; probe=$(mktemp "$path/.nooklet-write-test.XXXXXX") || { echo "Mapped folder is not writable: $path" >&2; exit 1; }; rm -f -- "$probe" || { echo "Could not clean up the write test: $path" >&2; exit 1; }; probe=""; done; trap - EXIT HUP INT TERM`;
}

function buildPowerShellCommand(environment, override, configuration) {
    const encodedEnvironment = encodeText(environment);
    const encodedOverride = encodeText(override);
    const encodedHostPaths = encodeText(JSON.stringify(selectedHostPaths(configuration)));
    const probe = mountProbe(configuration);

    return `& {
  $PreviousErrorActionPreference = $ErrorActionPreference
  $OriginalLocation = (Get-Location).Path
  $ErrorActionPreference = 'Stop'
  $GeneratedEnv = '${encodedEnvironment}'
  $GeneratedOverride = '${encodedOverride}'
  $DockerHostPathsJson = '${encodedHostPaths}'

  function ConvertFrom-NookletBase64 {
    param([Parameter(Mandatory = $true)][string]$Value)
    return [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Value))
  }

  function Invoke-NookletNative {
    param([Parameter(Mandatory = $true)][string[]]$CommandLine)
    $Executable = $CommandLine[0]
    $Arguments = @()
    if ($CommandLine.Count -gt 1) {
      $Arguments = $CommandLine[1..($CommandLine.Count - 1)]
    }
    $Preference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
      $Output = @(& $Executable @Arguments 2>$null)
      $ExitCode = $LASTEXITCODE
    } finally {
      $ErrorActionPreference = $Preference
    }
    $FirstLine = ''
    if ($Output.Count -gt 0) { $FirstLine = ([string]$Output[0]).Trim() }
    return [pscustomobject]@{ ExitCode = $ExitCode; FirstLine = $FirstLine }
  }

  function Test-NookletDockerEngine {
    return (Invoke-NookletNative -CommandLine @('docker', 'info', '--format', '{{.OSType}}')).ExitCode -eq 0
  }

  function Test-NookletDockerArtifacts {
    if ((Invoke-NookletNative -CommandLine @('docker', 'container', 'inspect', 'nooklet')).ExitCode -eq 0) {
      return $true
    }
    return (Invoke-NookletNative -CommandLine @('docker', 'volume', 'inspect', 'nooklet_nooklet-data')).ExitCode -eq 0
  }

  function Test-NookletRepository {
    param([Parameter(Mandatory = $true)][string]$Path)
    if (
      -not (Test-Path -LiteralPath (Join-Path $Path 'docker-compose.yml') -PathType Leaf) -or
      -not (Test-Path -LiteralPath (Join-Path $Path 'package.json') -PathType Leaf) -or
      -not (Test-Path -LiteralPath (Join-Path $Path '.git') -PathType Container)
    ) {
      return $false
    }
    $Remote = Invoke-NookletNative -CommandLine @('git', '-C', $Path, 'remote', 'get-url', 'origin')
    if ($Remote.ExitCode -ne 0) { return $false }
    return $Remote.FirstLine -in @(
      'https://github.com/TannerMidd/Nooklet',
      'https://github.com/TannerMidd/Nooklet.git',
      'git@github.com:TannerMidd/Nooklet.git'
    )
  }

  function Get-NookletFileState {
    param(
      [Parameter(Mandatory = $true)][string]$Path,
      [Parameter(Mandatory = $true)][string]$Base64
    )
    if (-not (Test-Path -LiteralPath $Path)) { return 'missing' }
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return 'blocked' }
    $Existing = [Convert]::ToBase64String(
      [IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $Path).Path)
    )
    if ($Existing -cne $Base64) { return 'different' }
    return 'matching'
  }

  function Write-NookletGeneratedFile {
    param(
      [Parameter(Mandatory = $true)][string]$Path,
      [Parameter(Mandatory = $true)][string]$Base64
    )
    $Destination = Join-Path (Get-Location).Path $Path
    $Temporary = "$Destination.nooklet-$PID.tmp"
    try {
      [IO.File]::WriteAllBytes($Temporary, [Convert]::FromBase64String($Base64))
      [IO.File]::Copy($Temporary, $Destination, $true)
    } finally {
      if (Test-Path -LiteralPath $Temporary) {
        Remove-Item -LiteralPath $Temporary -Force
      }
    }
  }

  try {
    $DockerHostPaths = @(
      ConvertFrom-Json -InputObject (ConvertFrom-NookletBase64 -Value $DockerHostPathsJson)
    )
    foreach ($HostPath in $DockerHostPaths) {
      if (-not (Test-Path -LiteralPath $HostPath -PathType Container)) {
        throw "Host folder does not exist or is not available: $HostPath. Create or reconnect it, then paste this same command again. No Nooklet files were created."
      }
    }

    if (-not (Get-Command -Name docker -ErrorAction SilentlyContinue)) {
      throw 'Docker was not found. Install Docker Desktop, open it, then paste this same command again. No Nooklet files were created.'
    }
    if ((Invoke-NookletNative -CommandLine @('docker', 'compose', 'version')).ExitCode -ne 0) {
      throw 'Docker Compose v2 is unavailable. Update Docker Desktop, then paste this same command again. No Nooklet files were created.'
    }
    $DockerInfo = Invoke-NookletNative -CommandLine @('docker', 'info', '--format', '{{.OSType}}')
    if ($DockerInfo.ExitCode -ne 0) {
      throw 'Docker is installed, but its engine is not responding. Open or restart Docker Desktop, wait until the engine is running, then paste this same command again. No Nooklet files were created.'
    }
    if ($DockerInfo.FirstLine -ne 'linux') {
      throw 'Docker Desktop is using Windows containers. Switch to Linux containers, wait for the engine, then paste this same command again. No Nooklet files were created.'
    }
    if (-not (Get-Command -Name git -ErrorAction SilentlyContinue)) {
      throw 'Git was not found. Install Git, then paste this same command again. No Nooklet files were created.'
    }

    if (
      (Test-Path -LiteralPath '.\\Nooklet' -PathType Container) -and
      (@(Get-ChildItem -LiteralPath '.\\Nooklet' -Force).Count -eq 0)
    ) {
      Remove-Item -LiteralPath '.\\Nooklet' -Force
    }
    if (Test-NookletRepository -Path (Get-Location).Path) {
      Write-Host 'Using the current Nooklet repository.'
    } elseif (Test-Path -LiteralPath '.\\Nooklet') {
      if (-not (Test-NookletRepository -Path (Join-Path (Get-Location).Path 'Nooklet'))) {
        throw 'A Nooklet folder already exists here but is not a complete official clone. Rename or repair that folder, then paste this same command again.'
      }
      Set-Location -LiteralPath '.\\Nooklet'
      Write-Host 'Using the existing Nooklet repository.'
    } elseif (
      (Test-Path -LiteralPath '.\\.git') -or
      (Test-Path -LiteralPath '.\\docker-compose.yml') -or
      ((Split-Path -Leaf (Get-Location).Path) -eq 'Nooklet')
    ) {
      throw 'This folder looks like an incomplete or different project. Open its parent folder, then paste this same command again.'
    } else {
      git clone https://github.com/TannerMidd/Nooklet.git Nooklet
      if ($LASTEXITCODE -ne 0) {
        throw 'Could not clone Nooklet. If a partial Nooklet folder was created, rename or remove it before retrying.'
      }
      Set-Location -LiteralPath '.\\Nooklet'
      if (-not (Test-NookletRepository -Path (Get-Location).Path)) {
        throw 'The cloned repository could not be verified as the official Nooklet project.'
      }
    }

    $EnvState = Get-NookletFileState -Path '.env' -Base64 $GeneratedEnv
    $OverrideState = Get-NookletFileState -Path 'docker-compose.override.yml' -Base64 $GeneratedOverride
    if ($EnvState -eq 'blocked') {
      throw '.env exists but is not a regular file. Refusing to replace it.'
    }
    if ($OverrideState -eq 'blocked') {
      throw 'docker-compose.override.yml exists but is not a regular file. Refusing to replace it.'
    }
    $HasArtifacts = Test-NookletDockerArtifacts
    if ($EnvState -eq 'missing' -and $HasArtifacts) {
      throw 'A Nooklet container or data volume already exists, but this folder has no .env holding its secrets. Stop: do not delete the container or volume, and do not generate replacement secrets. Restore the original .env from your secure backup, then paste this same command again. If it cannot be recovered, preserve the volume and follow https://github.com/TannerMidd/Nooklet/wiki/Docker-Installation#installation-recovery.'
    }
    if ($EnvState -eq 'matching') {
      Write-Host 'Reusing matching .env.'
    } elseif ($EnvState -eq 'different' -and $HasArtifacts) {
      Write-Host 'Keeping the existing .env because it belongs to your current Nooklet container or data volume.'
    } else {
      Write-NookletGeneratedFile -Path '.env' -Base64 $GeneratedEnv
      if ($EnvState -eq 'different') {
        Write-Host 'Replaced the .env left behind by an earlier incomplete setup.'
      } else {
        Write-Host 'Created .env.'
      }
    }
    if ($OverrideState -eq 'matching') {
      Write-Host 'Reusing matching docker-compose.override.yml.'
    } else {
      Write-NookletGeneratedFile -Path 'docker-compose.override.yml' -Base64 $GeneratedOverride
      Write-Host 'Wrote docker-compose.override.yml for your selected folders.'
    }

    docker compose config --quiet
    if ($LASTEXITCODE -ne 0) {
      throw 'Docker Compose validation failed. Your matching setup files were saved; correct the reported Docker error, then paste this same command again.'
    }
    docker compose build app
    if ($LASTEXITCODE -ne 0) {
      if (-not (Test-NookletDockerEngine)) {
        throw 'Docker Desktop disconnected while setting up Nooklet. Your matching setup files were saved. Restart Docker Desktop, wait for its Linux engine, then paste this same command again.'
      }
      throw 'Docker could not build Nooklet. Your matching setup files were saved; correct the reported error, then paste this same command again.'
    }
    docker compose run --rm --no-deps --entrypoint sh app -c '${probe}'
    if ($LASTEXITCODE -ne 0) {
      if (-not (Test-NookletDockerEngine)) {
        throw 'Docker Desktop disconnected while checking your storage. Your matching setup files were saved. Restart Docker Desktop, wait for its Linux engine, then paste this same command again.'
      }
      throw 'Docker could not mount and write to every selected folder. If the output above mentioned EOF, a pipe, daemon, or API failure, restart Docker Desktop first. Otherwise share the folders under Settings > Resources > File sharing and choose Apply & restart. Then paste this same command again; matching setup files will be safely reused.'
    }
    docker compose up -d
    if ($LASTEXITCODE -ne 0) {
      if (-not (Test-NookletDockerEngine)) {
        throw 'Docker Desktop disconnected before Nooklet became healthy. Your matching setup files were saved. Restart Docker Desktop, wait for its Linux engine, then paste this same command again.'
      }
      throw 'Docker stopped before Nooklet became healthy. If the error mentions EOF, a pipe, daemon, or API failure, restart Docker Desktop and wait for its engine. Then paste this same command again; matching setup files will be safely reused.'
    }
    $ContainerHealth = ''
    for ($Attempt = 0; $Attempt -lt 60; $Attempt += 1) {
      $HealthProbe = Invoke-NookletNative -CommandLine @(
        'docker', 'inspect', '--format',
        '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}',
        'nooklet'
      )
      if ($HealthProbe.ExitCode -eq 0) { $ContainerHealth = $HealthProbe.FirstLine }
      if ($ContainerHealth -eq 'healthy') { break }
      Start-Sleep -Seconds 2
    }
    if ($ContainerHealth -ne 'healthy') {
      if (-not (Test-NookletDockerEngine)) {
        throw 'Docker Desktop disconnected while Nooklet was starting. Restart Docker Desktop, wait for its Linux engine, then paste this same command again.'
      }
      docker compose ps
      throw 'Nooklet started but did not become healthy within two minutes. Run docker compose logs --tail=200 app, correct the reported issue, then paste this same command again.'
    }
    docker compose ps
    $AppPort = '42021'
    $AppPortLine = @(Select-String -Path '.env' -Pattern '^APP_PORT=([0-9]+)')
    if ($AppPortLine.Count -gt 0) {
      $AppPort = $AppPortLine[0].Matches[0].Groups[1].Value
    }
    Write-Host ''
    Write-Host "Nooklet is healthy: http://localhost:$AppPort"
    Select-String -Path '.env' -Pattern '^BOOTSTRAP_TOKEN='
  } finally {
    Set-Location -LiteralPath $OriginalLocation
    $ErrorActionPreference = $PreviousErrorActionPreference
  }
}
`;
}

function buildPosixCommand(environment, override, configuration) {
    const platform = configuration.platform;
    const decode = platform === "macos" ? "base64 -D" : "base64 --decode";
    const encodedEnvironment = encodeText(environment);
    const encodedOverride = encodeText(override);
    const hostChecks = selectedHostPaths(configuration)
        .map((path) => `  nooklet_require_directory '${encodeText(path)}'`)
        .join("\n");
    const probe = mountProbe(configuration);
    const engineFailure =
        platform === "macos"
            ? "Docker is installed, but its engine is not responding. Open or restart Docker Desktop, wait until the engine is running, then paste this same command again. No Nooklet files were created."
            : "Docker is installed, but its daemon is not reachable. Start Docker or verify access to its socket, then paste this same command again. No Nooklet files were created.";
    const engineRetryFailure =
        platform === "macos"
            ? "Docker Desktop disconnected while setting up Nooklet. Your matching setup files were saved. Restart Docker Desktop, wait for its Linux engine, then paste this same command again."
            : "The Docker daemon disconnected while setting up Nooklet. Your matching setup files were saved. Start Docker or restore access to its socket, then paste this same command again.";
    const mountFailure =
        platform === "macos"
            ? "Docker could not mount and write to every selected folder. If the output above mentioned EOF, a socket, daemon, or API failure, restart Docker Desktop first. Otherwise share the folders under Settings > Resources > File sharing and choose Apply & restart. Then paste this same command again; matching setup files will be safely reused."
            : "Docker could not mount and write to every selected folder. Verify that the mounted drives are online and writable by the non-root container user, then paste this same command again; matching setup files will be safely reused.";
    const startFailure =
        platform === "macos"
            ? "Docker stopped before Nooklet became healthy. If the error mentions EOF, a socket, daemon, or API failure, restart Docker Desktop and wait for its engine. Then paste this same command again; matching setup files will be safely reused."
            : "Docker stopped before Nooklet became healthy. Inspect the error above and run docker compose logs --tail=200 app if needed. Then paste this same command again; matching setup files will be safely reused.";

    return `(
  set -eu
  umask 077
  generated_env='${encodedEnvironment}'
  generated_override='${encodedOverride}'

  nooklet_decode() {
    printf '%s' "$1" | ${decode}
  }

  nooklet_engine_ready() {
    docker info --format '{{.OSType}}' >/dev/null 2>&1
  }

  nooklet_has_existing_artifacts() {
    docker container inspect nooklet >/dev/null 2>&1 ||
      docker volume inspect nooklet_nooklet-data >/dev/null 2>&1
  }

  nooklet_require_directory() {
    host_path=$(nooklet_decode "$1")
    if [ ! -d "$host_path" ]; then
      printf 'Host folder does not exist or is not available: %s\\nCreate or reconnect it, then paste this same command again. No Nooklet files were created.\\n' "$host_path" >&2
      exit 1
    fi
  }

  nooklet_is_repository() {
    repository=$1
    [ -f "$repository/docker-compose.yml" ] &&
      [ -f "$repository/package.json" ] &&
      [ -d "$repository/.git" ] || return 1
    remote=$(git -C "$repository" remote get-url origin 2>/dev/null) || return 1
    case "$remote" in
      https://github.com/TannerMidd/Nooklet|https://github.com/TannerMidd/Nooklet.git|git@github.com:TannerMidd/Nooklet.git) return 0 ;;
      *) return 1 ;;
    esac
  }

  nooklet_file_state() {
    state_path=$1
    state_payload=$2
    if [ ! -e "$state_path" ]; then
      printf 'missing'
      return
    fi
    if [ ! -f "$state_path" ]; then
      printf 'blocked'
      return
    fi
    existing_payload=$(base64 < "$state_path" | tr -d '\\r\\n')
    if [ "$existing_payload" = "$state_payload" ]; then
      printf 'matching'
    else
      printf 'different'
    fi
  }

  nooklet_write_generated_file() {
    generated_path=$1
    generated_payload=$2
    generated_temporary="$generated_path.nooklet.$$.tmp"
    nooklet_decode "$generated_payload" > "$generated_temporary"
    chmod 600 "$generated_temporary"
    mv -f "$generated_temporary" "$generated_path"
  }

  trap 'rm -f .env.nooklet.$$.tmp docker-compose.override.yml.nooklet.$$.tmp' EXIT HUP INT TERM

${hostChecks}

  if ! command -v docker >/dev/null 2>&1; then
    printf 'Docker was not found. Install Docker, start its engine, then paste this same command again. No Nooklet files were created.\\n' >&2
    exit 1
  fi
  if ! docker compose version >/dev/null 2>&1; then
    printf 'Docker Compose v2 is unavailable. Update Docker, then paste this same command again. No Nooklet files were created.\\n' >&2
    exit 1
  fi
  if ! docker_os=$(docker info --format '{{.OSType}}' 2>/dev/null); then
    printf '${engineFailure}\\n' >&2
    exit 1
  fi
  if [ "$docker_os" != 'linux' ]; then
    printf 'Docker must use Linux containers. Switch the engine to Linux containers, then paste this same command again. No Nooklet files were created.\\n' >&2
    exit 1
  fi
  if ! command -v git >/dev/null 2>&1; then
    printf 'Git was not found. Install Git, then paste this same command again. No Nooklet files were created.\\n' >&2
    exit 1
  fi

  if [ -d ./Nooklet ] && [ -z "$(ls -A ./Nooklet 2>/dev/null)" ]; then
    rmdir ./Nooklet 2>/dev/null || true
  fi

  if nooklet_is_repository .; then
    printf 'Using the current Nooklet repository.\\n'
  elif [ -e ./Nooklet ]; then
    if ! nooklet_is_repository ./Nooklet; then
      printf 'A Nooklet folder already exists here but is not a complete official clone. Rename or repair that folder, then paste this same command again.\\n' >&2
      exit 1
    fi
    cd ./Nooklet
    printf 'Using the existing Nooklet repository.\\n'
  elif [ -e ./.git ] || [ -e ./docker-compose.yml ] || [ "\${PWD##*/}" = 'Nooklet' ]; then
    printf 'This folder looks like an incomplete or different project. Open its parent folder, then paste this same command again.\\n' >&2
    exit 1
  else
    if ! git clone https://github.com/TannerMidd/Nooklet.git Nooklet; then
      printf 'Could not clone Nooklet. If a partial Nooklet folder was created, rename or remove it before retrying.\\n' >&2
      exit 1
    fi
    cd ./Nooklet
    if ! nooklet_is_repository .; then
      printf 'The cloned repository could not be verified as the official Nooklet project.\\n' >&2
      exit 1
    fi
  fi

  env_state=$(nooklet_file_state .env "$generated_env")
  override_state=$(nooklet_file_state docker-compose.override.yml "$generated_override")
  if [ "$env_state" = 'blocked' ]; then
    printf '.env exists but is not a regular file. Refusing to replace it.\\n' >&2
    exit 1
  fi
  if [ "$override_state" = 'blocked' ]; then
    printf 'docker-compose.override.yml exists but is not a regular file. Refusing to replace it.\\n' >&2
    exit 1
  fi
  has_artifacts=false
  if nooklet_has_existing_artifacts; then
    has_artifacts=true
  fi
  if [ "$env_state" = 'missing' ] && [ "$has_artifacts" = true ]; then
    printf 'A Nooklet container or data volume already exists, but this folder has no .env holding its secrets. Stop: do not delete the container or volume, and do not generate replacement secrets. Restore the original .env from your secure backup, then paste this same command again. If it cannot be recovered, preserve the volume and follow https://github.com/TannerMidd/Nooklet/wiki/Docker-Installation#installation-recovery.\\n' >&2
    exit 1
  fi
  if [ "$env_state" = 'matching' ]; then
    printf 'Reusing matching .env.\\n'
  elif [ "$env_state" = 'different' ] && [ "$has_artifacts" = true ]; then
    printf 'Keeping the existing .env because it belongs to your current Nooklet container or data volume.\\n'
  else
    nooklet_write_generated_file .env "$generated_env"
    if [ "$env_state" = 'different' ]; then
      printf 'Replaced the .env left behind by an earlier incomplete setup.\\n'
    else
      printf 'Created .env.\\n'
    fi
  fi
  if [ "$override_state" = 'matching' ]; then
    printf 'Reusing matching docker-compose.override.yml.\\n'
  else
    nooklet_write_generated_file docker-compose.override.yml "$generated_override"
    printf 'Wrote docker-compose.override.yml for your selected folders.\\n'
  fi
  chmod 600 .env docker-compose.override.yml

  if ! docker compose config --quiet; then
    printf 'Docker Compose validation failed. Your matching setup files were saved; correct the reported Docker error, then paste this same command again.\\n' >&2
    exit 1
  fi
  if ! docker compose build app; then
    if ! nooklet_engine_ready; then
      printf '${engineRetryFailure}\\n' >&2
    else
      printf 'Docker could not build Nooklet. Your matching setup files were saved; correct the reported error, then paste this same command again.\\n' >&2
    fi
    exit 1
  fi
  if ! docker compose run --rm --no-deps --entrypoint sh app -c '${probe}'; then
    if ! nooklet_engine_ready; then
      printf '${engineRetryFailure}\\n' >&2
    else
      printf '${mountFailure}\\n' >&2
    fi
    exit 1
  fi
  if ! docker compose up -d; then
    if ! nooklet_engine_ready; then
      printf '${engineRetryFailure}\\n' >&2
    else
      printf '${startFailure}\\n' >&2
    fi
    exit 1
  fi
  container_health=''
  attempt=0
  while [ "$attempt" -lt 60 ]; do
    container_health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' nooklet 2>/dev/null || true)
    if [ "$container_health" = 'healthy' ]; then
      break
    fi
    attempt=$((attempt + 1))
    sleep 2
  done
  if [ "$container_health" != 'healthy' ]; then
    if ! nooklet_engine_ready; then
      printf '${engineRetryFailure}\\n' >&2
    else
      docker compose ps
      printf 'Nooklet started but did not become healthy within two minutes. Run docker compose logs --tail=200 app, correct the reported issue, then paste this same command again.\\n' >&2
    fi
    exit 1
  fi
  docker compose ps
  app_port=$(sed -n 's/^APP_PORT=\\([0-9]*\\).*$/\\1/p' .env | head -n 1)
  if [ -z "$app_port" ]; then app_port=42021; fi
  printf '\\nNooklet is healthy: http://localhost:%s\\n' "$app_port"
  grep '^BOOTSTRAP_TOKEN=' .env
)`;
}

export function createSetupCommand(input, randomSource = globalThis.crypto) {
    const validation = validateSetupInput(input);

    if (!validation.value) {
        return { ...validation, command: "", mappings: [] };
    }

    const environment = buildEnvironment(generateSecrets(randomSource));
    const override = buildOverride(validation.value);
    const command =
        validation.value.platform === "windows"
            ? buildPowerShellCommand(environment, override, validation.value)
            : buildPosixCommand(environment, override, validation.value);
    const mappings = [
        ...validation.value.libraries.map(({ path, target, type }) => ({
            label: LIBRARY_LABELS[type],
            path,
            target,
        })),
        {
            label: "Completed-download staging",
            path: validation.value.downloadPath,
            target: "/downloads",
        },
    ];

    return { ...validation, command, mappings };
}
