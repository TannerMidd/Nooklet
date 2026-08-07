import { writeFileSync } from "node:fs";

import type { FullResult, Reporter } from "@playwright/test/reporter";

class CompletionReporter implements Reporter {
  onEnd(result: FullResult) {
    const outputPath = process.env.NOOKLET_E2E_COMPLETION_FILE;
    if (!outputPath) return;

    writeFileSync(outputPath, JSON.stringify({ status: result.status }), "utf8");
  }
}

export default CompletionReporter;
