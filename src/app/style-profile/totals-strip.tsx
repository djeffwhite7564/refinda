// src/app/style-profile/totals-strip.tsx

type Totals = {
  total_actions: number;
  saves: number;
  purchases: number;
  not_for_me: number;
  last_action_at: string | null;
};

function formatLastAction(ts: string | null) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString();
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-2 text-3xl font-bold text-gray-900">{value}</div>
      {sub ? <div className="mt-1 text-xs text-gray-500">{sub}</div> : null}
    </div>
  );
}

export default function TotalsStrip({
  totals,
  loading = false,
}: {
  totals: Totals | null;
  loading?: boolean;
}) {
  const last = formatLastAction(totals?.last_action_at ?? null);

  return (
    <div className="rounded-3xl border bg-gradient-to-b from-white to-gray-50 p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-gray-900">Learning Totals</div>
          <div className="mt-1 text-xs text-gray-500">
            Real-time behavioral signals powering your denim identity.
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-full border bg-white px-3 py-1 text-xs text-gray-600">
            Last action: <span className="font-mono">{last}</span>
          </span>

          <span
            className={[
              "rounded-full px-3 py-1 text-xs",
              loading
                ? "bg-blue-50 text-blue-700 border border-blue-200"
                : "bg-gray-100 text-gray-600",
            ].join(" ")}
          >
            {loading ? "Refreshing…" : "Up to date"}
          </span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Signals" value={totals?.total_actions ?? 0} sub="Total events" />
        <StatCard label="Saves" value={totals?.saves ?? 0} sub="Positive intent" />
        <StatCard label="Purchases" value={totals?.purchases ?? 0} sub="Strongest weight" />
        <StatCard label="Not for me" value={totals?.not_for_me ?? 0} sub="Negative signal" />
      </div>
    </div>
  );
}


