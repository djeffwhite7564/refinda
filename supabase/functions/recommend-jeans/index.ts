// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
// supabase/functions/recommend-jeans/index.ts

// supabase/functions/recommend-jeans/index.ts
import { createClient } from "@supabase/supabase-js";

/* ---------------- CORS ---------------- */

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
};

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/* ---------------- Types ---------------- */

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

  // ✅ per-rec anchor attribution
  anchor_look_id: string;

  // ✅ new: user-facing “why this matches the anchor”
  anchor_reason: string;

  // computed server-side
  confidence_score?: number; // 0..1
  confidence_label?: "strong" | "good" | "bridge";
};

type TasteVector = Record<string, number>;
type TasteItem = { key: string; weight: number };

type RecommendBody = {
  vibe?: string;
  size?: string;
  budget?: number | string;
  debug?: boolean;
};

type ProfileRow =
  | {
      taste_vector?: TasteVector | null;
      vibe_default?: string | null;
      taste_clamp_min?: number | null;
      taste_clamp_max?: number | null;
    }
  | null;

type VibeProfile =
  | {
      id: string;
      label: string;
      attributes: unknown;
      core_jean_styles: string[];
      why: string[] | null;
    }
  | null;

type TasteGroup = "era" | "fit" | "rise" | "wash" | "fabric";
type GroupTasteBucket = { likes: TasteItem[]; dislikes: TasteItem[] };
type GroupedTaste = Record<TasteGroup, GroupTasteBucket>;

type TopLook = {
  celebrity_look_id: string;
  distance: number;
  celebrity_id: string;
  celebrity_name: string;
  canonical_text: string | null;
  style_profile: unknown;
  image_url: string | null;
  display_asset_id: string | null;
  has_public_image: boolean;
};

type DebugOpenAiSnapshot = {
  model: string;
  vibe: string | null;
  vibe_profile_label: string | null;
  allowed_fits: string[] | null;
  allowed_rises: string[] | null;
  size: string | null;
  budget: number | null;

  // ✅ Taste debug
  taste_vector_raw: TasteVector | null;
  taste_vector_pretty: {
    clamp: { min: number; max: number } | null;
    totals: { keys: number; positives: number; negatives: number } | null;
    groups: GroupedTaste | null;
    top_positive: TasteItem[];
    top_negative: TasteItem[];
  };

  taste_summary: GroupedTaste | null;

  top_celebrity_looks_count: number | null;
  top_celebrity_looks_preview: unknown[] | null;

  // ✅ sanity preview
  recs_preview: {
    brand: string;
    model: string;
    anchor_look_id: string;
    anchor_distance: number | null;
    anchor_reason: string | null;
    confidence_score: number | null;
    confidence_label: DenimRec["confidence_label"] | null;
  }[];

  system_preview: string;
  user_preview: string;
};

type AiResult = {
  recommendations: DenimRec[];
  model: string;
  debug_openai?: DebugOpenAiSnapshot;
};

/**
 * Minimal representation of Responses API message content.
 * We only care about pieces that might contain text.
 */
type ResponseContentItem = { type?: string; text?: string; value?: string };
type ResponseOutputItem = { type?: string; content?: ResponseContentItem[] };

type OpenAIResponsesResult = {
  output_text?: string;
  output?: ResponseOutputItem[];
  // fallback for chat-completions shaped responses (rare here)
  choices?: { message?: { content?: string } }[];
};

/* ---------------- Helpers ---------------- */

function getEnvOrThrow(key: string): string {
  const v = Deno.env.get(key);
  if (!v) throw new Error(`Missing ${key}`);
  return v;
}

