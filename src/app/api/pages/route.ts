import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function GET() {
  const { env } = await getCloudflareContext({ async: true });
  const { results } = await env.DB.prepare(
    `SELECT p.id, p.url, p.label,
            COUNT(s.id) as snapshot_count,
            MAX(s.captured_at) as last_captured_at
     FROM pages p
     LEFT JOIN snapshots s ON s.page_id = p.id
     GROUP BY p.id
     ORDER BY last_captured_at DESC`
  ).all();

  return NextResponse.json(results);
}
