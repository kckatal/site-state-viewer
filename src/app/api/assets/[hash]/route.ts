import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ hash: string }> }
) {
  const { hash } = await params;
  const { env } = await getCloudflareContext({ async: true });

  const object = await env.SNAPSHOTS.get(`assets/${hash}`);
  if (!object) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  return new NextResponse(await object.arrayBuffer(), {
    headers: {
      "content-type":
        object.httpMetadata?.contentType ?? "application/octet-stream",
      "cache-control": "public, max-age=31536000, immutable",
      // The replay iframe runs on an opaque origin, so archived subresources are
      // cross-origin to it.
      "access-control-allow-origin": "*",
    },
  });
}
