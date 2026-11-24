import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { phase2Enabled } from "./lib/features";

// Detects locale from cookie, then Accept-Language, then defaults to ar.
const intl = createMiddleware(routing);

export default function proxy(req: NextRequest) {
  // Only the Phase 2-3 APIs reach this branch (see matcher).
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return phase2Enabled ? NextResponse.next() : NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return intl(req);
}

export const config = {
  matcher: [
    "/((?!api|_next|_vercel|.*\\..*).*)",
    "/api/helpers/:path*",
    "/api/orders/:path*",
    "/api/community/:path*",
  ],
};
