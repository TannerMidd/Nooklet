const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const ENV_REFERENCE = /\$(?:\{[^}]*\}|[A-Za-z_][A-Za-z0-9_]*|\()|%[^%]+%/;
const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function error(field, message) {
  return { field, message };
}

export function normalizeHostPath(rawValue, platform, field = "path") {
  const raw = String(rawValue ?? "").trim();
  if (!raw) return { error: error(field, "Enter an absolute host folder.") };
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
    if (
      path
        .slice(3)
        .split("/")
        .some((part) => !part || part === "." || part === ".." || /[<>:"|?*]/.test(part))
    ) {
      return { error: error(field, "This Windows folder contains an invalid segment.") };
    }
    return { value: path };
  }

  if (platform === "linux" || platform === "macos") {
    const path = raw.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
    if (!path.startsWith("/") || path === "/" || path.startsWith("//")) {
      return {
        error: error(field, "Use an absolute folder such as /srv/media/movies."),
      };
    }
    if (path.slice(1).split("/").some((part) => !part || part === "." || part === "..")) {
      return { error: error(field, "Remove dot segments or traversal from this folder.") };
    }
    return { value: path };
  }

  return { error: error("platform", "Choose the operating system that runs Docker.") };
}

function pathsOverlap(left, right, platform) {
  const normalize = (value) =>
    platform === "windows" ? value.toLocaleLowerCase() : value;
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
    if (!String(item?.path ?? "").trim()) continue;
    const field = String(item?.field ?? `drive-path-${index + 1}`);
    const type = item?.type === "tv" ? "tv" : "movies";
    const normalized = normalizeHostPath(item.path, platform, field);
    if (normalized.error) errors.push(normalized.error);
    else libraries.push({ field, type, path: normalized.value });
  }

  if (libraries.length === 0) {
    errors.push(error("libraries", "Add at least one movie or TV folder."));
  }

  const download = normalizeHostPath(
    input?.downloadPath,
    platform,
    "quick-download-path",
  );
  if (download.error) errors.push(download.error);

  for (let left = 0; left < libraries.length; left += 1) {
    for (let right = left + 1; right < libraries.length; right += 1) {
      if (pathsOverlap(libraries[left].path, libraries[right].path, platform)) {
        errors.push(
          error(
            libraries[right].field,
            "This folder overlaps another library folder.",
          ),
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

  if (errors.length) return { errors, value: null };

  const counts = { movies: 0, tv: 0 };
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
APPROVED_DOWNLOAD_ROOTS=/downloads
DOWNLOAD_ENGINE_DIR=/downloads/nooklet-engine
TRUST_PROXY_HEADERS=false
PRIVATE_SERVICE_HOST_ALLOWLIST=
ALLOW_PRIVATE_SERVICE_HOSTS=false
SABNZBD_PATH_MAPPINGS=
AI_RECOMMENDATIONS_TIMEOUT_MS=1800000
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

function buildPowerShellCommand(environment, override) {
  return `$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath '.\\docker-compose.yml')) {
  if (-not (Test-Path -LiteralPath '.\\Nooklet\\docker-compose.yml')) {
    git clone https://github.com/TannerMidd/Nooklet.git Nooklet
    if ($LASTEXITCODE -ne 0) { throw 'Could not clone Nooklet.' }
  }
  Set-Location -LiteralPath '.\\Nooklet'
}
if ((Test-Path -LiteralPath '.env') -or (Test-Path -LiteralPath 'docker-compose.override.yml')) {
  throw 'Setup files already exist. This command intentionally protects existing configuration.'
}
[IO.File]::WriteAllBytes((Join-Path $PWD '.env'), [Convert]::FromBase64String('${encodeText(environment)}'))
[IO.File]::WriteAllBytes((Join-Path $PWD 'docker-compose.override.yml'), [Convert]::FromBase64String('${encodeText(override)}'))
docker compose config --quiet
if ($LASTEXITCODE -ne 0) { throw 'Docker Compose validation failed.' }
docker compose up -d --build
if ($LASTEXITCODE -ne 0) { throw 'Nooklet did not start.' }
docker compose ps
Write-Host ''
Write-Host 'Open Nooklet: http://localhost:42021'
Select-String -Path '.env' -Pattern '^BOOTSTRAP_TOKEN='`;
}

function buildPosixCommand(environment, override, platform) {
  const decode = platform === "macos" ? "base64 -D" : "base64 --decode";
  return `set -e
if [ ! -f ./docker-compose.yml ]; then
  if [ ! -f ./Nooklet/docker-compose.yml ]; then
    git clone https://github.com/TannerMidd/Nooklet.git Nooklet
  fi
  cd ./Nooklet
fi
if [ -e ./.env ] || [ -e ./docker-compose.override.yml ]; then
  echo 'Setup files already exist. This command intentionally protects existing configuration.' >&2
  exit 1
fi
printf '%s' '${encodeText(environment)}' | ${decode} > .env
printf '%s' '${encodeText(override)}' | ${decode} > docker-compose.override.yml
chmod 600 .env
docker compose config --quiet
docker compose up -d --build
docker compose ps
printf '\\nOpen Nooklet: http://localhost:42021\\n'
grep '^BOOTSTRAP_TOKEN=' .env`;
}

export function createSetupCommand(input, randomSource = globalThis.crypto) {
  const validation = validateSetupInput(input);
  if (!validation.value) return { ...validation, command: "", mappings: [] };
  const environment = buildEnvironment(generateSecrets(randomSource));
  const override = buildOverride(validation.value);
  const command =
    validation.value.platform === "windows"
      ? buildPowerShellCommand(environment, override)
      : buildPosixCommand(environment, override, validation.value.platform);
  const mappings = [
    ...validation.value.libraries.map(({ path, target, type }) => ({
      label: type === "tv" ? "TV library" : "Movie library",
      path,
      target,
    })),
    {
      label: "Downloads / staging",
      path: validation.value.downloadPath,
      target: "/downloads",
    },
  ];
  return { ...validation, command, mappings };
}
