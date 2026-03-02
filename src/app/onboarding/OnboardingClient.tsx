// src/app/onboarding/OnboardingClient.tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Archetype, Fit, Rise, Wash, Stretch, BudgetTier, DraftProfile, InitialProfile } from "./types";

const ARCHETYPES: Archetype[] = [
  "90s supermodel",
  "quiet luxury",
  "western americana",
  "street heritage",
  "vintage workwear",
  "minimal clean",
  "rock & roll",
];

const FITS: Fit[] = ["Straight", "Relaxed", "Tapered", "Slim", "Wide", "Bootcut"];
const RISE: Rise[] = ["High", "Mid", "Low"];
const WASH: Wash[] = ["Light wash", "Mid wash", "Dark rinse", "Black", "Raw denim"];
const STRETCH: Stretch[] = ["Rigid", "Some stretch", "Stretch"];
const BUDGET: BudgetTier[] = ["under_100", "under_150", "invest"];

function Chip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-full border px-3 py-1 text-sm transition",
        selected
          ? "border-black bg-black text-white"
          : "border-gray-300 bg-white text-black hover:bg-gray-50",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function parseNumberOrNull(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseCommaList(raw: string): string[] {
  const items = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const out: string[] = [];

  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out;
}

function toggleInArray<T extends string>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value];
}

