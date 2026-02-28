// src/app/style-profile/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

import TotalsStrip from "./totals-strip";
import StyleVector, {
  labelForTasteKey,
  safeRange,
  styleGroupForKey,
  type TasteVector,
} from "./style-vector";
import TasteHealthDashboard from "./taste-health-dashboard";

/* ============================= Types ============================= */

type VectorItem = { key: string; weight: number };

type Dashboard = {
  profile:
    | {
        taste_vector: Record<string, number>;
        taste_clamp_min: number;
        taste_clamp_max: number;
      }
    | null;
  likes: VectorItem[] | null;
  dislikes: VectorItem[] | null;
  totals:
    | {
        total_actions: number;
        saves: number;
        purchases: number;
        not_for_me: number;
        last_action_at: string | null;
      }
    | null;
};

type SnapshotRow = {
  created_at: string;
  taste_vector: TasteVector;
};

/* ============================= Utils ============================= */

const STYLE_GROUPS = ["Era", "Fit", "Rise", "Wash", "Fabric"] as const;
type StyleGroup = (typeof STYLE_GROUPS)[number];

function meterPct(x: number) {
  return Math.max(0, Math.min(100, Math.round(x)));
}

function getNum(x: unknown): number | null {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
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
  for (const k of ks) {
    const av = getNum(a[k]) ?? 0;
    const bv = getNum(b[k]) ?? 0;
    sum += Math.abs(av - bv);
  }
  return meterPct(((sum / ks.length) / range) * 100);
}

/* ========================== Confidence =========================== */

function confidenceFromTotals(totalActions: number, likes: VectorItem[]) {
  const strength =
    likes.length === 0
      ? 0
      : likes.reduce((acc, x) => acc + Math.min(10, Math.abs(x.weight)), 0) / likes.length;

  const actionComponent = 1 - Math.exp(-totalActions / 12);
  const strengthComponent = strength / 10;

  return Math.round((actionComponent * 0.7 + strengthComponent * 0.3) * 100);
}

/* ====================== Archetype (Upgraded) ===================== */

function topKeysByPrefixFromVector(
  v: TasteVector | null,
  prefix: string,
  n = 1,
  dir: "pos" | "neg" | "abs" = "abs"
) {
  if (!v) return [];
  const items = Object.entries(v)
    .filter(([k]) => k.startsWith(prefix))
    .map(([k, val]) => ({ key: k, val: getNum(val) ?? 0 }))
    .filter((x) => Number.isFinite(x.val));

  const filtered =
    dir === "pos" ? items.filter((x) => x.val > 0) : dir === "neg" ? items.filter((x) => x.val < 0) : items;

  filtered.sort((a, b) => {
    if (dir === "abs") return Math.abs(b.val) - Math.abs(a.val);
    return dir === "pos" ? b.val - a.val : a.val - b.val;
  });

  return filtered.slice(0, n);
}

function archetypeFromTasteVector(v: TasteVector | null) {
  const era = topKeysByPrefixFromVector(v, "era_", 1, "abs")[0]?.key?.replace("era_", "") ?? "modern";
  const fit = topKeysByPrefixFromVector(v, "fit_", 1, "abs")[0]?.key?.replace("fit_", "") ?? "straight";
  const fabric = topKeysByPrefixFromVector(v, "fabric_", 1, "abs")[0]?.key?.replace("fabric_", "") ?? "rigid";

  const fabricWord = fabric.includes("rigid") ? "Structured" : fabric.includes("stretch") ? "Comfort" : "Classic";

  const eraWord = era.includes("90")
    ? "90s"
    : era.includes("80")
      ? "80s"
      : era.includes("y2k")
        ? "Y2K"
        : era.includes("heritage")
          ? "Heritage"
          : "Modern";

  const fitWord = fit.includes("straight")
    ? "Minimalist"
    : fit.includes("slim")
      ? "Tailored"
      : fit.includes("baggy")
        ? "Skater"
        : fit.includes("relaxed")
          ? "Easy"
          : "Classic";

  return `${fabricWord} ${eraWord} ${fitWord}`;
}

