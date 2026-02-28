// src/app/style-profile/taste-health-dashboard.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { labelForTasteKey, styleGroupForKey, type TasteVector, safeRange } from "./style-vector";

type SnapshotRow = {
  created_at: string;
  taste_vector: TasteVector;
};

type DriftPoint = { created_at: string; drift_pct: number };

const GROUPS = ["era", "fit", "rise", "wash", "fabric"] as const;
type Group = (typeof GROUPS)[number];

function meterPct(x: number) {
  return Math.max(0, Math.min(100, Math.round(x)));
}

function Meter({ pct }: { pct: number }) {
  return (
    <div className="h-2 w-full rounded-full bg-gray-200" aria-label={`Meter ${meterPct(pct)}%`}>
      <div
        className="h-2 rounded-full bg-gray-900 transition-all duration-500"
        style={{ width: `${meterPct(pct)}%` }}
      />
    </div>
  );
}

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function keysOf(v: TasteVector | null | undefined): string[] {
  return v ? Object.keys(v) : [];
}

function getNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

function unionKeys(a: TasteVector, b: TasteVector): string[] {
  const set = new Set<string>();
  for (const k of Object.keys(a)) set.add(k);
  for (const k of Object.keys(b)) set.add(k);
  return Array.from(set);
}

// Drift %: mean(|v_new - v_prev|) / (range) * 100
function driftPct(a: TasteVector, b: TasteVector, clampMin: number, clampMax: number): number {
  const range = safeRange(clampMin, clampMax);
  const ks = unionKeys(a, b);
  if (ks.length === 0) return 0;

  let sum = 0;
  let n = 0;

  for (const k of ks) {
    const av = getNum(a[k]) ?? 0;
    const bv = getNum(b[k]) ?? 0;
    sum += Math.abs(av - bv);
    n += 1;
  }

  return meterPct((sum / n / range) * 100);
}

// Saturation %: % numeric keys where |v| >= (halfRange * railThreshold)
function saturationPct(v: TasteVector, clampMin: number, clampMax: number, railThreshold = 0.9): number {
  const min = Math.min(clampMin, clampMax);
  const max = Math.max(clampMin, clampMax);
  const halfRange = safeRange(min, max) / 2;

  const ks = Object.keys(v);
  if (ks.length === 0) return 0;

  let sat = 0;
  let denom = 0;

  for (const k of ks) {
    const x = getNum(v[k]);
    if (x === null) continue;
    denom += 1;
    if (Math.abs(x) >= halfRange * railThreshold) sat += 1;
  }

  return denom === 0 ? 0 : meterPct((sat / denom) * 100);
}

function groupMetrics(v: TasteVector): {
  dominancePct: number;
  diversityPct: number;
  shares: Record<string, number>;
} {
  const masses: Record<string, number> = { era: 0, fit: 0, rise: 0, wash: 0, fabric: 0, other: 0 };
  let total = 0;

  for (const [k, raw] of Object.entries(v)) {
    const x = getNum(raw);
    if (x === null) continue;

    // reuse the same grouping logic used by Style Signals (convert StyleGroup -> lower)
    const gStyle = styleGroupForKey(k);
    const g =
      gStyle === "Era"
        ? "era"
        : gStyle === "Fit"
          ? "fit"
          : gStyle === "Rise"
            ? "rise"
            : gStyle === "Wash"
              ? "wash"
              : gStyle === "Fabric"
                ? "fabric"
                : "other";

    const m = Math.abs(x);
    masses[g] = (masses[g] ?? 0) + m;
    total += m;
  }

  const shares: Record<string, number> = {};
  const groups = Object.keys(masses);
  for (const g of groups) shares[g] = total > 0 ? masses[g] / total : 0;

  const maxShare = groups.reduce((acc, g) => Math.max(acc, shares[g] ?? 0), 0);

  return {
    dominancePct: meterPct(maxShare * 100),
    diversityPct: meterPct((1 - maxShare) * 100),
    shares,
  };
}

function Card(props: { title: string; value: string; subtitle: string; pct: number; footer: string }) {
  const { title, value, subtitle, pct, footer } = props;
  return (
    <div className="rounded-2xl border bg-gray-50 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-gray-900">{title}</div>
          <div className="mt-1 text-xs text-gray-600">{subtitle}</div>
        </div>
        <div className="font-mono text-sm font-semibold text-gray-900">{value}</div>
      </div>
      <div className="mt-3">
        <Meter pct={pct} />
      </div>
      <div className="mt-2 text-xs text-gray-500">{footer}</div>
    </div>
  );
}

