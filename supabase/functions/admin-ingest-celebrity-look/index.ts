// supabase/functions/admin-ingest-celebrity-look/index.ts
import { createClient } from "@supabase/supabase-js";

/* ----------------------------- CORS CONFIG ----------------------------- */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // tighten in prod
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/* ----------------------------- TYPES ----------------------------- */
type VisionSource = "source_asset_id" | "display_asset_id" | "image_url" | "none";

type IngestPayload =
  | {
      look_id: string;
      force?: boolean; // NEW: rerun even if already complete
      tags?: string[] | null;
      notes?: string | null;
    }
  | {
      celebrity_id: string;
      force?: boolean; // NEW
      source_asset_id?: string | null;
      display_asset_id?: string | null;
      image_url?: string | null; // legacy fallback only
      is_active?: boolean;
      tags?: string[] | null;
      notes?: string | null;
    };

type StyleProfile = {
  era: string;
  silhouette: string[];
  rise: string;
  wash: string;
  fabric: string;
  details: string[];
  vibe: string[];
  color_palette: string[];
};

type ResponsesRaw = {
  output?: unknown;
  output_text?: unknown;
};

type EmbeddingsAPI = { data?: Array<{ embedding?: unknown }> };

/* ----------------------------- HELPERS ----------------------------- */
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function getEnvOrThrow(key: string): string {
  const v = Deno.env.get(key);
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, "_");
}

function safeString(x: unknown): string {
  return typeof x === "string" ? x : "";
}

function extractOutputText(resp: ResponsesRaw): string {
  const output = resp.output;
  if (!Array.isArray(output)) return safeString(resp.output_text);

  const chunks: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;

    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;

    for (const c of content) {
      if (!c || typeof c !== "object") continue;
      const cc = c as Record<string, unknown>;
      if (cc.type === "output_text" && typeof cc.text === "string") {
        chunks.push(cc.text);
      }
    }
  }

  return chunks.join("\n").trim() || safeString(resp.output_text) || "";
}

function extractJsonObject(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const slice = text.slice(start, end + 1);
      try {
        return JSON.parse(slice);
      } catch {
        return null;
      }
    }
    return null;
  }
}

function readForce(payload: IngestPayload): boolean {
  if ("force" in payload && typeof payload.force === "boolean") return payload.force;
  return false;
}

/* ----------------------------- ALLOWED VALUES ----------------------------- */
const ERA_ALLOWED = ["70s", "80s", "90s", "00s", "10s", "modern", "vintage"] as const;
const RISE_ALLOWED = ["low", "mid", "high"] as const;
const WASH_ALLOWED = ["light", "medium", "dark", "black", "white", "raw"] as const;
const FABRIC_ALLOWED = ["rigid", "stretch", "selvedge", "denim-blend"] as const;
const SIL_ALLOWED = [
  "straight",
  "relaxed",
  "baggy",
  "slim-straight",
  "flare",
  "bootcut",
  "barrel",
  "skinny",
  "wide",
] as const;

type Allowed<T extends readonly string[]> = T[number];

function pickAllowed<T extends readonly string[]>(
  value: string,
  allowed: T,
  fallback: Allowed<T>
): Allowed<T> {
  const v = norm(value);
  const hit = allowed.find((a) => a === v);
  return (hit ?? fallback) as Allowed<T>;
}

function parseStyleProfileFromModel(raw: unknown): StyleProfile {
  if (typeof raw !== "object" || raw === null) {
    return {
      era: "",
      silhouette: [],
      rise: "",
      wash: "",
      fabric: "",
      details: [],
      vibe: [],
      color_palette: [],
    };
  }
  const obj = raw as Record<string, unknown>;

  return {
    era: String(obj.era ?? ""),
    silhouette: Array.isArray(obj.silhouette) ? obj.silhouette.map(String) : [],
    rise: String(obj.rise ?? ""),
    wash: String(obj.wash ?? ""),
    fabric: String(obj.fabric ?? ""),
    details: Array.isArray(obj.details) ? obj.details.map(String) : [],
    vibe: Array.isArray(obj.vibe) ? obj.vibe.map(String) : [],
    color_palette: Array.isArray(obj.color_palette) ? obj.color_palette.map(String) : [],
  };
}