function profileModeFromDrift(drift: number) {
  if (drift >= 12) return { label: "Learning fast", cls: "bg-orange-50 text-orange-700 border-orange-200" };
  if (drift >= 6) return { label: "Shifting", cls: "bg-amber-50 text-amber-700 border-amber-200" };
  return { label: "Stable", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
}

/* ============================ Style DNA ========================== */

type DnaRow = {
  key: string;
  label: string;
  raw: number;
  group: StyleGroup;
  leanSigned: number; // -100..+100
  leanCentered: number; // 0..100 (50 neutral)
  strength: number; // 0..100
  direction: "Prefer" | "Avoid" | "Neutral";
  volatilityPct: number | null; // 0..100, higher = more volatile
};

const SORTS = ["Top Strength", "Most Prefer", "Most Avoid", "Most Neutral"] as const;
type SortMode = (typeof SORTS)[number];

const FILTERS = ["All", "Prefer", "Avoid"] as const;
type FilterMode = (typeof FILTERS)[number];

// neutral band tightened so “Most Avoid” is visually meaningful
function dirForLean(leanSigned: number): DnaRow["direction"] {
  if (leanSigned >= 10) return "Prefer";
  if (leanSigned <= -10) return "Avoid";
  return "Neutral";
}

function signedLeanPct(raw: number, halfRange: number) {
  if (halfRange <= 0) return 0;
  const pct = (raw / halfRange) * 100;
  return Math.max(-100, Math.min(100, Math.round(pct)));
}

function centeredFromRaw(raw: number, halfRange: number) {
  if (halfRange <= 0) return 50;
  const pct = ((raw + halfRange) / (2 * halfRange)) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

function strengthPct(raw: number, halfRange: number) {
  if (halfRange <= 0) return 0;
  const linear = Math.max(0, Math.min(1, Math.abs(raw) / halfRange));
  return Math.round(Math.sqrt(linear) * 100);
}

function sortRows(rows: DnaRow[], mode: SortMode) {
  const r = [...rows];
  if (mode === "Top Strength") {
    r.sort((a, b) => b.strength - a.strength);
  } else if (mode === "Most Prefer") {
    r.sort((a, b) => b.leanSigned - a.leanSigned || b.strength - a.strength);
  } else if (mode === "Most Avoid") {
    r.sort((a, b) => a.leanSigned - b.leanSigned || b.strength - a.strength);
  } else {
    r.sort((a, b) => Math.abs(a.leanSigned) - Math.abs(b.leanSigned) || b.strength - a.strength);
  }
  return r;
}

// show fewer: keep sort order, show meaningful if any else top N (never empty)
function visibleRows(rowsSorted: DnaRow[], halfRange: number, fallbackN = 8) {
  const t = halfRange * 0.15;
  const meaningful = rowsSorted.filter((x) => Math.abs(x.raw) >= t);
  if (meaningful.length > 0) return meaningful.slice(0, fallbackN);
  return rowsSorted.slice(0, fallbackN);
}

function Badge({ dir }: { dir: DnaRow["direction"] }) {
  const cls =
    dir === "Prefer"
      ? "bg-green-50 text-green-700 border-green-200"
      : dir === "Avoid"
        ? "bg-red-50 text-red-700 border-red-200"
        : "bg-gray-50 text-gray-700 border-gray-200";

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      {dir}
    </span>
  );
}

function VolatilityPill({ pct }: { pct: number | null }) {
  if (pct === null) {
    return (
      <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-semibold text-gray-700">
        Vol: —
      </span>
    );
  }

  const label = pct >= 35 ? "High" : pct >= 18 ? "Med" : "Low";
  const cls =
    label === "High"
      ? "border-orange-200 bg-orange-50 text-orange-700"
      : label === "Med"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-emerald-200 bg-emerald-50 text-emerald-700";

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      Vol: {label}
    </span>
  );
}

function describeTrait(label: string, leanSigned: number, strength: number) {
  const abs = Math.abs(leanSigned);

  if (abs >= 25) {
    return leanSigned > 0
      ? `Strong preference signal for ${label}. Expect this to heavily influence recommendations.`
      : `Strong avoidance signal for ${label}. Recommendations should steer away from this.`;
  }

  if (abs >= 10) {
    return leanSigned > 0
      ? `Leaning toward ${label}. Expect this to show up more in recommendations.`
      : `Leaning away from ${label}. Expect this to show up less in recommendations.`;
  }

  if (strength < 20) return `Very early signal for ${label}. More feedback will sharpen this.`;
  return `No clear direction yet for ${label}. This may fluctuate as you keep rating picks.`;
}

