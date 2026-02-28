import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function errMsg(e: unknown): string | null {
  if (!e) return null;
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && "message" in e && typeof (e as any).message === "string") {
    return (e as any).message;
  }
  return JSON.stringify(e);
}

export default async function ProfilePage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) redirect("/login");

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <main className="mx-auto max-w-3xl px-6 py-20">
      <h1 className="text-3xl font-bold">Your Profile</h1>

      <pre className="mt-6 overflow-auto rounded-xl bg-black p-6 text-sm text-white">
        {JSON.stringify(
          {
            user: { id: user.id, email: user.email },
            userErr: errMsg(userErr),
            profile,
            profileErr: errMsg(profileErr),
          },
          null,
          2
        )}
      </pre>
    </main>
  );
}





