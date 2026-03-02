"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  Archetype,
  Fit,
  Rise,
  Wash,
  Stretch,
  BudgetTier,
  DraftProfile,
  InitialProfile,
} from "./types";

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
        "rounded-full border px-3 py-1 text-sm",
        selected ? "border-black bg-black text-white" : "border-gray-300 bg-white text-black",
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

  // ✅ browser client (works in "use client")
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState<DraftProfile>(() => ({
    id: initialProfile.id,

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

      const payload = {
        id: draft.id,
        vibe_default: draft.vibe_default,
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
        .upsert(payload, { onConflict: "id" }); // ✅ explicit conflict key

      if (upsertErr) throw upsertErr;

      router.push("/app/results");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Set your taste</h1>
        <p className="mt-2 text-gray-600">3 quick steps. This becomes your curation memory.</p>
      </div>

      <div className="mb-6 flex gap-2 text-sm text-gray-600">
        <span className={step === 1 ? "font-semibold text-black" : ""}>1. Vibe</span>
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

      {/* Keep your existing step UI here */}
      {/* Make sure your final button calls saveAndFinish */}
      {/* Example: */}
      {/* <button onClick={saveAndFinish} disabled={busy}>Finish</button> */}

      <p className="mt-6 text-sm text-gray-500">Tip: you can re-run this any time. Taste is editable.</p>
    </main>
  );
}