/**
 * Gradient Lean bar (red -> neutral -> green) with center mark + marker dot.
 * pct is 0..100 where 50 is neutral.
 */
function GradientLeanBar({ pct }: { pct: number }) {
  const p = meterPct(pct);
  return (
    <div className="relative h-3 w-full rounded-full bg-gradient-to-r from-red-400 via-gray-200 to-green-400">
      <div className="absolute left-1/2 top-0 h-3 w-[2px] -translate-x-1/2 bg-gray-600/60" />
      <div
        className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-gray-200 bg-white shadow-sm"
        style={{ left: `${p}%` }}
        aria-hidden
      />
    </div>
  );
}

/* =================== NEW: Colored Strength & Avoid Bars =================== */
/**
 * We keep the same “meter” geometry, but color the filled portion:
 * - Prefer (positive) => green
 * - Avoid (negative)  => red
 * - Neutral           => gray
 *
 * For “Strong Signals” and “Avoiding” sections we know the sign already, so we pass variant explicitly.
 */
function StrengthBarColored({
  pct,
  variant,
}: {
  pct: number;
  variant: "prefer" | "avoid" | "neutral";
}) {
  const p = meterPct(pct);
  const fill =
    variant === "prefer"
      ? "bg-green-500"
      : variant === "avoid"
        ? "bg-red-500"
        : "bg-gray-500";

  return (
    <div className="h-2 w-full rounded-full bg-gray-200" aria-label={`Strength ${p}%`}>
      <div className={`h-2 rounded-full ${fill} transition-all duration-500`} style={{ width: `${p}%` }} />
    </div>
  );
}

function strengthPctFromWeight(weight: number, clampMin: number, clampMax: number) {
  const range = safeRange(clampMin, clampMax);
  const halfRange = range / 2;
  if (halfRange <= 0) return 0;
  const linear = Math.max(0, Math.min(1, Math.abs(weight) / halfRange));
  return Math.round(Math.sqrt(linear) * 100);
}
/* ======================================================================== */

function computeVolatilityByKey(
  snapshots: SnapshotRow[],
  clampMin: number,
  clampMax: number
): Record<string, number> {
  // volatility = stddev of recent deltas per key, normalized by range => 0..100
  const range = safeRange(clampMin, clampMax);
  if (snapshots.length < 2) return {};

  const keys = new Set<string>();
  for (const s of snapshots) for (const k of Object.keys(s.taste_vector ?? {})) keys.add(k);

  const out: Record<string, number> = {};
  for (const k of keys) {
    const deltas: number[] = [];
    for (let i = 0; i < snapshots.length - 1; i++) {
      const a = getNum(snapshots[i]?.taste_vector?.[k]) ?? 0;
      const b = getNum(snapshots[i + 1]?.taste_vector?.[k]) ?? 0;
      deltas.push(a - b);
    }
    if (deltas.length === 0) continue;

    const mean = deltas.reduce((acc, x) => acc + x, 0) / deltas.length;
    const varr = deltas.reduce((acc, x) => acc + (x - mean) * (x - mean), 0) / deltas.length;
    const std = Math.sqrt(varr);

    out[k] = meterPct((std / range) * 100);
  }
  return out;
}

