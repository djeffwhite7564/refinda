"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type VibeAttributes = {
  rise?: string[];
  fit?: string[];
  wash?: string[];
  details?: string[];
};

type StyleVibe = {
  id: string;
  label: string;
  audience: string;
  description: string | null;
  core_jean_styles: string[];
  attributes: VibeAttributes | null;
  why: string[] | null;
};

export default function VibePicker({
  initialVibe,
  vibes = [],
}: {
  initialVibe: string;
  vibes: StyleVibe[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const firstId = vibes.length > 0 ? vibes[0].id : "";
  const [selected, setSelected] = useState(initialVibe || firstId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedVibe = useMemo(
    () => vibes.find((v) => v.id === selected),
    [vibes, selected]
  );

  if (!vibes.length) {
    return (
      <div className="rounded-2xl border border-neutral-200 p-6">
        <p className="text-neutral-600">Loading style vibes…</p>
      </div>
    );
  }

  async function saveAndContinue() {
    if (saving) return;
    setSaving(true);
    setError(null);

    try {
      const { data, error: userErr } = await supabase.auth.getUser();
      const user = data.user;

      if (userErr || !user) {
        router.replace("/login");
        router.refresh();
        return;
      }

      const { error: upErr } = await supabase
        .from("profiles")
        .update({ vibe_default: selected })
        .eq("id", user.id);

      if (upErr) throw upErr;

      router.push("/onboarding");
      router.refresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  const attrs = selectedVibe?.attributes ?? null;

  return (
    <div className="grid gap-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {vibes.map((v) => {
          const active = selected === v.id;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => setSelected(v.id)}
              className={[
                "rounded-2xl border p-5 text-left transition",
                active
                  ? "border-black bg-black text-white"
                  : "border-neutral-200 hover:border-neutral-400",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="text-lg font-bold">{v.label}</div>
                <div className={active ? "text-xs text-white/70" : "text-xs text-neutral-500"}>
                  {v.audience}
                </div>
              </div>

              {v.description && (
                <div className={active ? "mt-2 text-white/80" : "mt-2 text-neutral-600"}>
                  {v.description}
                </div>
              )}

              <div className={active ? "mt-4 text-sm text-white/80" : "mt-4 text-sm text-neutral-600"}>
                <div className="font-semibold">Core jean styles</div>
                <div className="mt-1">
                  {(v.core_jean_styles ?? []).slice(0, 3).join(" • ")}
                  {(v.core_jean_styles ?? []).length > 3 ? " • ..." : ""}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl border border-neutral-200 p-6">
        <div className="text-sm text-neutral-500">Selected vibe</div>
        <div className="mt-1 text-2xl font-bold">{selectedVibe?.label ?? selected}</div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div>
            <div className="text-sm font-semibold">Key attributes</div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-700">
              {(attrs?.rise ?? []).map((x) => <li key={`rise-${x}`}>Rise: {x}</li>)}
              {(attrs?.fit ?? []).map((x) => <li key={`fit-${x}`}>Fit: {x}</li>)}
              {(attrs?.wash ?? []).map((x) => <li key={`wash-${x}`}>Wash: {x}</li>)}
              {(attrs?.details ?? []).map((x) => <li key={`detail-${x}`}>{x}</li>)}
            </ul>
          </div>

          <div>
            <div className="text-sm font-semibold">Why this vibe works</div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-700">
              {(selectedVibe?.why ?? []).map((x) => <li key={`why-${x}`}>{x}</li>)}
            </ul>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-4">
          <button
            onClick={saveAndContinue}
            disabled={saving}
            className="rounded-xl bg-black px-6 py-3 font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Saving..." : "Continue"}
          </button>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  );
}



