import { build } from "esbuild";

import { createWorkerBuildOptions } from "./lib/worker-build.mjs";

await build(await createWorkerBuildOptions());
