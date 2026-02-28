// src/app/auth/callback/callback-client.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function CallbackClient() {
  const router = useRouter();
  const params = useSearchParams();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [msg, setMsg] = useState("Finishing sign-in…");
  const ran = useRef(false); // prevents double execution in dev

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    let cancelled = false;

    (async () => {
      try {
        const code = params.get("code");
        const errorDesc = params.get("error_description");
        const error = params.get("error");

        if (error || errorDesc) {
          if (!cancelled) {
            setMsg(`Auth error: ${errorDesc ?? error ?? "Unknown error"}`);
          }
          return;
        }

        if (!code) {
          if (!cancelled) {
            setMsg("No auth code found. Try signing in again.");
          }
          return;
        }

        // Exchange PKCE code for session
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

        if (exchangeError) {
          if (exchangeError.message?.toLowerCase().includes("code verifier not found")) {
            if (!cancelled) {
              setMsg(
                "Sign-in link opened in a different tab/profile. Open it in the same tab where you clicked 'Send link'."
              );
            }
            return;
          }

          if (!cancelled) {
            setMsg(`Exchange failed: ${exchangeError.message}`);
          }
          return;
        }

        // Verify session exists
        const { data, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          if (!cancelled) {
            setMsg(`Session check failed: ${sessionError.message}`);
          }
          return;
        }

        if (!data.session) {
          if (!cancelled) {
            setMsg("No session found after exchange. Try signing in again.");
          }
          return;
        }

        if (!cancelled) {
          setMsg("Signed in! Redirecting…");
        }

        router.replace("/results");
      } catch (e: unknown) {
        if (!cancelled) {
          setMsg(e instanceof Error ? e.message : String(e));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [params, router, supabase]);

  return <p className="mt-3 text-sm opacity-80">{msg}</p>;
}