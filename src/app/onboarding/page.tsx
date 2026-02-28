import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import OnboardingClient from "./OnboardingClient";
import type { InitialProfile } from "./types";

export default async function OnboardingPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) redirect("/login");

  const { data, error: profileErr } = await supabase
    .from("profiles")
    .select(
      [
        "id",
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
      ].join(",")
    )
    .eq("id", user.id)
    .maybeSingle();

  if (profileErr) {
    // If you prefer, you can redirect or show an error page instead.
    // For onboarding, it's safe to continue with a minimal profile.
    // console.warn("profiles read failed:", profileErr.message);
  }

  const profile = (data as InitialProfile | null) ?? null;

  return <OnboardingClient initialProfile={profile ?? ({ id: user.id } as InitialProfile)} />;
}