const DASHBOARD_DEFINITIONS = {
  snapshotSummary: {
    title: "Snapshot Summary",
    body:
      "A quick status read of what’s loaded and what the latest snapshot contains. Includes a short “top signals” rollup " +
      "to make the latest taste state more human-readable.",
  },
  recentDrift: {
    title: "Recent Drift",
    body:
      "Drift across the most recent snapshot pairs (newest → older). Spikes usually mean rapid learning (fresh feedback), " +
      "a decay/normalization change, or a real shift in behavior.",
  },
  groupShare: {
    title: "Group Share",
    body:
      "How much each major group contributes to total absolute signal mass in the latest snapshot. " +
      "share = sum(|v|) per group / total.",
  },
  drift: {
    title: "Drift",
    body:
      "Average per-key change between the latest two snapshots, normalized by the clamp range. Lower drift = calmer profile.",
  },
  stability: { title: "Stability", body: "Just the complement of Drift. stability% = 100 − drift%." },
  diversity: {
    title: "Diversity",
    body:
      "How spread out absolute signal mass is across groups. Approximated as (1 − maxGroupShare) × 100.",
  },
  dominance: {
    title: "Dominance",
    body:
      "The largest group share of absolute signal mass. dominance% = maxGroupShare × 100.",
  },
  saturation: {
    title: "Saturation",
    body:
      "Percent of numeric keys near the clamp rails (default: within 90% of halfRange). If high, clamp may be too tight or decay too weak.",
  },
} as const;

