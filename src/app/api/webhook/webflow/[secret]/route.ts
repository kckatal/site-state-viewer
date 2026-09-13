import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { captureSnapshot } from "@/lib/archive";
import { isAuthorizedCaller, hasValidSignature } from "@/lib/webhook-auth";

const ARCHIVING_TRIGGERS = [
  "site_publish",
  "collection_item_created",
  "collection_item_changed",
  "collection_item_deleted",
  "collection_item_published",
  "collection_item_unpublished",
];

async function urlsToArchive(db: D1Database): Promise<string[]> {
  const { results } = await db
    .prepare(`SELECT url FROM pages ORDER BY created_at`)
    .all<{ url: string }>();
  if (results.length > 0) return results.map((r) => r.url);

  return (process.env.WATCHED_PAGE_URLS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ secret: string }> }
) {
  const { secret } = await params;
  if (!isAuthorizedCaller(secret)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const rawBody = await req.text();
  const signatureOk = await hasValidSignature(
    rawBody,
    req.headers.get("x-webflow-signature"),
    req.headers.get("x-webflow-timestamp")
  );
  if (!signatureOk) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let triggerType: string | undefined;
  try {
    triggerType = (JSON.parse(rawBody) as { triggerType?: string }).triggerType;
  } catch {
    return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
  }

  if (triggerType && !ARCHIVING_TRIGGERS.includes(triggerType)) {
    return NextResponse.json({ ignored: triggerType });
  }

  const { env, ctx } = await getCloudflareContext({ async: true });
  const urls = await urlsToArchive(env.DB);
  if (urls.length === 0) {
    return NextResponse.json({ error: "No pages tracked yet" }, { status: 200 });
  }

  // Webflow expects a prompt 2xx, and a crawl takes far longer than that, so the
  // archiving runs after the response is sent.
  const work = Promise.allSettled(
    urls.map((url) => captureSnapshot(url, "webhook"))
  );
  if (ctx?.waitUntil) {
    ctx.waitUntil(work);
  } else {
    await work;
  }

  return NextResponse.json({
    accepted: true,
    triggerType: triggerType ?? "unknown",
    queued: urls,
  });
}
