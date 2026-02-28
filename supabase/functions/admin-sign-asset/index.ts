// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
// supabase/functions/admin-sign-asset/index.ts
// supabase/functions/admin-sign-asset/index.ts
// supabase/functions/admin-sign-asset/index.ts

import { createClient } from "@supabase/supabase-js";

type Body = {
  asset_id?: string;
  expires_in?: number;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

function getBearer(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return json(500, { error: "Missing env vars" });
    }

    const bearer = getBearer(req);
    if (!bearer) return json(401, { error: "Missing Authorization header" });

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Validate user
    const { data: userRes, error: userErr } = await supabase.auth.getUser(bearer);
    if (userErr || !userRes?.user) {
      return json(401, { error: "Invalid user session" });
    }

    const body = (await req.json()) as Body;
    const assetId = body.asset_id;
    const expiresIn = Math.max(60, Math.min(body.expires_in ?? 600, 3600));

    if (!assetId) return json(400, { error: "asset_id required" });

    const { data: asset, error: assetErr } = await supabase
      .from("media_assets")
      .select("bucket, object_path, visibility")
      .eq("id", assetId)
      .single();

    if (assetErr || !asset) {
      return json(404, { error: "Asset not found" });
    }

    // Public assets
    if (asset.visibility === "public") {
      const { data } = supabase.storage
        .from(asset.bucket)
        .getPublicUrl(asset.object_path);

      return json(200, { url: data.publicUrl });
    }

    // Private assets
    const { data: signed, error: signErr } = await supabase.storage
      .from(asset.bucket)
      .createSignedUrl(asset.object_path, expiresIn);

    if (signErr) {
      return json(500, { error: signErr.message });
    }

    return json(200, { url: signed.signedUrl });
  } catch (err) {
    return json(500, { error: String(err) });
  }
});




/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/admin-sign-asset' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
