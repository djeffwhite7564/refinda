"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const JEAN_STYLES_V1 = [
  "Straight-leg",
  "Relaxed straight",
  "Baggy / skater",
  "Low-rise straight",
  "Cargo denim",
  "Subtle flare",
  "Barrel (soft)",
  "Slim-straight",
  "High-rise comfort straight",
] as const;

type JeanStyleV1 = (typeof JEAN_STYLES_V1)[number];

const FIT_PREFS = ["Relaxed", "Straight", "Slim-straight", "Baggy"] as const;
type FitPref = (typeof FIT_PREFS)[number];

type FitInitial = {
  waist: number | null;
  inseam: number | null;
  fit_preference: FitPref | null;
  favorite_celebrities: string[] | null;
  jean_style_preferences: JeanStyleV1[] | null;
};

type CelebrityLook = {
  notes: string;
  links: unknown[];
  tags: string[];
};

export default function FitForm({ initial }: { initial: FitInitial }) {
  const router = useRouter();

  // ✅ browser client (works in "use client")
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [waist, setWaist] = useState(initial.waist?.toString() ?? "");
  const [inseam, setInseam] = useState(initial.inseam?.toString() ?? "");
  const [fitPreference, setFitPreference] = useState<FitPref>(
    initial.fit_preference ?? "Relaxed"
  );

  // comma-separated input for MVP simplicity
  const [celebs, setCelebs] = useState((initial.favorite_celebrities ?? []).join(", "));

  const [stylePrefs, setStylePrefs] = useState<JeanStyleV1[]>(
    initial.jean_style_preferences?.length
      ? initial.jean_style_preferences
      : ["Straight-leg", "Relaxed straight"]
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleStyle(style: JeanStyleV1) {
    setStylePrefs((prev) =>
      prev.includes(style) ? prev.filter((s) => s !== style) : [...prev, style]
    );
  }

  function parseNumberOrNull(v: string): number | null {
    const t = v.trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }

  function parseCelebs(raw: string): string[] {
    const items = raw
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);

    // Dedupe while preserving original casing of first occurrence
    const seen = new Set<string>();
    const out: string[] = [];
    for (const c of items) {
      const key = c.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(c);
    }
    return out;
  }

  async function saveAndContinue() {
    if (saving) return;
    setSaving(true);
    setError(null);

    try {
      const { data, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) throw sessErr;

      const user = data.session?.user;
      if (!user) {
        router.push("/login");
        return;
      }

      const waistNum = parseNumberOrNull(waist);
      if (waist.trim() && waistNum === null) throw new Error("Waist must be a number.");

      const inseamNum = parseNumberOrNull(inseam);
      if (inseam.trim() && inseamNum === null) throw new Error("Inseam must be a number.");

      const celebList = parseCelebs(celebs);

      const lookMap: Record<string, CelebrityLook> = Object.fromEntries(
        celebList.map((c) => [c, { notes: "", links: [], tags: [] }])
      );

      const payload = {
        waist: waistNum,
        inseam: inseamNum,
        fit_preference: fitPreference,
        favorite_celebrities: celebList,
        celebrity_look_map: lookMap,
        jean_style_preferences: stylePrefs,
      };

      const { error: upErr } = await supabase
        .from("profiles")
        .update(payload)
        .eq("id", user.id);

      if (upErr) throw upErr;

      router.push("/results");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-sm font-semibold">Waist</label>
          <input
            className="mt-2 w-full rounded-xl border px-4 py-3"
            placeholder="e.g., 30"
            inputMode="numeric"
            value={waist}
            onChange={(e) => setWaist(e.target.value)}
          />
        </div>

        <div>
          <label className="text-sm font-semibold">Inseam</label>
          <input
            className="mt-2 w-full rounded-xl border px-4 py-3"
            placeholder="e.g., 32"
            inputMode="numeric"
            value={inseam}
            onChange={(e) => setInseam(e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className="text-sm font-semibold">Fit preference</label>
        <select
          className="mt-2 w-full rounded-xl border px-4 py-3"
          value={fitPreference}
          onChange={(e) => setFitPreference(e.target.value as FitPref)}
        >
          {FIT_PREFS.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
        <p className="mt-2 text-sm text-neutral-600">
          This guides silhouette matching when we generate your “exact look” picks.
        </p>
      </div>

      <div>
        <label className="text-sm font-semibold">Favorite celebrity anchors (comma-separated)</label>
        <input
          className="mt-2 w-full rounded-xl border px-4 py-3"
          placeholder='e.g., "Hailey Bieber, Bella Hadid, Rihanna"'
          value={celebs}
          onChange={(e) => setCelebs(e.target.value)}
        />
        <p className="mt-2 text-sm text-neutral-600">
          We’ll use these to build your celebrity look map (multiple is great).
        </p>
      </div>

      <div>
        <div className="text-sm font-semibold">Jean style preferences (V1)</div>
        <p className="mt-2 text-sm text-neutral-600">
          Keep it simple — these are the only styles V1 needs.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          {JEAN_STYLES_V1.map((s) => {
            const active = stylePrefs.includes(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleStyle(s)}
                className={[
                  "rounded-full border px-4 py-2 text-sm transition",
                  active ? "border-black bg-black text-white" : "border-neutral-300 hover:border-neutral-500",
                ].join(" ")}
              >
                {s}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={saveAndContinue}
          disabled={saving}
          className="rounded-xl bg-black px-6 py-3 font-semibold text-white disabled:opacity-60"
        >
          {saving ? "Saving..." : "Continue to Results"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}




