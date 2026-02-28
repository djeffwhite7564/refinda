// app/admin/looks/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";

type LookRow = Database["public"]["Views"]["admin_look_summary"]["Row"];
type IngestStatus = Database["public"]["Enums"]["ingest_status"];
type AssetVisibility = Database["public"]["Enums"]["asset_visibility"];
type Celebrity = Pick<Database["public"]["Tables"]["celebrities"]["Row"], "id" | "name">;

// --- CONFIG ---
const PRIVATE_SOURCE_BUCKET = "private-source";
const PUBLIC_MEDIA_BUCKET = "public-media";
const INGEST_FUNCTION_NAME = "admin-ingest-celebrity-look";
const SIGN_FUNCTION_NAME = "admin-sign-asset";

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function safeShortId(id: unknown, n = 8) {
  const s = typeof id === "string" ? id : "";
  return s.length >= n ? `${s.slice(0, n)}…` : s || "—";
}

function formatDate(iso: unknown) {
  const s = typeof iso === "string" ? iso : null;
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString();
  } catch {
    return s;
  }
}

function IngestStatusPill({ status }: { status: unknown }) {
  const s = typeof status === "string" ? status : "unknown";
  const tone =
    s === "complete"
      ? "bg-green-100 text-green-800 ring-green-200"
      : s === "failed"
      ? "bg-red-100 text-red-800 ring-red-200"
      : s === "processing"
      ? "bg-blue-100 text-blue-800 ring-blue-200"
      : "bg-gray-100 text-gray-800 ring-gray-200";

  return (
    <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1", tone)}>
      {s}
    </span>
  );
}

