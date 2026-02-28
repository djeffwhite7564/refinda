import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-20">
      <h1 className="text-5xl font-extrabold tracking-tight">
        Refinda.ai
      </h1>
      <p className="mt-6 text-lg text-neutral-600">
        Choose your Style Vibe → get curated vintage jean matches across the web.
      </p>

      <div className="mt-10 flex gap-4">
        <Link
          href="/login"
          className="rounded-xl border border-black px-6 py-3 font-semibold"
        >
          Create account / Sign in
        </Link>
        <Link
          href="/profile"
          className="rounded-xl border border-neutral-300 px-6 py-3"
        >
          Profile
        </Link>
      </div>
    </main>
  );
}

