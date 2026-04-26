import { NextResponse } from "next/server";

import { auth } from "@/auth";
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