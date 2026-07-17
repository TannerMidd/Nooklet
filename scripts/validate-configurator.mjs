import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const coreSource = await readFile(
  "engineering-dossier/configurator-core.js",
  "utf8",
);
const {
  createSetupCommand,
  normalizeHostPath,
  validateSetupInput,
} = await import(
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
assert.match(windowsSetup.command, /docker compose config --quiet/);
assert.match(windowsSetup.command, /docker compose up -d --build/);
assert.match(windowsSetup.command, /docker compose ps/);
assert.match(windowsSetup.command, /BOOTSTRAP_TOKEN/);
assert.ok(!windowsSetup.command.includes("down -v"));
assert.ok(!windowsSetup.command.includes("D:/Media/Movies"));
assert.deepEqual(
  windowsSetup.mappings.map(({ target }) => target),
  ["/media/movies", "/media/tv", "/downloads"],
);

const encodedFiles = [
  ...windowsSetup.command.matchAll(/FromBase64String\('([A-Za-z0-9+/=]+)'\)/g),
].map((match) => Buffer.from(match[1], "base64").toString("utf8"));
assert.equal(encodedFiles.length, 2);
assert.match(encodedFiles[0], /^AUTH_SECRET=[A-Za-z0-9+/]{64}$/m);
assert.match(encodedFiles[0], /^BOOTSTRAP_TOKEN=[A-Za-z0-9+/]{64}$/m);
assert.match(encodedFiles[0], /^DOWNLOAD_ENGINE_DIR=\/downloads\/nooklet-engine$/m);
assert.match(encodedFiles[1], /source: "D:\/Media\/Movies"/);
assert.match(encodedFiles[1], /target: "\/media\/movies"/);
assert.match(encodedFiles[1], /create_host_path: false/);

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
assert.ok(normalizeHostPath("../media", "linux").error);
assert.ok(normalizeHostPath("/srv/${HOME}", "linux").error);
assert.ok(normalizeHostPath("D:/Media\nprivileged: true", "windows").error);
assert.ok(
  validateSetupInput({
    ...windowsInput,
    downloadPath: "D:/Media/Movies/Staging",
  }).errors.some(({ field }) => field === "quick-download-path"),
);

const controllerSource = await readFile("engineering-dossier/configurator.js", "utf8");
const guideSource = await readFile("engineering-dossier/guide/index.html", "utf8");
assert.match(guideSource, /id="docker-configurator"/);
assert.match(guideSource, /src="\.\.\/configurator\.js"/);
assert.match(guideSource, /connect-src 'none'/);
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
