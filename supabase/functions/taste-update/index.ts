// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
};

type DenimRec = {
  brand: string;
  model: string;
  era_inspiration?: string;
  fit?: string;
  rise?: string;
  wash?: string;
  stretch_level?: string;
};

type FeedbackAction = "save" | "bought" | "not_for_me";
type TasteVector = Record<string, number>;

type RecommendRunRow = {
  id: string;
  user_id: string;
  recommendations: DenimRec[] | null;
};

type ProfileTasteRow = {
  taste_vector: TasteVector | null;
  taste_decay: number | null;
  taste_clamp_min: number | null;
  taste_clamp_max: number | null;
};

type SnapshotRow = { created_at: string };

type TasteUpdateBody = {
  run_id?: string;
  rec_index?: number | string;
  action?: FeedbackAction;
};

type PostgrestErrorLike = { message?: string };

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function weightFor(action: FeedbackAction) {
  if (action === "bought") return 1.5;
  if (action === "save") return .6;
  return -1;
}

function inc(map: Record<string, number>, key: string, w: number) {
  map[key] = (map[key] ?? 0) + w;
}

function normalizeText(s?: string) {
  return (s ?? "").toLowerCase();
}

function extractFeatures(rec: DenimRec): string[] {
  const feats: string[] = [];

  const era = normalizeText(rec.era_inspiration);
  if (era.includes("90")) feats.push("era_90s");
  if (era.includes("80")) feats.push("era_80s");
  if (era.includes("y2k")) feats.push("era_y2k");
  if (era.includes("heritage") || era.includes("vintage")) feats.push("era_heritage");

  const fit = normalizeText(rec.fit);
  if (fit.includes("slim")) feats.push("fit_slim");
  if (fit.includes("straight")) feats.push("fit_straight");
  if (fit.includes("relaxed")) feats.push("fit_relaxed");
  if (fit.includes("baggy") || fit.includes("skater")) feats.push("fit_baggy");
  if (fit.includes("boot")) feats.push("fit_bootcut");
  if (fit.includes("cowboy")) feats.push("fit_cowboy_cut");

  const rise = normalizeText(rec.rise);
  if (rise.includes("low")) feats.push("rise_low");
  if (rise.includes("mid")) feats.push("rise_mid");
  if (rise.includes("high")) feats.push("rise_high");

  const wash = normalizeText(rec.wash);
  if (wash.includes("light")) feats.push("wash_light");
  if (wash.includes("medium") || wash.includes("mid")) feats.push("wash_medium");
  if (wash.includes("dark")) feats.push("wash_dark");
  if (wash.includes("raw")) feats.push("wash_raw");
  if (wash.includes("distress") || wash.includes("faded")) feats.push("wash_distressed");

  const stretch = normalizeText(rec.stretch_level);
  if (stretch.includes("non") || stretch.includes("rigid")) feats.push("fabric_rigid");
  if (stretch.includes("stretch")) feats.push("fabric_stretch");

  return Array.from(new Set(feats));
}

//
function tasteVectorToEmbeddingText(tv: Record<string, number>, topN = 12) {
  const entries = Object.entries(tv)
    .map(([k, v]) => [k, Number(v)] as const)
    .filter(([, v]) => Number.isFinite(v));

  const pos = entries
    .filter(([, v]) => v > 0.25)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN);

  const neg = entries
    .filter(([, v]) => v < -0.25)
    .sort((a, b) => a[1] - b[1])
    .slice(0, topN);

  const fmt = (arr: readonly (readonly [string, number])[]) =>
    arr.map(([k, v]) => `${k}:${v.toFixed(2)}`).join(", ");

  return [
    "Refinda user taste vector for denim traits.",
    pos.length ? `Likes: ${fmt(pos)}.` : "Likes: none.",
    neg.length ? `Dislikes: ${fmt(neg)}.` : "Dislikes: none.",
    "Keys are canonical: era_*, fit_*, rise_*, wash_*, fabric_*."
  ].join(" ");
}