function StyleDnaTable({
  tasteVector,
  clampMin,
  clampMax,
}: {
  tasteVector: TasteVector | null;
  clampMin: number;
  clampMax: number;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [sort, setSort] = useState<SortMode>("Top Strength");
  const [filter, setFilter] = useState<FilterMode>("All");
  const [showAll, setShowAll] = useState(false);

  const [sectionsOpen, setSectionsOpen] = useState<Record<StyleGroup, boolean>>(() => {
    const init = {} as Record<StyleGroup, boolean>;
    for (const g of STYLE_GROUPS) init[g] = true;
    return init;
  });

  const min = Math.min(clampMin, clampMax);
  const max = Math.max(clampMin, clampMax);
  const halfRange = safeRange(min, max) / 2;

  const [volByKey, setVolByKey] = useState<Record<string, number>>({});

  useEffect(() => {
    let alive = true;

    const run = async () => {
      try {
        const { data, error } = await supabase
          .from("taste_vector_snapshots")
          .select("created_at,taste_vector")
          .order("created_at", { ascending: false })
          .limit(12);

        if (!alive) return;
        if (error) {
          setVolByKey({});
          return;
        }

        const rows = Array.isArray(data) ? data : [];
        const parsed: SnapshotRow[] = rows
          .map((r) => {
            const created_at = typeof (r as any)?.created_at === "string" ? (r as any).created_at : "";
            const tv = (r as any)?.taste_vector;
            const taste_vector: TasteVector =
              tv && typeof tv === "object" && !Array.isArray(tv) ? (tv as TasteVector) : {};
            return { created_at, taste_vector };
          })
          .filter((r) => r.created_at);

        setVolByKey(computeVolatilityByKey(parsed, min, max));
      } catch {
        if (!alive) return;
        setVolByKey({});
      }
    };

    void run();
    return () => {
      alive = false;
    };
  }, [supabase, min, max]);

  const rows = useMemo(() => {
    if (!tasteVector) return [] as DnaRow[];

    const out: DnaRow[] = [];

    for (const [k, rawAny] of Object.entries(tasteVector)) {
      const raw = getNum(rawAny);
      if (raw === null) continue;

      const g = styleGroupForKey(k);
      if (g === "Other") continue;
      const group = g as StyleGroup;

      const leanSigned = signedLeanPct(raw, halfRange);
      const strength = strengthPct(raw, halfRange);
      const direction = dirForLean(leanSigned);

      out.push({
        key: k,
        label: labelForTasteKey(k),
        raw,
        group,
        leanSigned,
        leanCentered: centeredFromRaw(raw, halfRange),
        strength,
        direction,
        volatilityPct: typeof volByKey[k] === "number" ? volByKey[k] : null,
      });
    }

    return out;
  }, [tasteVector, halfRange, volByKey]);

  const rowsByGroup = useMemo(() => {
    const grouped = {} as Record<StyleGroup, DnaRow[]>;
    for (const g of STYLE_GROUPS) grouped[g] = [];
    for (const r of rows) grouped[r.group].push(r);
    return grouped;
  }, [rows]);

  function applyFilter(rs: DnaRow[]) {
    if (filter === "Prefer") return rs.filter((r) => r.direction === "Prefer");
    if (filter === "Avoid") return rs.filter((r) => r.direction === "Avoid");
    return rs;
  }

  function renderGroupTable(group: StyleGroup, groupRows: DnaRow[]) {
    const filtered = applyFilter(groupRows);
    const sorted = sortRows(filtered, sort);
    const display = showAll ? sorted : visibleRows(sorted, halfRange, 8);

    return (
      <div className="overflow-hidden rounded-2xl border">
        <div className="grid grid-cols-12 gap-x-5 bg-gray-50 px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
          <div className="col-span-5">Trait</div>
          <div className="col-span-3">Lean</div>
          <div className="col-span-2">Strength</div>
          <div className="col-span-1 text-right">Raw</div>
          <div className="col-span-1">Vol</div>
        </div>

        <div className="divide-y">
          {display.map((r) => (
            <div key={r.key} className="grid grid-cols-12 gap-x-5 px-4 py-3">
              <div className="col-span-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-gray-900">{r.label}</div>
                    <div className="mt-1 text-xs text-gray-600">{describeTrait(r.label, r.leanSigned, r.strength)}</div>
                  </div>
                  <Badge dir={r.direction} />
                </div>
              </div>

              <div className="col-span-3 flex flex-col justify-center gap-2">
                <div className="text-[11px] text-gray-600">
                  {r.leanSigned > 0 ? "+" : ""}
                  {r.leanSigned}%
                </div>
                <GradientLeanBar pct={r.leanCentered} />
              </div>

              <div className="col-span-2 flex flex-col justify-center gap-2">
                <div className="text-[11px] text-gray-600">{r.strength}%</div>
                {/* keep the neutral black bar for the table (already looks good) */}
                <div className="h-2 w-full rounded-full bg-gray-200" aria-label={`Strength ${r.strength}%`}>
                  <div className="h-2 rounded-full bg-black transition-all duration-500" style={{ width: `${meterPct(r.strength)}%` }} />
                </div>
              </div>

              <div className="col-span-1 flex items-center justify-end">
                <span className="font-mono text-xs text-gray-600">{r.raw.toFixed(3)}</span>
              </div>

              <div className="col-span-1 flex items-center justify-start">
                <VolatilityPill pct={r.volatilityPct} />
              </div>
            </div>
          ))}
        </div>

        {!showAll ? (
          <div className="bg-gray-50 px-4 py-3 text-xs text-gray-600">
            Showing {display.length} of {sorted.length} (sorted by “{sort}”). Use “Show all” for the full list.
          </div>
        ) : null}
      </div>
    );
  }

  if (!tasteVector) {
    return (
      <section className="rounded-3xl border bg-white p-6 shadow-sm">
        <div className="text-lg font-semibold">Style DNA</div>
        <div className="mt-2 text-sm text-gray-500">No taste vector yet.</div>
      </section>
    );
  }

  const totalCount = rows.length;

  return (
    <section className="rounded-3xl border bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold">Style DNA</div>
          <div className="mt-1 text-sm text-gray-600">
            <span className="font-medium">Lean</span> uses a red→neutral→green scale (center tick is neutral).{" "}
            <span className="ml-2 font-medium">Strength</span> is magnitude.{" "}
            <span className="ml-2 font-medium">Volatility</span> is how much a trait has shifted recently.
          </div>
          <div className="mt-2 text-xs text-gray-500">Total DNA traits: {totalCount}</div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            className="rounded-xl border bg-white px-3 py-2 text-sm"
            value={filter}
            onChange={(e) => setFilter(e.target.value as FilterMode)}
          >
            {FILTERS.map((f) => (
              <option key={f} value={f}>
                Filter: {f}
              </option>
            ))}
          </select>

          <select
            className="rounded-xl border bg-white px-3 py-2 text-sm"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortMode)}
          >
            {SORTS.map((s) => (
              <option key={s} value={s}>
                Sort: {s}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="rounded-xl border bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? "Show fewer" : "Show all"}
          </button>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {STYLE_GROUPS.map((g) => {
          const groupRows = rowsByGroup[g] ?? [];
          const shownCount = applyFilter(groupRows).length;

          return (
            <div key={g} className="rounded-2xl border bg-white">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
                onClick={() => setSectionsOpen((s) => ({ ...s, [g]: !s[g] }))}
              >
                <div>
                  <div className="text-sm font-semibold text-gray-900">{g}</div>
                  <div className="mt-0.5 text-xs text-gray-500">
                    {filter === "All" ? `${groupRows.length} traits` : `${shownCount} traits after filter`}
                  </div>
                </div>
                <div className="text-xs font-semibold text-gray-600">{sectionsOpen[g] ? "Hide" : "Show"}</div>
              </button>

              {sectionsOpen[g] ? <div className="px-5 pb-5">{renderGroupTable(g, groupRows)}</div> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ============================== Page ============================= */

export default function StyleProfilePage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [dash, setDash] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [rpcLoading, setRpcLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [latestDrift, setLatestDrift] = useState<number | null>(null);

  const inFlight = useRef<Promise<void> | null>(null);

  async function loadDashboard() {
    if (inFlight.current) return inFlight.current;

    inFlight.current = (async () => {
      setRpcLoading(true);
      setError(null);

      try {
        const { data, error } = await supabase.rpc("get_style_profile_dashboard");
        if (error) {
          setError(error.message);
          setDash(null);
          return;
        }
        setDash((data as Dashboard) ?? null);
      } finally {
        setRpcLoading(false);
      }
    })().finally(() => {
      inFlight.current = null;
    });

    return inFlight.current;
  }

  async function signOut() {
    try {
      await supabase.auth.signOut();
    } finally {
      window.location.href = "/login";
    }
  }

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      setLoading(true);

      const timeout = window.setTimeout(() => {
        if (mounted) {
          setError((e) => e ?? "Timed out loading dashboard. Refresh the page.");
          setLoading(false);
        }
      }, 12000);

      try {
        await loadDashboard();
      } catch (e: unknown) {
        if (mounted) setError(e instanceof Error ? e.message : String(e));
      } finally {
        window.clearTimeout(timeout);
        if (mounted) setLoading(false);
      }
    };

    void run();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const likes = dash?.likes ?? [];
  const dislikes = dash?.dislikes ?? [];
  const tasteVector = (dash?.profile?.taste_vector ?? null) as TasteVector | null;
  const totals = dash?.totals ?? null;

  const clampMin = Math.min(dash?.profile?.taste_clamp_min ?? -30, dash?.profile?.taste_clamp_max ?? 30);
  const clampMax = Math.max(dash?.profile?.taste_clamp_min ?? -30, dash?.profile?.taste_clamp_max ?? 30);

  const totalActions = totals?.total_actions ?? 0;
  const hasAnySignals = totalActions > 0;

  // Drift label for Archetype
  useEffect(() => {
    let alive = true;

    const run = async () => {
      try {
        const { data, error } = await supabase
          .from("taste_vector_snapshots")
          .select("created_at,taste_vector")
          .order("created_at", { ascending: false })
          .limit(2);

        if (!alive) return;
        if (error || !Array.isArray(data) || data.length < 2) {
          setLatestDrift(null);
          return;
        }

        const a = ((data[0] as any)?.taste_vector ?? {}) as TasteVector;
        const b = ((data[1] as any)?.taste_vector ?? {}) as TasteVector;

        const min = Math.min(clampMin, clampMax);
        const max = Math.max(clampMin, clampMax);

        setLatestDrift(driftPct(a, b, min, max));
      } catch {
        if (!alive) return;
        setLatestDrift(null);
      }
    };

    void run();
    return () => {
      alive = false;
    };
  }, [supabase, clampMin, clampMax]);

  if (loading) return <div className="p-8">Loading...</div>;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Your Style Profile</h1>
          <p className="mt-2 text-sm text-gray-600">
            Your denim identity evolves as you save, buy, and reject recommendations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="rounded-xl border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
            onClick={loadDashboard}
          >
            {rpcLoading ? "Refreshing…" : "Refresh"}
          </button>
          <button
            className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black"
            onClick={signOut}
          >
            Sign out
          </button>
        </div>
      </div>

      {error && <div className="rounded-2xl border border-red-300 bg-red-50 p-4 text-red-700">{error}</div>}

      <TotalsStrip totals={totals} loading={rpcLoading} />

      {/* Style Signals */}
      <StyleVector tasteVector={tasteVector} clampMin={clampMin} clampMax={clampMax} />

      {/* ✅ Upgraded Archetype (kept) */}
      {dash?.profile && (
        <div className="rounded-3xl border bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm text-gray-500">Style Archetype</div>
              <div className="mt-2 text-3xl font-bold">{archetypeFromTasteVector(tasteVector)}</div>
              <div className="mt-2 text-sm text-gray-600">
                A headline summary of your strongest signals across era, fit, and fabric.
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border bg-gray-50 px-3 py-1 text-sm">
                Confidence{" "}
                <span className="font-mono font-semibold text-gray-900">
                  {confidenceFromTotals(totalActions, likes)}%
                </span>
              </span>

              {typeof latestDrift === "number" ? (
                <span className={`rounded-full border px-3 py-1 text-sm ${profileModeFromDrift(latestDrift).cls}`}>
                  {profileModeFromDrift(latestDrift).label}{" "}
                  <span className="font-mono font-semibold">({latestDrift}%)</span>
                </span>
              ) : (
                <span className="rounded-full border bg-gray-50 px-3 py-1 text-sm text-gray-700">
                  Drift <span className="font-mono font-semibold">—</span>
                </span>
              )}
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border bg-gray-50 p-5">
              <div className="text-sm font-semibold text-gray-900">Key drivers (Prefer)</div>
              <div className="mt-3 space-y-2 text-sm">
                {[
                  ...topKeysByPrefixFromVector(tasteVector, "era_", 1, "pos"),
                  ...topKeysByPrefixFromVector(tasteVector, "fit_", 1, "pos"),
                  ...topKeysByPrefixFromVector(tasteVector, "wash_", 1, "pos"),
                ]
                  .slice(0, 3)
                  .map((x) => (
                    <div key={x.key} className="flex items-center justify-between gap-3">
                      <span className="text-gray-800">{labelForTasteKey(x.key)}</span>
                      <span className="font-mono text-gray-500">{x.val.toFixed(3)}</span>
                    </div>
                  ))}

                {[
                  ...topKeysByPrefixFromVector(tasteVector, "era_", 1, "pos"),
                  ...topKeysByPrefixFromVector(tasteVector, "fit_", 1, "pos"),
                  ...topKeysByPrefixFromVector(tasteVector, "wash_", 1, "pos"),
                ].length === 0 ? <div className="text-gray-600">No strong “prefer” signals yet.</div> : null}
              </div>
            </div>

            <div className="rounded-2xl border bg-gray-50 p-5">
              <div className="text-sm font-semibold text-gray-900">Guardrails (Avoid)</div>
              <div className="mt-3 space-y-2 text-sm">
                {[
                  ...topKeysByPrefixFromVector(tasteVector, "fit_", 1, "neg"),
                  ...topKeysByPrefixFromVector(tasteVector, "rise_", 1, "neg"),
                  ...topKeysByPrefixFromVector(tasteVector, "wash_", 1, "neg"),
                ]
                  .slice(0, 2)
                  .map((x) => (
                    <div key={x.key} className="flex items-center justify-between gap-3">
                      <span className="text-gray-800">{labelForTasteKey(x.key)}</span>
                      <span className="font-mono text-gray-500">{x.val.toFixed(3)}</span>
                    </div>
                  ))}

                {[
                  ...topKeysByPrefixFromVector(tasteVector, "fit_", 1, "neg"),
                  ...topKeysByPrefixFromVector(tasteVector, "rise_", 1, "neg"),
                  ...topKeysByPrefixFromVector(tasteVector, "wash_", 1, "neg"),
                ].length === 0 ? <div className="text-gray-600">No strong avoidances yet.</div> : null}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ✅ Upgraded Style DNA */}
      <StyleDnaTable tasteVector={tasteVector} clampMin={clampMin} clampMax={clampMax} />

      {/* Taste Health Dashboard */}
      <TasteHealthDashboard clampMin={clampMin} clampMax={clampMax} snapshotLimit={30} />

      {/* Debug-ish empty profile */}
      {dash && dash.profile === null && (
        <div className="rounded-2xl border p-4">
          <div className="font-semibold">No profile returned</div>
          <div className="mt-1 text-sm opacity-70">
            This usually means your <span className="font-mono">profiles</span> row doesn’t exist for this user, or RLS is blocking reads.
          </div>
        </div>
      )}

      {/* ✅ Colored Strong Signals / Avoiding (now with bars) */}
      {dash?.profile && hasAnySignals && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-3xl border bg-white p-6 shadow-sm">
            <div className="mb-4 text-lg font-semibold">Strong Signals</div>

            <div className="space-y-3 text-sm">
              {likes.slice(0, 10).map((x) => {
                const w = Number(x.weight);
                const pct = strengthPctFromWeight(w, clampMin, clampMax);
                return (
                  <div key={x.key} className="space-y-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 truncate text-gray-800">{labelForTasteKey(x.key)}</div>
                      <div className="shrink-0 font-mono text-xs text-gray-500">{w.toFixed(3)}</div>
                    </div>
                    <StrengthBarColored pct={pct} variant="prefer" />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-3xl border bg-white p-6 shadow-sm">
            <div className="mb-4 text-lg font-semibold">Avoiding</div>

            {dislikes.length === 0 ? (
              <div className="text-sm text-gray-500">No strong avoidances yet.</div>
            ) : (
              <div className="space-y-3 text-sm">
                {dislikes.slice(0, 10).map((x) => {
                  const w = Number(x.weight);
                  const pct = strengthPctFromWeight(w, clampMin, clampMax);
                  return (
                    <div key={x.key} className="space-y-1">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 truncate text-gray-800">{labelForTasteKey(x.key)}</div>
                        <div className="shrink-0 font-mono text-xs text-gray-500">{w.toFixed(3)}</div>
                      </div>
                      <StrengthBarColored pct={pct} variant="avoid" />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}













