import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const PROTECTED = ["/analyze", "/cases", "/live", "/archive", "/keys", "/settings"];

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const path = request.nextUrl.pathname;
  if (!user && PROTECTED.some((p) => path === p || path.startsWith(`${p}/`))) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/sign-in";
    url.searchParams.set("next", path + request.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  // API routes authenticate themselves (session cookie or API key); static assets are skipped.
  matcher: ["/((?!api/|_next/static|_next/image|favicon.svg|canonical-face-mesh.json|opengraph-image).*)"],
};