function Help({ clampMin, clampMax }: { clampMin: number; clampMax: number }) {
  const min = Math.min(clampMin, clampMax);
  const max = Math.max(clampMin, clampMax);
  const range = safeRange(min, max);
  const halfRange = range / 2;

  return (
    <div className="mt-3 rounded-2xl border bg-gray-50 p-4 text-sm text-gray-700">
      <div className="font-semibold text-gray-900">How to read this dashboard</div>

      <div className="mt-3 space-y-4">
        <div>
          <div className="font-medium">{DASHBOARD_DEFINITIONS.snapshotSummary.title}</div>
          <div className="mt-1">{DASHBOARD_DEFINITIONS.snapshotSummary.body}</div>
        </div>

        <div>
          <div className="font-medium">{DASHBOARD_DEFINITIONS.recentDrift.title}</div>
          <div className="mt-1">{DASHBOARD_DEFINITIONS.recentDrift.body}</div>
        </div>

        <div>
          <div className="font-medium">{DASHBOARD_DEFINITIONS.groupShare.title}</div>
          <div className="mt-1">{DASHBOARD_DEFINITIONS.groupShare.body}</div>
        </div>

        <div className="pt-2">
          <div className="font-semibold text-gray-900">Core metrics (definitions + formulas)</div>

          <div className="mt-3 space-y-4">
            <div>
              <div className="font-medium">{DASHBOARD_DEFINITIONS.drift.title}</div>
              <div className="mt-1">{DASHBOARD_DEFINITIONS.drift.body}</div>
              <div className="mt-2 font-mono text-xs text-gray-600">
                drift% = mean(|v_new − v_prev|) / ({max} − {min}) × 100
              </div>
              <div className="mt-1 text-xs text-gray-600">
                Example: range {range} and mean delta 3.0 → 3/{range}×100 = {meterPct((3 / range) * 100)}% drift.
              </div>
            </div>

            <div>
              <div className="font-medium">{DASHBOARD_DEFINITIONS.stability.title}</div>
              <div className="mt-1">{DASHBOARD_DEFINITIONS.stability.body}</div>
              <div className="mt-2 font-mono text-xs text-gray-600">stability% = 100 − drift%</div>
            </div>

            <div>
              <div className="font-medium">{DASHBOARD_DEFINITIONS.diversity.title}</div>
              <div className="mt-1">{DASHBOARD_DEFINITIONS.diversity.body}</div>
              <div className="mt-2 font-mono text-xs text-gray-600">diversity% ≈ (1 − maxGroupShare) × 100</div>
            </div>

            <div>
              <div className="font-medium">{DASHBOARD_DEFINITIONS.dominance.title}</div>
              <div className="mt-1">{DASHBOARD_DEFINITIONS.dominance.body}</div>
              <div className="mt-2 font-mono text-xs text-gray-600">dominance% = maxGroupShare × 100</div>
            </div>

            <div>
              <div className="font-medium">{DASHBOARD_DEFINITIONS.saturation.title}</div>
              <div className="mt-1">{DASHBOARD_DEFINITIONS.saturation.body}</div>
              <div className="mt-2 font-mono text-xs text-gray-600">
                saturated if |v| ≥ ({halfRange.toFixed(2)} × 0.90)
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function topSignals(v: TasteVector, n = 2) {
  const entries = Object.entries(v)
    .map(([k, raw]) => ({ k, v: getNum(raw) ?? 0, g: styleGroupForKey(k) }))
    .filter((x) => x.g !== "Other" && Number.isFinite(x.v));

  const pos = entries
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v)
    .slice(0, n);

  const neg = entries
    .filter((x) => x.v < 0)
    .sort((a, b) => a.v - b.v)
    .slice(0, n);

  return { pos, neg };
}

export default function TasteHealthDashboard({
  clampMin,
  clampMax,
  snapshotLimit = 30,
}: {
  clampMin: number;
  clampMax: number;
  snapshotLimit?: number;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showVector, setShowVector] = useState(false);
  const inFlight = useRef<Promise<void> | null>(null);

  async function load() {
    if (inFlight.current) return inFlight.current;

    inFlight.current = (async () => {
      setLoading(true);
      setErr(null);

      const { data, error } = await supabase
        .from("taste_vector_snapshots")
        .select("created_at,taste_vector")
        .order("created_at", { ascending: false })
        .limit(snapshotLimit);

      if (error) {
        setErr(error.message);
        setSnapshots([]);
        setLoading(false);
        return;
      }

      const rows = Array.isArray(data) ? data : [];
      const parsed: SnapshotRow[] = rows
        .map((r) => {
          const created_at =
            typeof (r as { created_at?: unknown }).created_at === "string"
              ? (r as { created_at: string }).created_at
              : "";

          const tv = (r as { taste_vector?: unknown }).taste_vector;
          const taste_vector: TasteVector =
            tv && typeof tv === "object" && !Array.isArray(tv) ? (tv as TasteVector) : {};

          return { created_at, taste_vector };
        })
        .filter((r) => r.created_at.length > 0);

      setSnapshots(parsed);
      setLoading(false);
    })().finally(() => {
      inFlight.current = null;
    });

    return inFlight.current;
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const min = Math.min(clampMin, clampMax);
  const max = Math.max(clampMin, clampMax);

  const latestVector: TasteVector | null = snapshots.length > 0 ? snapshots[0].taste_vector : null;
  const prevVector: TasteVector | null = snapshots.length > 1 ? snapshots[1].taste_vector : null;

  const coverage = latestVector ? keysOf(latestVector).length : 0;

  const drift = latestVector && prevVector ? driftPct(latestVector, prevVector, min, max) : 0;
  const stability = meterPct(100 - drift);

  const gm = latestVector
    ? groupMetrics(latestVector)
    : { dominancePct: 0, diversityPct: 0, shares: {} as Record<string, number> };

  const dominance = gm.dominancePct;
  const diversity = gm.diversityPct;

  const saturation = latestVector ? saturationPct(latestVector, min, max, 0.9) : 0;

  const driftSeries: DriftPoint[] = (() => {
    if (snapshots.length < 2) return [];
    const out: DriftPoint[] = [];
    const n = Math.min(10, snapshots.length - 1);
    for (let i = 0; i < n; i++) {
      const a = snapshots[i]?.taste_vector;
      const b = snapshots[i + 1]?.taste_vector;
      if (!a || !b) continue;
      out.push({ created_at: snapshots[i].created_at, drift_pct: driftPct(a, b, min, max) });
    }
    return out;
  })();

  const hasSnapshots = snapshots.length > 0;

  const tops = latestVector ? topSignals(latestVector, 2) : { pos: [], neg: [] };

  return (
    <section className="rounded-3xl border bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold">Taste Health Dashboard</div>
          <div className="mt-1 text-sm text-gray-600">
            Diagnostics for drift, balance, and rail-hitting so we can tune decay + normalization with confidence.
          </div>
        </div>

        <button
          className="rounded-xl border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
          disabled={loading}
          onClick={() => void load()}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <details className="mt-4">
        <summary className="cursor-pointer select-none text-sm text-gray-600 hover:text-gray-900">
          Definitions, formulas, and examples
        </summary>
        <Help clampMin={min} clampMax={max} />
      </details>

      {err ? (
        <div className="mt-6 rounded-2xl border border-red-300 bg-red-50 p-4 text-red-700">{err}</div>
      ) : null}

      {!loading && !err && !hasSnapshots ? (
        <div className="mt-6 rounded-2xl border bg-gray-50 p-4 text-sm text-gray-700">
          No snapshots yet. Generate picks and record feedback (Save / Bought / Not for me) to create daily snapshots.
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 md:grid-cols-5">
        <Card title="Drift" value={`${drift}%`} subtitle="Change vs previous snapshot" pct={drift} footer="Lower is calmer; spikes mean fast learning." />
        <Card title="Stability" value={`${stability}%`} subtitle="100 − Drift" pct={stability} footer="Higher is more consistent preferences." />
        <Card title="Diversity" value={`${diversity}%`} subtitle="Spread across groups" pct={diversity} footer="Higher = signals spread across dimensions." />
        <Card title="Dominance" value={`${dominance}%`} subtitle="Largest group share" pct={dominance} footer="High can indicate overfitting to one dimension." />
        <Card title="Saturation" value={`${saturation}%`} subtitle="Near clamp rails" pct={saturation} footer="If high: decay too weak or clamp too tight." />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border bg-gray-50 p-5">
          <div className="text-sm font-semibold text-gray-900">{DASHBOARD_DEFINITIONS.snapshotSummary.title}</div>
          <div className="mt-1 text-xs text-gray-600">{DASHBOARD_DEFINITIONS.snapshotSummary.body}</div>

          <div className="mt-3 text-sm text-gray-700">
            <div className="flex justify-between">
              <span className="text-gray-600">Snapshots loaded</span>
              <span className="font-mono">{snapshots.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Keys in latest vector</span>
              <span className="font-mono">{coverage}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Clamp range</span>
              <span className="font-mono">
                {min}…{max}
              </span>
            </div>
          </div>

          {snapshots[0]?.created_at ? (
            <div className="mt-3 text-xs text-gray-500">
              Latest snapshot: <span className="font-mono">{formatTime(snapshots[0].created_at)}</span>
            </div>
          ) : null}

          {latestVector ? (
            <div className="mt-4 rounded-xl border bg-white p-3">
              <div className="text-xs font-semibold text-gray-700">Top signals</div>
              <div className="mt-2 grid gap-2 text-xs md:grid-cols-2">
                <div>
                  <div className="font-semibold text-gray-700">Preferences</div>
                  {tops.pos.length === 0 ? (
                    <div className="mt-1 text-gray-400">None</div>
                  ) : (
                    <div className="mt-1 space-y-1">
                      {tops.pos.map((x) => (
                        <div key={x.k} className="flex justify-between gap-2">
                          <span className="text-gray-700">{labelForTasteKey(x.k)}</span>
                          <span className="font-mono text-gray-500">{x.v.toFixed(3)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div className="font-semibold text-gray-700">Avoidances</div>
                  {tops.neg.length === 0 ? (
                    <div className="mt-1 text-gray-400">None</div>
                  ) : (
                    <div className="mt-1 space-y-1">
                      {tops.neg.map((x) => (
                        <div key={x.k} className="flex justify-between gap-2">
                          <span className="text-gray-700">{labelForTasteKey(x.k)}</span>
                          <span className="font-mono text-gray-500">{x.v.toFixed(3)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-4">
            <button
              type="button"
              className="rounded-xl border bg-white px-3 py-2 text-xs font-medium hover:bg-gray-50 disabled:opacity-60"
              disabled={!latestVector}
              onClick={() => setShowVector((v) => !v)}
            >
              {showVector ? "Hide latest vector" : "Show latest vector"}
            </button>

            {showVector && latestVector ? (
              <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl border bg-white p-3 text-[11px] leading-relaxed text-gray-800">
                {JSON.stringify(latestVector, null, 2)}
              </pre>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border bg-gray-50 p-5">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-900">{DASHBOARD_DEFINITIONS.recentDrift.title} (last 10)</div>
            <div className="text-xs text-gray-500">newest → older</div>
          </div>
          <div className="mt-1 text-xs text-gray-600">{DASHBOARD_DEFINITIONS.recentDrift.body}</div>

          {loading ? (
            <div className="mt-3 text-sm text-gray-600">Loading…</div>
          ) : driftSeries.length === 0 ? (
            <div className="mt-3 text-sm text-gray-600">Not enough snapshots yet to compute drift.</div>
          ) : (
            <div className="mt-3 space-y-3">
              {driftSeries.map((p) => (
                <div key={p.created_at} className="space-y-1">
                  <div className="flex justify-between text-xs text-gray-600">
                    <span className="font-mono">{formatTime(p.created_at)}</span>
                    <span className="font-mono font-semibold">{p.drift_pct}%</span>
                  </div>
                  <Meter pct={p.drift_pct} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-2xl border bg-white p-5">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-900">{DASHBOARD_DEFINITIONS.groupShare.title} (absolute signal mass)</div>
          <div className="text-xs text-gray-500">share = sum(|v|) per group / total</div>
        </div>
        <div className="mt-1 text-xs text-gray-600">{DASHBOARD_DEFINITIONS.groupShare.body}</div>

        {!latestVector ? (
          <div className="mt-3 text-sm text-gray-600">No snapshots yet.</div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-5">
            {(["era", "fit", "rise", "wash", "fabric"] as const).map((g) => {
              const share = gm.shares[g] ?? 0;
              const pct = meterPct(share * 100);
              return (
                <div key={g} className="rounded-xl border bg-gray-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-700">{g}</div>
                  <div className="mt-1 font-mono text-sm font-semibold text-gray-900">{pct}%</div>
                  <div className="mt-2">
                    <Meter pct={pct} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}