export default function OnboardingClient({ initialProfile }: { initialProfile: InitialProfile }) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [avoidBrandsRaw, setAvoidBrandsRaw] = useState<string>(
    (initialProfile.avoid_brands ?? []).join(", ")
  );
  const [jeanStylesRaw, setJeanStylesRaw] = useState<string>(
    (initialProfile.jean_style_preferences ?? []).join(", ")
  );

  const [draft, setDraft] = useState<DraftProfile>(() => ({
    id: initialProfile.id,

    // VIBE is set on /vibe, onboarding does NOT ask for it anymore.
    // We keep the field in state for type compatibility, but do not write it here.
    vibe_default: initialProfile.vibe_default ?? "90s supermodel",

    aesthetic_archetype: initialProfile.aesthetic_archetype ?? "90s supermodel",

    fit_preference: initialProfile.fit_preference ?? "Straight",
    rise_preference: initialProfile.rise_preference ?? "Mid",
    wash_preference: initialProfile.wash_preference ?? [],
    stretch_preference: initialProfile.stretch_preference ?? "Rigid",

    waist: initialProfile.waist ?? 32,
    inseam: initialProfile.inseam ?? 32,

    jean_style_preferences: initialProfile.jean_style_preferences ?? [],
    budget_tier: initialProfile.budget_tier ?? "under_150",
    avoid_brands: initialProfile.avoid_brands ?? [],
  }));

  function nextStep() {
    setStep((s) => (s === 3 ? 3 : ((s + 1) as 1 | 2 | 3)));
  }

  function prevStep() {
    if (step === 1) {
      router.push("/vibe");
      return;
  }
  setStep((s) => ((s - 1) as 1 | 2 | 3));
}

  async function saveAndFinish() {
    if (busy) return;

    setBusy(true);
    setError(null);

    try {
      const waistNum = parseNumberOrNull(draft.waist);
      const inseamNum = parseNumberOrNull(draft.inseam);

      if (String(draft.waist ?? "").trim() && waistNum === null) {
        throw new Error("Waist must be a valid number.");
      }
      if (String(draft.inseam ?? "").trim() && inseamNum === null) {
        throw new Error("Inseam must be a valid number.");
      }

      // Onboarding owns archetype + fit + constraints.
      // Vibe is handled separately on /vibe and should not be overwritten here.
      const payload = {
        id: draft.id,
        aesthetic_archetype: draft.aesthetic_archetype,

        fit_preference: draft.fit_preference,
        rise_preference: draft.rise_preference,
        wash_preference: draft.wash_preference,
        stretch_preference: draft.stretch_preference,

        waist: waistNum,
        inseam: inseamNum,

        jean_style_preferences: draft.jean_style_preferences,
        budget_tier: draft.budget_tier,
        avoid_brands: draft.avoid_brands,
      };

      const { error: upsertErr } = await supabase
        .from("profiles")
        .upsert(payload, { onConflict: "id" });

      if (upsertErr) throw upsertErr;

      router.push("/results");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const stepTitle =
    step === 1 ? "Aesthetic Type" : step === 2 ? "Fit" : "Constraints";

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Set your taste</h1>
        <p className="mt-2 text-gray-600">
          3 quick steps. This becomes your curation memory.
        </p>
      </div>

      <div className="mb-8 flex gap-2 text-sm text-gray-600">
        <span className={step === 1 ? "font-semibold text-black" : ""}>1. Aesthetic</span>
        <span>→</span>
        <span className={step === 2 ? "font-semibold text-black" : ""}>2. Fit</span>
        <span>→</span>
        <span className={step === 3 ? "font-semibold text-black" : ""}>3. Constraints</span>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* STEP 1: Aesthetic Type */}
      {step === 1 && (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Pick your aesthetic type</h2>
            <p className="mt-1 text-sm text-gray-600">
              This sets the “lens” for your recommendations (era, silhouettes, details).
              You can change it anytime.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {ARCHETYPES.map((a) => (
              <Chip
                key={a}
                label={a}
                selected={draft.aesthetic_archetype === a}
                onClick={() => setDraft((d) => ({ ...d, aesthetic_archetype: a }))}
              />
            ))}
          </div>

          <div className="rounded-lg border bg-gray-50 p-4 text-sm text-gray-700">
            <div className="font-medium mb-1">What this does</div>
            <ul className="list-disc pl-5 space-y-1">
              <li>Anchors your default “style direction”</li>
              <li>Improves celebrity look matching + filtering</li>
              <li>Helps the Taste Engine learn faster</li>
            </ul>
          </div>
        </section>
      )}

      {/* STEP 2: Fit */}
      {step === 2 && (
        <section className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold">Fit preferences</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {FITS.map((f) => (
                <Chip
                  key={f}
                  label={f}
                  selected={draft.fit_preference === f}
                  onClick={() => setDraft((d) => ({ ...d, fit_preference: f }))}
                />
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold">Rise</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {RISE.map((r) => (
                <Chip
                  key={r}
                  label={r}
                  selected={draft.rise_preference === r}
                  onClick={() => setDraft((d) => ({ ...d, rise_preference: r }))}
                />
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold">Wash</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {WASH.map((w) => (
                <Chip
                  key={w}
                  label={w}
                  selected={draft.wash_preference.includes(w)}
                  onClick={() =>
                    setDraft((d) => ({ ...d, wash_preference: toggleInArray(d.wash_preference, w) }))
                  }
                />
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold">Stretch</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {STRETCH.map((s) => (
                <Chip
                  key={s}
                  label={s}
                  selected={draft.stretch_preference === s}
                  onClick={() => setDraft((d) => ({ ...d, stretch_preference: s }))}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="space-y-1">
              <div className="text-sm font-medium">Waist</div>
              <input
                className="w-full rounded-lg border px-3 py-2 text-sm"
                value={draft.waist ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, waist: e.target.value }))}
                inputMode="numeric"
              />
            </label>

            <label className="space-y-1">
              <div className="text-sm font-medium">Inseam</div>
              <input
                className="w-full rounded-lg border px-3 py-2 text-sm"
                value={draft.inseam ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, inseam: e.target.value }))}
                inputMode="numeric"
              />
            </label>
          </div>
        </section>
      )}

      {/* STEP 3: Constraints */}
      {step === 3 && (
        <section className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold">Constraints</h2>
            <p className="mt-1 text-sm text-gray-600">
              Keep results focused (price, brands, styles). Optional — you can edit later.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold">Budget tier</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {BUDGET.map((b) => (
                <Chip
                  key={b}
                  label={b.replaceAll("_", " ")}
                  selected={draft.budget_tier === b}
                  onClick={() => setDraft((d) => ({ ...d, budget_tier: b }))}
                />
              ))}
            </div>
          </div>

          <label className="space-y-1 block">
            <div className="text-sm font-medium">Preferred jean styles (comma-separated)</div>
            <input
              className="w-full rounded-lg border px-3 py-2 text-sm"
              value={jeanStylesRaw}
              onChange={(e) => {
                const raw = e.target.value;
                setJeanStylesRaw(raw);
                setDraft((d) => ({ ...d, jean_style_preferences: parseCommaList(raw) }));
              }}
              placeholder="straight leg, relaxed, carpenter, …"
            />
          </label>

          <label className="space-y-1 block">
            <div className="text-sm font-medium">Avoid brands (comma-separated)</div>
            <input
              className="w-full rounded-lg border px-3 py-2 text-sm"
              value={avoidBrandsRaw}
              onChange={(e) => {
                const raw = e.target.value;
                setAvoidBrandsRaw(raw);
                setDraft((d) => ({ ...d, avoid_brands: parseCommaList(raw) }));
              }}
              placeholder="brand1, brand2, …"
            />
          </label>
        </section>
      )}

      {/* Controls */}
        <div className="mt-10 flex items-center justify-between">
        <button
          type="button"
          onClick={prevStep}
          disabled={busy}
          className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50"
        >
          {step === 1 ? "Back to Vibe" : "Back"}
        </button>

        {step < 3 ? (
          <button
            type="button"
            onClick={nextStep}
            disabled={busy}
            className="rounded-lg bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            onClick={saveAndFinish}
            disabled={busy}
            className="rounded-lg bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {busy ? "Saving…" : "Finish"}
          </button>
        )}
      </div>

      <p className="mt-6 text-sm text-gray-500">
        Tip: you can re-run this any time. Taste is editable.
      </p>
    </main>
  );
}