function Button({
  children,
  onClick,
  variant = "default",
  disabled,
  type,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "default" | "secondary" | "danger" | "ghost";
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const base =
    "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition";
  const styles =
    variant === "default"
      ? "bg-gray-900 text-white hover:bg-gray-800 disabled:bg-gray-400"
      : variant === "secondary"
      ? "border bg-white text-gray-900 hover:bg-gray-50 disabled:opacity-60"
      : variant === "danger"
      ? "bg-red-600 text-white hover:bg-red-500 disabled:bg-red-300"
      : "text-gray-900 hover:bg-gray-100";
  return (
    <button type={type ?? "button"} className={cx(base, styles)} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-xl border">
        <div className="flex items-center justify-between border-b p-4">
          <div className="text-sm font-semibold text-gray-900">{title}</div>
          <button type="button" className="rounded-lg p-2 hover:bg-gray-100" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function Drawer({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl border-l">
        <div className="flex items-center justify-between border-b p-4">
          <div className="text-sm font-semibold text-gray-900">{title}</div>
          <button type="button" className="rounded-lg p-2 hover:bg-gray-100" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="p-4 overflow-y-auto h-[calc(100%-64px)]">{children}</div>
      </div>
    </div>
  );
}

function buildObjectPath(prefix: string, celebId: string, file: File) {
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${prefix}/${celebId}/${stamp}-${safeName}`;
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * Resolve a URL for an asset:
 * - public: uses getPublicUrl(bucket, object_path)
 * - private: calls admin-sign-asset with asset_id
 */
async function resolveAssetUrl(opts: {
  supabase: ReturnType<typeof createSupabaseBrowserClient>;
  assetId: string | null;
  bucket: string | null;
  objectPath: string | null;
  visibility: AssetVisibility | null;
  expiresIn?: number;
}): Promise<string | null> {
  const { supabase, assetId, bucket, objectPath, visibility, expiresIn = 600 } = opts;
  if (!bucket || !objectPath) return null;

  // ✅ CRITICAL: private-source must NEVER use getPublicUrl
  if (bucket === PRIVATE_SOURCE_BUCKET) {
    if (!assetId) return null;

    const { data, error } = await supabase.functions.invoke(SIGN_FUNCTION_NAME, {
      body: { asset_id: assetId, expires_in: expiresIn },
    });

    if (!error && data?.url) return data.url as string;
    return null;
  }

  // public-media (or other public buckets)
  if (visibility === "public") {
    const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath);
    return data?.publicUrl ?? null;
  }

  // private but not private-source: sign via function too (safe default)
  if (visibility === "private") {
    if (!assetId) return null;
    const { data, error } = await supabase.functions.invoke(SIGN_FUNCTION_NAME, {
      body: { asset_id: assetId, expires_in: expiresIn },
    });
    if (!error && data?.url) return data.url as string;
    return null;
  }

  // unknown: don't risk generating a bad URL
  return null;
}



export default function AdminLooksPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  // data
  const [celebs, setCelebs] = useState<Celebrity[]>([]);
  const [rows, setRows] = useState<LookRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  // filters
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<IngestStatus | "all">("all");
  const [activeOnly, setActiveOnly] = useState(false);
  const [celebFilter, setCelebFilter] = useState<string>("all");

  // actions
  const [busyIds, setBusyIds] = useState<Record<string, boolean>>({});

  // drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<LookRow | null>(null);
  const [drawerPreviewUrl, setDrawerPreviewUrl] = useState<string | null>(null);

  // thumbnails cache
  const [thumbByLookId, setThumbByLookId] = useState<Record<string, string>>({});
  const thumbReqId = useRef(0);

  // add look modal
  const [addOpen, setAddOpen] = useState(false);
  const [addCelebrityId, setAddCelebrityId] = useState<string>("");
  const [addPrivateFile, setAddPrivateFile] = useState<File | null>(null);
  const [addPublicFile, setAddPublicFile] = useState<File | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [addWorking, setAddWorking] = useState(false);
  const [addProgress, setAddProgress] = useState<string>("");

  async function loadCelebs() {
    const { data, error } = await supabase
      .from("celebrities")
      .select("id,name")
      .order("name", { ascending: true })
      .returns<Celebrity[]>();

    if (error) throw error;

    const list = data ?? [];
    setCelebs(list);
    if (!addCelebrityId && list.length > 0) setAddCelebrityId(list[0].id);
  }

  async function loadLooks() {
    setLoading(true);
    setPageError(null);

    try {
      let query = supabase
        .from("admin_look_summary")
        .select(
          [
            "id",
            "celebrity_id",
            "celebrity_name",
            "ingest_status",
            "ingest_error",
            "is_active",
            "updated_at",
            "created_at",
            "ingested_at",
            "canonical_text",
            "style_profile",
            "image_url",
            "source_asset_id",
            "source_bucket",
            "source_object_path",
            "source_visibility",
            "display_asset_id",
            "display_bucket",
            "display_object_path",
            "display_visibility",
          ].join(",")
        )
        .order("updated_at", { ascending: false })
        .limit(200);

      if (activeOnly) query = query.eq("is_active", true);
      if (status !== "all") query = query.eq("ingest_status", status);
      if (celebFilter !== "all") query = query.eq("celebrity_id", celebFilter);

      const { data, error } = await query.returns<LookRow[]>();
      if (error) throw error;

      const needle = q.trim().toLowerCase();
      let out = data ?? [];

      if (needle) {
        out = out.filter((r) => {
          const celebName = (r.celebrity_name ?? "").toLowerCase();
          const st = (r.ingest_status ?? "").toString().toLowerCase();
          const text = (r.canonical_text ?? "").toLowerCase();
          return `${celebName} ${st} ${text}`.includes(needle);
        });
      }

      setRows(out);
      void primeThumbs(out);
    } catch (e: any) {
      setPageError(e?.message ?? "Failed to load looks");
    } finally {
      setLoading(false);
    }
  }

async function primeThumbs(list: LookRow[]) {
  const candidates = list
    .slice(0, 24)
    .filter((r) => typeof r.id === "string" && r.id.length > 0)
    .filter((r) => !thumbByLookId[r.id as string]);

  if (candidates.length === 0) return;

  const req = ++thumbReqId.current;

  const pairs = await Promise.all(
    candidates.map(async (r) => {
      const id = r.id as string;

      // 1) Try display first
      const displayUrl = await resolveAssetUrl({
        supabase,
        assetId: (r.display_asset_id as any) ?? null,
        bucket: (r.display_bucket as any) ?? null,
        objectPath: (r.display_object_path as any) ?? null,
        visibility: (r.display_visibility as any) ?? null,
        expiresIn: 600,
      });
      if (displayUrl) return [id, displayUrl] as const;

      // 2) Fallback to source (private)
      const sourceUrl = await resolveAssetUrl({
        supabase,
        assetId: (r.source_asset_id as any) ?? null,
        bucket: (r.source_bucket as any) ?? null,
        objectPath: (r.source_object_path as any) ?? null,
        visibility: (r.source_visibility as any) ?? null,
        expiresIn: 600,
      });
      if (sourceUrl) return [id, sourceUrl] as const;

      return [id, null] as const;
    })
  );

  if (req !== thumbReqId.current) return;

  setThumbByLookId((prev) => {
    const next = { ...prev };
    for (const [id, url] of pairs) {
      if (url) next[id] = url;
    }
    return next;
  });
}


  useEffect(() => {
    (async () => {
      try {
        await loadCelebs();
        await loadLooks();
      } catch (e: any) {
        setPageError(e?.message ?? "Failed to initialize");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadLooks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, activeOnly, celebFilter]);

  useEffect(() => {
    const t = setTimeout(() => void loadLooks(), 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function toggleActive(lookId: string, next: boolean) {
    setBusyIds((m) => ({ ...m, [lookId]: true }));
    setRows((prev) => prev.map((r) => (r.id === lookId ? ({ ...r, is_active: next } as LookRow) : r)));

    try {
      const { error } = await supabase.from("celebrity_looks").update({ is_active: next }).eq("id", lookId);
      if (error) throw error;
      await loadLooks();
    } catch (e: any) {
      setRows((prev) => prev.map((r) => (r.id === lookId ? ({ ...r, is_active: !next } as LookRow) : r)));
      setPageError(e?.message ?? "Failed to update is_active");
    } finally {
      setBusyIds((m) => ({ ...m, [lookId]: false }));
    }
  }

  async function forceIngest(lookId: string) {
    setBusyIds((m) => ({ ...m, [lookId]: true }));
    try {
      const { error } = await supabase.functions.invoke(INGEST_FUNCTION_NAME, {
        body: { look_id: lookId, force: true },
      });
      if (error) throw error;
      await loadLooks();
    } catch (e: any) {
      setPageError(e?.message ?? "Failed to invoke ingest");
    } finally {
      setBusyIds((m) => ({ ...m, [lookId]: false }));
    }
  }

  async function getPreviewUrlFromRow(row: LookRow) {
    setDrawerPreviewUrl(null);

    // 1) display
    const displayUrl = await resolveAssetUrl({
      supabase,
      assetId: (row.display_asset_id as any) ?? null,
      bucket: (row.display_bucket as any) ?? null,
      objectPath: (row.display_object_path as any) ?? null,
      visibility: (row.display_visibility as any) ?? null,
      expiresIn: 600,
    });
    if (displayUrl) {
      setDrawerPreviewUrl(displayUrl);
      return;
    }

    // 2) source
    const sourceUrl = await resolveAssetUrl({
      supabase,
      assetId: (row.source_asset_id as any) ?? null,
      bucket: (row.source_bucket as any) ?? null,
      objectPath: (row.source_object_path as any) ?? null,
      visibility: (row.source_visibility as any) ?? null,
      expiresIn: 600,
    });
    if (sourceUrl) {
      setDrawerPreviewUrl(sourceUrl);
      return;
    }

    // 3) legacy
    if (row.image_url && row.image_url !== "about:blank") {
      setDrawerPreviewUrl(row.image_url);
      return;
    }

    setDrawerPreviewUrl(null);
  }

  async function openDrawer(row: LookRow) {
    setSelected(row);
    setDrawerOpen(true);
    try {
      await getPreviewUrlFromRow(row);
    } catch (e: any) {
      setPageError(e?.message ?? "Failed to load preview");
    }
  }

  async function addLookSubmit() {
    setAddError(null);
    
const { data } = await supabase.auth.getUser();
console.log("addLookSubmit user:", data.user);

    if (!addCelebrityId) {
      setAddError("Select a celebrity.");
      return;
    }
    if (!addPrivateFile && !addPublicFile) {
      setAddError("Upload at least one image (private source recommended).");
      return;
    }

    setAddWorking(true);
    setAddProgress("Uploading assets…");

    try {
      let source_asset_id: string | null = null;
      let display_asset_id: string | null = null;
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? null;

      // 1) Upload private source
      if (addPrivateFile) {
        const object_path = buildObjectPath("source", addCelebrityId, addPrivateFile);

        const { error: upErr } = await supabase.storage
          .from(PRIVATE_SOURCE_BUCKET)
          .upload(object_path, addPrivateFile, { upsert: false, contentType: addPrivateFile.type });

        if (upErr) throw upErr;

        setAddProgress("Saving private source asset record…");

        const { data: ins, error: insErr } = await supabase
          .from("media_assets")
          .insert({
            bucket: PRIVATE_SOURCE_BUCKET,
            object_path,
            visibility: "private" as AssetVisibility,
            mime_type: addPrivateFile.type || null,
            bytes: addPrivateFile.size ?? null,
            title: addPrivateFile.name,
            created_by: uid,
          })
          .select("id")
          .single();

        if (insErr) throw insErr;
        source_asset_id = (ins as any).id as string;
      }

      // 2) Upload public display
      if (addPublicFile) {
        const object_path = buildObjectPath("display", addCelebrityId, addPublicFile);

        const { error: upErr } = await supabase.storage
          .from(PUBLIC_MEDIA_BUCKET)
          .upload(object_path, addPublicFile, { upsert: false, contentType: addPublicFile.type });

        if (upErr) throw upErr;

        setAddProgress("Saving public display asset record…");

        const { data: ins, error: insErr } = await supabase
          .from("media_assets")
          .insert({
            bucket: PUBLIC_MEDIA_BUCKET,
            object_path,
            visibility: "public" as AssetVisibility,
            mime_type: addPublicFile.type || null,
            bytes: addPublicFile.size ?? null,
            title: addPublicFile.name,
            created_by: uid,
          })
          .select("id")
          .single();

        if (insErr) throw insErr;
        display_asset_id = (ins as any).id as string;
      }

      // 3) Insert celebrity_looks
      setAddProgress("Creating look record…");

      const { data: look, error: lookErr } = await supabase
        .from("celebrity_looks")
        .insert({
          celebrity_id: addCelebrityId,
          source_asset_id,
          display_asset_id,
          ingest_status: "queued" as IngestStatus,
          is_active: true,
        })
        .select("id")
        .single();

      if (lookErr) throw lookErr;
      const lookId = (look as any).id as string;

      // 4) Invoke ingest
      setAddProgress("Invoking ingest…");

      const { error: fnErr } = await supabase.functions.invoke(INGEST_FUNCTION_NAME, {
        body: { look_id: lookId },
      });
      if (fnErr) throw fnErr;

      // 5) Poll status
      setAddProgress("Waiting for ingest status…");

      let attempts = 0;
      while (attempts < 40) {
        attempts += 1;
        await sleep(1500);

        const { data: s, error: sErr } = await supabase
          .from("celebrity_looks")
          .select("id,ingest_status,ingest_error")
          .eq("id", lookId)
          .single();

        if (sErr) throw sErr;

        const st = (s as any).ingest_status as IngestStatus;
        if (st === "complete") {
          setAddProgress("Complete ✅");
          break;
        }
        if (st === "failed") {
          setAddProgress("Failed ❌");
          break;
        }
        setAddProgress(`Ingesting… (${String(st)})`);
      }

      setAddOpen(false);
      setAddPrivateFile(null);
      setAddPublicFile(null);
      setAddProgress("");
      await loadLooks();
    } catch (e: any) {
      setAddError(e?.message ?? "Add Look failed");
    } finally {
      setAddWorking(false);
    }
  }

  const queued = rows.filter((r) => r.ingest_status === "queued").length;
  const processing = rows.filter((r) => r.ingest_status === "processing").length;
  const failed = rows.filter((r) => r.ingest_status === "failed").length;
  const complete = rows.filter((r) => r.ingest_status === "complete").length;

  const drawerTitle = selected ? `${selected.celebrity_name ?? "—"} • Look ${safeShortId(selected.id)}` : "Look";

  return (
    <div className="mx-auto max-w-7xl p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Looks</h1>
          <p className="mt-1 text-sm text-gray-600">Filter, inspect, retry ingestion, and curate which looks are active.</p>
        </div>

        <div className="flex gap-2">
          <Link href="/admin" className="rounded-xl border px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50">
            Dashboard
          </Link>
          <Link
            href="/admin/celebrities"
            className="rounded-xl border px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
          >
            Celebrities
          </Link>
          <Button onClick={() => setAddOpen(true)}>Add Look</Button>
        </div>
      </div>

      {pageError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{pageError}</div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-gray-500">Queued</div>
          <div className="mt-1 text-xl font-semibold">{queued}</div>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-gray-500">Processing</div>
          <div className="mt-1 text-xl font-semibold">{processing}</div>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-gray-500">Failed</div>
          <div className="mt-1 text-xl font-semibold">{failed}</div>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-gray-500">Complete</div>
          <div className="mt-1 text-xl font-semibold">{complete}</div>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-4 shadow-sm space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <input
            className="w-full lg:max-w-md rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-200"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search celebrity, status, canonical text…"
          />

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-700">Status</span>
              <select className="rounded-xl border px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value as any)}>
                <option value="all">All</option>
                <option value="queued">queued</option>
                <option value="processing">processing</option>
                <option value="failed">failed</option>
                <option value="complete">complete</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-700">Celebrity</span>
              <select className="rounded-xl border px-3 py-2 text-sm" value={celebFilter} onChange={(e) => setCelebFilter(e.target.value)}>
                <option value="all">All</option>
                {celebs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
              Active only
            </label>

            <Button variant="secondary" onClick={() => loadLooks()} disabled={loading}>
              {loading ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-600">
              <tr>
                <th className="p-3">Thumb</th>
                <th className="p-3">Celebrity</th>
                <th className="p-3">Status</th>
                <th className="p-3">Active</th>
                <th className="p-3">Updated</th>
                <th className="p-3">Ingested</th>
                <th className="p-3">Assets</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => {
                const id = typeof r.id === "string" ? r.id : "";
                const thumb = id ? thumbByLookId[id] : null;

                return (
                  <tr key={id || `${r.celebrity_id}-${String(r.created_at)}`} className="hover:bg-gray-50">
                    <td className="p-3">
                      <div className="h-12 w-12 overflow-hidden rounded-lg border bg-gray-100">
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumb} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="h-full w-full" />
                        )}
                      </div>
                    </td>

                    <td className="p-3 font-medium text-gray-900">
                      <div className="flex flex-col">
                        <span>{r.celebrity_name ?? "—"}</span>
                        <span className="text-xs text-gray-500 font-mono">{safeShortId(r.id)}</span>
                      </div>
                    </td>

                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <IngestStatusPill status={r.ingest_status} />
                        {r.ingest_status === "failed" && r.ingest_error ? (
                          <span className="text-xs text-red-700 truncate max-w-[260px]" title={r.ingest_error}>
                            {r.ingest_error}
                          </span>
                        ) : null}
                      </div>
                    </td>

                    <td className="p-3">
                      <span className={cx("text-xs", r.is_active ? "text-gray-900" : "text-gray-500")}>
                        {r.is_active ? "Yes" : "No"}
                      </span>
                    </td>

                    <td className="p-3 text-gray-600">{formatDate(r.updated_at)}</td>
                    <td className="p-3 text-gray-600">{formatDate(r.ingested_at)}</td>

                    <td className="p-3 text-xs text-gray-700">
                      <div className="flex flex-col">
                        <span>source: {safeShortId(r.source_asset_id)}</span>
                        <span>display: {safeShortId(r.display_asset_id)}</span>
                      </div>
                    </td>

                    <td className="p-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <Button variant="ghost" onClick={() => openDrawer(r)}>
                          View
                        </Button>
                        <Button variant="secondary" disabled={!id || !!busyIds[id]} onClick={() => id && forceIngest(id)}>
                          {id && busyIds[id] ? "…" : "Re-run ingest"}
                        </Button>
                        <Button
                          variant={r.is_active ? "secondary" : "default"}
                          disabled={!id || !!busyIds[id]}
                          onClick={() => id && toggleActive(id, !r.is_active)}
                        >
                          {r.is_active ? "Deactivate" : "Activate"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {!loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-6 text-sm text-gray-500">
                    No looks found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Drawer */}
      <Drawer
        open={drawerOpen}
        title={drawerTitle}
        onClose={() => {
          setDrawerOpen(false);
          setSelected(null);
          setDrawerPreviewUrl(null);
        }}
      >
        {selected ? (
          <div className="space-y-4">
            <div className="rounded-2xl border bg-white p-3">
              <div className="text-xs text-gray-500">Preview</div>
              <div className="mt-2 rounded-xl border bg-gray-50 overflow-hidden">
                {drawerPreviewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={drawerPreviewUrl} alt="" className="w-full object-cover" />
                ) : (
                  <div className="p-6 text-sm text-gray-500">No preview available</div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border bg-white p-3">
                <div className="text-xs text-gray-500">Status</div>
                <div className="mt-1 flex items-center gap-2">
                  <IngestStatusPill status={selected.ingest_status} />
                  <span className="text-xs text-gray-600">updated {formatDate(selected.updated_at)}</span>
                </div>
              </div>
              <div className="rounded-2xl border bg-white p-3">
                <div className="text-xs text-gray-500">Active</div>
                <div className="mt-1 text-sm text-gray-900">{selected.is_active ? "Yes" : "No"}</div>
              </div>
            </div>

            {selected.ingest_error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-3">
                <div className="text-xs font-medium text-red-800">Ingest error</div>
                <div className="mt-1 text-xs text-red-800 whitespace-pre-wrap">{selected.ingest_error}</div>
              </div>
            ) : null}

            <div className="rounded-2xl border bg-white p-3">
              <div className="text-xs text-gray-500">Canonical text</div>
              <div className="mt-2 text-sm text-gray-900 whitespace-pre-wrap">{selected.canonical_text ?? "—"}</div>
            </div>

            <div className="rounded-2xl border bg-white p-3">
              <div className="text-xs text-gray-500">Style profile (JSON)</div>
              <pre className="mt-2 overflow-x-auto rounded-xl bg-gray-50 p-3 text-xs text-gray-800">
                {JSON.stringify(selected.style_profile ?? {}, null, 2)}
              </pre>
            </div>

            <div className="rounded-2xl border bg-white p-3">
              <div className="text-xs text-gray-500">Assets</div>
              <div className="mt-2 text-xs text-gray-800 space-y-1">
                <div>
                  <span className="text-gray-500">source_asset_id:</span>{" "}
                  <span className="font-mono">{selected.source_asset_id ?? "—"}</span>
                </div>
                <div>
                  <span className="text-gray-500">display_asset_id:</span>{" "}
                  <span className="font-mono">{selected.display_asset_id ?? "—"}</span>
                </div>
                <div>
                  <span className="text-gray-500">image_url:</span>{" "}
                  <span className="font-mono">{selected.image_url ?? "—"}</span>
                </div>
              </div>

              <div className="mt-3 flex gap-2 flex-wrap">
                <Button variant="secondary" onClick={() => getPreviewUrlFromRow(selected)}>
                  Refresh preview URL
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => typeof selected.id === "string" && forceIngest(selected.id)}
                  disabled={typeof selected.id !== "string"}
                >
                  Force re-ingest
                </Button>
                <Button
                  variant={selected.is_active ? "secondary" : "default"}
                  onClick={() => typeof selected.id === "string" && toggleActive(selected.id, !selected.is_active)}
                  disabled={typeof selected.id !== "string"}
                >
                  {selected.is_active ? "Mark inactive" : "Mark active"}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </Drawer>

      {/* Add Look Modal */}
      <Modal open={addOpen} title="Add Look" onClose={() => (addWorking ? null : setAddOpen(false))}>
        <div className="space-y-4">
          <div className="rounded-xl border bg-gray-50 p-3 text-sm text-gray-700">
            Upload a <b>private source</b> (recommended) and optionally a <b>public display</b>. We’ll create{" "}
            <span className="font-mono">media_assets</span> rows, create the look, invoke ingest, and poll status.
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">Celebrity</label>
            <select
              className="w-full rounded-xl border px-3 py-2 text-sm"
              value={addCelebrityId}
              onChange={(e) => setAddCelebrityId(e.target.value)}
              disabled={addWorking}
            >
              {celebs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">
                Private source (<span className="font-mono">{PRIVATE_SOURCE_BUCKET}</span>)
              </label>
              <input type="file" accept="image/*" disabled={addWorking} onChange={(e) => setAddPrivateFile(e.target.files?.[0] ?? null)} />
              <div className="text-xs text-gray-500">{addPrivateFile ? addPrivateFile.name : "No file selected"}</div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">
                Public display (<span className="font-mono">{PUBLIC_MEDIA_BUCKET}</span>)
              </label>
              <input type="file" accept="image/*" disabled={addWorking} onChange={(e) => setAddPublicFile(e.target.files?.[0] ?? null)} />
              <div className="text-xs text-gray-500">{addPublicFile ? addPublicFile.name : "No file selected"}</div>
            </div>
          </div>

          {addError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{addError}</div>
          ) : null}

          {addProgress ? <div className="rounded-xl border bg-white p-3 text-sm text-gray-700">{addProgress}</div> : null}

          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" disabled={addWorking} onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button disabled={addWorking} onClick={addLookSubmit}>
              {addWorking ? "Working…" : "Create + Ingest"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}



