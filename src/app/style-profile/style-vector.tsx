// src/app/style-profile/style-vector.tsx
// Best-visual version: shows BOTH "Strength" (magnitude) and "Lean" (direction on the clamp range)
// Includes a centered +/- meter for Lean so negatives feel intuitive.

// src/app/style-profile/style-vector.tsx
"use client";

import React from "react";

export type TasteVector = Record<string, number>;

export const STYLE_GROUPS = ["Era", "Fit", "Rise", "Wash", "Fabric"] as const;
export type StyleGroup = (typeof STYLE_GROUPS)[number];

export function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

export function safeRange(min: number, max: number) {
  const r = max - min;
  return r === 0 ? 1 : r;
}

export function labelForTasteKey(key: string) {
  return key
    .replace(/^era_/, "Era: ")
    .replace(/^fit_/, "Fit: ")
    .replace(/^rise_/, "Rise: ")
    .replace(/^wash_/, "Wash: ")
    .replace(/^fabric_/, "Fabric: ")
    .replace(/_/g, " ");
}

export function styleGroupForKey(key: string): StyleGroup | "Other" {
  if (key.startsWith("era_")) return "Era";
  if (key.startsWith("fit_")) return "Fit";
  if (key.startsWith("rise_")) return "Rise";
  if (key.startsWith("wash_")) return "Wash";
  if (key.startsWith("fabric_")) return "Fabric";
  return "Other";
}

// Position within clamp range: min..max => 0..100
function rangePositionPct(v: number, clampMin: number, clampMax: number) {
  const range = safeRange(clampMin, clampMax);
  return Math.round(clamp01((v - clampMin) / range) * 100);
}

// Lean: map v in [-halfRange..+halfRange] => [-100..+100] (clamped)
function signedLeanPct(v: number, clampMin: number, clampMax: number) {
  const halfRange = safeRange(clampMin, clampMax) / 2;
  const raw = halfRange === 0 ? 0 : (v / halfRange) * 100;
  return Math.round(Math.max(-100, Math.min(100, raw)));
}

// Strength: |v| / halfRange => 0..1, curved for nicer visuals
function strengthPct(v: number, clampMin: number, clampMax: number) {
  const halfRange = safeRange(clampMin, clampMax) / 2;
  const linear = halfRange === 0 ? 0 : clamp01(Math.abs(v) / halfRange);
  const curved = Math.sqrt(linear);
  return Math.round(curved * 100);
}

type Direction = "Prefer" | "Avoid" | "Neutral";

// “Prefer / Avoid / Neutral” based on Lean
function directionLabelByRange(v: number, clampMin: number, clampMax: number): { label: Direction; tone: string } {
  const b = signedLeanPct(v, clampMin, clampMax);
  if (b >= 15) return { label: "Prefer", tone: "text-green-700" };
  if (b <= -15) return { label: "Avoid", tone: "text-red-700" };
  return { label: "Neutral", tone: "text-gray-600" };
}

/* ===================== Colored bars (by direction) ===================== */

function barFill(direction: Direction) {
  if (direction === "Prefer") return "bg-emerald-600";
  if (direction === "Avoid") return "bg-rose-600";
  return "bg-gray-600";
}

// Always neutral track (premium / less “pastel dashboard”)
function barTrack() {
  return "bg-gray-200";
}

// Keep center tick neutral too (clean + consistent)
function centerTick() {
  return "bg-gray-500/40";
}

function Meter({ pct, direction }: { pct: number; direction: Direction }) {
  const p = clamp01(pct / 100) * 100;
  return (
    <div className={`h-2 w-full rounded-full ${barTrack()}`} aria-label={`Strength ${Math.round(p)}%`}>
      <div
        className={`h-2 rounded-full ${barFill(direction)} transition-all duration-500 ease-out`}
        style={{ width: `${p}%` }}
      />
    </div>
  );
}

/**
 * Centered lean bar:
 * 0% = far left (strong avoid)
 * 50% = neutral
 * 100% = far right (strong prefer)
 */
