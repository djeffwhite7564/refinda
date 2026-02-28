// src/app/admin/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type IngestStatus = "queued" | "processing" | "failed" | "complete";
type Row = { ingest_status: IngestStatus };

export default function AdminHomePage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [loading, setLoading] = useState(true);
  const [statusCounts, setStatusCounts] = useState<Record<IngestStatus, number>>({
    queued: 0,
    processing: 0,
    failed: 0,
    complete: 0,
  });
  const [activeLooks, setActiveLooks] = useState<number>(0);
  const [activeCelebs, setActiveCelebs] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    setLoading(true);
    try {
      // Looks status counts (lightweight)
      const { data: looks, error: looksErr } = await supabase
        .from("celebrity_looks")
        .select("ingest_status,is_active");

      if (looksErr) throw looksErr;

      const counts: Record<IngestStatus, number> = {
        queued: 0,
        processing: 0,
        failed: 0,
        complete: 0,
      };

      let active = 0;
      for (const r of (looks ?? []) as any[]) {
        const st = r.ingest_status as IngestStatus;
        if (counts[st] !== undefined) counts[st] += 1;
        if (r.is_active) active += 1;
      }

      setStatusCounts(counts);
      setActiveLooks(active);

      // Celebs active count
      const { data: celebs, error: celebsErr } = await supabase
        .from("celebrities")
        .select("is_active");

      if (celebsErr) throw celebsErr;

      setActiveCelebs((celebs ?? []).filter((c: any) => c.is_active).length);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load admin dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Admin Dashboard</h1>
            <p className="text-sm text-gray-500">Catalog ops for Celebrities + Looks</p>
          </div>
          <nav className="flex items-center gap-2">
            <Link
              href="/admin/celebrities"
              className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
            >
              Celebrities
            </Link>
            <Link
              href="/admin/looks"
              className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
            >
              Looks
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 space-y-6">
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card
            title="Active Celebrities"
            value={loading ? "…" : String(activeCelebs)}
            hint="is_active = true"
          />
          <Card
            title="Active Looks"
            value={loading ? "…" : String(activeLooks)}
            hint="is_active = true"
          />
          <Card
            title="Ingest Health"
            value={
              loading
                ? "…"
                : `${statusCounts.complete} complete • ${statusCounts.failed} failed`
            }
            hint="Status overview"
          />
        </section>

        <section className="rounded-xl border p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Ingest Status</h2>
              <p className="text-sm text-gray-500">
                Quick view of queued/processing/failed/complete
              </p>
            </div>
            <button
              onClick={() => load()}
              className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
            >
              Refresh
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            <Pill label="Queued" value={statusCounts.queued} loading={loading} />
            <Pill label="Processing" value={statusCounts.processing} loading={loading} />
            <Pill label="Failed" value={statusCounts.failed} loading={loading} />
            <Pill label="Complete" value={statusCounts.complete} loading={loading} />
          </div>

          <div className="mt-4 flex gap-2">
            <Link
              href="/admin/looks?status=queued"
              className="text-sm underline text-gray-700 hover:text-gray-900"
            >
              View queued
            </Link>
            <Link
              href="/admin/looks?status=failed"
              className="text-sm underline text-gray-700 hover:text-gray-900"
            >
              View failed
            </Link>
            <Link
              href="/admin/looks"
              className="text-sm underline text-gray-700 hover:text-gray-900"
            >
              View all looks
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

function Card({ title, value, hint }: { title: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border p-4">
      <div className="text-sm text-gray-500">{title}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-xs text-gray-400">{hint}</div>
    </div>
  );
}

function Pill({
  label,
  value,
  loading,
}: {
  label: string;
  value: number;
  loading: boolean;
}) {
  return (
    <div className="rounded-lg border px-3 py-2">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-semibold">{loading ? "…" : value}</div>
    </div>
  );
}
