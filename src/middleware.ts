import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptionsWithName } from "@supabase/ssr";

export function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptionsWithName) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptionsWithName) {
          response.cookies.set({ name, value: "", ...options, maxAge: 0 });
        },
      },
    }
  );

  // Refreshes session cookies if needed
  // (do NOT throw on AbortError which can happen in edge/runtime situations)
  supabase.auth.getUser().catch((e: unknown) => {
    if (e && typeof e === "object" && "name" in e && (e as any).name === "AbortError") return;
    throw e;
  });

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};