function CenterLeanBar({ valuePct, direction }: { valuePct: number; direction: Direction }) {
  const pct = clamp01(valuePct / 100) * 100;
  const isRight = pct >= 50;

  return (
    <div className={`relative h-3 w-full rounded-full ${barTrack()}`} aria-label={`Lean position ${Math.round(pct)}%`}>
      <div className={`absolute left-1/2 top-0 h-3 w-[2px] -translate-x-1/2 ${centerTick()}`} />

      <div
        className={`absolute top-0 h-3 rounded-full ${barFill(direction)} transition-all duration-500`}
        style={{
          left: isRight ? "50%" : `${pct}%`,
          width: isRight ? `${pct - 50}%` : `${50 - pct}%`,
        }}
      />

      <div
        className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-gray-300 bg-white shadow-sm"
        style={{ left: `${pct}%` }}
        aria-hidden
      />
    </div>
  );
}

/* ============================ Other helpers ============================ */

function topByAbs(items: { key: string; v: number }[]) {
  if (items.length === 0) return null;
  return [...items].sort((a, b) => Math.abs(b.v) - Math.abs(a.v))[0];
}

function topNWithinGroup(items: { key: string; v: number }[], n: number, dir: "pos" | "neg") {
  const filtered = dir === "pos" ? items.filter((x) => x.v > 0) : items.filter((x) => x.v < 0);
  filtered.sort((a, b) => (dir === "pos" ? b.v - a.v : a.v - b.v));
  return filtered.slice(0, n);
}

function StyleSignalsHelp({ clampMin, clampMax }: { clampMin: number; clampMax: number }) {
  const min = Math.min(clampMin, clampMax);
  const max = Math.max(clampMin, clampMax);
  const range = safeRange(min, max);
  const halfRange = range / 2;

  return (
    <div className="mt-3 rounded-2xl border bg-gray-50 p-4 text-sm text-gray-700">
      <div className="font-semibold text-gray-900">How to read these metrics</div>

      <div className="mt-3 space-y-3">
        <div>
          <div className="font-medium">Raw</div>
          <div>The learned weight for the top signal in this category. Positive = preference. Negative = avoidance.</div>
          <div className="mt-1 font-mono text-xs text-gray-500">Example: Raw = +6.356 (strong preference)</div>
        </div>

        <div>
          <div className="font-medium">Lean</div>
          <div>
            Direction on a centered scale from <span className="font-mono">-100%</span> (avoid) to{" "}
            <span className="font-mono">+100%</span> (prefer), normalized by your clamp range.
          </div>
          <div className="mt-1 font-mono text-xs text-gray-500">
            Lean% = clamp( Raw / {halfRange.toFixed(2)} × 100 ) where {halfRange.toFixed(2)} = (Range/2)
          </div>
        </div>

        <div>
          <div className="font-medium">Strength</div>
          <div>Magnitude only (ignores direction). Higher means the signal is stronger / more decisive.</div>
          <div className="mt-1 font-mono text-xs text-gray-500">
            Strength% = sqrt( clamp01( |Raw| / {halfRange.toFixed(2)} ) ) × 100
          </div>
        </div>

        <div>
          <div className="font-medium">Position</div>
          <div>Where the raw value sits inside your configured clamp range.</div>
          <div className="mt-1 font-mono text-xs text-gray-500">
            Position% = (Raw − {min}) / ({max} − {min}) × 100
          </div>
        </div>
      </div>
    </div>
  );
}

