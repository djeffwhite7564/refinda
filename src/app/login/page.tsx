"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function testConnection() {
    setMessage(null);
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        setMessage(`❌ Session check error: ${error.message}`);
        return;
      }
      setMessage(`✅ Supabase reachable. Session: ${data.session ? "yes" : "no"}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setMessage(`❌ Failed to reach Supabase: ${msg}`);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    setLoading(true);

    try {
      const res =
        mode === "signup"
          ? await supabase.auth.signUp({ email, password })
          : await supabase.auth.signInWithPassword({ email, password });

      if (res.error) {
        setMessage(res.error.message);
        return;
      }

      // If email confirmations are ON, signup won't create a session
      if (mode === "signup" && !res.data.session) {
        setMessage("Account created. Please check your email to confirm, then sign in.");
        return;
      }

      // ✅ Don’t immediately re-check getSession(); it can race.
      router.replace("/vibe");
      router.refresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setMessage(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-md px-6 py-20">
      <h1 className="text-3xl font-bold">Welcome to Refinda</h1>

      <div className="mt-6 flex gap-2">
        <button
          type="button"
          onClick={() => setMode("signin")}
          className={`flex-1 rounded-lg px-4 py-2 ${mode === "signin" ? "bg-black text-white" : "border"}`}
        >
          Sign in
        </button>

        <button
          type="button"
          onClick={() => setMode("signup")}
          className={`flex-1 rounded-lg px-4 py-2 ${mode === "signup" ? "bg-black text-white" : "border"}`}
        >
          Create account
        </button>
      </div>

      <button
        type="button"
        onClick={testConnection}
        className="mt-3 w-full rounded-lg border px-4 py-3"
      >
        Test Supabase Connection
      </button>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <input
          className="w-full rounded-lg border px-4 py-3"
          placeholder="Email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
        <input
          className="w-full rounded-lg border px-4 py-3"
          placeholder="Password (min 8 chars)"
          type="password"
          minLength={8}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
        />
        <button
          disabled={loading}
          className="w-full rounded-lg bg-black px-4 py-3 font-semibold text-white disabled:opacity-60"
        >
          {loading ? "Working..." : mode === "signup" ? "Create account" : "Sign in"}
        </button>
      </form>

      {message && <p className="mt-4 text-sm text-red-600">{message}</p>}
    </main>
  );
}