function getEnv(key: string, fallback: string): string {
  return Deno.env.get(key) ?? fallback;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function isOpenAIResponsesResult(x: unknown): x is OpenAIResponsesResult {
  if (!isRecord(x)) return false;
  return "output" in x || "output_text" in x || "choices" in x;
}

function safeNumber(x: unknown): number | undefined {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string") {
    const n = Number(x.trim());
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function asStringArray(x: unknown): string[] | null {
  if (!Array.isArray(x)) return null;
  const out = x
    .filter((v): v is string => typeof v === "string")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return out.length ? out : null;
}

function getAttr(obj: unknown, key: string): unknown {
  if (!isRecord(obj)) return undefined;
  return obj[key];
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function norm(s: unknown): string {
  return typeof s === "string" ? s.toLowerCase().trim() : "";
}

function includesOne(hay: string, needles: string[]) {
  const h = hay.toLowerCase();
  return needles.some((n) => n && h.includes(n.toLowerCase()));
}

/* ---------------- Deterministic Confidence ---------------- */

function tokenizeRecText(rec: DenimRec): string {
  return [
    rec.era_inspiration,
    rec.fit,
    rec.rise,
    rec.wash,
    rec.stretch_level,
    rec.brand,
    rec.model,
    rec.why_each_pick,
    rec.anchor_reason,
  ]
    .map(norm)
    .join(" ")
    .trim();
}

function tasteKeyToNeedles(key: string): string[] {
  const k = key.toLowerCase();
  const base = k
    .replace(/^era_/, "")
    .replace(/^fit_/, "")
    .replace(/^rise_/, "")
    .replace(/^wash_/, "")
    .replace(/^fabric_/, "")
    .replace(/_/g, " ")
    .trim();

  if (!base) return [];

  const extra: string[] = [];
  if (k.startsWith("wash_")) {
    if (base.includes("light")) extra.push("light wash", "faded");
    if (base.includes("dark")) extra.push("dark wash", "rinse");
    if (base.includes("medium")) extra.push("mid wash", "medium wash");
    if (base.includes("black")) extra.push("black denim", "black");
  }
  if (k.startsWith("rise_")) {
    if (base.includes("low")) extra.push("low-rise", "low rise");
    if (base.includes("mid")) extra.push("mid-rise", "mid rise");
    if (base.includes("high")) extra.push("high-rise", "high rise");
  }
  if (k.startsWith("fit_")) {
    if (base.includes("straight")) extra.push("straight-leg", "straight leg");
    if (base.includes("baggy")) extra.push("baggy", "loose");
    if (base.includes("slim")) extra.push("slim", "taper");
    if (base.includes("flare")) extra.push("flare", "bootcut");
  }
  if (k.startsWith("fabric_")) {
    if (base.includes("rigid")) extra.push("rigid", "non-stretch");
    if (base.includes("stretch")) extra.push("stretch", "elastane");
    if (base.includes("soft")) extra.push("soft");
  }

  const underscored = k.replace(/^(era_|fit_|rise_|wash_|fabric_)/, "");
  return Array.from(
    new Set([base, underscored, ...extra].map((s) => s.trim()).filter(Boolean))
  );
}

function scoreTasteMatch(args: {
  recText: string;
  tasteSummary: GroupedTaste | null;
}): number {
  const { recText, tasteSummary } = args;
  if (!tasteSummary) return 0.5; // neutral

  let points = 0;
  let maxPoints = 0;

  const groups: TasteGroup[] = ["era", "fit", "rise", "wash", "fabric"];

  for (const g of groups) {
    const likes = tasteSummary[g]?.likes ?? [];
    const dislikes = tasteSummary[g]?.dislikes ?? [];

    const likeCap = 2;
    const dislikeCap = 1;

    let likeHits = 0;
    for (const it of likes) {
      const needles = tasteKeyToNeedles(it.key);
      if (needles.length && includesOne(recText, needles)) likeHits += 1;
      if (likeHits >= likeCap) break;
    }

    let dislikeHits = 0;
    for (const it of dislikes) {
      const needles = tasteKeyToNeedles(it.key);
      if (needles.length && includesOne(recText, needles)) dislikeHits += 1;
      if (dislikeHits >= dislikeCap) break;
    }

    points += likeHits * 1.0;
    points -= dislikeHits * 1.2;

    maxPoints += likeCap * 1.0;
    maxPoints += dislikeCap * 1.2;
  }

  const normalized = 0.5 + (maxPoints > 0 ? points / (2 * maxPoints) : 0);
  return clamp01(normalized);
}

function scoreVibeConstraint(args: {
  rec: DenimRec;
  allowedFits: string[] | null;
  allowedRises: string[] | null;
}): { ok: boolean; score: number } {
  const fit = norm(args.rec.fit);
  const rise = norm(args.rec.rise);

  if (args.allowedFits?.length) {
    const okFit = args.allowedFits.map(norm).includes(fit);
    if (!okFit) return { ok: false, score: 0.05 };
  }

  if (args.allowedRises?.length) {
    const okRise = args.allowedRises.map(norm).includes(rise);
    if (!okRise) return { ok: false, score: 0.05 };
  }

  const hasAny = Boolean(args.allowedFits?.length || args.allowedRises?.length);
  return { ok: true, score: hasAny ? 1.0 : 0.7 };
}

function scoreAnchorStrength(args: { anchorDistance: number | null }): number {
  const d = args.anchorDistance;
  if (d === null || !Number.isFinite(d)) return 0.25;

  // Map: 0.10 -> 1.0, 0.60 -> 0.0 (clamped)
  const strength = 1 - (d - 0.1) / 0.5;
  return clamp01(strength);
}

function hasTasteDislikeHit(args: {
  recText: string;
  tasteSummary: GroupedTaste | null;
}): boolean {
  const { recText, tasteSummary } = args;
  if (!tasteSummary) return false;

  const groups: TasteGroup[] = ["era", "fit", "rise", "wash", "fabric"];
  for (const g of groups) {
    const dislikes = tasteSummary[g]?.dislikes ?? [];
    for (const it of dislikes) {
      const needles = tasteKeyToNeedles(it.key);
      if (needles.length && includesOne(recText, needles)) return true;
    }
  }
  return false;
}

function computeRecConfidence(args: {
  rec: DenimRec;
  allowedFits: string[] | null;
  allowedRises: string[] | null;
  tasteSummary: GroupedTaste | null;
  anchorDistance: number | null;
}): { confidence_score: number; confidence_label: "strong" | "good" | "bridge" } {
  const recText = tokenizeRecText(args.rec);

  const vibe = scoreVibeConstraint({
    rec: args.rec,
    allowedFits: args.allowedFits,
    allowedRises: args.allowedRises,
  });

  const taste = scoreTasteMatch({ recText, tasteSummary: args.tasteSummary });
  const anchor = scoreAnchorStrength({ anchorDistance: args.anchorDistance });

  const base = 0.12;
  const score = base + 0.58 * vibe.score + 0.22 * taste + 0.08 * anchor;

let finalScore = vibe.ok ? clamp01(score) : clamp01(Math.min(score, 0.25));

const dislikeHit = hasTasteDislikeHit({ recText, tasteSummary: args.tasteSummary });
const weakAnchor = args.anchorDistance !== null && args.anchorDistance > 0.55;

let label: "strong" | "good" | "bridge" =
  finalScore >= 0.78 ? "strong" : finalScore >= 0.6 ? "good" : "bridge";

// ✅ If we force bridge for “risk”, keep the % honest
if (dislikeHit || weakAnchor) {
  label = "bridge";
  finalScore = Math.min(finalScore, 0.69); // cap so it won't appear “strong”
}

return { confidence_score: finalScore, confidence_label: label };
}

/* ---------------- Deterministic Re-ranker for Anchors ---------------- */

type StyleProfileShape = {
  era?: string;
  rise?: string;
  wash?: string;
  fabric?: string;
  silhouette?: string[];
  vibe?: string[];
};

function extractFromStyleProfile(style_profile: unknown): {
  rise: string;
  wash: string;
  fabric: string;
  silhouette: string[];
  vibe: string[];
} {
  if (!style_profile || typeof style_profile !== "object") {
    return { rise: "", wash: "", fabric: "", silhouette: [], vibe: [] };
  }

  const sp = style_profile as StyleProfileShape;

  return {
    rise: norm(sp.rise),
    wash: norm(sp.wash),
    fabric: norm(sp.fabric),
    silhouette: Array.isArray(sp.silhouette)
      ? sp.silhouette.map(norm).filter(Boolean)
      : [],
    vibe: Array.isArray(sp.vibe) ? sp.vibe.map(norm).filter(Boolean) : [],
  };
}

function extractAllowedWash(vibeProfile: VibeProfile): string[] {
  if (!vibeProfile?.attributes || typeof vibeProfile.attributes !== "object") {
    return [];
  }

  const attrs = vibeProfile.attributes as Record<string, unknown>;
  const wash = attrs["wash"];

  if (!Array.isArray(wash)) return [];
  return wash.map(norm).filter(Boolean);
}

function scoreAnchor(args: {
  look: TopLook;
  allowedFits: string[] | null;
  allowedRises: string[] | null;
  vibeProfile: VibeProfile;
  tasteSummary: GroupedTaste | null;
}) {
  const { look, allowedFits, allowedRises, vibeProfile, tasteSummary } = args;

  const dist = typeof look.distance === "number" ? look.distance : 1;
  let score = 1 - dist;

  if (look.has_public_image) score += 0.08;

  const sp = extractFromStyleProfile(look.style_profile);
  const canon = norm(look.canonical_text);

  if (allowedFits?.length) {
    const fitHits = allowedFits.map(norm);
    const silhouetteText = sp.silhouette.join(" ");
    const ok = includesOne(silhouetteText + " " + canon, fitHits);
    score += ok ? 0.12 : -0.2;
  }

  if (allowedRises?.length) {
    const riseHits = allowedRises.map(norm);
    const ok = includesOne(sp.rise + " " + canon, riseHits);
    score += ok ? 0.1 : -0.15;
  }

  const allowedWash = extractAllowedWash(vibeProfile);
  if (allowedWash.length) {
    const ok = includesOne(sp.wash + " " + canon, allowedWash);
    score += ok ? 0.06 : 0;
  }

  const dislikedWash =
    tasteSummary?.wash?.dislikes.map((x) => norm(x.key.replace("wash_", ""))) ??
    [];
  if (dislikedWash.length && includesOne(sp.wash + " " + canon, dislikedWash)) {
    score -= 0.06;
  }

  const dislikedFabric =
    tasteSummary?.fabric?.dislikes.map((x) =>
      norm(x.key.replace("fabric_", ""))
    ) ?? [];
  if (
    dislikedFabric.length &&
    includesOne(sp.fabric + " " + canon, dislikedFabric)
  ) {
    score -= 0.06;
  }

  return score;
}

function rerankAnchors(args: {
  looks: TopLook[];
  allowedFits: string[] | null;
  allowedRises: string[] | null;
  vibeProfile: VibeProfile;
  tasteSummary: GroupedTaste | null;
}) {
  const scored = args.looks.map((look) => ({
    look,
    _score: scoreAnchor({
      look,
      allowedFits: args.allowedFits,
      allowedRises: args.allowedRises,
      vibeProfile: args.vibeProfile,
      tasteSummary: args.tasteSummary,
    }),
  }));

  scored.sort((a, b) => b._score - a._score);
  return scored.map((x) => x.look);
}

/**
 * Supports common vibe attribute shapes:
 * - attributes.fit: ["Baggy","Relaxed"]
 * - attributes.fit.primary / secondary: string or string[]
 * - attributes.rise: ["Low","Mid"]
 * - attributes.rise.primary / secondary: string or string[]
 */
function extractAllowedFromVibeAttributes(attrs: unknown): {
  allowedFits: string[] | null;
  allowedRises: string[] | null;
} {
  const fitNode = getAttr(attrs, "fit");
  const riseNode = getAttr(attrs, "rise");

  const fitPrimary = getAttr(fitNode, "primary");
  const fitSecondary = getAttr(fitNode, "secondary");

  const risePrimary = getAttr(riseNode, "primary");
  const riseSecondary = getAttr(riseNode, "secondary");

  const allowedFits =
    asStringArray(fitNode) ??
    asStringArray(fitPrimary) ??
    (typeof fitPrimary === "string" ? [fitPrimary] : null) ??
    asStringArray(fitSecondary) ??
    (typeof fitSecondary === "string" ? [fitSecondary] : null);

  const allowedRises =
    asStringArray(riseNode) ??
    asStringArray(risePrimary) ??
    (typeof risePrimary === "string" ? [risePrimary] : null) ??
    asStringArray(riseSecondary) ??
    (typeof riseSecondary === "string" ? [riseSecondary] : null);

  const dedupe = (arr: string[] | null) => {
    if (!arr) return null;
    const seen = new Set<string>();
    const out: string[] = [];
    for (const s of arr) {
      const k = s.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(s);
    }
    return out.length ? out : null;
  };

  return {
    allowedFits: dedupe(allowedFits),
    allowedRises: dedupe(allowedRises),
  };
}

/* ---------------- Stub ---------------- */

function stubRecommendations(): DenimRec[] {
  // In fallback, we fill anchor_look_id + anchor_reason later.
  return [
    {
      brand: "Levi's",
      model: "501",
      era_inspiration: "90s supermodel",
      fit: "straight",
      rise: "mid",
      wash: "medium indigo",
      stretch_level: "rigid",
      why_each_pick:
        "A timeless straight-leg jean that defined 90s off-duty supermodel style.",
      search_queries: ["Levi's 501 vintage straight jean"],
      anchor_look_id: "",
      anchor_reason: "",
    },
    {
      brand: "Wrangler",
      model: "13MWZ",
      era_inspiration: "80s Americana",
      fit: "cowboy cut",
      rise: "high",
      wash: "dark indigo",
      stretch_level: "rigid",
      why_each_pick: "Authentic cowboy-cut denim with structure and attitude.",
      search_queries: ["Wrangler 13MWZ cowboy cut jean"],
      anchor_look_id: "",
      anchor_reason: "",
    },
    {
      brand: "Lee",
      model: "Rider",
      era_inspiration: "90s minimalist",
      fit: "straight",
      rise: "mid",
      wash: "medium wash",
      stretch_level: "rigid",
      why_each_pick: "Clean, structured denim aligned with strong 90s minimalism.",
      search_queries: ["Lee Rider straight leg jean"],
      anchor_look_id: "",
      anchor_reason: "",
    },
  ];
}

/* ---------------- Taste Summary (Grouped) ---------------- */

function groupForKey(key: string): TasteGroup | null {
  if (key.startsWith("era_")) return "era";
  if (key.startsWith("fit_")) return "fit";
  if (key.startsWith("rise_")) return "rise";
  if (key.startsWith("wash_")) return "wash";
  if (key.startsWith("fabric_")) return "fabric";
  return null;
}

function summarizeTasteVectorGrouped(
  tv: TasteVector | null | undefined,
  topPerGroup = 2,
  bottomPerGroup = 1,
  threshold = 0.25
): GroupedTaste | null {
  if (!tv) return null;

  const grouped: Record<TasteGroup, { k: string; v: number }[]> = {
    era: [],
    fit: [],
    rise: [],
    wash: [],
    fabric: [],
  };

  for (const [k, raw] of Object.entries(tv)) {
    const v = Number(raw);
    if (!Number.isFinite(v)) continue;
    const g = groupForKey(k);
    if (!g) continue;
    grouped[g].push({ k, v });
  }

  const result: GroupedTaste = {
    era: { likes: [], dislikes: [] },
    fit: { likes: [], dislikes: [] },
    rise: { likes: [], dislikes: [] },
    wash: { likes: [], dislikes: [] },
    fabric: { likes: [], dislikes: [] },
  };

  (Object.keys(result) as TasteGroup[]).forEach((g) => {
    const arr = grouped[g];

    result[g].likes = arr
      .filter((x) => x.v > threshold)
      .sort((a, b) => b.v - a.v)
      .slice(0, topPerGroup)
      .map((x) => ({ key: x.k, weight: x.v }));

    result[g].dislikes = arr
      .filter((x) => x.v < -threshold)
      .sort((a, b) => a.v - b.v)
      .slice(0, bottomPerGroup)
      .map((x) => ({ key: x.k, weight: x.v }));
  });

  return result;
}

function enforceVibeOnFitRise(ts: GroupedTaste | null): GroupedTaste | null {
  if (!ts) return null;
  return {
    ...ts,
    fit: { likes: [], dislikes: ts.fit.dislikes },
    rise: { likes: [], dislikes: ts.rise.dislikes },
  };
}

function prettyTasteVector(
  tv: TasteVector | null | undefined,
  clampMin?: number | null,
  clampMax?: number | null,
  topN = 12
): DebugOpenAiSnapshot["taste_vector_pretty"] {
  const clamp =
    typeof clampMin === "number" && typeof clampMax === "number"
      ? { min: clampMin, max: clampMax }
      : null;

  if (!tv) {
    return {
      clamp,
      totals: null,
      groups: null,
      top_positive: [],
      top_negative: [],
    };
  }

  const entries = Object.entries(tv)
    .map(([key, v]) => ({ key, weight: Number(v) }))
    .filter((x) => Number.isFinite(x.weight));

  const top_positive = entries
    .filter((x) => x.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, topN);

  const top_negative = entries
    .filter((x) => x.weight < 0)
    .sort((a, b) => a.weight - b.weight)
    .slice(0, topN);

  const positives = entries.filter((x) => x.weight > 0).length;
  const negatives = entries.filter((x) => x.weight < 0).length;

  return {
    clamp,
    totals: { keys: entries.length, positives, negatives },
    groups: summarizeTasteVectorGrouped(tv),
    top_positive,
    top_negative,
  };
}

/* ---------------- OpenAI: Extract Text ---------------- */

function extractModelText(resp: OpenAIResponsesResult): string | null {
  if (typeof resp.output_text === "string" && resp.output_text.trim()) {
    return resp.output_text.trim();
  }

  if (Array.isArray(resp.output)) {
    for (const item of resp.output) {
      if (!item || !Array.isArray(item.content)) continue;

      const joined = item.content
        .map((c) =>
          typeof c?.text === "string"
            ? c.text
            : typeof c?.value === "string"
              ? c.value
              : ""
        )
        .join("")
        .trim();

      if (joined) return joined;
    }
  }

  const cc = resp.choices?.[0]?.message?.content;
  if (typeof cc === "string" && cc.trim()) return cc.trim();

  return null;
}

function parseAiJson(
  outText: string,
  validAnchorIds: Set<string>
): { recommendations: DenimRec[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(outText);
  } catch {
    throw new Error("Model returned non-JSON output.");
  }

  if (!isRecord(parsed)) throw new Error("AI JSON was not an object.");

  const recsUnknown = parsed["recommendations"];
  if (!Array.isArray(recsUnknown))
    throw new Error("Invalid AI JSON shape (missing recommendations array).");

  const recs: DenimRec[] = recsUnknown.map((r) => {
    if (!isRecord(r))
      throw new Error("Invalid recommendation item (not an object).");

    const brand = typeof r["brand"] === "string" ? r["brand"] : "";
    const model = typeof r["model"] === "string" ? r["model"] : "";
    const era_inspiration =
      typeof r["era_inspiration"] === "string" ? r["era_inspiration"] : "";
    const fit = typeof r["fit"] === "string" ? r["fit"] : "";
    const rise = typeof r["rise"] === "string" ? r["rise"] : "";
    const wash = typeof r["wash"] === "string" ? r["wash"] : "";
    const stretch_level =
      typeof r["stretch_level"] === "string" ? r["stretch_level"] : "";
    const why_each_pick =
      typeof r["why_each_pick"] === "string" ? r["why_each_pick"] : "";

    const anchor_look_id =
      typeof r["anchor_look_id"] === "string" ? r["anchor_look_id"] : "";
    const anchor_reason =
      typeof r["anchor_reason"] === "string" ? r["anchor_reason"] : "";

    if (!anchor_look_id) throw new Error("Recommendation missing anchor_look_id.");
    if (!validAnchorIds.has(anchor_look_id)) {
      throw new Error(
        `Recommendation anchor_look_id was not in top_celebrity_looks: ${anchor_look_id}`
      );
    }
    if (!anchor_reason || anchor_reason.trim().length < 12) {
      throw new Error("Recommendation missing anchor_reason (too short).");
    }

    const search_queries_unknown = r["search_queries"];
    const search_queries = Array.isArray(search_queries_unknown)
      ? search_queries_unknown
          .filter((q): q is string => typeof q === "string")
          .slice(0, 3)
      : [];

    return {
      brand,
      model,
      era_inspiration,
      fit,
      rise,
      wash,
      stretch_level,
      why_each_pick,
      search_queries,
      anchor_look_id,
      anchor_reason,
    };
  });

  if (recs.length === 0) throw new Error("AI returned zero recommendations.");
  return { recommendations: recs };
}

/* ---------------- OpenAI Call ---------------- */

function buildSchemaPayload(args: {
  model: string;
  vibe?: string;
  vibe_profile: VibeProfile;
  allowed_fits: string[] | null;
  allowed_rises: string[] | null;
  size?: string;
  budget?: number;
  taste_summary: GroupedTaste | null;
  top_celebrity_looks: TopLook[];
}) {
  const system = `
You are Refinda's denim curator: a decisive judgment engine.
Return ONLY valid JSON matching the schema. No markdown. No backticks.

Rules:
- Use taste_summary if provided. (Per-group likes/dislikes.)
- Prioritize strong positive weights; avoid strong negative weights.

- CELEBRITY LOOK ANCHORS:
  - You will receive top_celebrity_looks (celebrity_name + canonical_text + style_profile).
  - Use these as inspiration anchors for the recommendations.
  - At least 5 of the 7-10 picks must clearly align with one or more anchors (silhouette/fit, rise, wash, fabric, vibe).
  - Do NOT invent celebrity names. Only reference celebrities provided in top_celebrity_looks.

  - IMPORTANT (PER-REC ANCHORING):
    For EACH recommendation:
    1) Choose the single BEST matching anchor look_id from top_celebrity_looks and set recommendation.anchor_look_id.
       (Must be one of the provided look_id values.)
    2) Write recommendation.anchor_reason: ONE sentence (12-28 words) explaining the match using concrete traits
       (fit/silhouette, rise, wash, fabric, vibe). Do NOT mention “distance” or “embedding”.

- VIBE CONSTRAINTS (IMPORTANT):
  - If vibe_profile is provided, its attributes are the styling ground truth.
  - If allowed_fits is provided, every recommendation.fit MUST be one of allowed_fits.
  - If allowed_rises is provided, every recommendation.rise MUST be one of allowed_rises.
  - At least 70% of recommendations must match the vibe’s primary intent.
  - Only up to 2 "bridge picks" may deviate slightly, but must still feel compatible.

- IMPORTANT: Do NOT repeat the same era/fit/rise/wash/stretch for every item.
- Across 7-10 items, ensure variety:
  - at least 2 different eras
  - at least 2 different fits (within allowed_fits if provided)
  - at least 2 different washes
  - mix rise + stretch levels (within allowed_rises if provided)

- Stay aligned with vibe_profile + size + budget.
- Return 7-10 items.
`.trim();

  const userObj = {
    task: "Recommend 7-10 denim picks grounded in the provided top_celebrity_looks, aligned with vibe_profile, size, budget, and taste_summary.",
    vibe: args.vibe ?? null,
    vibe_profile: args.vibe_profile,
    allowed_fits: args.allowed_fits,
    allowed_rises: args.allowed_rises,
    size: args.size ?? null,
    budget: args.budget ?? null,
    taste_summary: args.taste_summary,
    top_celebrity_looks: (args.top_celebrity_looks ?? [])
      .slice(0, 5)
      .map((x) => ({
        celebrity_name: x.celebrity_name,
        look_id: x.celebrity_look_id,
        distance: Number(x.distance.toFixed(4)),
        canonical_text: x.canonical_text,
        style_profile: x.style_profile,
      })),
  };

  const user = JSON.stringify(userObj);

  const payload = {
    model: args.model,
    input: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    text: {
      format: {
        name: "denim_recommendations",
        type: "json_schema",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            recommendations: {
              type: "array",
              minItems: 7,
              maxItems: 10,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  brand: { type: "string" },
                  model: { type: "string" },
                  era_inspiration: { type: "string" },
                  fit: { type: "string" },
                  rise: { type: "string" },
                  wash: { type: "string" },
                  stretch_level: { type: "string" },
                  why_each_pick: { type: "string" },
                  search_queries: {
                    type: "array",
                    minItems: 1,
                    maxItems: 3,
                    items: { type: "string" },
                  },

                  // ✅ new required fields
                  anchor_look_id: { type: "string" },
                  anchor_reason: { type: "string" },
                },
                required: [
                  "brand",
                  "model",
                  "era_inspiration",
                  "fit",
                  "rise",
                  "wash",
                  "stretch_level",
                  "why_each_pick",
                  "search_queries",
                  "anchor_look_id",
                  "anchor_reason",
                ],
              },
            },
          },
          required: ["recommendations"],
        },
      },
    },
  };

  return { payload, system, user };
}

