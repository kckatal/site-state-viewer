import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ pageId: string }> }
) {
  const { pageId } = await params;
  const { env } = await getCloudflareContext({ async: true });
  const { results } = await env.DB.prepare(
    `SELECT id, captured_at, title, trigger
     FROM snapshots
     WHERE page_id = ?1
     ORDER BY captured_at DESC`
  )
    .bind(pageId)
    .all();

  return NextResponse.json(results);
}