function normalizeStyleProfile(s: StyleProfile): StyleProfile {
  const sil = s.silhouette
    .map(norm)
    .filter((x) => (SIL_ALLOWED as readonly string[]).includes(x));

  return {
    era: pickAllowed(s.era, ERA_ALLOWED, "modern"),
    silhouette: sil.length ? sil : ["straight"],
    rise: pickAllowed(s.rise, RISE_ALLOWED, "mid"),
    wash: pickAllowed(s.wash, WASH_ALLOWED, "medium"),
    fabric: pickAllowed(s.fabric, FABRIC_ALLOWED, "rigid"),
    details: s.details.map(norm).filter(Boolean).slice(0, 16),
    vibe: s.vibe.map(norm).filter(Boolean).slice(0, 16),
    color_palette: s.color_palette.map(norm).filter(Boolean).slice(0, 16),
  };
}

function isEmptyStyleProfile(s: StyleProfile): boolean {
  const hasAny =
    (s.era && s.era.trim().length > 0) ||
    s.silhouette.length > 0 ||
    (s.rise && s.rise.trim().length > 0) ||
    (s.wash && s.wash.trim().length > 0) ||
    (s.fabric && s.fabric.trim().length > 0) ||
    s.details.length > 0 ||
    s.vibe.length > 0 ||
    s.color_palette.length > 0;
  return !hasAny;
}

function buildCanonicalText(style: StyleProfile): string {
  return [
    `era:${style.era}`,
    `silhouette:${style.silhouette.join(",")}`,
    `rise:${style.rise}`,
    `wash:${style.wash}`,
    `fabric:${style.fabric}`,
    `details:${style.details.join(",")}`,
    `vibe:${style.vibe.join(",")}`,
    `palette:${style.color_palette.join(",")}`,
  ].join(" | ");
}

/* ----------------------------- OPENAI VIA FETCH ----------------------------- */
async function callResponses(payload: unknown): Promise<ResponsesRaw> {
  const apiKey = getEnvOrThrow("OPENAI_API_KEY");

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(payload),
  });

  const json = (await res.json()) as ResponsesRaw & { error?: unknown };
  if (!res.ok) throw new Error(JSON.stringify(json));
  return json;
}

async function createEmbedding(text: string): Promise<number[]> {
  const apiKey = getEnvOrThrow("OPENAI_API_KEY");

  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
  });

  const json = (await res.json()) as EmbeddingsAPI & { error?: unknown };
  if (!res.ok) throw new Error(JSON.stringify(json));

  const emb = json.data?.[0]?.embedding;
  if (!Array.isArray(emb) || emb.some((x) => typeof x !== "number")) {
    throw new Error("Embedding missing or invalid");
  }
  return emb as number[];
}

async function extractStyleProfile(imageUrl: string, strict: boolean): Promise<StyleProfile> {
  const strictPrompt = `You are a denim style classifier. Return ONLY valid JSON:
{
  "era": string,
  "silhouette": string[],
  "rise": string,
  "wash": string,
  "fabric": string,
  "details": string[],
  "vibe": string[],
  "color_palette": string[]
}
REQUIREMENTS:
- Do NOT return empty strings. Choose the closest value if unsure.
- era must be one of: ${JSON.stringify(ERA_ALLOWED)}
- rise must be one of: ${JSON.stringify(RISE_ALLOWED)}
- wash must be one of: ${JSON.stringify(WASH_ALLOWED)}
- fabric must be one of: ${JSON.stringify(FABRIC_ALLOWED)}
- silhouette must include at least one of: ${JSON.stringify(SIL_ALLOWED)}
Return JSON only. No markdown. No commentary.`;

  const basePrompt = `Analyze the denim look and return ONLY valid JSON:
{
  "era": string,
  "silhouette": string[],
  "rise": string,
  "wash": string,
  "fabric": string,
  "details": string[],
  "vibe": string[],
  "color_palette": string[]
}
Return JSON only.`;

  const resp = await callResponses({
    model: "gpt-4.1-mini",
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: strict ? strictPrompt : basePrompt },
          { type: "input_image", image_url: imageUrl, detail: "auto" },
        ],
      },
    ],
  });

  const text = extractOutputText(resp).trim();
  const parsed = extractJsonObject(text);
  if (!parsed) {
    return {
      era: "",
      silhouette: [],
      rise: "",
      wash: "",
      fabric: "",
      details: [],
      vibe: [],
      color_palette: [],
    };
  }

  return parseStyleProfileFromModel(parsed);
}

