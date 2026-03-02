import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server"; // adjust if needed

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Not logged in
  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  // Logged in but not admin
  if (!profile?.is_admin) {
    redirect("/"); // or redirect("/not-authorized")
  }

  return <>{children}</>;
}