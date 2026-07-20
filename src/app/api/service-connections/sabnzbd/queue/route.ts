import { NextResponse } from "next/server";

import { auth } from "@/auth";
import {
  applyEngineQueueAction,
  EngineQueueActionError,
} from "@/modules/download-engine/workflows/apply-engine-queue-action";
import { sabnzbdQueueActionSchema } from "@/modules/service-connections/sabnzbd-queue-actions";
import { applySabnzbdQueueAction } from "@/modules/service-connections/workflows/apply-sabnzbd-queue-action";

import { downloadQueueSourceSchema } from "./contract";
import { getActiveDownloadQueueView } from "./queue-view";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const queueState = await getActiveDownloadQueueView(session.user.id);

    return NextResponse.json(queueState, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[download-queue] refresh failed", error);
    return NextResponse.json(
      { code: "queue_unavailable", message: "Unable to load the download queues right now." },
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

  const source = downloadQueueSourceSchema.safeParse(
    typeof body === "object" && body !== null ? (body as { source?: unknown }).source : undefined,
  );
  const actionBody = typeof body === "object" && body !== null
    ? Object.fromEntries(Object.entries(body).filter(([key]) => key !== "source"))
    : body;
  const action = sabnzbdQueueActionSchema.safeParse(actionBody);

  if (!source.success || !action.success) {
    return NextResponse.json(
      { code: "invalid_action", message: "Invalid download queue action." },
      { status: 400 },
    );
  }

  try {
    let outcome: Awaited<ReturnType<typeof applyEngineQueueAction>> | null = null;
    if (source.data === "engine") {
      outcome = await applyEngineQueueAction(session.user.id, action.data);
    } else {
      await applySabnzbdQueueAction(session.user.id, action.data);
    }

    const queueState = await getActiveDownloadQueueView(session.user.id);
    return NextResponse.json({
      ...queueState,
      ...(outcome
        ? {
            action: outcome,
            ...(outcome.status === "pending" ? { statusMessage: outcome.message } : {}),
          }
        : {}),
    }, { status: 200 });
  } catch (error) {
    console.error(`[download-queue] ${source.data} action failed`, error);

    if (error instanceof EngineQueueActionError) {
      return NextResponse.json(
        { code: "queue_action_conflict", message: error.message },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { code: "queue_action_failed", message: "Unable to update that download queue right now." },
      { status: 500 },
    );
  }
}