/* ----------------------------- MINIMAL SUPABASE TYPES (NO `any`, NO duplicate `from`) ----------------------------- */
type PostgrestOk<T> = { data: T; error: null };
type PostgrestFail = { data: null; error: unknown };
type PostgrestResult<T> = Promise<PostgrestOk<T> | PostgrestFail>;

type MediaAssetRow = {
  id: string;
  bucket: string;
  object_path: string;
  visibility: "public" | "private";
};

type LookRow = {
  id: string;
  celebrity_id: string;
  source_asset_id: string | null;
  display_asset_id: string | null;
  image_url: string;
  ingest_status?: string;
};

type StorageBucket = {
  getPublicUrl: (path: string) => { data: { publicUrl: string } };
  createSignedUrl: (
    path: string,
    expiresIn: number
  ) => Promise<{ data: { signedUrl: string } | null; error: unknown | null }>;
};

type StorageClient = {
  from: (bucket: string) => StorageBucket;
};

type MediaAssetsQuery = {
  select: (columns: string) => MediaAssetsQuery;
  eq: (column: string, value: string) => MediaAssetsQuery;
  single: () => PostgrestResult<MediaAssetRow>;
};

type LooksQuery = {
  select: (columns: string) => LooksQuery;
  eq: (column: string, value: string) => LooksQuery;
  single: () => PostgrestResult<LookRow>;
  insert: (values: Record<string, unknown>) => LooksQuery;
  update: (values: Record<string, unknown>) => LooksQuery;
};

type EmbeddingsQuery = {
  upsert: (values: Record<string, unknown>, opts: { onConflict: string }) => EmbeddingsQuery;
  insert: (values: Record<string, unknown>) => EmbeddingsQuery;
  select: (columns: string) => EmbeddingsQuery;
  single: () => PostgrestResult<{ id: string }>;
};

type AffinityQuery = {
  upsert: (values: Record<string, unknown>, opts: { onConflict: string }) => Promise<unknown>;
};

interface AdminDbClient {
  from(table: "media_assets"): MediaAssetsQuery;
  from(table: "celebrity_looks"): LooksQuery;
  from(table: "celebrity_look_embeddings"): EmbeddingsQuery;
  from(table: "profile_celebrity_affinity"): AffinityQuery;
}

type SupabaseAdminClient = AdminDbClient & { storage: StorageClient };

/* ----------------------------- ASSET URL RESOLUTION ----------------------------- */
async function resolveAssetUrl(
  supabaseAdmin: SupabaseAdminClient,
  assetId: string,
  ttlSeconds = 600
): Promise<string> {
  const assetRes = await supabaseAdmin
    .from("media_assets")
    .select("id,bucket,object_path,visibility")
    .eq("id", assetId)
    .single();

  if (assetRes.error || !assetRes.data) throw new Error(`Asset not found: ${assetId}`);

  const asset = assetRes.data;

  if (asset.visibility === "public") {
    const { data } = supabaseAdmin.storage.from(asset.bucket).getPublicUrl(asset.object_path);
    if (!data?.publicUrl) throw new Error("Failed to get public URL");
    return data.publicUrl;
  }

  const { data: signed, error: signErr } = await supabaseAdmin.storage
    .from(asset.bucket)
    .createSignedUrl(asset.object_path, ttlSeconds);

  if (signErr || !signed?.signedUrl) throw new Error("Failed to create signed URL");
  return signed.signedUrl;
}

