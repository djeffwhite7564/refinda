"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type CelebritySummaryRow = {
  id: string;
  name: string;
  primary_archetype: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  looks_count: number;
  last_look_updated_at: string | null;
};

type SortKey =
  | "updated_at"
  | "name"
  | "looks_count"
  | "last_look_updated_at"
  | "is_active";

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function StatusDot({ active }: { active: boolean }) {
  return (
    <span
      className={classNames(
        "inline-block h-2 w-2 rounded-full",
        active ? "bg-green-500" : "bg-gray-300"
      )}
      aria-label={active ? "Active" : "Inactive"}
      title={active ? "Active" : "Inactive"}
    />
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
    <button
      type={type ?? "button"}
      className={classNames(base, styles)}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={classNames(
        "relative inline-flex h-6 w-11 items-center rounded-full border transition",
        checked ? "bg-gray-900 border-gray-900" : "bg-gray-200 border-gray-200",
        disabled && "opacity-60 cursor-not-allowed"
      )}
      aria-pressed={checked}
    >
      <span
        className={classNames(
          "inline-block h-5 w-5 transform rounded-full bg-white shadow transition",
          checked ? "translate-x-5" : "translate-x-1"
        )}
      />
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
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-xl border">
        <div className="flex items-center justify-between border-b p-4">
          <div className="text-sm font-semibold text-gray-900">{title}</div>
          <button
            type="button"
            className="rounded-lg p-2 hover:bg-gray-100"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function CelebrityForm({
  initial,
  saving,
  error,
  onSubmit,
  onCancel,
}: {
  initial: { name: string; primary_archetype: string; notes: string };
  saving: boolean;
  error: string | null;
  onSubmit: (v: { name: string; primary_archetype: string; notes: string }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [primaryArchetype, setPrimaryArchetype] = useState(initial.primary_archetype);
  const [notes, setNotes] = useState(initial.notes);

  useEffect(() => {
    setName(initial.name);
    setPrimaryArchetype(initial.primary_archetype);
    setNotes(initial.notes);
  }, [initial.name, initial.primary_archetype, initial.notes]);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ name: name.trim(), primary_archetype: primaryArchetype.trim(), notes });
      }}
    >
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-700">Name</label>
        <input
          className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-200"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Jennifer Aniston"
          required
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-700">Primary archetype</label>
        <input
          className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-200"
          value={primaryArchetype}
          onChange={(e) => setPrimaryArchetype(e.target.value)}
          placeholder="e.g., Modern Minimal / 90s Casual / Bombshell..."
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-700">Notes</label>
        <textarea
          className="w-full min-h-[96px] rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-200"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Internal notes for curation / sourcing / style direction…"
        />
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving || !name.trim()}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

