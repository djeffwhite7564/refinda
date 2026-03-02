// src/app/results/layout.tsx
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ResultsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) redirect("/login");

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("aesthetic_archetype, fit_preference, vibe_default")
    .eq("id", user.id)
    .maybeSingle();

  if (profileErr || !profile) redirect("/onboarding");

  if (!profile.vibe_default) redirect("/vibe");

  if (!profile.aesthetic_archetype || !profile.fit_preference) {
    redirect("/onboarding");
  }

  return <>{children}</>;
}

