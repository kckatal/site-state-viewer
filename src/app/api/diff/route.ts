import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { diffWords } from "diff";

export async function GET(req: NextRequest) {
  const fromId = req.nextUrl.searchParams.get("from");
  const toId = req.nextUrl.searchParams.get("to");
  if (!fromId || !toId) {
    return NextResponse.json(
      { error: "Both 'from' and 'to' snapshot ids are required" },
      { status: 400 }
    );
  }

  const { env } = await getCloudflareContext({ async: true });
  const [fromRow, toRow] = await Promise.all([
    env.DB.prepare(`SELECT text_content, captured_at FROM snapshots WHERE id = ?1`)
      .bind(fromId)
      .first<{ text_content: string; captured_at: string }>(),
    env.DB.prepare(`SELECT text_content, captured_at FROM snapshots WHERE id = ?1`)
      .bind(toId)
      .first<{ text_content: string; captured_at: string }>(),
  ]);

  if (!fromRow || !toRow) {
    return NextResponse.json({ error: "One or both snapshots not found" }, { status: 404 });
  }

  const parts = diffWords(fromRow.text_content, toRow.text_content).map((p) => ({
    value: p.value,
    added: p.added ?? false,
    removed: p.removed ?? false,
  }));

  return NextResponse.json({
    from: { id: fromId, capturedAt: fromRow.captured_at },
    to: { id: toId, capturedAt: toRow.captured_at },
    parts,
  });
}
