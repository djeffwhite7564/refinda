// src/app/results/results-client.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type DenimRec = {
  brand: string;
  model: string;
  era_inspiration: string;
  fit: string;
  rise: string;
  wash: string;
  stretch_level: string;
  why_each_pick: string;
  search_queries: string[];

  // ✅ new fields from recommend-jeans
  anchor_look_id?: string;
  anchor_reason?: string;

  confidence_score?: number; // 0..1
  confidence_label?: "strong" | "good" | "bridge";
};

type TasteItem = { key: string; weight: number };

type DebugOpenAiSnapshot = {
  model: string;
  vibe: string | null;
  vibe_profile_label: string | null;
  allowed_fits: string[] | null;
  allowed_rises: string[] | null;
  size: string | null;
  budget: number | null;

  taste_vector_raw?: Record<string, number> | null;
  taste_vector_pretty?: {
    clamp?: { min: number; max: number } | null;
    totals?: { keys: number; positives: number; negatives: number } | null;
    groups?: unknown;
    top_positive?: TasteItem[];
    top_negative?: TasteItem[];
  } | null;

  taste_summary: unknown;

  top_celebrity_looks_count?: number | null;
  top_celebrity_looks_preview?: unknown[] | null;

  system_preview: string;
  user_preview: string;
};

type AnchorIndexItem = {
  look_id: string;
  celebrity_name: string;
  image_url: string | null;
  display_asset_id: string | null;
};

type Output = {
  ok: boolean;
  ai_used: boolean;
  ai_error: string | null;
  run_id?: string | null;
  user_id: string;
  input: { vibe?: string; size?: string; budget?: number };
  debug_openai?: DebugOpenAiSnapshot | null;
  recommendations?: DenimRec[];

  // ✅ always returned (recommended)
  anchor_index?: Record<string, AnchorIndexItem> | null;

  // debug-only (may be null)
  anchor_looks?: unknown[] | null;
};

type FeedbackAction = "save" | "not_for_me" | "bought";

type ProfileLite = {
  vibe_default: string | null;
  waist: number | null;
  inseam: number | null;
};

type Toast = { id: number; text: string };

let sessionReadPromise: Promise<string> | null = null;

async function getAccessTokenSafe(
  supabase: ReturnType<typeof createSupabaseBrowserClient>
): Promise<string> {
  if (!sessionReadPromise) {
    sessionReadPromise = (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;

      const token = data.session?.access_token;
      if (!token) throw new Error("No session. Please log in first.");
      return token;
    })().finally(() => {
      sessionReadPromise = null;
    });
  }
  return sessionReadPromise;
}

