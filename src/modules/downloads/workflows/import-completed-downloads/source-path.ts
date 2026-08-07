import path from "node:path";
import { realpath } from "node:fs/promises";

import { env } from "@/lib/env";

function isWithinRoot(rootPath: string, candidatePath: string) {
  const normalizedRoot = process.platform === "win32" ? rootPath.toLowerCase() : rootPath;
  const normalizedCandidate = process.platform === "win32" ? candidatePath.toLowerCase() : candidatePath;
  const relative = path.relative(normalizedRoot, normalizedCandidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/** Resolve symlinks and require engine output to stay in its completed root. */
export async function resolveCompletedDownloadSourcePath(sourcePath: string) {
  const [canonicalPath, engineCompleteRoot] = await Promise.all([
    realpath(sourcePath),
    realpath(path.resolve(env.DOWNLOAD_ENGINE_DIR, "complete")),
  ]);

  if (path.resolve(engineCompleteRoot) === path.parse(engineCompleteRoot).root) {
    throw new Error("The filesystem root cannot be a completed-download trust boundary.");
  }

  if (!isWithinRoot(engineCompleteRoot, canonicalPath)) {
    throw new Error("Built-in download output escaped the configured engine directory.");
  }

  return canonicalPath;
}
