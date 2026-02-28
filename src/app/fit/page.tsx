import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import FitForm from "./fit-form";

export default async function FitPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) redirect("/login");

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("waist, inseam, fit_preference, favorite_celebrities, jean_style_preferences")
    .eq("id", user.id)
    .maybeSingle();

  if (profileErr) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-bold">Set your fit</h1>
        <p className="mt-4 text-red-600">Failed to load profile: {profileErr.message}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-4xl font-extrabold tracking-tight">Set your fit</h1>
      <p className="mt-3 text-neutral-600">
        Sizing + fit + celebrity anchors help us curate your exact matches.
      </p>

      <div className="mt-10 rounded-2xl border border-neutral-200 p-6">
        <FitForm
          initial={
            profile ?? {
              waist: null,
              inseam: null,
              fit_preference: null,
              favorite_celebrities: [],
              jean_style_preferences: [],
            }
          }
        />
      </div>
    </main>
  );
}




