// src/app/profile/page.tsx
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function errMsg(e: unknown): string | null {
  if (!e) return null;
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e && "message" in e && typeof (e as any).message === "string") {
    return (e as any).message;
  }
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

function deriveDisplayName(user: { email?: string | null; user_metadata?: any } | null): string {
  const meta = user?.user_metadata ?? {};
  const fromMeta = typeof meta.display_name === "string" ? meta.display_name.trim() : "";
  if (fromMeta) return fromMeta;

  const email = user?.email ?? "";
  const prefix = email.includes("@") ? email.split("@")[0] : email;
  return prefix || "User";
}

type ProfileRow = {
  id: string;
  display_name: string | null;
  vibe_default: string | null;
  aesthetic_archetype: string | null;
  fit_preference: string | null;
  rise_preference: string | null;
  wash_preference: string[] | null;
  stretch_preference: string | null;
  waist: number | null;
  inseam: number | null;
  jean_style_preferences: string[] | null;
  budget_tier: string | null;
  avoid_brands: string[] | null;
  is_admin: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

export default async function ProfilePage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) redirect("/login");

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select(
      [
        "id",
        "display_name",
        "vibe_default",
        "aesthetic_archetype",
        "fit_preference",
        "rise_preference",
        "wash_preference",
        "stretch_preference",
        "waist",
        "inseam",
        "jean_style_preferences",
        "budget_tier",
        "avoid_brands",
        "is_admin",
        "created_at",
        "updated_at",
      ].join(",")
    )
    .eq("id", user.id)
    .maybeSingle<ProfileRow>();

  // Repair display_name if missing (prevents NOT NULL issues elsewhere)
  const desiredDisplayName = deriveDisplayName(user);
  let repaired = false;
  let repairedErr: unknown = null;

  let finalProfile = profile ?? null;

  const needsRepair =
    !finalProfile || !finalProfile.display_name || !finalProfile.display_name.trim();

  if (!profileErr && needsRepair) {
    const { data: repairedProfile, error: upErr } = await supabase
      .from("profiles")
      .upsert({ id: user.id, display_name: desiredDisplayName }, { onConflict: "id" })
      .select(
        [
          "id",
          "display_name",
          "vibe_default",
          "aesthetic_archetype",
          "fit_preference",
          "rise_preference",
          "wash_preference",
          "stretch_preference",
          "waist",
          "inseam",
          "jean_style_preferences",
          "budget_tier",
          "avoid_brands",
          "is_admin",
          "created_at",
          "updated_at",
        ].join(",")
      )
      .maybeSingle<ProfileRow>();

    if (upErr) {
      repairedErr = upErr;
    } else {
      repaired = true;
      finalProfile = repairedProfile ?? finalProfile;
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-20">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold">Your Profile</h1>
          <p className="mt-2 text-gray-600">Account + saved taste settings.</p>
        </div>

        <a href="/results" className="rounded-xl border px-4 py-2 text-sm hover:bg-gray-50">
          Back to Results
        </a>
      </div>

      <div className="mt-8 rounded-2xl border bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm text-gray-500">Signed in</div>
            <div className="mt-1 font-medium">{user.email}</div>

            <div className="mt-3 text-sm text-gray-700">
              <span className="font-medium">Display name:</span>{" "}
              <span className="text-gray-900">{finalProfile?.display_name ?? "—"}</span>
            </div>

            <div className="mt-1 text-sm text-gray-700">
              <span className="font-medium">Admin:</span>{" "}
              {String(finalProfile?.is_admin ?? false)}
            </div>
          </div>

          {repaired ? (
            <span className="rounded-full border bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
              display_name repaired
            </span>
          ) : null}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-xl border bg-gray-50 p-4">
            <div className="text-xs font-semibold text-gray-500">Taste</div>
            <div className="mt-2 space-y-1 text-sm text-gray-800">
              <div>
                <span className="font-medium">Aesthetic:</span>{" "}
                {finalProfile?.aesthetic_archetype ?? "—"}
              </div>
              <div>
                <span className="font-medium">Vibe default:</span>{" "}
                {finalProfile?.vibe_default ?? "—"}
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-gray-50 p-4">
            <div className="text-xs font-semibold text-gray-500">Fit</div>
            <div className="mt-2 space-y-1 text-sm text-gray-800">
              <div>
                <span className="font-medium">Fit:</span>{" "}
                {finalProfile?.fit_preference ?? "—"}
              </div>
              <div>
                <span className="font-medium">Rise:</span>{" "}
                {finalProfile?.rise_preference ?? "—"}
              </div>
              <div>
                <span className="font-medium">Waist / Inseam:</span>{" "}
                {(finalProfile?.waist ?? "—") as any} x {(finalProfile?.inseam ?? "—") as any}
              </div>
            </div>
          </div>
        </div>

        {(profileErr || repairedErr) ? (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="font-medium">Warning</div>
            <div className="mt-1">
              {profileErr ? `profiles read: ${errMsg(profileErr)}` : null}
              {profileErr && repairedErr ? " • " : null}
              {repairedErr ? `repair upsert: ${errMsg(repairedErr)}` : null}
            </div>
          </div>
        ) : null}
      </div>

      <details className="mt-8 rounded-2xl border bg-gray-50 p-4">
        <summary className="cursor-pointer select-none text-sm font-medium">
          Debug
        </summary>
        <pre className="mt-4 overflow-auto rounded-xl bg-black p-6 text-xs text-white">
          {JSON.stringify(
            {
              user: { id: user.id, email: user.email, user_metadata: user.user_metadata },
              userErr: errMsg(userErr),
              profile: finalProfile,
              profileErr: errMsg(profileErr),
              repaired,
              repairedErr: errMsg(repairedErr),
            },
            null,
            2
          )}
        </pre>
      </details>
    </main>
  );
}




