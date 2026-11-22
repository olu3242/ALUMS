import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { env, isBackendConfigured } from "@/lib/env";

const PROTECTED = ["/app", "/admin"];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const isProtected = PROTECTED.some((p) => request.nextUrl.pathname === p || request.nextUrl.pathname.startsWith(p + "/"));
  if (!isBackendConfigured()) return response;

  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getUser() revalidates the JWT with Supabase Auth (not just a local decode).
  const { data: { user } } = await supabase.auth.getUser();
  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = `?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  return response;
}