async function embedText1536(text: string): Promise<number[]> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const model = Deno.env.get("OPENAI_EMBED_MODEL") ?? "text-embedding-3-small";

  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, input: text }),
  });

  const raw = await res.text();
  if (!res.ok) throw new Error(`OpenAI embeddings error ${res.status}: ${raw}`);

  const parsed = JSON.parse(raw);
  const emb = parsed?.data?.[0]?.embedding;

  if (!Array.isArray(emb) || emb.length !== 1536) {
    throw new Error(`Unexpected embedding length: ${Array.isArray(emb) ? emb.length : "n/a"}`);
  }

  // Ensure numeric + finite
  const out = emb.map((x: unknown) => Number(x));
  if (out.some((n) => !Number.isFinite(n))) {
    throw new Error("Embedding contained non-finite numbers");
  }

  return out;
}


function errMsg(e: unknown): string {
  if (!e) return "Unknown error";
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null && "message" in e && typeof (e as PostgrestErrorLike).message === "string") {
    return (e as PostgrestErrorLike).message ?? "Unknown error";
  }
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

function isFeedbackAction(x: unknown): x is FeedbackAction {
  return x === "save" || x === "bought" || x === "not_for_me";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") {
    return json(405, { ok: false, error: "Method not allowed" });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json(401, { ok: false, error: "Missing Authorization header" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    if (!supabaseUrl || !supabaseKey) {
      return json(500, { ok: false, error: "Missing SUPABASE_URL or SUPABASE_ANON_KEY" });
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: auth, error: authError } = await supabase.auth.getUser();
    const user = auth?.user ?? null;
    if (authError || !user) return json(401, { ok: false, error: "Unauthorized" });

    // Parse body safely
    let body: TasteUpdateBody = {};
    try {
      const parsed = (await req.json()) as unknown;
      if (typeof parsed === "object" && parsed !== null) body = parsed as TasteUpdateBody;
    } catch {
      body = {};
    }

    const run_id = typeof body.run_id === "string" ? body.run_id : undefined;
    const action = body.action;

    const rec_index =
      typeof body.rec_index === "number"
        ? body.rec_index
        : typeof body.rec_index === "string"
          ? Number(body.rec_index)
          : NaN;

    if (!run_id || !Number.isFinite(rec_index) || !isFeedbackAction(action)) {
      return json(400, {
        ok: false,
        error: "Missing/invalid run_id, rec_index, or action",
        got: { run_id, rec_index: body.rec_index, action },
      });
    }

    // Fetch run (must belong to user)
    const { data: run, error: runErr } = await supabase
      .from("recommendation_runs")
      .select("id,user_id,recommendations")
      .eq("id", run_id)
      .single<RecommendRunRow>();

    if (runErr || !run) {
      return json(404, { ok: false, error: "Run not found", details: errMsg(runErr) });
    }

    if (run.user_id !== user.id) return json(403, { ok: false, error: "Forbidden" });

    const recs = run.recommendations ?? [];
    const rec = recs[rec_index];
    if (!rec) return json(400, { ok: false, error: "rec_index out of range" });

    // Compute delta
    const w = weightFor(action);
    const features = extractFeatures(rec);

    const delta: Record<string, number> = {};
    for (const f of features) inc(delta, f, w);

    // Log taste event (best-effort)
    {
      const { error: evtErr } = await supabase.from("taste_events").insert({
        user_id: user.id,
        run_id,
        rec_index,
        action,
        item_features: features,
        delta,
      });
      if (evtErr) console.error("taste_events insert failed:", errMsg(evtErr));
    }

    // Load current taste_vector + params
    const { data: profile, error: profErr } = await supabase
      .from("profiles")
      .select("taste_vector,taste_decay,taste_clamp_min,taste_clamp_max,taste_last_updated_at")
      .eq("id", user.id)
      .single<ProfileTasteRow>();

    if (profErr || !profile) {
      return json(404, { ok: false, error: "Profile not found", details: errMsg(profErr) });
    }

      const current = profile.taste_vector ?? {};
      const baseDecay = profile.taste_decay ?? 0.985;
      const clampMin = profile.taste_clamp_min ?? -30;
      const clampMax = profile.taste_clamp_max ?? 30;

    // ----- TIME-AWARE DECAY -----

    const lastUpdatedRaw =
      (profile as Record<string, unknown>)["taste_last_updated_at"];

    const lastUpdatedAt =
      typeof lastUpdatedRaw === "string"
        ? new Date(lastUpdatedRaw).getTime()
        : 0;

    const nowAt = Date.now();

    const daysElapsed = lastUpdatedAt
      ? Math.max(0, (nowAt - lastUpdatedAt) / (1000 * 60 * 60 * 24))
      : 0;

    // effectiveDecay = baseDecay ^ daysElapsed
    // If same day → decay ~ 1
    // If many days → more decay applied
    const effectiveDecay = daysElapsed
      ? Math.pow(baseDecay, daysElapsed)
      : 1;


    // Compute updated taste vector via SQL rpc
const { data: calc, error: calcErr } = await supabase.rpc("taste_vector_apply", {
  current,
  delta,
  decay: effectiveDecay,   // 👈 use effective decay
  clamp_min: clampMin,
  clamp_max: clampMax,
});



    if (calcErr || !calc || typeof calc !== "object") {
      return json(500, {
        ok: false,
        error: "Failed to compute taste_vector in SQL",
        details: errMsg(calcErr),
      });
    }

    const updated = calc as TasteVector;

    // Update profile
    const { error: updErr } = await supabase
      .from("profiles")
      .update({
  taste_vector: updated,
  taste_last_updated_at: new Date().toISOString(),
})

      .eq("id", user.id);

    if (updErr) {
      return json(500, { ok: false, error: "Failed to update taste_vector", details: errMsg(updErr) });
    }

    // --- BEST-EFFORT: update taste_embedding for vector search ---
let taste_embedding_updated = false;
try {
  const tasteText = tasteVectorToEmbeddingText(updated);
  const embedding = await embedText1536(tasteText);

  const { error: embErr } = await supabase
    .from("profiles")
    .update({
      taste_embedding: embedding, // pgvector accepts number[]
      taste_embedding_model: Deno.env.get("OPENAI_EMBED_MODEL") ?? "text-embedding-3-small",
      taste_embedding_updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (embErr) {
    console.error("taste_embedding update failed:", errMsg(embErr));
  } else {
    taste_embedding_updated = true;
  }
} catch (e) {
  console.error("taste_embedding compute failed:", errMsg(e));
}


    // Snapshot (best-effort)
    let snapInserted = false;
    try {
      const { data: lastSnap } = await supabase
        .from("taste_vector_snapshots")
        .select("created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<SnapshotRow>();

      const lastAt = lastSnap?.created_at ? new Date(lastSnap.created_at).getTime() : 0;
      const nowAt = Date.now();

      if (!lastAt || nowAt - lastAt > 24 * 60 * 60 * 1000) {
        const { error: snapErr } = await supabase.from("taste_vector_snapshots").insert({
          user_id: user.id,
          taste_vector: updated,
        });
        if (!snapErr) snapInserted = true;
        else console.error("snapshot insert failed:", errMsg(snapErr));
      }
    } catch (e) {
      console.error("snapshot logic failed:", errMsg(e));
    }

    return json(200, {
      ok: true,
      action,
      weight: w,
      features,
      delta,
      taste_vector: updated,
      taste_embedding_updated,
      snapshot_inserted: snapInserted,
    });
  } catch (e) {
    console.error("taste-update fatal:", errMsg(e));
    return json(500, { ok: false, error: errMsg(e) });
  }
});





/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/taste-update' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
