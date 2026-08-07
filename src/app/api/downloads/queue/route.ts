import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { logger } from "@/lib/observability/logger";
import { downloadQueueActionSchema } from "@/modules/download-engine/queue/download-queue-actions";
import { getActiveDownloadQueue } from "@/modules/download-engine/queries/get-active-download-queue";
import {
  applyEngineQueueAction,
  EngineQueueActionError,
} from "@/modules/download-engine/workflows/apply-engine-queue-action";
import { classifySessionAccess } from "@/modules/identity-access/session-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function getQueueActor() {
  const session = await auth();
  const accessState = classifySessionAccess(session);

  if (accessState === "password_change_required") {
    return {
      ok: false,
      response: NextResponse.json(
        {
          code: "password_change_required",
          message: "Replace the temporary password before using this endpoint.",
        },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      ),
    } as const;
  }

  if (accessState !== "ready" || !session?.user?.id) {
    return {
      ok: false,
      response: NextResponse.json(
        { code: "unauthorized", message: "Unauthorized" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      ),
    } as const;
  }

  return { ok: true, userId: session.user.id } as const;
}

export async function GET() {
  const actor = await getQueueActor();
  if (!actor.ok) return actor.response;

  try {
    return NextResponse.json(await getActiveDownloadQueue(actor.userId), {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    logger.error("download_queue_refresh_failed", { userId: actor.userId, error });
    return NextResponse.json(
      { code: "queue_unavailable", message: "Unable to load the download queue right now." },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  const actor = await getQueueActor();
  if (!actor.ok) return actor.response;

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
    const outcome = await applyEngineQueueAction(actor.userId, action.data);
    const queueState = await getActiveDownloadQueue(actor.userId);
    return NextResponse.json({
      ...queueState,
      action: outcome,
      ...(outcome.status === "pending" ? { statusMessage: outcome.message } : {}),
    }, { status: 200 });
  } catch (error) {
    logger.error("download_queue_action_failed", {
      userId: actor.userId,
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
