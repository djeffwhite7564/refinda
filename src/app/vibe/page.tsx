import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import VibePicker from "./vibe-picker";

function errMsg(e: unknown): string {
  if (!e) return "Unknown error";
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && "message" in e && typeof (e as any).message === "string") {
    return (e as any).message;
  }
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

export default async function VibePage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) redirect("/login");

  const { data: existingProfile, error: profileReadErr } = await supabase
    .from("profiles")
    .select("id, vibe_default")
    .eq("id", user.id)
    .maybeSingle();

  if (profileReadErr) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-16">
        <h1 className="text-3xl font-bold">Choose your Style Vibe</h1>
        <p className="mt-4 text-red-600">Failed to load profile: {errMsg(profileReadErr)}</p>
      </main>
    );
  }

  if (!existingProfile) {
    const { error: upsertErr } = await supabase.from("profiles").upsert({
      id: user.id,
      display_name: (user.user_metadata?.full_name as string | undefined) ?? "",
      vibe_default: "model-off-duty",
    });

    if (upsertErr) {
      return (
        <main className="mx-auto max-w-5xl px-6 py-16">
          <h1 className="text-3xl font-bold">Choose your Style Vibe</h1>
          <p className="mt-4 text-red-600">Failed to create profile: {errMsg(upsertErr)}</p>
        </main>
      );
    }
  }

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("vibe_default")
    .eq("id", user.id)
    .single();

  if (profileErr) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-16">
        <h1 className="text-3xl font-bold">Choose your Style Vibe</h1>
        <p className="mt-4 text-red-600">Failed to load current vibe: {errMsg(profileErr)}</p>
      </main>
    );
  }

  const { data: vibes, error: vibesErr } = await supabase
    .from("style_vibes")
    .select("id,label,audience,description,core_jean_styles,attributes,why")
    .order("label", { ascending: true });

  if (vibesErr) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-16">
        <h1 className="text-3xl font-bold">Choose your Style Vibe</h1>
        <p className="mt-4 text-red-600">Failed to load vibes: {errMsg(vibesErr)}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <h1 className="text-4xl font-extrabold tracking-tight">Choose your Style Vibe</h1>
      <p className="mt-3 text-neutral-600">
        This powers your jean matches, celebrity style inspiration, and curated finds across the web.
      </p>

      <div className="mt-8">
        <div className="mb-4 text-sm text-neutral-600">
          vibes loaded on server: {vibes?.length ?? 0}
        </div>

        <VibePicker
          initialVibe={profile.vibe_default ?? "model-off-duty"}
          vibes={vibes ?? []}
        />
      </div>
    </main>
  );
}



