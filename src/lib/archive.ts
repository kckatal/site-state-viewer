import { parseHTML } from "linkedom";
import { getCloudflareContext } from "@opennextjs/cloudflare";

const ARCHIVABLE_ASSET_SELECTORS = [
  { selector: "link[rel=stylesheet]", attr: "href" },
  { selector: "script[src]", attr: "src" },
  { selector: "img", attr: "src" },
];

// Attributes that describe the asset at its ORIGINAL location. Once the asset is
// re-hosted from the archive they are wrong (SRI hash) or actively break the load
// (CORS-mode fetch from the sandboxed replay iframe's opaque origin).
const STALE_FETCH_ATTRS = ["integrity", "crossorigin"];

const CSS_URL_PATTERN = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;

async function sha256(input: string | ArrayBuffer): Promise<string> {
  const data = typeof input === "string" ? new TextEncoder().encode(input) : input;
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function assetPath(hash: string): string {
  return `/api/assets/${hash}`;
}

interface ArchivedAsset {
  hash: string;
  originalUrl: string;
  contentType: string | null;
}

class AssetArchiver {
  private seen = new Map<string, ArchivedAsset | null>();

  constructor(private bucket: R2Bucket) {}

  get archived(): ArchivedAsset[] {
    return [...this.seen.values()].filter((a): a is ArchivedAsset => a !== null);
  }

  async archive(absoluteUrl: string, depth = 0): Promise<ArchivedAsset | null> {
    const cached = this.seen.get(absoluteUrl);
    if (cached !== undefined) return cached;

    const result = await this.fetchAndStore(absoluteUrl, depth);
    this.seen.set(absoluteUrl, result);
    return result;
  }

  private async fetchAndStore(
    absoluteUrl: string,
    depth: number
  ): Promise<ArchivedAsset | null> {
    try {
      const res = await fetch(absoluteUrl);
      if (!res.ok) return null;
      const contentType = res.headers.get("content-type");

      const isCss =
        contentType?.includes("text/css") ||
        new URL(absoluteUrl).pathname.endsWith(".css");

      // Stylesheets reference further assets (fonts, background images) by URLs
      // relative to the stylesheet's own location. Re-hosting the stylesheet
      // changes that base, so those references have to be archived and rewritten
      // too or they resolve against the archive route and 404.
      const body = isCss
        ? new TextEncoder().encode(
            await this.rewriteCss(await res.text(), absoluteUrl, depth)
          ).buffer as ArrayBuffer
        : await res.arrayBuffer();

      // Keyed by the bytes, not the URL: a URL whose content changes between
      // publishes must archive as a distinct object, or later snapshots would
      // silently replay an earlier capture's styling.
      const hash = await sha256(body);
      const key = `assets/${hash}`;

      if (!(await this.bucket.head(key))) {
        await this.bucket.put(key, body, {
          httpMetadata: contentType ? { contentType } : undefined,
        });
      }

      return { hash, originalUrl: absoluteUrl, contentType };
    } catch {
      return null;
    }
  }

  private async rewriteCss(
    css: string,
    cssUrl: string,
    depth: number
  ): Promise<string> {
    if (depth >= 2) return css;

    const references = [...css.matchAll(CSS_URL_PATTERN)];
    const replacements = new Map<string, string>();

    for (const match of references) {
      const raw = match[2];
      if (raw.startsWith("data:") || replacements.has(raw)) continue;
      let absolute: string;
      try {
        absolute = new URL(raw, cssUrl).toString();
      } catch {
        continue;
      }
      const nested = await this.archive(absolute, depth + 1);
      if (nested) replacements.set(raw, assetPath(nested.hash));
    }

    return css.replace(CSS_URL_PATTERN, (whole, _quote, raw) => {
      const replacement = replacements.get(raw);
      return replacement ? `url("${replacement}")` : whole;
    });
  }
}

export interface CaptureResult {
  snapshotId: string;
  pageId: string;
  capturedAt: string;
  title: string;
  assetCount: number;
}

export async function captureSnapshot(
  url: string,
  trigger: "manual" | "webhook" = "manual"
): Promise<CaptureResult> {
  const { env } = await getCloudflareContext({ async: true });
  const db = env.DB;
  const bucket = env.SNAPSHOTS;

  const res = await fetch(url, {
    headers: { "user-agent": "site-state-viewer-archiver/0.1" },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  const html = await res.text();
  const { document } = parseHTML(html);

  const title = document.querySelector("title")?.textContent?.trim() ?? "";
  const textContent = (document.body?.textContent ?? "")
    .replace(/\s+/g, " ")
    .trim();

  const archiver = new AssetArchiver(bucket);

  for (const { selector, attr } of ARCHIVABLE_ASSET_SELECTORS) {
    for (const el of Array.from(document.querySelectorAll(selector))) {
      const raw = el.getAttribute(attr);
      if (!raw || raw.startsWith("data:")) continue;
      let absoluteUrl: string;
      try {
        absoluteUrl = new URL(raw, url).toString();
      } catch {
        continue;
      }
      const stored = await archiver.archive(absoluteUrl);
      if (!stored) continue;
      el.setAttribute(attr, assetPath(stored.hash));
      for (const stale of STALE_FETCH_ATTRS) el.removeAttribute(stale);
    }
  }

  const snapshotId = crypto.randomUUID();
  const capturedAt = new Date().toISOString();
  const htmlKey = `snapshots/${snapshotId}.html`;
  await bucket.put(htmlKey, document.toString(), {
    httpMetadata: { contentType: "text/html; charset=utf-8" },
  });

  const pageId = await sha256(url);
  await db
    .prepare(
      `INSERT INTO pages (id, url, label, created_at)
       VALUES (?1, ?2, ?2, ?3)
       ON CONFLICT(id) DO NOTHING`
    )
    .bind(pageId, url, capturedAt)
    .run();

  await db
    .prepare(
      `INSERT INTO snapshots (id, page_id, captured_at, title, html_key, text_content, trigger)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
    )
    .bind(snapshotId, pageId, capturedAt, title, htmlKey, textContent, trigger)
    .run();

  const assets = archiver.archived;
  if (assets.length > 0) {
    const stmt = db.prepare(
      `INSERT INTO snapshot_assets (id, snapshot_id, original_url, r2_key, content_type)
       VALUES (?1, ?2, ?3, ?4, ?5)`
    );
    await db.batch(
      assets.map((a) =>
        stmt.bind(
          crypto.randomUUID(),
          snapshotId,
          a.originalUrl,
          `assets/${a.hash}`,
          a.contentType
        )
      )
    );
  }

  return {
    snapshotId,
    pageId,
    capturedAt,
    title,
    assetCount: assets.length,
  };
}
