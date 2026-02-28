import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  // Require login
  if (userErr || !user) redirect("/login");

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("aesthetic_archetype, fit_preference, vibe_default")
    .eq("id", user.id)
    .maybeSingle();

  const needsOnboarding =
    !!profileErr ||
    !profile ||
    !profile.aesthetic_archetype ||
    !profile.fit_preference ||
    !profile.vibe_default;

  if (needsOnboarding) redirect("/onboarding");

  return <>{children}</>;
}