async function callOpenAI(payload: unknown): Promise<OpenAIResponsesResult> {
  const apiKey = getEnvOrThrow("OPENAI_API_KEY");

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${text}`);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`OpenAI returned non-JSON: ${text}`);
  }

  if (!isOpenAIResponsesResult(parsed)) {
    throw new Error("OpenAI response did not match expected Responses shape.");
  }

  return parsed;
}

async function getAiRecommendations(args: {
  vibe?: string;
  vibeProfile: VibeProfile;
  size?: string;
  budget?: number;
  profile: ProfileRow;
  topLooks: TopLook[];
}): Promise<AiResult> {
  const model = getEnv("OPENAI_MODEL", "gpt-4.1-mini");

  const tasteVector = args.profile?.taste_vector ?? null;
  const rawSummary = summarizeTasteVectorGrouped(tasteVector);
  const tasteSummary = args.vibeProfile ? enforceVibeOnFitRise(rawSummary) : rawSummary;

  const { allowedFits, allowedRises } = extractAllowedFromVibeAttributes(
    args.vibeProfile?.attributes
  );

  const built = buildSchemaPayload({
    model,
    vibe: args.vibe,
    vibe_profile: args.vibeProfile,
    allowed_fits: allowedFits,
    allowed_rises: allowedRises,
    size: args.size,
    budget: args.budget,
    taste_summary: tasteSummary,
    top_celebrity_looks: args.topLooks ?? [],
  });

  const data = await callOpenAI(built.payload);

  const outText = extractModelText(data);
  if (!outText) {
    console.error("OpenAI missing text: has output_text?", Boolean(data.output_text));
    console.error("OpenAI output length:", Array.isArray(data.output) ? data.output.length : 0);
    throw new Error(
      "No model text returned (output_text empty and no message content found)."
    );
  }

  // anchor lookup for validation + scoring
  const anchorDistanceByLookId: Record<string, number> = {};
  const validAnchorIds = new Set<string>();
  for (const l of args.topLooks ?? []) {
    validAnchorIds.add(l.celebrity_look_id);
    if (typeof l.distance === "number" && Number.isFinite(l.distance)) {
      anchorDistanceByLookId[l.celebrity_look_id] = l.distance;
    }
  }

  const parsed = parseAiJson(outText, validAnchorIds);
  if (parsed.recommendations.length < 7) throw new Error("AI returned too few recommendations.");

  const scored: DenimRec[] = parsed.recommendations.map((rec) => {
    const anchorDistance =
      typeof anchorDistanceByLookId[rec.anchor_look_id] === "number"
        ? anchorDistanceByLookId[rec.anchor_look_id]
        : null;

    const c = computeRecConfidence({
      rec,
      allowedFits,
      allowedRises,
      tasteSummary,
      anchorDistance,
    });

    return {
      ...rec,
      confidence_score: c.confidence_score,
      confidence_label: c.confidence_label,
    };
  });

  const looksPreview = (args.topLooks ?? []).slice(0, 3).map((x) => ({
    celebrity_name: x.celebrity_name,
    look_id: x.celebrity_look_id,
    distance: x.distance,
    canonical_text: x.canonical_text,
    has_public_image: x.has_public_image,
  }));

  const clampMin = args.profile?.taste_clamp_min ?? null;
  const clampMax = args.profile?.taste_clamp_max ?? null;

  const recs_preview = scored.slice(0, 5).map((r) => ({
    brand: r.brand,
    model: r.model,
    anchor_look_id: r.anchor_look_id,
    anchor_distance:
      typeof anchorDistanceByLookId[r.anchor_look_id] === "number"
        ? anchorDistanceByLookId[r.anchor_look_id]
        : null,
    anchor_reason: r.anchor_reason ?? null,
    confidence_score: typeof r.confidence_score === "number" ? r.confidence_score : null,
    confidence_label: r.confidence_label ?? null,
  }));

  const debug_openai: DebugOpenAiSnapshot = {
    model,
    vibe: args.vibe ?? null,
    vibe_profile_label: args.vibeProfile?.label ?? null,
    allowed_fits: allowedFits,
    allowed_rises: allowedRises,
    size: args.size ?? null,
    budget: args.budget ?? null,

    taste_vector_raw: tasteVector,
    taste_vector_pretty: prettyTasteVector(tasteVector, clampMin, clampMax, 12),

    taste_summary: tasteSummary,
    top_celebrity_looks_count: (args.topLooks ?? []).length,
    top_celebrity_looks_preview: looksPreview,

    recs_preview,

    system_preview: built.system.slice(0, 650),
    user_preview: built.user.slice(0, 2200),
  };

  return { recommendations: scored, model, debug_openai };
}

/* ---------------- Handler ---------------- */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" });

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json(401, { ok: false, error: "Missing Authorization header" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!supabaseUrl || !supabaseKey) {
    return json(500, { ok: false, error: "Missing SUPABASE_URL or SUPABASE_ANON_KEY" });
  }

  const USE_AI = Deno.env.get("USE_AI") === "true";

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: auth, error: authError } = await supabase.auth.getUser();
  const user = auth?.user ?? null;
  if (authError || !user) return json(401, { ok: false, error: "Unauthorized" });

  let body: RecommendBody = {};
  try {
    const raw: unknown = await req.json();
    if (isRecord(raw)) body = raw as RecommendBody;
  } catch {
    body = {};
  }

  const debug = body.debug === true;

  const size = typeof body.size === "string" ? body.size : undefined;
  const budget = safeNumber(body.budget);

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (profileErr) console.warn("profiles read failed (continuing):", profileErr.message);

  const vibeFromBody = typeof body.vibe === "string" ? body.vibe : undefined;
  const vibe = vibeFromBody ?? ((profile as ProfileRow)?.vibe_default ?? undefined);

  let vibeProfile: VibeProfile = null;
  if (vibe) {
    const { data, error } = await supabase
      .from("style_vibes")
      .select("id,label,attributes,core_jean_styles,why")
      .eq("id", vibe)
      .maybeSingle();

    if (!error && data) vibeProfile = data;
  }

  const startTime = Date.now();

  let ai_used = false;
  let ai_error: string | null = null;
  let modelUsed = getEnv("OPENAI_MODEL", "gpt-4.1-mini");

  let recommendations: DenimRec[] = stubRecommendations();
  let debug_openai: DebugOpenAiSnapshot | null = null;

  // Only fetch looks when AI is enabled (keeps non-AI path fast & cheap)
  let topLooks: TopLook[] = [];
  if (USE_AI) {
    try {
      const { data, error } = await supabase.rpc("match_celebrity_looks_for_user", {
        p_user_id: user.id,
        match_count: 20,
      });

      if (!error && Array.isArray(data)) topLooks = data as TopLook[];
      else if (error) console.warn("match_celebrity_looks_for_user error:", error.message);
    } catch (e) {
      console.warn("match_celebrity_looks_for_user failed:", e);
    }
  }

  const { allowedFits, allowedRises } = extractAllowedFromVibeAttributes(
    vibeProfile?.attributes
  );

  const tasteVector = (profile as ProfileRow)?.taste_vector ?? null;
  const rawSummary = summarizeTasteVectorGrouped(tasteVector);
  const tasteSummary = vibeProfile ? enforceVibeOnFitRise(rawSummary) : rawSummary;

  const rerankedLooks =
    vibeProfile && topLooks.length
      ? rerankAnchors({
          looks: topLooks,
          allowedFits,
          allowedRises,
          vibeProfile,
          tasteSummary,
        })
      : topLooks;

  const modelAnchors = rerankedLooks.slice(0, 6);

  if (USE_AI) {
    try {
      const ai = await getAiRecommendations({
        vibe,
        vibeProfile,
        size,
        budget,
        profile: profile as ProfileRow,
        topLooks: modelAnchors,
      });

      recommendations = ai.recommendations;
      modelUsed = ai.model;
      ai_used = true;

      if (debug) debug_openai = ai.debug_openai ?? null;
    } catch (e: unknown) {
      ai_error = e instanceof Error ? e.message : String(e);
      console.error("AI failed, using stub:", ai_error);

      const anchorDistanceByLookId: Record<string, number> = {};
      for (const l of modelAnchors) {
        if (typeof l.distance === "number" && Number.isFinite(l.distance)) {
          anchorDistanceByLookId[l.celebrity_look_id] = l.distance;
        }
      }
      const firstAnchorId = modelAnchors[0]?.celebrity_look_id ?? "";

      recommendations = stubRecommendations().map((rec) => {
        const anchor_look_id = firstAnchorId || "";
        const anchor_reason =
          anchor_look_id
            ? "Closest available anchor for this fallback pick (AI unavailable)."
            : "No anchors available (AI unavailable).";

        const anchorDistance =
          anchor_look_id && typeof anchorDistanceByLookId[anchor_look_id] === "number"
            ? anchorDistanceByLookId[anchor_look_id]
            : null;

        const filled: DenimRec = { ...rec, anchor_look_id, anchor_reason };

        const c = computeRecConfidence({
          rec: filled,
          allowedFits,
          allowedRises,
          tasteSummary,
          anchorDistance,
        });

        return {
          ...filled,
          confidence_score: c.confidence_score,
          confidence_label: c.confidence_label,
        };
      });
    }
  } else {
    // Non-AI path: fill anchor id + reason + score
    const anchorDistanceByLookId: Record<string, number> = {};
    for (const l of modelAnchors) {
      if (typeof l.distance === "number" && Number.isFinite(l.distance)) {
        anchorDistanceByLookId[l.celebrity_look_id] = l.distance;
      }
    }
    const firstAnchorId = modelAnchors[0]?.celebrity_look_id ?? "";

    recommendations = recommendations.map((rec) => {
      const anchor_look_id = firstAnchorId || "";
      const anchor_reason =
        anchor_look_id
          ? "Closest available anchor for this non-AI pick."
          : "No anchors available for this non-AI pick.";

      const anchorDistance =
        anchor_look_id && typeof anchorDistanceByLookId[anchor_look_id] === "number"
          ? anchorDistanceByLookId[anchor_look_id]
          : null;

      const filled: DenimRec = { ...rec, anchor_look_id, anchor_reason };

      const c = computeRecConfidence({
        rec: filled,
        allowedFits,
        allowedRises,
        tasteSummary,
        anchorDistance,
      });

      return {
        ...filled,
        confidence_score: c.confidence_score,
        confidence_label: c.confidence_label,
      };
    });
  }

  const latency_ms = Date.now() - startTime;

  const { data: runInsert, error: runErr } = await supabase
    .from("recommendation_runs")
    .insert({
      user_id: user.id,
      input: { vibe, size, budget },
      profile_snapshot: (profile as Record<string, unknown>) ?? {},
      recommendations,
      ai_used,
      model: modelUsed,
      latency_ms,
      recommendation_count: recommendations.length,
      top_anchor_look_ids: modelAnchors.map((l) => l.celebrity_look_id),
    })
    .select("id")
    .single();

  if (runErr) console.warn("recommendation_runs insert failed:", runErr.message);

  return json(200, {
    ok: true,
    ai_used,
    ai_error,
    run_id: runInsert?.id ?? null,
    user_id: user.id,
    input: { vibe, size, budget },
    debug_openai, // only when debug=true
    recommendations,
    anchor_looks: debug ? rerankedLooks : null, // only return anchors in debug
  });
});
/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/recommend-jeans' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
