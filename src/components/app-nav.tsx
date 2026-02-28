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
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("is_admin")
        .maybeSingle();

      setIsAdmin(Boolean(data?.is_admin));
    })();
  }, [supabase]);

  function navClass(href: string) {
    const active = pathname.startsWith(href);
    return `px-4 py-2 rounded-full text-sm transition ${
      active
        ? "bg-black text-white"
        : "text-gray-700 hover:bg-gray-100"
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
            <Link href="/results" className={navClass("/results")}>
              Results
            </Link>

            <Link href="/style-profile" className={navClass("/style-profile")}>
              Style DNA
            </Link>

            <Link href="/vibe" className={navClass("/vibe")}>
              Refine
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