import { NextResponse } from "next/server";

import { ensureDatabaseReady } from "@/lib/database/client";

// Lightweight liveness/readiness probe used by container orchestrators.
// Confirms the SQLite connection is open and migrations have been applied.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    ensureDatabaseReady();

    return NextResponse.json({ status: "ok" }, { status: 200 });
  } catch {
    return NextResponse.json({ status: "error" }, { status: 503 });
  }
}
