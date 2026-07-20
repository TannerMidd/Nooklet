import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { context } from "esbuild";

import { createWorkerBuildOptions } from "./lib/worker-build.mjs";

const root = process.cwd();
const nextCliEntry = path.join(root, "node_modules", "next", "dist", "bin", "next");
const workerSupervisorEntry = path.join(root, "scripts", "worker-supervisor.mjs");
const supervisorWatchdogEntry = path.join(root, "scripts", "lib", "supervisor-watchdog.mjs");
const workerOutputDirectory = path.join(root, ".codex-tmp", "dev-worker");
const workerEntry = path.join(workerOutputDirectory, "worker.cjs");

try {
  process.loadEnvFile(path.join(root, ".env"));
} catch (error) {
  if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ENOENT") {
    throw error;
  }
}

let webProcess;
let workerSupervisorProcess;
let workerBuildContext;
let workerBundleReady = false;
let runtimeStarted = false;
let shuttingDown = false;
const plannedWorkerStops = new WeakSet();

function launch(entry, args, env) {
  return spawn(process.execPath, [entry, ...args], {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
}

function stopChild(child, signal = "SIGTERM") {
  if (child && child.exitCode === null && child.signalCode === null) child.kill(signal);
}

function waitForClose(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => child.once("close", resolve));
}

function startWorkerSupervisor() {
  if (shuttingDown || !workerBundleReady) return;

  const child = launch(workerSupervisorEntry, [], {
    NODE_ENV: "development",
    NOOKLET_SUPERVISOR_PID: String(process.pid),
    NOOKLET_WATCH_WORKER_ENTRY: "true",
    NOOKLET_WORKER_ENTRY: workerEntry,
  });
  workerSupervisorProcess = child;

  child.once("error", (error) => {
    console.error("[development-supervisor] unable to start worker supervisor:", error);
  });
  child.once("close", (code, signal) => {
    if (workerSupervisorProcess === child) workerSupervisorProcess = undefined;
    if (shuttingDown || plannedWorkerStops.has(child)) return;

    console.error(
      `[development-supervisor] worker supervisor exited (${signal ?? code ?? "unknown"}); restarting.`,
    );
    setTimeout(startWorkerSupervisor, 1_000).unref();
  });
}

function startWeb() {
  const commandArguments = process.argv.slice(2);
  const hasConfiguredPort = commandArguments.some(
    (argument) => argument === "-p" || argument === "--port" || argument.startsWith("--port="),
  );
  const child = launch(
    nextCliEntry,
    ["dev", ...(hasConfiguredPort ? [] : ["-p", "42021"]), ...commandArguments],
    {
      NODE_ENV: "development",
      NODE_OPTIONS: [
        process.env.NODE_OPTIONS,
        `--import=${pathToFileURL(supervisorWatchdogEntry).href}`,
      ].filter(Boolean).join(" "),
      NOOKLET_PROCESS_ROLE: "web",
      NOOKLET_SUPERVISOR_PID: String(process.pid),
    },
  );
  webProcess = child;

  child.once("error", (error) => {
    console.error("[development-supervisor] unable to start Next.js:", error);
  });
  child.once("close", (code, signal) => {
    if (webProcess === child) webProcess = undefined;
    if (!shuttingDown) {
      console.error(
        `[development-supervisor] Next.js exited (${signal ?? code ?? "unknown"}).`,
      );
      void beginShutdown(typeof code === "number" ? code : 1);
    }
  });
}

async function beginShutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  const forceExit = setTimeout(() => {
    stopChild(webProcess, "SIGKILL");
    stopChild(workerSupervisorProcess, "SIGKILL");
    process.exit(exitCode);
  }, 12_000);
  forceExit.unref();

  const worker = workerSupervisorProcess;
  if (worker) plannedWorkerStops.add(worker);
  stopChild(webProcess);
  stopChild(worker);
  await Promise.allSettled([
    waitForClose(webProcess),
    waitForClose(worker),
    workerBuildContext?.dispose(),
  ]);
  process.exit(exitCode);
}

async function bootstrap() {
  let firstBuildCompleted;
  const firstBuild = new Promise((resolve) => { firstBuildCompleted = resolve; });
  let observedFirstBuild = false;

  const restartWorkerPlugin = {
    name: "restart-development-worker",
    setup(build) {
      build.onEnd((result) => {
        const succeeded = result.errors.length === 0;
        if (succeeded) workerBundleReady = true;

        if (!observedFirstBuild) {
          observedFirstBuild = true;
          firstBuildCompleted();
        } else if (succeeded && runtimeStarted && !workerSupervisorProcess) {
          startWorkerSupervisor();
        }
      });
    },
  };

  workerBuildContext = await context(await createWorkerBuildOptions({
    root,
    outputDirectory: workerOutputDirectory,
    plugins: [restartWorkerPlugin],
  }));
  await workerBuildContext.watch();
  await firstBuild;

  runtimeStarted = true;
  startWeb();
  startWorkerSupervisor();

  if (!workerBundleReady) {
    console.error(
      "[development-supervisor] worker build failed; web remains available and the worker will start after a successful rebuild.",
    );
  }
}

process.on("SIGINT", () => void beginShutdown(0));
process.on("SIGTERM", () => void beginShutdown(0));

void bootstrap().catch((error) => {
  console.error("[development-supervisor] startup failed:", error);
  void beginShutdown(1);
});