export default function AdminCelebritiesPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [rows, setRows] = useState<CelebritySummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [showInactive, setShowInactive] = useState(true);

  const [sortKey, setSortKey] = useState<SortKey>("updated_at");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  // modal state
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formInitial, setFormInitial] = useState({ name: "", primary_archetype: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // row-level toggles state
  const [busyIds, setBusyIds] = useState<Record<string, boolean>>({});

  async function load() {
    setLoading(true);
    setPageError(null);
    try {
      // Use the view for fast list reads
      let query = supabase
        .from("admin_celebrity_summary")
        .select(
          "id,name,primary_archetype,is_active,created_at,updated_at,looks_count,last_look_updated_at"
        );

      if (!showInactive) query = query.eq("is_active", true);

      // Sorting
      if (sortKey === "name") query = query.order("name", { ascending: sortDir === "asc" });
      else if (sortKey === "looks_count") query = query.order("looks_count", { ascending: sortDir === "asc" });
      else if (sortKey === "last_look_updated_at")
        query = query.order("last_look_updated_at", { ascending: sortDir === "asc", nullsFirst: false });
      else if (sortKey === "is_active") query = query.order("is_active", { ascending: sortDir === "asc" });
      else query = query.order("updated_at", { ascending: sortDir === "asc" });

      // Search (client-side for simplicity & to avoid ilike on a view; we can move to RPC if needed)
      const { data, error } = await query;
      if (error) throw error;

      let out = (data ?? []) as CelebritySummaryRow[];
      const needle = q.trim().toLowerCase();
      if (needle) {
        out = out.filter(
          (r) =>
            r.name.toLowerCase().includes(needle) ||
            (r.primary_archetype ?? "").toLowerCase().includes(needle)
        );
      }

      setRows(out);
    } catch (e: any) {
      setPageError(e?.message ?? "Failed to load celebrities");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInactive, sortKey, sortDir]);

  useEffect(() => {
    const t = setTimeout(() => load(), 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function openCreate() {
    setEditingId(null);
    setFormInitial({ name: "", primary_archetype: "", notes: "" });
    setFormError(null);
    setOpen(true);
  }

  async function openEdit(id: string) {
    setFormError(null);
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("celebrities")
        .select("id,name,primary_archetype,notes")
        .eq("id", id)
        .single();
      if (error) throw error;

      setEditingId(id);
      setFormInitial({
        name: data.name ?? "",
        primary_archetype: data.primary_archetype ?? "",
        notes: data.notes ?? "",
      });
      setOpen(true);
    } catch (e: any) {
      setPageError(e?.message ?? "Failed to load celebrity");
    } finally {
      setSaving(false);
    }
  }

  async function saveCelebrity(v: { name: string; primary_archetype: string; notes: string }) {
    setSaving(true);
    setFormError(null);

    try {
      if (!v.name.trim()) throw new Error("Name is required");

      if (editingId) {
        const { error } = await supabase
          .from("celebrities")
          .update({
            name: v.name.trim(),
            primary_archetype: v.primary_archetype.trim() || null,
            notes: v.notes || null,
          })
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("celebrities").insert({
          name: v.name.trim(),
          primary_archetype: v.primary_archetype.trim() || null,
          notes: v.notes || null,
          is_active: false,
        });
        if (error) throw error;
      }

      setOpen(false);
      await load();
    } catch (e: any) {
      setFormError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(id: string, next: boolean) {
    setBusyIds((m) => ({ ...m, [id]: true }));

    // optimistic UI
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, is_active: next } : r)));

    try {
      const { error } = await supabase.from("celebrities").update({ is_active: next }).eq("id", id);
      if (error) throw error;
      // reload to refresh updated_at and ordering
      await load();
    } catch (e: any) {
      // rollback
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, is_active: !next } : r)));
      setPageError(e?.message ?? "Failed to update is_active");
    } finally {
      setBusyIds((m) => ({ ...m, [id]: false }));
    }
  }

  const activeCount = rows.filter((r) => r.is_active).length;

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Celebrities</h1>
          <p className="mt-1 text-sm text-gray-600">
            Manage your catalog. Create/edit celebs, activate for storefront, and track look coverage.
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href="/admin"
            className="rounded-xl border px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
          >
            Dashboard
          </Link>
          <Link
            href="/admin/looks"
            className="rounded-xl border px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
          >
            Looks
          </Link>
          <Button onClick={openCreate}>Create</Button>
        </div>
      </div>

      {pageError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {pageError}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">Total</div>
          <div className="mt-1 text-2xl font-semibold text-gray-900">{rows.length}</div>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">Active</div>
          <div className="mt-1 text-2xl font-semibold text-gray-900">{activeCount}</div>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">Inactive</div>
          <div className="mt-1 text-2xl font-semibold text-gray-900">
            {rows.length - activeCount}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-4 shadow-sm space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 gap-2">
            <input
              className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-200"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name or archetype…"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
              />
              Show inactive
            </label>

            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-700">Sort</span>
              <select
                className="rounded-xl border px-3 py-2 text-sm"
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
              >
                <option value="updated_at">Updated</option>
                <option value="name">Name</option>
                <option value="looks_count">Looks count</option>
                <option value="last_look_updated_at">Last look updated</option>
                <option value="is_active">Active</option>
              </select>
              <select
                className="rounded-xl border px-3 py-2 text-sm"
                value={sortDir}
                onChange={(e) => setSortDir(e.target.value as "asc" | "desc")}
              >
                <option value="desc">Desc</option>
                <option value="asc">Asc</option>
              </select>
            </div>

            <Button variant="secondary" onClick={load} disabled={loading}>
              {loading ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-600">
              <tr>
                <th className="p-3"> </th>
                <th className="p-3">Name</th>
                <th className="p-3">Primary archetype</th>
                <th className="p-3">Looks</th>
                <th className="p-3">Last look updated</th>
                <th className="p-3">Updated</th>
                <th className="p-3">Active</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="p-3">
                    <StatusDot active={r.is_active} />
                  </td>
                  <td className="p-3 font-medium text-gray-900">
                    <div className="flex flex-col">
                      <span>{r.name}</span>
                      <span className="text-xs text-gray-500 font-mono">{r.id.slice(0, 8)}…</span>
                    </div>
                  </td>
                  <td className="p-3 text-gray-700">{r.primary_archetype ?? "—"}</td>
                  <td className="p-3 text-gray-900">{r.looks_count ?? 0}</td>
                  <td className="p-3 text-gray-600">{formatDate(r.last_look_updated_at)}</td>
                  <td className="p-3 text-gray-600">{formatDate(r.updated_at)}</td>
                  <td className="p-3">
                    <Toggle
                      checked={r.is_active}
                      disabled={!!busyIds[r.id]}
                      onChange={(v) => toggleActive(r.id, v)}
                    />
                  </td>
                  <td className="p-3 text-right">
                    <div className="inline-flex items-center gap-2">
                      <Button variant="ghost" onClick={() => openEdit(r.id)}>
                        Edit
                      </Button>
                      <Link
                        href={`/admin/celebrity/${encodeURIComponent(r.id)}`}
                        className="rounded-xl px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-100"
                      >
                        Details
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}

              {!loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-6 text-sm text-gray-500">
                    No celebrities found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={open}
        title={editingId ? "Edit celebrity" : "Create celebrity"}
        onClose={() => (saving ? null : setOpen(false))}
      >
        <CelebrityForm
          initial={formInitial}
          saving={saving}
          error={formError}
          onCancel={() => setOpen(false)}
          onSubmit={saveCelebrity}
        />
      </Modal>
    </div>
  );
}
