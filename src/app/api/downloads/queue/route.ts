import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { logger } from "@/lib/observability/logger";
import { downloadQueueActionSchema } from "@/modules/download-engine/queue/download-queue-actions";
import { getActiveDownloadQueue } from "@/modules/download-engine/queries/get-active-download-queue";
import {
  applyEngineQueueAction,
  EngineQueueActionError,
} from "@/modules/download-engine/workflows/apply-engine-queue-action";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(await getActiveDownloadQueue(session.user.id), {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    logger.error("download_queue_refresh_failed", { userId: session.user.id, error });
    return NextResponse.json(
      { code: "queue_unavailable", message: "Unable to load the download queue right now." },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { code: "invalid_json", message: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const action = downloadQueueActionSchema.safeParse(body);
  if (!action.success) {
    return NextResponse.json(
      { code: "invalid_action", message: "Invalid download queue action." },
      { status: 400 },
    );
  }

  try {
    const outcome = await applyEngineQueueAction(session.user.id, action.data);
    const queueState = await getActiveDownloadQueue(session.user.id);
    return NextResponse.json({
      ...queueState,
      action: outcome,
      ...(outcome.status === "pending" ? { statusMessage: outcome.message } : {}),
    }, { status: 200 });
  } catch (error) {
    logger.error("download_queue_action_failed", {
      userId: session.user.id,
      actionType: action.data.type,
      error,
    });

    if (error instanceof EngineQueueActionError) {
      return NextResponse.json(
        { code: "queue_action_conflict", message: error.message },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { code: "queue_action_failed", message: "Unable to update the download queue right now." },
      { status: 500 },
    );
  }
}
