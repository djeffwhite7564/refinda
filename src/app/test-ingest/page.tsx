"use client";

import { useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type IngestPayload =
  | {
      look_id: string;
      tags?: string[] | null;
      notes?: string | null;
    }
  | {
      celebrity_id: string;
      source_asset_id?: string | null;
      display_asset_id?: string | null;
      image_url?: string | null; // legacy fallback only
      is_active?: boolean;
      tags?: string[] | null;
      notes?: string | null;
    };

type RunResult =
  | {
      ok: true;
      status: number;
      url: string;
      parsed: unknown;
      raw: string;
      tokenPrefix: string;
      anonKeyPrefix: string;
      userId: string;
    }
  | {
      ok: false;
      status: number;
      url: string;
      error: string;
      parsed: unknown;
      raw: string;
      tokenPrefix: string;
      anonKeyPrefix: string;
      userId: string;
    };

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

type Mode = "by_look_id" | "create_and_ingest";

export default function IngestLookTestPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [mode, setMode] = useState<Mode>("by_look_id");

  const [lookId, setLookId] = useState<string>("");

  const [createPayload, setCreatePayload] = useState<{
    celebrity_id: string;
    source_asset_id: string;
    display_asset_id: string;
    image_url: string;
    is_active: boolean;
  }>({
    celebrity_id: "",
    source_asset_id: "",
    display_asset_id: "",
    image_url: "",
    is_active: true,
  });

  const [tags, setTags] = useState<string>("90s, straight, minimal");
  const [notes, setNotes] = useState<string>("Admin ingest test");

  const [running, setRunning] = useState(false);
  const [out, setOut] = useState<RunResult | null>(null);

  function tagsArray(): string[] {
    return tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }

  async function run() {
    setRunning(true);
    setOut(null);

    try {
      const {
        data: { session },
        error: sessErr,
      } = await supabase.auth.getSession();

      if (sessErr) {
        setOut({
          ok: false,
          status: 0,
          url: "",
          error: `getSession error: ${sessErr.message}`,
          parsed: null,
          raw: "",
          tokenPrefix: "",
          anonKeyPrefix: "",
          userId: "",
        });
        return;
      }

      if (!session?.access_token || !session.user?.id) {
        setOut({
          ok: false,
          status: 0,
          url: "",
          error: "No active session. Please log in and retry.",
          parsed: null,
          raw: "",
          tokenPrefix: "",
          anonKeyPrefix: "",
          userId: "",
        });
        return;
      }

      const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!baseUrl) {
        setOut({
          ok: false,
          status: 0,
          url: "",
          error: "Missing NEXT_PUBLIC_SUPABASE_URL in env.",
          parsed: null,
          raw: "",
          tokenPrefix: session.access_token.slice(0, 20),
          anonKeyPrefix: "",
          userId: session.user.id,
        });
        return;
      }
      if (!anon) {
        setOut({
          ok: false,
          status: 0,
          url: "",
          error: "Missing NEXT_PUBLIC_SUPABASE_ANON_KEY in env.",
          parsed: null,
          raw: "",
          tokenPrefix: session.access_token.slice(0, 20),
          anonKeyPrefix: "",
          userId: session.user.id,
        });
        return;
      }

      const url = `${baseUrl}/functions/v1/admin-ingest-celebrity-look`;

      let payload: IngestPayload;

      if (mode === "by_look_id") {
        if (!lookId.trim()) {
          setOut({
            ok: false,
            status: 0,
            url,
            error: "Enter a look_id.",
            parsed: null,
            raw: "",
            tokenPrefix: session.access_token.slice(0, 20),
            anonKeyPrefix: anon.slice(0, 12),
            userId: session.user.id,
          });
          return;
        }

        payload = {
          look_id: lookId.trim(),
          tags: tagsArray(),
          notes: notes || null,
        };
      } else {
        const celeb = createPayload.celebrity_id.trim();
        const src = createPayload.source_asset_id.trim();
        const disp = createPayload.display_asset_id.trim();
        const legacy = createPayload.image_url.trim();

        if (!celeb) {
          setOut({
            ok: false,
            status: 0,
            url,
            error: "celebrity_id is required in Create+Ingest mode.",
            parsed: null,
            raw: "",
            tokenPrefix: session.access_token.slice(0, 20),
            anonKeyPrefix: anon.slice(0, 12),
            userId: session.user.id,
          });
          return;
        }

        if (!src && !disp && !legacy) {
          setOut({
            ok: false,
            status: 0,
            url,
            error:
              "Provide source_asset_id, display_asset_id, or image_url (legacy fallback).",
            parsed: null,
            raw: "",
            tokenPrefix: session.access_token.slice(0, 20),
            anonKeyPrefix: anon.slice(0, 12),
            userId: session.user.id,
          });
          return;
        }

        payload = {
          celebrity_id: celeb,
          source_asset_id: src || null,
          display_asset_id: disp || null,
          image_url: legacy || null,
          is_active: createPayload.is_active,
          tags: tagsArray(),
          notes: notes || null,
        };
      }

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anon,
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      const raw = await res.text();
      const parsed = safeJsonParse(raw);

      const base: Omit<RunResult, "ok" | "status" | "error"> = {
        url,
        parsed,
        raw,
        tokenPrefix: session.access_token.slice(0, 20),
        anonKeyPrefix: anon.slice(0, 12),
        userId: session.user.id,
      };

      if (!res.ok) {
        setOut({
          ok: false,
          status: res.status,
          error: `HTTP ${res.status}`,
          ...base,
        });
        return;
      }

      setOut({
        ok: true,
        status: res.status,
        ...base,
      });
    } catch (e) {
      setOut({
        ok: false,
        status: 0,
        url: "",
        error: e instanceof Error ? e.message : String(e),
        parsed: null,
        raw: "",
        tokenPrefix: "",
        anonKeyPrefix: "",
        userId: "",
      });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="p-8 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Admin Ingest Look Test</h1>
        <p className="text-sm text-gray-600">
          Calls <code className="px-1">admin-ingest-celebrity-look</code> using your
          current session (Bearer) + anon <code className="px-1">apikey</code>.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMode("by_look_id")}
          className={`border px-3 py-2 rounded ${mode === "by_look_id" ? "bg-gray-100" : ""}`}
        >
          Ingest by look_id
        </button>
        <button
          type="button"
          onClick={() => setMode("create_and_ingest")}
          className={`border px-3 py-2 rounded ${
            mode === "create_and_ingest" ? "bg-gray-100" : ""
          }`}
        >
          Create + ingest
        </button>
      </div>

      <div className="grid gap-3 max-w-3xl">
        {mode === "by_look_id" ? (
          <label className="grid gap-1">
            <span className="text-sm text-gray-700">look_id</span>
            <input
              className="border rounded px-3 py-2"
              value={lookId}
              onChange={(e) => setLookId(e.target.value)}
              placeholder="uuid of celebrity_looks.id"
            />
            <span className="text-xs text-gray-500">
              Preferred mode once the admin UI creates looks with asset ids.
            </span>
          </label>
        ) : (
          <>
            <label className="grid gap-1">
              <span className="text-sm text-gray-700">celebrity_id</span>
              <input
                className="border rounded px-3 py-2"
                value={createPayload.celebrity_id}
                onChange={(e) =>
                  setCreatePayload((p) => ({ ...p, celebrity_id: e.target.value }))
                }
                placeholder="uuid of celebrities.id"
              />
            </label>

            <label className="grid gap-1">
              <span className="text-sm text-gray-700">source_asset_id (optional)</span>
              <input
                className="border rounded px-3 py-2"
                value={createPayload.source_asset_id}
                onChange={(e) =>
                  setCreatePayload((p) => ({ ...p, source_asset_id: e.target.value }))
                }
                placeholder="uuid of media_assets.id (private-source)"
              />
            </label>

            <label className="grid gap-1">
              <span className="text-sm text-gray-700">display_asset_id (optional)</span>
              <input
                className="border rounded px-3 py-2"
                value={createPayload.display_asset_id}
                onChange={(e) =>
                  setCreatePayload((p) => ({ ...p, display_asset_id: e.target.value }))
                }
                placeholder="uuid of media_assets.id (public-media)"
              />
              <span className="text-xs text-gray-500">
                If you provide only one asset id, the function will use it for vision.
              </span>
            </label>

            <label className="grid gap-1">
              <span className="text-sm text-gray-700">image_url (legacy fallback)</span>
              <input
                className="border rounded px-3 py-2"
                value={createPayload.image_url}
                onChange={(e) =>
                  setCreatePayload((p) => ({ ...p, image_url: e.target.value }))
                }
                placeholder="optional legacy public URL"
              />
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={createPayload.is_active}
                onChange={(e) =>
                  setCreatePayload((p) => ({ ...p, is_active: e.target.checked }))
                }
              />
              Set look is_active = true
            </label>
          </>
        )}

        <label className="grid gap-1">
          <span className="text-sm text-gray-700">Notes (optional)</span>
          <input
            className="border rounded px-3 py-2"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>

        <label className="grid gap-1">
          <span className="text-sm text-gray-700">Tags (comma-separated)</span>
          <input
            className="border rounded px-3 py-2"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
        </label>

        <div className="flex items-center gap-3">
          <button onClick={run} disabled={running} className="border px-4 py-2 rounded">
            {running ? "Running..." : "Run Ingest"}
          </button>

          <button
            type="button"
            disabled={running}
            className="border px-4 py-2 rounded"
            onClick={() => {
              setLookId("");
              setCreatePayload({
                celebrity_id: "",
                source_asset_id: "",
                display_asset_id: "",
                image_url: "",
                is_active: true,
              });
              setTags("90s, straight, minimal");
              setNotes("Admin ingest test");
              setOut(null);
            }}
          >
            Reset
          </button>
        </div>
      </div>

      {out && (
        <div className="space-y-3">
          <div className={`border rounded p-3 ${out.ok ? "bg-green-50" : "bg-red-50"}`}>
            <div className="text-sm">
              <div>
                <span className="font-semibold">Status:</span>{" "}
                {out.status || "(no status)"} {out.ok ? "✅" : "❌"}
              </div>
              <div className="truncate">
                <span className="font-semibold">URL:</span> {out.url || "(n/a)"}
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                <div>
                  <span className="font-semibold">User:</span> {out.userId || "(n/a)"}
                </div>
                <div>
                  <span className="font-semibold">Token:</span>{" "}
                  <span className="font-mono">{out.tokenPrefix || "(n/a)"}</span>…
                </div>
                <div>
                  <span className="font-semibold">Anon:</span>{" "}
                  <span className="font-mono">{out.anonKeyPrefix || "(n/a)"}</span>…
                </div>
              </div>
              {!out.ok && (
                <div className="mt-2">
                  <span className="font-semibold">Error:</span> {out.error}
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <div className="text-sm font-semibold">Parsed</div>
              <pre className="border rounded p-3 text-xs overflow-auto whitespace-pre-wrap bg-white">
                {JSON.stringify(out.parsed, null, 2)}
              </pre>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-semibold">Raw</div>
              <pre className="border rounded p-3 text-xs overflow-auto whitespace-pre-wrap bg-white">
                {out.raw}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}




