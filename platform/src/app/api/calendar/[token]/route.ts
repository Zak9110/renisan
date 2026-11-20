import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db-singleton";
import { buildUserCalendarIcs, findUserByCalendarToken } from "@/lib/lists/service";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!token || token.length < 20) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  const db = await getDb();
  const user = await findUserByCalendarToken(db, token);
  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const ics = await buildUserCalendarIcs(db, user.id, user.locale);
  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="renisan-deadlines.ics"',
      "Cache-Control": "private, max-age=900",
    },
  });
}
