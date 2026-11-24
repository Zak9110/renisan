import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { auditLog, helperProfiles, users } from "@/db/schema";
import {
  applyAsHelper,
  autoConfirmDeliveredOrders,
  checkServiceBannedPhrases,
  createHelperService,
  createOrderReview,
  createServiceOrder,
  listPublicServices,
  purgeExpiredVerificationProofs,
  reviewHelperService,
  transitionOrder,
  verifyHelper,
} from "@/lib/helpers/service";
import {
  adminCreatePlacement,
  adminCreateSponsor,
  listActivePlacements,
  recordPlacementEvent,
} from "@/lib/sponsors/service";
import {
  adminCreateClub,
  adminCreateEvent,
  answerAmbassadorQuestion,
  applyAsAmbassador,
  listPublicCommunity,
  moderateQuestion,
  registerForEvent,
  requestAmbassadorIntro,
  respondAmbassadorIntro,
  submitAmbassadorQuestion,
  verifyAmbassador,
} from "@/lib/community/service";

const SECRET = "phase23-test-secret-0123456789abcdef";

describe("M7 Helpers/Orders, M8 Sponsors & M9 Ambassadors/Events/Clubs", () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  it("blocks banned coaching phrases (essay writing, guarantees, login sharing)", () => {
    expect(checkServiceBannedPhrases("We write your essay for Chevening").blocked).toBe(true);
    expect(checkServiceBannedPhrases("100% success guaranteed admission").blocked).toBe(true);
    expect(checkServiceBannedPhrases("Please share your password so I can submit").blocked).toBe(true);
    expect(checkServiceBannedPhrases("Structured essay feedback and mock interview practice").blocked).toBe(
      false,
    );
  });

  it("enforces M7 helper verification, 30d proof purge, minor guardian consent, order state machine, 72h auto-confirm & reviews", async () => {
    const handle = createDb("pglite://memory");
    close = handle.close;
    const db = handle.db;
    await runMigrations(db, "pglite://memory");

    const now = new Date("2026-11-23T12:00:00Z");

    const [editor] = await db
      .insert(users)
      .values({ email: "ed@example.org", role: "editor", birthYear: 1995 })
      .returning();
    const [adultHelper] = await db
      .insert(users)
      .values({ email: "helper@example.org", role: "member", birthYear: 1999 })
      .returning();
    const [minorBuyer] = await db
      .insert(users)
      .values({ email: "minor@example.org", role: "member", birthYear: 2010 })
      .returning();

    // Minor cannot become a paid helper
    const minorApply = await applyAsHelper(
      db,
      minorBuyer!.id,
      {
        bio: { en: "Student" },
        languages: ["ar"],
        subjects: ["CS"],
        outcomes: [{ program: "Test", year: 2025 }],
        verificationMethod: "certificate",
        proofRef: "private/proof-minor.pdf",
      },
      now,
    );
    expect(minorApply.ok).toBe(false);

    // Adult applies and gets verified -> 30-day proof deletion scheduled
    const applied = await applyAsHelper(
      db,
      adultHelper!.id,
      {
        bio: { en: "Chevening scholar offering essay feedback" },
        languages: ["ar", "en"],
        subjects: ["Engineering"],
        outcomes: [{ program: "Chevening", year: 2025, country: "UK" }],
        verificationMethod: "offer_letter",
        proofRef: "private/offer-123.pdf",
      },
      now,
    );
    expect(applied.ok).toBe(true);

    const verified = await verifyHelper(db, editor!.id, "editor", adultHelper!.id, "approve", now);
    expect(verified.ok).toBe(true);

    // Banned phrase service rejected
    const bannedSvc = await createHelperService(db, adultHelper!.id, {
      category: "essay_feedback",
      title: { en: "We write your essay fast" },
      scope: { en: "Guaranteed admission" },
      deliverables: { en: "Written essay" },
      priceIqd: 25000,
      deliveryDays: 2,
    });
    expect(bannedSvc.ok).toBe(false);

    // Clean coaching service created -> approved by editor
    const cleanSvc = await createHelperService(db, adultHelper!.id, {
      category: "essay_feedback",
      title: { en: "Essay Structure Feedback" },
      scope: { en: "Detailed written comments on your draft" },
      deliverables: { en: "Annotated PDF + checklist" },
      priceIqd: 20000,
      deliveryDays: 3,
      allowedForMinors: true,
      groupSession: true,
    });
    expect(cleanSvc.ok).toBe(true);
    const serviceId = cleanSvc.ok ? cleanSvc.service.id : "";

    await reviewHelperService(db, editor!.id, "editor", serviceId, "active", now);
    expect((await listPublicServices(db)).length).toBe(1);

    // Minor buyer blocked without guardian consent
    const noConsent = await createServiceOrder(db, minorBuyer!.id, SECRET, "manual", { serviceId }, now);
    expect(noConsent.ok).toBe(false);
    if (!noConsent.ok) expect(noConsent.error).toBe("guardian_consent_required");

    // Minor buyer succeeds WITH recorded guardian consent
    const created = await createServiceOrder(
      db,
      minorBuyer!.id,
      SECRET,
      "manual",
      {
        serviceId,
        guardianConsent: {
          guardianName: "Parent Name",
          guardianContact: "+9647700000000",
          consentText: "I consent to this coaching session.",
          locale: "ar",
        },
      },
      now,
    );
    expect(created.ok).toBe(true);
    const orderId = created.ok ? created.order.id : "";
    if (created.ok) {
      expect(created.order.platformFeeIqd).toBe(2400); // 12% of 20,000 IQD
    }

    // Illegal jump (created -> delivered) rejected
    const badJump = await transitionOrder(db, adultHelper!.id, "helper", orderId, "delivered", { now });
    expect(badJump.ok).toBe(false);

    // Valid transitions: created -> paid_held -> in_progress -> delivered
    expect((await transitionOrder(db, editor!.id, "editor", orderId, "paid_held", { now })).ok).toBe(true);
    expect((await transitionOrder(db, adultHelper!.id, "helper", orderId, "in_progress", { now })).ok).toBe(
      true,
    );
    expect((await transitionOrder(db, adultHelper!.id, "helper", orderId, "delivered", { now })).ok).toBe(
      true,
    );

    // 72h auto-confirmation moves delivered -> confirmed automatically
    const after73h = new Date(now.getTime() + 73 * 60 * 60 * 1000);
    expect(await autoConfirmDeliveredOrders(db, after73h)).toBe(1);

    // Release funds & leave 1 review (2nd review blocked)
    expect((await transitionOrder(db, editor!.id, "editor", orderId, "released", { now: after73h })).ok).toBe(
      true,
    );
    expect((await createOrderReview(db, minorBuyer!.id, orderId, 5, "Helpful feedback!")).ok).toBe(true);
    expect((await createOrderReview(db, minorBuyer!.id, orderId, 4, "Duplicate")).ok).toBe(false);

    // 30-day proof auto-deletion purges private proofRef
    const after31d = new Date(now.getTime() + 31 * 24 * 60 * 60 * 1000);
    const purged = await purgeExpiredVerificationProofs(db, after31d);
    expect(purged.helpersPurged).toBe(1);
    const [reloadedHelper] = await db
      .select()
      .from(helperProfiles)
      .where(eq(helperProfiles.userId, adultHelper!.id));
    expect(reloadedHelper!.proofRef).toBeNull();

    const audits = await db.select().from(auditLog);
    expect(audits.some((a) => a.action === "order.auto_confirm_72h")).toBe(true);
  });

  it("handles M8 sponsors & M9 ambassadors, moderated Q&A, adult-only intros, events & clubs", async () => {
    const handle = createDb("pglite://memory");
    close = handle.close;
    const db = handle.db;
    await runMigrations(db, "pglite://memory");

    const now = new Date("2026-11-23T12:00:00Z");
    const [admin] = await db
      .insert(users)
      .values({ email: "admin@example.org", role: "admin", birthYear: 1992 })
      .returning();
    const [adult] = await db
      .insert(users)
      .values({ email: "amb@example.org", role: "member", birthYear: 1998 })
      .returning();
    const [adult2] = await db
      .insert(users)
      .values({ email: "student2@example.org", role: "member", birthYear: 2001 })
      .returning();
    const [minor] = await db
      .insert(users)
      .values({ email: "teen@example.org", role: "member", birthYear: 2010 })
      .returning();

    // M8 Sponsor & placement with anonymous aggregate counters
    const sp = await adminCreateSponsor(
      db,
      admin!.id,
      "admin",
      { name: "SAMPLE — Edu Partner", websiteUrl: "https://example.org/sponsor" },
      now,
    );
    expect(sp.ok).toBe(true);
    const pl = await adminCreatePlacement(
      db,
      admin!.id,
      "admin",
      {
        sponsorId: sp.ok ? sp.sponsor.id : "",
        slot: "opportunities_banner",
        title: { en: "SAMPLE — Free IELTS Workshop" },
        targetUrl: "https://example.org/workshop",
        startsAt: new Date(now.getTime() - 3600_000),
        endsAt: new Date(now.getTime() + 86_400_000),
      },
      now,
    );
    expect(pl.ok).toBe(true);
    const placementId = pl.ok ? pl.placement.id : "";
    expect(await recordPlacementEvent(db, placementId, "impression")).toBe(true);
    expect(await recordPlacementEvent(db, placementId, "click")).toBe(true);
    const activeSlots = await listActivePlacements(db, "opportunities_banner", now);
    expect(activeSlots).toHaveLength(1);
    expect(activeSlots[0]!.placement.impressionCount).toBe(1);
    expect(activeSlots[0]!.placement.clickCount).toBe(1);

    // M9 Ambassador verification (minor blocked, adult approved)
    expect(
      (
        await applyAsAmbassador(
          db,
          minor!.id,
          {
            university: "Test Uni",
            country: "Turkey",
            field: "CS",
            verificationMethod: "student_id",
            proofRef: "id-1",
          },
          now,
        )
      ).ok,
    ).toBe(false);

    const ambRes = await applyAsAmbassador(
      db,
      adult!.id,
      {
        university: "METU",
        country: "Turkey",
        field: "Computer Engineering",
        howFunded: { en: "Türkiye Bursları" },
        verificationMethod: "academic_email",
        proofRef: "student@metu.edu.tr",
      },
      now,
    );
    expect(ambRes.ok).toBe(true);
    const ambassadorId = ambRes.ok ? ambRes.ambassador.id : "";
    expect((await verifyAmbassador(db, admin!.id, "admin", ambassadorId, true, now)).ok).toBe(true);

    // Minor CAN submit public Q&A with pseudonym -> moderated -> answered
    const q = await submitAmbassadorQuestion(db, minor!.id, ambassadorId, "Is Turkish required?", "Anon12");
    expect(q.ok).toBe(true);
    const qId = q.ok ? q.question.id : "";
    expect((await moderateQuestion(db, admin!.id, "admin", qId, "approved", now)).ok).toBe(true);
    expect(
      (await answerAmbassadorQuestion(db, adult!.id, qId, "Year 1 includes a Turkish prep course.", now)).ok,
    ).toBe(true);

    // Minor BLOCKED from direct intro; adult double-opt-in intro succeeds
    const minorIntro = await requestAmbassadorIntro(db, minor!.id, ambassadorId, "Hi", now);
    expect(minorIntro.ok).toBe(false);
    const adultIntro = await requestAmbassadorIntro(db, adult2!.id, ambassadorId, "Applying to METU", now);
    expect(adultIntro.ok).toBe(true);
    const introId = adultIntro.ok ? adultIntro.intro.id : "";
    const accepted = await respondAmbassadorIntro(db, adult!.id, introId, "accepted", "@amb_telegram", now);
    expect(accepted.ok).toBe(true);
    if (accepted.ok) expect(accepted.intro.contactChannel).toBe("@amb_telegram");

    // Events & Clubs
    const ev = await adminCreateEvent(
      db,
      admin!.id,
      "admin",
      {
        title: { en: "SAMPLE — Study in Turkey Office Hours" },
        hostName: "METU Ambassadors",
        startsAt: new Date(now.getTime() + 86_400_000),
        externalUrl: "https://example.org/zoom",
      },
      now,
    );
    expect(ev.ok).toBe(true);
    expect((await registerForEvent(db, minor!.id, ev.ok ? ev.event.id : "")).ok).toBe(true);

    expect(
      (
        await adminCreateClub(
          db,
          admin!.id,
          "admin",
          {
            name: { en: "SAMPLE — Iraqi CS Applicants Club" },
            topic: "Computer Science",
            externalUrl: "https://example.org/club",
          },
          now,
        )
      ).ok,
    ).toBe(true);

    const community = await listPublicCommunity(db);
    expect(community.ambassadors).toHaveLength(1);
    expect(community.ambassadors[0]!.questions).toHaveLength(1);
    expect(community.events[0]!.registrationCount).toBe(1);
    expect(community.clubs).toHaveLength(1);
  });
});
