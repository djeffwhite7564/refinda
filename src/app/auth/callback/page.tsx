// src/app/auth/callback/page.tsx
import { Suspense } from "react";
import CallbackClient from "./callback-client";

export default function AuthCallbackPage() {
  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-xl font-semibold">Auth Callback</h1>

      <Suspense fallback={<p className="mt-3 text-sm opacity-80">Finishing sign-in…</p>}>
        <CallbackClient />
      </Suspense>
    </main>
  );
}



