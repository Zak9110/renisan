import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { rateLimited } from "@/lib/api-guard";
import { getDb } from "@/lib/db-singleton";
import { answerAmbassadorQuestion, submitAmbassadorQuestion } from "@/lib/community/service";

const postSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ask"),
    ambassadorId: z.uuid(),
    questionText: z.string().min(5).max(1000),
    pseudonym: z.string().max(80).optional(),
  }),
  z.object({
    kind: z.literal("answer"),
    questionId: z.uuid(),
    answerText: z.string().min(2).max(2000),
  }),
]);

export async function POST(req: NextRequest) {
  const user = await getCurrentSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const db = await getDb();
  const limited = await rateLimited(db, "community-question", user.id, 20);
  if (limited) return limited;
  if (parsed.data.kind === "ask") {
    const res = await submitAmbassadorQuestion(
      db,
      user.id,
      parsed.data.ambassadorId,
      parsed.data.questionText,
      parsed.data.pseudonym,
    );
    return NextResponse.json(res, { status: res.ok ? 201 : 400 });
  }
  const res = await answerAmbassadorQuestion(db, user.id, parsed.data.questionId, parsed.data.answerText);
  return NextResponse.json(res, { status: res.ok ? 200 : 403 });
}