/* ----------------------------- EDGE FUNCTION ----------------------------- */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = getEnvOrThrow("SUPABASE_URL");
  const SUPABASE_ANON_KEY = getEnvOrThrow("SUPABASE_ANON_KEY");
  const SUPABASE_SERVICE_ROLE_KEY = getEnvOrThrow("SUPABASE_SERVICE_ROLE_KEY");

  try {
    if (req.method !== "POST") return jsonResponse({ error: "Use POST" }, 405);

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return jsonResponse({ error: "Missing Authorization bearer token" }, 401);
    }

    const payload = (await req.json()) as IngestPayload;
    const force = readForce(payload);

    // User client for auth + admin check
    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: authData, error: authErr } = await supabaseUser.auth.getUser();
    if (authErr || !authData?.user) {
      return jsonResponse({ error: "Invalid user session", details: authErr?.message }, 401);
    }
    const userId = authData.user.id;

    const { data: profile, error: profErr } = await supabaseUser
      .from("profiles")
      .select("id,is_admin")
      .eq("id", userId)
      .single();

    if (profErr || !profile?.is_admin) {
      return jsonResponse({ error: "Admin access required" }, 403);
    }

    const supabaseAdmin = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY
    ) as unknown as SupabaseAdminClient;

    let lookId: string;
    let celebrityId: string;

    if ("look_id" in payload) {
      lookId = payload.look_id;

      // include ingest_status for "skip if complete"
      const lookRes = await supabaseAdmin
        .from("celebrity_looks")
        .select("id,celebrity_id,source_asset_id,display_asset_id,image_url,ingest_status")
        .eq("id", lookId)
        .single();

      if (lookRes.error || !lookRes.data) {
        return jsonResponse({ error: "Look not found", details: lookRes.error }, 404);
      }

      celebrityId = lookRes.data.celebrity_id;

      if (!force && lookRes.data.ingest_status === "complete") {
        // cost-control early exit
        return jsonResponse({
          ok: true,
          celebrity_id: celebrityId,
          look_id: lookId,
          ingest_status: "complete",
          skipped: true,
          reason: "already_complete",
        });
      }

      await supabaseAdmin
        .from("celebrity_looks")
        .update({ ingest_status: "processing", ingest_error: null })
        .eq("id", lookId);
    } else {
      if (!payload.celebrity_id) return jsonResponse({ error: "celebrity_id is required" }, 400);

      const hasAny =
        !!payload.source_asset_id || !!payload.display_asset_id || !!payload.image_url;
      if (!hasAny) {
        return jsonResponse(
          { error: "Provide source_asset_id, display_asset_id, or image_url" },
          400
        );
      }

      const lookRowRes = await supabaseAdmin
        .from("celebrity_looks")
        .insert({
          celebrity_id: payload.celebrity_id,
          source_asset_id: payload.source_asset_id ?? null,
          display_asset_id: payload.display_asset_id ?? null,
          image_url: (payload.image_url ?? "").trim() || null,
          style_profile: {},
          canonical_text: null,
          is_active: payload.is_active ?? true,
          ingest_status: "processing",
          ingest_error: null,
        })
        .select("id,celebrity_id,source_asset_id,display_asset_id,image_url")
        .single();

      if (lookRowRes.error || !lookRowRes.data) {
        return jsonResponse({ error: "Failed to create look", details: lookRowRes.error }, 500);
      }

      lookId = lookRowRes.data.id;
      celebrityId = lookRowRes.data.celebrity_id;
    }

    // Load look again (fresh)
    const look2Res = await supabaseAdmin
      .from("celebrity_looks")
      .select("id,celebrity_id,source_asset_id,display_asset_id,image_url")
      .eq("id", lookId)
      .single();

    if (look2Res.error || !look2Res.data) {
      return jsonResponse({ error: "Failed to load look", details: look2Res.error }, 500);
    }

    const look2 = look2Res.data;

    // URL selection priority: source_asset (signed) -> display_asset -> legacy image_url
    let visionUrl: string | null = null;
    let visionSource: VisionSource = "none";

    try {
      if (look2.source_asset_id) {
        visionUrl = await resolveAssetUrl(supabaseAdmin, look2.source_asset_id, 600);
        visionSource = "source_asset_id";
      } else if (look2.display_asset_id) {
        visionUrl = await resolveAssetUrl(supabaseAdmin, look2.display_asset_id, 600);
        visionSource = "display_asset_id";
      } else if (look2.image_url) {
        visionUrl = look2.image_url;
        visionSource = "image_url";
      }
    } catch (e) {
      await supabaseAdmin
        .from("celebrity_looks")
        .update({
          ingest_status: "failed",
          ingest_error: `URL resolution failed: ${e instanceof Error ? e.message : String(e)}`,
        })
        .eq("id", lookId);

      return jsonResponse(
        { error: "Failed to resolve vision URL", details: e instanceof Error ? e.message : String(e) },
        500
      );
    }

    if (!visionUrl) {
      await supabaseAdmin
        .from("celebrity_looks")
        .update({
          ingest_status: "failed",
          ingest_error: "No usable vision URL (missing assets + image_url)",
        })
        .eq("id", lookId);

      return jsonResponse({ error: "No usable vision URL" }, 422);
    }

    // Vision extraction w/ retry
    let style = await extractStyleProfile(visionUrl, false);
    if (isEmptyStyleProfile(style)) style = await extractStyleProfile(visionUrl, true);
    style = normalizeStyleProfile(style);

    if (isEmptyStyleProfile(style)) {
      await supabaseAdmin
        .from("celebrity_looks")
        .update({ ingest_status: "failed", ingest_error: "Vision returned empty style profile" })
        .eq("id", lookId);

      return jsonResponse({ error: "Vision returned empty style profile" }, 422);
    }

    const canonicalText = buildCanonicalText(style);

    // Embedding
    const vector = await createEmbedding(canonicalText);
    if (vector.length !== 1536) {
      await supabaseAdmin
        .from("celebrity_looks")
        .update({ ingest_status: "failed", ingest_error: `Embedding dim mismatch: ${vector.length}` })
        .eq("id", lookId);

      return jsonResponse({ error: "Embedding dimension mismatch", dim: vector.length }, 500);
    }

    // Update look: complete
    const updatedRes = await supabaseAdmin
      .from("celebrity_looks")
      .update({
        style_profile: style,
        canonical_text: canonicalText,
        ingest_status: "complete",
        ingest_error: null,
        ingested_at: new Date().toISOString(),
      })
      .eq("id", lookId)
      .select("id,celebrity_id,ingest_status")
      .single();

    if (updatedRes.error || !updatedRes.data) {
      await supabaseAdmin
        .from("celebrity_looks")
        .update({
          ingest_status: "failed",
          ingest_error: `Failed to update look: ${JSON.stringify(updatedRes.error)}`,
        })
        .eq("id", lookId);

      return jsonResponse({ error: "Failed to update look", details: updatedRes.error }, 500);
    }

    // Upsert embedding (requires UNIQUE(celebrity_look_id) for true idempotency)
    let embeddingId: string | null = null;
    const embUpsertRes = await supabaseAdmin
      .from("celebrity_look_embeddings")
      .upsert(
        {
          celebrity_look_id: lookId,
          embedding: vector,
          embedding_model: "text-embedding-3-small",
        },
        { onConflict: "celebrity_look_id" }
      )
      .select("id")
      .single();

    if (!embUpsertRes.error && embUpsertRes.data) {
      embeddingId = embUpsertRes.data.id;
    } else {
      const embInsertRes = await supabaseAdmin
        .from("celebrity_look_embeddings")
        .insert({
          celebrity_look_id: lookId,
          embedding: vector,
          embedding_model: "text-embedding-3-small",
        })
        .select("id")
        .single();

      if (embInsertRes.error || !embInsertRes.data) {
        return jsonResponse(
          { error: "Failed to write embedding", details: embInsertRes.error ?? embUpsertRes.error },
          500
        );
      }
      embeddingId = embInsertRes.data.id;
    }

    // Optional affinity record
    const tags = ("tags" in payload ? payload.tags : null) ?? [];
    const notes = ("notes" in payload ? payload.notes : null) ?? null;

    if ((tags && tags.length > 0) || notes) {
      await supabaseAdmin.from("profile_celebrity_affinity").upsert(
        {
          profile_id: userId,
          celebrity_id: updatedRes.data.celebrity_id || celebrityId,
          celebrity_look_id: lookId,
          tags,
          notes,
        },
        { onConflict: "profile_id,celebrity_look_id" }
      );
    }

    return jsonResponse({
      ok: true,
      celebrity_id: updatedRes.data.celebrity_id || celebrityId,
      look_id: lookId,
      embedding_id: embeddingId,
      ingest_status: updatedRes.data.ingest_status ?? "complete",
      canonical_text: canonicalText,
      style_profile: style,
      vision_source: visionSource, // NEW: safe metadata
      // vision_url_used intentionally omitted (signed URLs should never be returned)
    });
  } catch (e) {
    return jsonResponse(
      { error: "Unhandled error", details: e instanceof Error ? e.message : String(e) },
      500
    );
  }
});










