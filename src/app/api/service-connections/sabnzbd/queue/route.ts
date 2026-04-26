import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { sabnzbdQueueActionSchema } from "@/modules/service-connections/sabnzbd-queue-actions";
import { applySabnzbdQueueAction } from "@/modules/service-connections/workflows/apply-sabnzbd-queue-action";
import { getActiveSabnzbdQueue } from "@/modules/service-connections/workflows/get-active-sabnzbd-queue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const queueState = await getActiveSabnzbdQueue(session.user.id);

  return NextResponse.json(queueState, { status: 200 });
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsedBody = sabnzbdQueueActionSchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json({ message: "Invalid SABnzbd queue action." }, { status: 400 });
    }

    const queueState = await applySabnzbdQueueAction(session.user.id, parsedBody.data);

    return NextResponse.json(queueState, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to update the SABnzbd queue right now.",
      },
      { status: 400 },
    );
  }
}