export default function StyleVector({
  tasteVector,
  clampMin = -30,
  clampMax = 30,
}: {
  tasteVector: TasteVector | null;
  clampMin?: number;
  clampMax?: number;
}) {
  if (!tasteVector) return null;

  const min = Math.min(clampMin, clampMax);
  const max = Math.max(clampMin, clampMax);
  const halfRange = safeRange(min, max) / 2;

  const entries = Object.entries(tasteVector)
    .map(([key, raw]) => ({ key, v: Number(raw), group: styleGroupForKey(key) }))
    .filter((e) => Number.isFinite(e.v) && e.group !== "Other");

  const groupCards = STYLE_GROUPS.map((g) => {
    const items = entries.filter((e) => e.group === g);
    const top = topByAbs(items);
    if (!top) return null;

    const dir = directionLabelByRange(top.v, min, max);

    // centered bar expects 0..100, where 50 is neutral
    const leanCentered = Math.round(clamp01((top.v + halfRange) / (2 * halfRange)) * 100);

    return {
      group: g,
      topKey: top.key,
      topV: top.v,
      dirLabel: dir.label,
      dirTone: dir.tone,
      strength: strengthPct(top.v, min, max),
      leanSigned: signedLeanPct(top.v, min, max),
      leanCentered,
      position: rangePositionPct(top.v, min, max),
      topPos: topNWithinGroup(items, 3, "pos"),
      topNeg: topNWithinGroup(items, 3, "neg"),
    };
  }).filter((x): x is NonNullable<typeof x> => x !== null);

  if (groupCards.length === 0) return null;

  return (
    <section className="rounded-3xl border bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold">Style Signals</div>
          <div className="mt-1 text-sm text-gray-600">
            Each card shows your strongest signal per category, plus <span className="font-medium">Strength</span>{" "}
            (magnitude) and <span className="font-medium">Lean</span> (direction).
          </div>
        </div>
        <div className="text-xs text-gray-500">
          Clamp range: <span className="font-mono">{min}…{max}</span>
        </div>
      </div>

      <details className="mt-4">
        <summary className="cursor-pointer select-none text-sm text-gray-600 hover:text-gray-900">
          How to read these metrics
        </summary>
        <StyleSignalsHelp clampMin={min} clampMax={max} />
      </details>

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        {groupCards.map((g) => (
          <div key={g.group} className="rounded-2xl border bg-gray-50 p-5">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-gray-900">{g.group}</div>
              <div className={`text-xs font-semibold ${g.dirTone}`}>{g.dirLabel}</div>
            </div>

            <div className="mt-2 text-sm text-gray-800">{labelForTasteKey(g.topKey)}</div>

            {/* Top metrics row */}
            <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
              <div className="rounded-xl border bg-white p-3">
                <div className="text-gray-500">Raw</div>
                <div className="mt-1 font-mono font-semibold text-gray-900">{g.topV.toFixed(3)}</div>
              </div>

              <div className="rounded-xl border bg-white p-3">
                <div className="text-gray-500">Lean</div>
                <div className="mt-1 font-mono font-semibold text-gray-900">
                  {g.leanSigned > 0 ? "+" : ""}
                  {g.leanSigned}%
                </div>
              </div>

              <div className="rounded-xl border bg-white p-3">
                <div className="text-gray-500">Position</div>
                <div className="mt-1 font-mono font-semibold text-gray-900">{g.position}%</div>
              </div>
            </div>

            {/* Strength */}
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-xs text-gray-600">
                <span>Strength</span>
                <span className="font-semibold">{g.strength}%</span>
              </div>
              <Meter pct={g.strength} direction={g.dirLabel} />
            </div>

            {/* Lean centered bar */}
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-xs text-gray-600">
                <span>Avoid</span>
                <span className="text-gray-500">Neutral</span>
                <span>Prefer</span>
              </div>
              <CenterLeanBar valuePct={g.leanCentered} direction={g.dirLabel} />
            </div>

            {/* Top signals inside group */}
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-xl border bg-white p-3">
                <div className="text-xs font-semibold text-gray-700">Top positives</div>
                <div className="mt-2 space-y-1 text-xs">
                  {g.topPos.length === 0 ? (
                    <div className="text-gray-400">None</div>
                  ) : (
                    g.topPos.map((x) => (
                      <div key={x.key} className="flex justify-between gap-2">
                        <span className="text-gray-700">{labelForTasteKey(x.key)}</span>
                        <span className="font-mono text-gray-500">{x.v.toFixed(3)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-xl border bg-white p-3">
                <div className="text-xs font-semibold text-gray-700">Top negatives</div>
                <div className="mt-2 space-y-1 text-xs">
                  {g.topNeg.length === 0 ? (
                    <div className="text-gray-400">None</div>
                  ) : (
                    g.topNeg.map((x) => (
                      <div key={x.key} className="flex justify-between gap-2">
                        <span className="text-gray-700">{labelForTasteKey(x.key)}</span>
                        <span className="font-mono text-gray-500">{x.v.toFixed(3)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}