async function callEdgeFunction<T>(fnName: string, token: string, body: unknown): Promise<T> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!base) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!anon) throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");

  const url = `${base}/functions/v1/${fnName}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anon,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`${fnName} HTTP ${res.status}: ${text}`);

  return JSON.parse(text) as T;
}

function isFiniteNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

function computeSize(waist: number | null, inseam: number | null): string {
  if (!waist || !inseam) return "";
  return `${waist}x${inseam}`;
}

function pct(score?: number) {
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  return Math.round(score * 100);
}

function confidencePercentChip(score?: number): { text: string; className: string } | null {
  const p = pct(score);
  if (p === null) return null;

  const base = "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium";

  if (p >= 80) {
    return {
      text: `${p}% match`,
      className: `${base} bg-emerald-50 border-emerald-200 text-emerald-800`,
    };
  }
  if (p >= 65) {
    return {
      text: `${p}% match`,
      className: `${base} bg-blue-50 border-blue-200 text-blue-800`,
    };
  }
  return {
    text: `${p}% match`,
    className: `${base} bg-amber-50 border-amber-200 text-amber-900`,
    };
}

function pickTypeChip(
  label?: DenimRec["confidence_label"]
): { text: string; className: string } | null {
  if (!label) return null;

  const base = "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium";

  if (label === "strong") {
    return { text: "Strong pick", className: `${base} bg-gray-900 border-gray-900 text-white` };
  }
  if (label === "good") {
    return { text: "Good pick", className: `${base} bg-gray-50 border-gray-200 text-gray-800` };
  }
  return { text: "Bridge pick", className: `${base} bg-amber-50 border-amber-200 text-amber-900` };
}

function oneLine(s?: string) {
  if (!s) return "";
  return s.replace(/\s+/g, " ").trim();
}

function titleCase(s: string) {
  return s
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function prettyFromKey(raw?: string) {
  const s = (raw ?? "").trim();
  if (!s) return "";

  const lower = s.toLowerCase();

  const map: Record<string, string> = {
    // era
    era_70s: "70s inspired",
    era_80s: "80s inspired",
    era_90s: "90s inspired",
    era_y2k: "Y2K inspired",
    era_modern: "Modern inspired",
    era_vintage: "Vintage inspired",

    // fit
    fit_straight: "Straight",
    fit_relaxed: "Relaxed",
    fit_baggy: "Baggy",
    fit_slim: "Slim",
    fit_flare: "Flare",
    fit_bootcut: "Bootcut",

    // rise
    rise_low: "Low rise",
    rise_mid: "Mid rise",
    rise_high: "High rise",

    // wash
    wash_light: "Light wash",
    wash_medium: "Medium wash",
    wash_dark: "Dark wash",
    wash_black: "Black wash",
    wash_off_black: "Off-black wash",

    // fabric
    fabric_rigid: "Rigid (non-stretch)",
    fabric_stretch: "Stretch",
    fabric_soft: "Soft denim",
  };

  if (map[lower]) return map[lower];

  const m = lower.match(/^(era|fit|rise|wash|fabric)_(.+)$/);
  if (m) {
    const group = m[1];
    const val = m[2].replace(/_/g, " ").trim();

    if (group === "era") return `${val.toUpperCase()} inspired`;
    if (group === "rise") return `${titleCase(val)} rise`;
    if (group === "wash") return `${titleCase(val)} wash`;
    if (group === "fabric") return titleCase(val);
    if (group === "fit") return titleCase(val);
  }

  return s;
}

function prettyFit(raw?: string) {
  return prettyFromKey(raw);
}
function prettyRise(raw?: string) {
  return prettyFromKey(raw);
}
function prettyWash(raw?: string) {
  return prettyFromKey(raw);
}
function prettyStretch(raw?: string) {
  const s = (raw ?? "").trim();
  if (!s) return "";

  const lower = s.toLowerCase();

  if (lower === "rigid" || lower === "non-stretch" || lower === "no stretch")
    return "Rigid (non-stretch)";
  if (lower === "stretch") return "Stretch";
  if (lower === "low") return "Low stretch";
  if (lower === "medium") return "Medium stretch";
  if (lower === "high") return "High stretch";

  return titleCase(s);
}

function prettyEraLine(raw?: string) {
  return prettyFromKey(raw);
}

function actionToastText(action: FeedbackAction): string {
  if (action === "save") return "Saved — we’ll show you more like this.";
  if (action === "not_for_me") return "Noted — we’ll avoid this direction.";
  return "Nice — purchases teach the fastest.";
}

export default function ResultsClient() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [output, setOutput] = useState<Output | null>(null);
  const [runId, setRunId] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ✅ toast with nonce
  const [toast, setToast] = useState<Toast | null>(null);

  const [feedbackByIndex, setFeedbackByIndex] = useState<Record<number, FeedbackAction>>({});

  // start blank; hydrate from profile
  const [vibe, setVibe] = useState<string>("");
  const [size, setSize] = useState<string>("");
  const [budget, setBudget] = useState<number>(150);
  const [debug, setDebug] = useState<boolean>(false);

  const [profileLoaded, setProfileLoaded] = useState(false);
  const didHydrateInputs = useRef(false);

  const recs = output?.recommendations ?? [];
  const anchorIndex = output?.anchor_index ?? null;

  // ✅ auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast?.id]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("vibe_default, waist, inseam")
          .maybeSingle<ProfileLite>();

        if (error) throw error;
        if (!mounted) return;

        if (!didHydrateInputs.current) {
          const nextVibe = data?.vibe_default ?? "";
          const nextSize = computeSize(data?.waist ?? null, data?.inseam ?? null);

          setVibe((prev) => (prev.trim() ? prev : nextVibe));
          setSize((prev) => (prev.trim() ? prev : nextSize));

          didHydrateInputs.current = true;
        }
      } catch {
        // ignore (user can type)
      } finally {
        if (mounted) setProfileLoaded(true);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [supabase]);

  async function runTest() {
    setBusy(true);
    setError(null);
    setOutput(null);
    setRunId(null);
    setFeedbackByIndex({});

    try {
      const token = await getAccessTokenSafe(supabase);

      // If vibe is blank, do NOT send it (falls back to profiles.vibe_default)
      const payload: { vibe?: string; size?: string; budget?: number; debug?: boolean } = { debug };

      const vibeTrim = vibe.trim();
      const sizeTrim = size.trim();

      if (vibeTrim) payload.vibe = vibeTrim;
      if (sizeTrim) payload.size = sizeTrim;
      if (isFiniteNumber(budget)) payload.budget = budget;

      const json = await callEdgeFunction<Output>("recommend-jeans", token, payload);

      setOutput(json);
      if (json.run_id) setRunId(json.run_id);

      // mirror what the function actually used
      const usedVibe = json.input?.vibe;
      const usedSize = json.input?.size;
      const usedBudget = json.input?.budget;

      if (typeof usedVibe === "string" && usedVibe.trim()) setVibe(usedVibe);
      if (typeof usedSize === "string" && usedSize.trim()) setSize(usedSize);
      if (typeof usedBudget === "number" && Number.isFinite(usedBudget)) setBudget(usedBudget);

      setToast({ id: Date.now(), text: "New picks generated." });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function setFeedback(recIndex: number, nextAction: FeedbackAction) {
    if (feedbackBusy) return;
    setFeedbackBusy(true);
    setError(null);

    try {
      const token = await getAccessTokenSafe(supabase);

      const rid = runId ?? output?.run_id ?? null;
      const uid = output?.user_id ?? null;

      if (!rid) throw new Error("Missing run_id. Call the Edge Function first.");
      if (!uid) throw new Error("Missing user_id. Call the Edge Function first.");

      const current = feedbackByIndex[recIndex];
      const isTogglingOff = current === nextAction;

      if (isTogglingOff) {
        const { error: delErr } = await supabase
          .from("recommendation_feedback")
          .delete()
          .eq("run_id", rid)
          .eq("user_id", uid)
          .eq("rec_index", recIndex)
          .eq("action", nextAction);

        if (delErr) throw delErr;

        setFeedbackByIndex((m) => {
          const copy = { ...m };
          delete copy[recIndex];
          return copy;
        });

        setToast({ id: Date.now(), text: "Undone." });
        return;
      }

      const { error: upErr } = await supabase
        .from("recommendation_feedback")
        .upsert(
          { run_id: rid, user_id: uid, rec_index: recIndex, action: nextAction },
          { onConflict: "run_id,user_id,rec_index,action" }
        );

      if (upErr) throw upErr;

      setFeedbackByIndex((m) => ({ ...m, [recIndex]: nextAction }));

      // ✅ show fly-over immediately (guaranteed rerender via nonce)
      setToast({ id: Date.now(), text: actionToastText(nextAction) });

      // then update taste (if this fails, UI still shows feedback)
      await callEdgeFunction("taste-update", token, {
        run_id: rid,
        rec_index: recIndex,
        action: nextAction,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setFeedbackBusy(false);
    }
  }

  function btnClass(selected: boolean, selectedClass: string) {
    return `rounded-xl px-3 py-2 text-sm transition border disabled:opacity-60 ${
      selected ? selectedClass : "bg-white hover:bg-gray-100 text-gray-900"
    }`;
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      {/* ✅ Toast (fly-over) */}
      {toast && (
        <div
          aria-live="polite"
          className="fixed left-1/2 top-6 z-[9999] -translate-x-1/2 rounded-full border bg-white px-4 py-2 text-sm shadow-lg"
        >
          {toast.text}
        </div>
      )}

      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Search Picks</h1>
          <p className="mt-2 text-gray-600">Curated to Your Vibe. Denim That Gets You!</p>
        </div>

        <button
          onClick={runTest}
          disabled={busy}
          className="rounded-xl bg-black px-4 py-2 text-white disabled:opacity-60"
        >
          {busy ? "Calling..." : "Generate picks"}
        </button>
      </div>

      {/* Controls */}
      <div className="mt-6 rounded-2xl border bg-white p-4">
        <div className="mb-3 text-xs text-gray-500">
          {profileLoaded ? (
            <>
              Inputs hydrate from <code className="rounded bg-gray-100 px-1">profiles</code>. Leave
              vibe blank to use{" "}
              <code className="rounded bg-gray-100 px-1">profiles.vibe_default</code>.
            </>
          ) : (
            "Loading profile defaults…"
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="text-sm">
            <div className="mb-1 text-gray-600">Vibe (style_vibes.id)</div>
            <input
              className="w-full rounded-xl border px-3 py-2"
              value={vibe}
              onChange={(e) => setVibe(e.target.value)}
              placeholder="(blank = use profile default)"
            />
          </label>

          <label className="text-sm">
            <div className="mb-1 text-gray-600">Size</div>
            <input
              className="w-full rounded-xl border px-3 py-2"
              value={size}
              onChange={(e) => setSize(e.target.value)}
              placeholder="(optional)"
            />
          </label>

          <label className="text-sm">
            <div className="mb-1 text-gray-600">Budget</div>
            <input
              className="w-full rounded-xl border px-3 py-2"
              value={Number.isFinite(budget) ? String(budget) : ""}
              onChange={(e) => {
                const next = e.target.value.trim();
                if (next === "") return setBudget(NaN);
                setBudget(Number(next));
              }}
              inputMode="numeric"
              placeholder="150"
            />
          </label>
        </div>

        <label className="mt-3 flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={debug} onChange={(e) => setDebug(e.target.checked)} />
          Include debug details in response
        </label>
      </div>

      {error && (
        <div className="mt-6 rounded-xl border border-red-300 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      {output && (
        <div className="mt-6 rounded-xl border p-4 text-sm">
          <div className="flex flex-wrap gap-3">
            <span className="rounded-full bg-gray-100 px-3 py-1">ok: {String(output.ok)}</span>
            <span className="rounded-full bg-gray-100 px-3 py-1">
              ai_used: {String(output.ai_used)}
            </span>

            <span className="rounded-full bg-gray-100 px-3 py-1">
              vibe_used: <code>{output.input?.vibe ?? "(profile default / unset)"}</code>
            </span>
            <span className="rounded-full bg-gray-100 px-3 py-1">
              size_used: <code>{output.input?.size ?? "(unset)"}</code>
            </span>
            <span className="rounded-full bg-gray-100 px-3 py-1">
              budget_used: <code>{String(output.input?.budget ?? "(unset)")}</code>
            </span>

            {(runId ?? output.run_id) && (
              <span className="rounded-full bg-gray-100 px-3 py-1">
                run_id: <code>{runId ?? output.run_id}</code>
              </span>
            )}
            {feedbackBusy && (
              <span className="rounded-full bg-gray-100 px-3 py-1">updating taste…</span>
            )}
          </div>

          {output.ai_error && (
            <pre className="mt-3 whitespace-pre-wrap text-red-700">ai_error: {output.ai_error}</pre>
          )}

          {output.debug_openai ? (
            <>
              <details className="mt-4 rounded-xl border bg-gray-50 p-3">
                <summary className="cursor-pointer select-none text-sm font-medium">
                  debug_openai (click to expand)
                </summary>
                <pre className="mt-3 overflow-auto whitespace-pre-wrap text-xs">
                  {JSON.stringify(output.debug_openai, null, 2)}
                </pre>
              </details>

              {output.anchor_looks ? (
                <details className="mt-4 rounded-xl border bg-gray-50 p-3">
                  <summary className="cursor-pointer select-none text-sm font-medium">
                    anchor_looks (click to expand)
                  </summary>
                  <pre className="mt-3 overflow-auto whitespace-pre-wrap text-xs">
                    {JSON.stringify(output.anchor_looks, null, 2)}
                  </pre>
                </details>
              ) : null}
            </>
          ) : null}
        </div>
      )}

      {recs.length > 0 ? (
        <div className="mt-8 grid gap-4">
          {recs.map((rec, i) => {
            const selected = feedbackByIndex[i];

            const confChip = confidencePercentChip(rec.confidence_score);
            const typeChip = pickTypeChip(rec.confidence_label);

            const anchor =
              rec.anchor_look_id && anchorIndex ? anchorIndex[rec.anchor_look_id] : null;

            const inspiredBy = anchor?.celebrity_name ?? null;
            const anchorWhy = oneLine(rec.anchor_reason);

            return (
              <div key={i} className="rounded-2xl border p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold">
                        {rec.brand} — {rec.model}
                      </h2>

                      <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
                        {confChip ? <span className={confChip.className}>{confChip.text}</span> : null}
                        {typeChip ? <span className={typeChip.className}>{typeChip.text}</span> : null}
                      </div>
                    </div>

                    <p className="mt-1 text-sm text-gray-600">{prettyEraLine(rec.era_inspiration)}</p>

                    {(inspiredBy || anchorWhy) && (
                      <div className="mt-3 space-y-1">
                        {inspiredBy && (
                          <div className="text-sm text-gray-800">
                            <span className="font-medium">Inspired by</span>{" "}
                            <span className="text-gray-700">{inspiredBy}</span>
                          </div>
                        )}
                        {anchorWhy && <div className="text-sm text-gray-700 line-clamp-2">{anchorWhy}</div>}
                      </div>
                    )}
                  </div>

                  <div className="shrink-0 text-right text-xs text-gray-600">
                    <div>
                      <span className="font-medium">Fit:</span> {prettyFit(rec.fit)}
                    </div>
                    <div>
                      <span className="font-medium">Rise:</span> {prettyRise(rec.rise)}
                    </div>
                    <div>
                      <span className="font-medium">Wash:</span> {prettyWash(rec.wash)}
                    </div>
                    <div>
                      <span className="font-medium">Stretch:</span> {prettyStretch(rec.stretch_level)}
                    </div>
                  </div>
                </div>

                <p className="mt-4 text-sm">{rec.why_each_pick}</p>

                {rec.search_queries?.length ? (
                  <div className="mt-4">
                    <div className="text-sm font-medium">Search</div>
                    <ul className="mt-2 list-disc pl-6 text-sm text-gray-700">
                      {rec.search_queries.map((q, idx) => (
                        <li key={idx}>
                          <a
                            className="underline"
                            href={`https://www.google.com/search?q=${encodeURIComponent(q)}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {q}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    disabled={feedbackBusy}
                    onClick={() => setFeedback(i, "save")}
                    className={btnClass(selected === "save", "bg-black text-white border-black")}
                  >
                    ❤️ Save
                  </button>

                  <button
                    disabled={feedbackBusy}
                    onClick={() => setFeedback(i, "not_for_me")}
                    className={btnClass(
                      selected === "not_for_me",
                      "bg-gray-900 text-white border-gray-900"
                    )}
                  >
                    👎 Not for me
                  </button>

                  <button
                    disabled={feedbackBusy}
                    onClick={() => setFeedback(i, "bought")}
                    className={btnClass(selected === "bought", "bg-black text-white border-black")}
                  >
                    🛒 Bought
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : output ? (
        <p className="mt-8 text-gray-600">No recommendations returned. (Check Edge Function logs.)</p>
      ) : null}
    </main>
  );
}