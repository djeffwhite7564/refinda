"use client";

import { useMemo, useState } from "react";
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
};

type Output = {
  ok: boolean;
  ai_used: boolean;
  ai_error: string | null;
  run_id?: string | null;
  user_id: string;
  input: { vibe?: string; size?: string; budget?: number };
  recommendations?: DenimRec[];
};

type FeedbackAction = "save" | "not_for_me" | "bought";

/**
 * 🔒 Module-level lock to prevent concurrent auth session reads.
 * Supabase auth-js uses internal locks; overlapping getSession() calls can abort.
 */
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

async function callEdgeFunction<T>(
  fnName: string,
  token: string,
  body: unknown
): Promise<T> {
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

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${fnName} returned non-JSON: ${text}`);
  }
}

export default function RecommendTestPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [output, setOutput] = useState<Output | null>(null);
  const [runId, setRunId] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [feedbackByIndex, setFeedbackByIndex] = useState<Record<number, FeedbackAction>>({});

  async function runTest() {
    setBusy(true);
    setError(null);
    setOutput(null);
    setRunId(null);
    setFeedbackByIndex({});

    try {
      const token = await getAccessTokenSafe(supabase);

      const json = await callEdgeFunction<Output>("recommend-jeans", token, {
        vibe: "90s supermodel",
        size: "32x32",
        budget: 150,
      });

      setOutput(json);
      if (json.run_id) setRunId(json.run_id);
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
          .eq("rec_index", recIndex);

        if (delErr) throw delErr;

        setFeedbackByIndex((m) => {
          const copy = { ...m };
          delete copy[recIndex];
          return copy;
        });

        return;
      }

      const { error: upErr } = await supabase
        .from("recommendation_feedback")
        .upsert(
          { run_id: rid, user_id: uid, rec_index: recIndex, action: nextAction },
          { onConflict: "run_id,user_id,rec_index" }
        );

      if (upErr) throw upErr;

      setFeedbackByIndex((m) => ({ ...m, [recIndex]: nextAction }));

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

  const recs = output?.recommendations ?? [];

  function btnClass(selected: boolean, selectedClass: string) {
    return `rounded-xl px-3 py-2 text-sm transition border disabled:opacity-60 ${
      selected ? selectedClass : "bg-white hover:bg-gray-100 text-gray-900"
    }`;
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Recommend Curation Jeans — Test</h1>
          <p className="mt-2 text-gray-600">
            Refinda’s Judgement Engine is a behavioral personalization system that continuously
            learns a user’s evolving denim identity.
          </p>
        </div>

        <button
          onClick={runTest}
          disabled={busy}
          className="rounded-xl bg-black px-4 py-2 text-white disabled:opacity-60"
        >
          {busy ? "Calling..." : "Personal Shopper"}
        </button>
      </div>

      {error && (
        <div className="mt-6 rounded-xl border border-red-300 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      {output && (
        <div className="mt-6 rounded-xl border p-4 text-sm">
          <div className="flex flex-wrap gap-3">
            <span className="rounded-full bg-gray-100 px-3 py-1">
              ok: {String(output.ok)}
            </span>
            <span className="rounded-full bg-gray-100 px-3 py-1">
              ai_used: {String(output.ai_used)}
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
            <pre className="mt-3 whitespace-pre-wrap text-red-700">
              ai_error: {output.ai_error}
            </pre>
          )}
        </div>
      )}

      {recs.length > 0 ? (
        <div className="mt-8 grid gap-4">
          {recs.map((rec, i) => {
            const selected = feedbackByIndex[i];

            return (
              <div key={i} className="rounded-2xl border p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold">
                      {rec.brand} — {rec.model}
                    </h2>
                    <p className="mt-1 text-sm text-gray-600">{rec.era_inspiration}</p>
                  </div>

                  <div className="text-right text-xs text-gray-600">
                    <div>
                      <span className="font-medium">Fit:</span> {rec.fit}
                    </div>
                    <div>
                      <span className="font-medium">Rise:</span> {rec.rise}
                    </div>
                    <div>
                      <span className="font-medium">Wash:</span> {rec.wash}
                    </div>
                    <div>
                      <span className="font-medium">Stretch:</span> {rec.stretch_level}
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

                  {selected && (
                    <span className="ml-2 text-sm text-gray-600">
                      Selected: <span className="font-medium">{selected}</span> (click again to
                      undo)
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : output ? (
        <p className="mt-8 text-gray-600">
          No recommendations returned. (Check Edge Function logs.)
        </p>
      ) : null}

      <p className="mt-10 text-sm text-gray-500">
        Tip: Make sure you’re logged in first, then visit <code>/app/recommend-test</code>.
      </p>
    </main>
  );
}

