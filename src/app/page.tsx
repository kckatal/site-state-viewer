"use client";

import { useEffect, useMemo, useState } from "react";

const DEFAULT_URL = "https://gruppo.emrielle.com/faqs";

type PageRow = {
  id: string;
  url: string;
  label: string | null;
  snapshot_count: number;
  last_captured_at: string | null;
};

type SnapshotRow = {
  id: string;
  captured_at: string;
  title: string | null;
  trigger: string;
};

type DiffPart = { value: string; added: boolean; removed: boolean };

const colors = {
  border: "#e3e3e6",
  panel: "#d9d9d9",
  rowBg: "#f4f4f6",
  rowBgActive: "#e6ecff",
  heading: "#1b2559",
  muted: "#8a8a94",
};

export default function Home() {
  const [pages, setPages] = useState<PageRow[]>([]);
  const [crawlUrl, setCrawlUrl] = useState(DEFAULT_URL);
  const [crawling, setCrawling] = useState(false);
  const [crawlError, setCrawlError] = useState<string | null>(null);

  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);
  const [search, setSearch] = useState("");

  const [viewSnapshotId, setViewSnapshotId] = useState<string | null>(null);
  const [diffFrom, setDiffFrom] = useState<string | null>(null);
  const [diffTo, setDiffTo] = useState<string | null>(null);
  const [diffParts, setDiffParts] = useState<DiffPart[] | null>(null);

  async function loadPages() {
    const res = await fetch("/api/pages");
    const rows = (await res.json()) as PageRow[];
    setPages(rows);
    if (!selectedPageId && rows.length > 0) loadSnapshots(rows[0].id);
  }

  useEffect(() => {
    loadPages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadSnapshots(pageId: string) {
    setSelectedPageId(pageId);
    setViewSnapshotId(null);
    setDiffParts(null);
    setDiffFrom(null);
    setDiffTo(null);
    const res = await fetch(`/api/pages/${pageId}/snapshots`);
    setSnapshots((await res.json()) as SnapshotRow[]);
  }

  async function runCrawl() {
    setCrawling(true);
    setCrawlError(null);
    try {
      const res = await fetch("/api/crawl", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: crawlUrl }),
      });
      const data = (await res.json()) as { error?: string; pageId: string };
      if (!res.ok) throw new Error(data.error ?? "Crawl failed");
      await loadPages();
      await loadSnapshots(data.pageId);
    } catch (err) {
      setCrawlError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setCrawling(false);
    }
  }

  async function runDiff() {
    if (!diffFrom || !diffTo) return;
    const res = await fetch(`/api/diff?from=${diffFrom}&to=${diffTo}`);
    const data = (await res.json()) as { parts?: DiffPart[] };
    setDiffParts(data.parts ?? null);
    setViewSnapshotId(null);
  }

  const visibleSnapshots = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return snapshots;
    return snapshots.filter((s) => {
      const label = `${new Date(s.captured_at).toLocaleString()} ${s.trigger} ${s.title ?? ""}`;
      return label.toLowerCase().includes(q);
    });
  }, [snapshots, search]);

  return (
    <div
      style={{
        fontFamily: "system-ui, -apple-system, sans-serif",
        padding: "32px 40px",
        color: "#16161a",
      }}
    >
      <h1 style={{ fontSize: 26, fontWeight: 500, margin: "0 0 28px" }}>
        Site snapshot viewer
      </h1>

      <div style={{ display: "flex", gap: 40, alignItems: "flex-start" }}>
        <div style={{ flex: "0 0 420px", maxWidth: 420 }}>
          <section
            style={{
              border: `1px solid ${colors.border}`,
              borderRadius: 6,
              padding: 12,
              marginBottom: 40,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: colors.heading,
                marginBottom: 8,
              }}
            >
              Crawl now
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={crawlUrl}
                onChange={(e) => setCrawlUrl(e.target.value)}
                style={{
                  flex: 1,
                  padding: "6px 8px",
                  fontSize: 12,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 4,
                }}
              />
              <button
                onClick={runCrawl}
                disabled={crawling}
                style={{
                  padding: "6px 10px",
                  fontSize: 12,
                  whiteSpace: "nowrap",
                  border: `1px solid ${colors.border}`,
                  borderRadius: 4,
                  background: "#fff",
                  cursor: crawling ? "default" : "pointer",
                }}
              >
                {crawling ? "Crawling…" : "Capture snapshot"}
              </button>
            </div>
            {crawlError && (
              <p style={{ color: "crimson", fontSize: 12, margin: "8px 0 0" }}>
                {crawlError}
              </p>
            )}
          </section>

          {pages.length > 1 && (
            <select
              value={selectedPageId ?? ""}
              onChange={(e) => loadSnapshots(e.target.value)}
              style={{
                width: "100%",
                padding: "6px 8px",
                fontSize: 12,
                marginBottom: 16,
                border: `1px solid ${colors.border}`,
                borderRadius: 4,
              }}
            >
              {pages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.url} ({p.snapshot_count})
                </option>
              ))}
            </select>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 14 }}>
            <h2
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: colors.heading,
                margin: 0,
                whiteSpace: "nowrap",
              }}
            >
              Snapshots
            </h2>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search snapshots"
              style={{
                flex: 1,
                padding: "8px 12px",
                fontSize: 14,
                border: "none",
                background: colors.panel,
                borderRadius: 2,
              }}
            />
          </div>

          {visibleSnapshots.length === 0 && (
            <p style={{ color: colors.muted, fontSize: 13 }}>
              {snapshots.length === 0
                ? "No snapshots yet — capture one above."
                : "No snapshots match that search."}
            </p>
          )}

          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {visibleSnapshots.map((s) => (
              <li
                key={s.id}
                style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}
              >
                <label style={{ fontSize: 11, color: colors.muted }}>
                  from{" "}
                  <input
                    type="radio"
                    name="from"
                    checked={diffFrom === s.id}
                    onChange={() => setDiffFrom(s.id)}
                  />
                </label>
                <label style={{ fontSize: 11, color: colors.muted }}>
                  to{" "}
                  <input
                    type="radio"
                    name="to"
                    checked={diffTo === s.id}
                    onChange={() => setDiffTo(s.id)}
                  />
                </label>
                <button
                  onClick={() => {
                    setViewSnapshotId(s.id);
                    setDiffParts(null);
                  }}
                  style={{
                    flex: 1,
                    textAlign: "left",
                    padding: "8px 12px",
                    fontSize: 13,
                    fontWeight: 600,
                    border: "none",
                    borderRadius: 2,
                    background:
                      viewSnapshotId === s.id ? colors.rowBgActive : colors.rowBg,
                    cursor: "pointer",
                  }}
                >
                  {new Date(s.captured_at).toLocaleString()}{" "}
                  <span style={{ color: colors.muted, fontWeight: 400 }}>
                    ({s.trigger})
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {diffFrom && diffTo && (
            <button
              onClick={runDiff}
              style={{
                marginTop: 14,
                padding: "6px 12px",
                fontSize: 12,
                border: `1px solid ${colors.border}`,
                borderRadius: 4,
                background: "#fff",
                cursor: "pointer",
              }}
            >
              Diff selected
            </button>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {diffParts ? (
            <div
              style={{
                border: `1px solid ${colors.border}`,
                borderRadius: 2,
                padding: 24,
                minHeight: 640,
                lineHeight: 1.7,
                fontSize: 14,
                whiteSpace: "pre-wrap",
              }}
            >
              {diffParts.map((p, i) => (
                <span
                  key={i}
                  style={{
                    background: p.added ? "#d4f8d4" : p.removed ? "#f8d4d4" : "transparent",
                    textDecoration: p.removed ? "line-through" : "none",
                  }}
                >
                  {p.value}
                </span>
              ))}
            </div>
          ) : viewSnapshotId ? (
            <iframe
              src={`/api/snapshots/${viewSnapshotId}`}
              // allow-scripts (without allow-same-origin) lets the archived page's
              // interactions run while keeping it on an opaque origin, so it cannot
              // reach this app's origin, cookies or storage.
              sandbox="allow-scripts"
              style={{
                width: "100%",
                height: 840,
                border: "none",
                background: "#fff",
                display: "block",
              }}
            />
          ) : (
            <div
              style={{
                background: colors.panel,
                minHeight: 840,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 20,
                color: "#16161a",
              }}
            >
              snapshot view
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
