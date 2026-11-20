import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

// Detects locale from cookie, then Accept-Language, then defaults to ar.
export default createMiddleware(routing);

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
