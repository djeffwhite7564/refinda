"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function AppNav() {
  const pathname = usePathname();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let alive = true;

    async function loadAdminFlag() {
      // 1) Get current signed-in user
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (!alive) return;

      if (userErr || !user) {
        setIsAdmin(false);
        return;
      }

      // 2) Fetch THIS user's profile row
      const { data: profile, error: profErr } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", user.id)
        .single();

      if (!alive) return;

      if (profErr) {
        // If RLS blocks or profile missing, default to false
        setIsAdmin(false);
        return;
      }

      setIsAdmin(Boolean(profile?.is_admin));
    }

    loadAdminFlag();

    // 3) Keep in sync on login/logout/refresh token
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      loadAdminFlag();
    });

    return () => {
      alive = false;
      sub?.subscription?.unsubscribe();
    };
  }, [supabase]);

  function navClass(href: string) {
    const active = pathname.startsWith(href);
    return `px-4 py-2 rounded-full text-sm transition ${
      active ? "bg-black text-white" : "text-gray-700 hover:bg-gray-100"
    }`;
  }

  return (
    <nav className="sticky top-0 z-40 border-b bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-6">
          <Link href="/results" className="font-semibold text-lg">
            Refinda
          </Link>

          <div className="hidden md:flex items-center gap-2">
            <Link href="/vibe" className={navClass("/vibe")}>
              Style Curator
            </Link>           
            <Link href="/results" className={navClass("/results")}>
              Search Picks
            </Link>
            <Link href="/style-profile" className={navClass("/style-profile")}>
              Style DNA
            </Link>



            <Link href="/inspiration" className={navClass("/inspiration")}>
              Inspiration
            </Link>
          </div>
        </div>

        {isAdmin && (
          <div className="hidden md:flex items-center gap-2">
            <Link href="/admin/dashboard" className={navClass("/admin/dashboard")}>
              Dashboard
            </Link>
            <Link href="/admin/celebrities" className={navClass("/admin/celebrities")}>
              Celebrities
            </Link>
            <Link href="/admin/looks" className={navClass("/admin/looks")}>
              Looks
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
}