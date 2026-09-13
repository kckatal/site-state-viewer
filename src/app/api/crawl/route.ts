import { NextRequest, NextResponse } from "next/server";
import { captureSnapshot } from "@/lib/archive";

export async function POST(req: NextRequest) {
  const body = await req.json<{ url?: string }>().catch(() => null);
  const url = body?.url;
  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "Missing 'url' in request body" }, { status: 400 });
  }

  try {
    const result = await captureSnapshot(url, "manual");
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
