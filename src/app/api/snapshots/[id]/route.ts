import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { env } = await getCloudflareContext({ async: true });

  const row = await env.DB.prepare(
    `SELECT html_key FROM snapshots WHERE id = ?1`
  )
    .bind(id)
    .first<{ html_key: string }>();

  if (!row) {
    return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });
  }

  const object = await env.SNAPSHOTS.get(row.html_key);
  if (!object) {
    return NextResponse.json({ error: "Archived HTML missing from storage" }, { status: 404 });
  }

  return new NextResponse(await object.arrayBuffer(), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-frame-options": "SAMEORIGIN",
    },
  });
}
