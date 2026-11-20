import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { profiles, users } from "@/db/schema";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db-singleton";

const profileSchema = z.object({
  educationLevel: z.enum(["grade12", "undergrad", "graduate", "other"]),
  fieldOfStudy: z.string().max(120).nullable().optional(),
  gpaPercent: z.number().min(0).max(110).nullable().optional(),
  englishTestType: z.string().max(40).nullable().optional(),
  englishScore: z.number().min(0).max(160).nullable().optional(),
  workExperienceYears: z.number().int().min(0).max(50).nullable().optional(),
  gender: z.enum(["male", "female"]).nullable().optional(),
  willingToReturn: z.boolean().nullable().optional(),
  governorate: z.string().max(60).nullable().optional(),
  currentCountry: z.string().length(2).nullable().optional(),
  university: z.string().max(160).nullable().optional(),
  idpSelfDeclared: z.boolean().nullable().optional(),
  birthYear: z.number().int().min(1940).max(2025).nullable().optional(),
  interests: z.array(z.string().max(60)).max(20).optional(),
});

export async function GET() {
  const user = await getCurrentSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({
    birthYear: user.birthYear,
    isMinor: user.isMinor,
    profile: user.profile,
  });
}

export async function PUT(req: NextRequest) {
  const user = await getCurrentSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = profileSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_profile" }, { status: 400 });
  }

  const db = await getDb();
  const { birthYear, ...rest } = parsed.data;
  const now = new Date();

  if (birthYear !== undefined) {
    await db.update(users).set({ birthYear }).where(eq(users.id, user.id));
  }

  const [saved] = await db
    .insert(profiles)
    .values({
      userId: user.id,
      educationLevel: rest.educationLevel,
      fieldOfStudy: rest.fieldOfStudy ?? null,
      gpaPercent: rest.gpaPercent ?? null,
      englishTestType: rest.englishTestType ?? null,
      englishScore: rest.englishScore ?? null,
      workExperienceYears: rest.workExperienceYears ?? null,
      gender: rest.gender ?? null,
      willingToReturn: rest.willingToReturn ?? null,
      governorate: rest.governorate ?? null,
      currentCountry: rest.currentCountry ?? null,
      university: rest.university ?? null,
      idpSelfDeclared: rest.idpSelfDeclared ?? null,
      interests: rest.interests ?? [],
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: profiles.userId,
      set: {
        educationLevel: rest.educationLevel,
        fieldOfStudy: rest.fieldOfStudy ?? null,
        gpaPercent: rest.gpaPercent ?? null,
        englishTestType: rest.englishTestType ?? null,
        englishScore: rest.englishScore ?? null,
        workExperienceYears: rest.workExperienceYears ?? null,
        gender: rest.gender ?? null,
        willingToReturn: rest.willingToReturn ?? null,
        governorate: rest.governorate ?? null,
        currentCountry: rest.currentCountry ?? null,
        university: rest.university ?? null,
        idpSelfDeclared: rest.idpSelfDeclared ?? null,
        interests: rest.interests ?? [],
        updatedAt: now,
      },
    })
    .returning();

  return NextResponse.json({ ok: true, profile: saved });
}
