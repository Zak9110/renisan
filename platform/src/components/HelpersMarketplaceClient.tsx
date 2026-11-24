"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { pickText, type Locale } from "@/i18n/config";

interface ServiceItemDto {
  service: {
    id: string;
    category: string;
    title: Record<string, string | undefined>;
    scope: Record<string, string | undefined>;
    deliverables: Record<string, string | undefined>;
    priceIqd: number;
    deliveryDays: number;
    allowedForMinors: boolean;
    groupSession: boolean;
  };
  helper: {
    userId: string;
    bio: Record<string, string | undefined> | null;
    languages: string[];
    subjects: string[];
    outcomes: { program: string; year: number; country?: string }[];
    averageRating: number | null;
    reviewCount: number;
  };
}

interface OrderDto {
  order: {
    id: string;
    status: string;
    priceIqd: number;
    platformFeeIqd: number;
    paymentRef: string | null;
    scopeSnapshot: string;
    createdAt: string;
  };
  service: {
    title: Record<string, string | undefined>;
    sessionLink: string | null;
  };
}

interface MeDto {
  id: string;
  role: string;
  isMinor: boolean;
}

export function HelpersMarketplaceClient({ locale }: { locale: Locale }) {
  const t = useTranslations("Helpers");
  const [tab, setTab] = useState<"browse" | "orders" | "apply">("browse");
  const [me, setMe] = useState<MeDto | null>(null);
  const [servicesList, setServicesList] = useState<ServiceItemDto[]>([]);
  const [ordersData, setOrdersData] = useState<{ asBuyer: OrderDto[]; asHelper: OrderDto[] }>({
    asBuyer: [],
    asHelper: [],
  });
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Booking modal state (with guardian consent for minors)
  const [bookingServiceId, setBookingServiceId] = useState<string | null>(null);
  const [guardianName, setGuardianName] = useState("");
  const [guardianContact, setGuardianContact] = useState("");
  const [guardianAccepted, setGuardianAccepted] = useState(false);

  // Review state per order
  const [reviewText, setReviewText] = useState<Record<string, string>>({});
  const [reviewRating, setReviewRating] = useState<Record<string, number>>({});

  // Helper application form
  const [program, setProgram] = useState("");
  const [year, setYear] = useState("2025");
  const [country, setCountry] = useState("");
  const [bio, setBio] = useState("");
  const [proofRef, setProofRef] = useState("");

  // Service creation form
  const [svcCategory, setSvcCategory] = useState<
    | "cv_feedback"
    | "essay_feedback"
    | "mock_interview"
    | "document_checklist"
    | "walkthrough"
    | "shortlisting"
    | "tutoring"
  >("essay_feedback");
  const [svcTitle, setSvcTitle] = useState("");
  const [svcScope, setSvcScope] = useState("");
  const [svcDeliverables, setSvcDeliverables] = useState("");
  const [svcPrice, setSvcPrice] = useState("20000");
  const [svcDays, setSvcDays] = useState("3");
  const [svcMinors, setSvcMinors] = useState(false);

  const errorText = (code?: string) =>
    code && t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.generic");

  const loadAll = useCallback(async () => {
    const [svcRes, meRes] = await Promise.all([fetch("/api/helpers"), fetch("/api/auth/me")]);
    if (svcRes.ok) {
      const json = (await svcRes.json()) as { items: ServiceItemDto[] };
      setServicesList(json.items);
    }
    if (meRes.ok) {
      const meJson = (await meRes.json()) as { user: MeDto | null };
      setMe(meJson.user);
      if (meJson.user) {
        const ordRes = await fetch("/api/orders");
        if (ordRes.ok) {
          setOrdersData((await ordRes.json()) as { asBuyer: OrderDto[]; asHelper: OrderDto[] });
        }
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([fetch("/api/helpers"), fetch("/api/auth/me")])
      .then(async ([svcRes, meRes]) => {
        if (!active) return;
        if (svcRes.ok) {
          const json = (await svcRes.json()) as { items: ServiceItemDto[] };
          if (active) setServicesList(json.items);
        }
        if (meRes.ok) {
          const meJson = (await meRes.json()) as { user: MeDto | null };
          if (active) setMe(meJson.user);
          if (meJson.user) {
            const ordRes = await fetch("/api/orders");
            if (active && ordRes.ok) {
              setOrdersData((await ordRes.json()) as { asBuyer: OrderDto[]; asHelper: OrderDto[] });
            }
          }
        }
        if (active) setLoading(false);
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingServiceId) return;
    setFeedback(null);
    const payload: Record<string, unknown> = { serviceId: bookingServiceId };
    if (me?.isMinor) {
      payload.guardianConsent = {
        guardianName,
        guardianContact,
        consentText: t("guardianConfirm"),
        locale,
      };
    }
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = (await res.json()) as {
      ok?: boolean;
      error?: string;
      payment?: { instructions?: string };
    };
    if (res.ok && json.ok) {
      setBookingServiceId(null);
      setFeedback(`${t("orderCreated")} ${json.payment?.instructions ?? ""}`);
      setTab("orders");
      await loadAll();
    } else {
      setFeedback(errorText(json.error));
    }
  };

  const handleOrderTransition = async (orderId: string, status: string, reason?: string) => {
    setFeedback(null);
    const res = await fetch(`/api/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, reason }),
    });
    if (res.ok) await loadAll();
    else {
      const json = (await res.json()) as { error?: string };
      setFeedback(errorText(json.error));
    }
  };

  const handleSubmitReview = async (orderId: string) => {
    const res = await fetch(`/api/orders/${orderId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rating: reviewRating[orderId] ?? 5,
        comment: reviewText[orderId] ?? "",
      }),
    });
    if (res.ok) {
      setFeedback(t("reviewSent"));
      await loadAll();
    } else {
      const json = (await res.json()) as { error?: string };
      setFeedback(errorText(json.error));
    }
  };

  const handleApplyHelper = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const res = await fetch("/api/helpers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bio: { [locale]: bio },
        languages: [locale, "en"],
        subjects: [],
        outcomes: [{ program, year: Number(year), country: country || undefined }],
        verificationMethod: "offer_letter",
        proofRef,
      }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    if (res.ok && json.ok) {
      setFeedback(t("appliedMsg"));
      setProgram("");
      setBio("");
      setProofRef("");
    } else {
      setFeedback(errorText(json.error));
    }
  };

  const handleCreateService = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const res = await fetch("/api/helpers/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: svcCategory,
        title: { [locale]: svcTitle },
        scope: { [locale]: svcScope },
        deliverables: { [locale]: svcDeliverables },
        priceIqd: Number(svcPrice),
        deliveryDays: Number(svcDays),
        allowedForMinors: svcMinors,
      }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    if (res.ok && json.ok) {
      setFeedback(t("serviceCreatedMsg"));
      setSvcTitle("");
      setSvcScope("");
      setSvcDeliverables("");
    } else if (json.error === "banned_phrase") {
      setFeedback(t("bannedPhraseError"));
    } else {
      setFeedback(errorText(json.error));
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div
        role="note"
        className="rounded-xl border-s-4 border-accent bg-surface p-4 text-start text-sm font-medium"
      >
        🛡️ {t("safeguardingNotice")}
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["browse", t("tabBrowse")],
            ["orders", t("tabOrders")],
            ["apply", t("tabApply")],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`min-h-11 rounded-lg border px-4 text-sm font-medium ${
              tab === k ? "border-accent bg-accent text-white" : "border-border bg-surface"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {feedback && (
        <p className="rounded-lg border border-accent bg-surface p-3 text-start text-sm text-accent">
          {feedback}
        </p>
      )}

      {/* Booking drawer */}
      {bookingServiceId && (
        <form
          onSubmit={handleBook}
          className="flex flex-col gap-3 rounded-xl border-2 border-accent bg-surface p-5 text-start"
        >
          {me?.isMinor && (
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-bg p-3">
              <strong className="text-sm text-accent">{t("guardianTitle")}</strong>
              <input
                type="text"
                required
                value={guardianName}
                onChange={(e) => setGuardianName(e.target.value)}
                placeholder={t("guardianName")}
                className="min-h-11 rounded-lg border border-border bg-surface px-3 text-sm"
              />
              <input
                type="text"
                required
                value={guardianContact}
                onChange={(e) => setGuardianContact(e.target.value)}
                placeholder={t("guardianContact")}
                className="min-h-11 rounded-lg border border-border bg-surface px-3 text-sm"
              />
              <label className="flex min-h-11 items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  required
                  checked={guardianAccepted}
                  onChange={(e) => setGuardianAccepted(e.target.checked)}
                />
                <span>{t("guardianConfirm")}</span>
              </label>
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              className="min-h-11 rounded-lg bg-accent px-5 text-sm font-medium text-white"
            >
              {t("confirmBooking")}
            </button>
            <button
              type="button"
              onClick={() => setBookingServiceId(null)}
              className="min-h-11 rounded-lg border border-border px-4 text-sm"
            >
              ✕
            </button>
          </div>
        </form>
      )}

      {/* Tab 1: Browse Verified Coaching Services */}
      {tab === "browse" && (
        <div className="flex flex-col gap-4">
          {loading ? (
            <p className="text-start text-sm text-muted">...</p>
          ) : servicesList.length === 0 ? (
            <p className="rounded-xl border border-border bg-surface p-6 text-start text-sm text-muted">
              {t("emptyServices")}
            </p>
          ) : (
            servicesList.map(({ service, helper }) => (
              <article
                key={service.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 text-start"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold">
                      <bdi>{pickText(service.title, locale)}</bdi>
                    </h2>
                    <p className="mt-1 text-xs text-muted">
                      {t(`category.${service.category}`)} · {service.deliveryDays} {t("daysLabel")} ·{" "}
                      {service.allowedForMinors ? t("minorAllowed") : t("adultsOnlyTag")}
                      {helper.averageRating != null
                        ? ` · ⭐ ${helper.averageRating} (${helper.reviewCount})`
                        : ""}
                    </p>
                  </div>
                  <strong className="text-base text-accent">
                    {service.priceIqd.toLocaleString("en-US")} {t("priceLabel")}
                  </strong>
                </div>

                <p className="text-sm">
                  <bdi>{pickText(service.scope, locale)}</bdi>
                </p>
                <p className="text-xs text-muted">
                  <bdi>{pickText(service.deliverables, locale)}</bdi>
                </p>

                {helper.outcomes.length > 0 && (
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="font-semibold text-muted">{t("verifiedOutcomes")}:</span>
                    {helper.outcomes.map((o, i) => (
                      <span
                        key={i}
                        className="rounded-full border border-border bg-bg px-2.5 py-0.5 text-text"
                      >
                        ✓ {o.program} ({o.year}
                        {o.country ? `, ${o.country}` : ""})
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  {me ? (
                    <button
                      type="button"
                      onClick={() => setBookingServiceId(service.id)}
                      className="min-h-11 rounded-lg bg-accent px-4 text-sm font-medium text-white"
                    >
                      {t("bookBtn")}
                    </button>
                  ) : (
                    <p className="text-xs text-muted">{t("signInPrompt")}</p>
                  )}
                </div>
              </article>
            ))
          )}
        </div>
      )}

      {/* Tab 2: My Orders */}
      {tab === "orders" && (
        <div className="flex flex-col gap-3">
          {!me ? (
            <p className="rounded-xl border border-border bg-surface p-5 text-start text-sm text-muted">
              {t("signInPrompt")}
            </p>
          ) : ordersData.asBuyer.length === 0 && ordersData.asHelper.length === 0 ? (
            <p className="rounded-xl border border-border bg-surface p-5 text-start text-sm text-muted">
              {t("emptyOrders")}
            </p>
          ) : (
            [
              ...ordersData.asBuyer.map((o) => ({ ...o, mine: "buyer" as const })),
              ...ordersData.asHelper.map((o) => ({ ...o, mine: "helper" as const })),
            ].map(({ order, service, mine }) => (
              <div
                key={order.id}
                className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 text-start text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>
                    <bdi>{pickText(service.title, locale)}</bdi>
                  </strong>
                  <span className="rounded-full border border-accent px-3 py-0.5 text-xs font-semibold text-accent">
                    {t(`status.${order.status}`)}
                  </span>
                </div>
                <p className="text-xs text-muted">
                  {order.priceIqd.toLocaleString("en-US")} {t("priceLabel")}
                  {order.paymentRef ? ` · Ref: ${order.paymentRef}` : ""}
                </p>
                <div className="flex flex-wrap gap-2">
                  {mine === "buyer" && service.sessionLink && (
                    <a
                      href={service.sessionLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center rounded-lg border border-accent px-4 text-xs text-accent"
                    >
                      {t("sessionLink")} ↗
                    </a>
                  )}
                  {mine === "helper" && (order.status === "paid_held" || order.status === "in_progress") && (
                    <button
                      type="button"
                      onClick={() =>
                        void handleOrderTransition(
                          order.id,
                          order.status === "paid_held" ? "in_progress" : "delivered",
                        )
                      }
                      className="min-h-11 rounded-lg bg-accent px-4 text-xs font-medium text-white"
                    >
                      {order.status === "paid_held" ? t("startWork") : t("markDelivered")}
                    </button>
                  )}
                  {mine === "buyer" && order.status === "delivered" && (
                    <button
                      type="button"
                      onClick={() => void handleOrderTransition(order.id, "confirmed")}
                      className="min-h-11 rounded-lg bg-accent px-4 text-xs font-medium text-white"
                    >
                      ✓ {t("confirmDelivery")}
                    </button>
                  )}
                  {["paid_held", "in_progress", "delivered"].includes(order.status) && (
                    <button
                      type="button"
                      onClick={() => void handleOrderTransition(order.id, "disputed", `${mine}_dispute`)}
                      className="min-h-11 rounded-lg border border-border px-3 text-xs text-muted"
                    >
                      🚩 {t("openDispute")}
                    </button>
                  )}
                </div>
                {mine === "buyer" && (order.status === "confirmed" || order.status === "released") && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <select
                      value={reviewRating[order.id] ?? 5}
                      onChange={(e) =>
                        setReviewRating({ ...reviewRating, [order.id]: Number(e.target.value) })
                      }
                      className="min-h-11 rounded-lg border border-border bg-bg px-2 text-xs"
                    >
                      {[5, 4, 3, 2, 1].map((n) => (
                        <option key={n} value={n}>
                          {"⭐".repeat(n)}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={reviewText[order.id] ?? ""}
                      onChange={(e) => setReviewText({ ...reviewText, [order.id]: e.target.value })}
                      placeholder="..."
                      className="min-h-11 flex-1 rounded-lg border border-border bg-bg px-3 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => void handleSubmitReview(order.id)}
                      className="min-h-11 rounded-lg border border-accent px-3 text-xs text-accent"
                    >
                      {t("leaveReview")}
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab 3: Apply as Helper & Create Coaching Service */}
      {tab === "apply" && (
        <div className="grid gap-6 sm:grid-cols-2">
          <form
            onSubmit={handleApplyHelper}
            className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 text-start"
          >
            <h2 className="text-base font-bold">{t("applyTitle")}</h2>
            {!me && <p className="text-xs text-muted">{t("signInPrompt")}</p>}
            <input
              type="text"
              required
              value={program}
              onChange={(e) => setProgram(e.target.value)}
              placeholder={t("programLabel")}
              className="min-h-11 rounded-lg border border-border bg-bg px-3 text-sm"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                required
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder={t("yearLabel")}
                className="min-h-11 rounded-lg border border-border bg-bg px-3 text-sm"
              />
              <input
                type="text"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder={t("countryLabel")}
                className="min-h-11 rounded-lg border border-border bg-bg px-3 text-sm"
              />
            </div>
            <textarea
              rows={3}
              required
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder={t("bioLabel")}
              className="rounded-lg border border-border bg-bg p-3 text-sm"
            />
            <input
              type="text"
              required
              value={proofRef}
              onChange={(e) => setProofRef(e.target.value)}
              placeholder={t("proofLabel")}
              className="min-h-11 rounded-lg border border-border bg-bg px-3 text-sm"
            />
            <button
              type="submit"
              disabled={!me}
              className="min-h-11 rounded-lg bg-accent px-4 text-sm font-medium text-white disabled:opacity-50"
            >
              {t("applySubmit")}
            </button>
          </form>

          <form
            onSubmit={handleCreateService}
            className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 text-start"
          >
            <h2 className="text-base font-bold">{t("createServiceTitle")}</h2>
            <select
              value={svcCategory}
              onChange={(e) => setSvcCategory(e.target.value as typeof svcCategory)}
              className="min-h-11 rounded-lg border border-border bg-bg px-3 text-sm"
            >
              <option value="cv_feedback">{t("category.cv_feedback")}</option>
              <option value="essay_feedback">{t("category.essay_feedback")}</option>
              <option value="mock_interview">{t("category.mock_interview")}</option>
              <option value="document_checklist">{t("category.document_checklist")}</option>
              <option value="walkthrough">{t("category.walkthrough")}</option>
              <option value="shortlisting">{t("category.shortlisting")}</option>
              <option value="tutoring">{t("category.tutoring")}</option>
            </select>
            <input
              type="text"
              required
              value={svcTitle}
              onChange={(e) => setSvcTitle(e.target.value)}
              placeholder={t("serviceTitleLabel")}
              className="min-h-11 rounded-lg border border-border bg-bg px-3 text-sm"
            />
            <textarea
              rows={2}
              required
              value={svcScope}
              onChange={(e) => setSvcScope(e.target.value)}
              placeholder={t("serviceScopeLabel")}
              className="rounded-lg border border-border bg-bg p-3 text-sm"
            />
            <input
              type="text"
              required
              value={svcDeliverables}
              onChange={(e) => setSvcDeliverables(e.target.value)}
              placeholder={t("serviceDeliverablesLabel")}
              className="min-h-11 rounded-lg border border-border bg-bg px-3 text-sm"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                required
                min={1000}
                value={svcPrice}
                onChange={(e) => setSvcPrice(e.target.value)}
                placeholder={t("servicePriceLabel")}
                className="min-h-11 rounded-lg border border-border bg-bg px-3 text-sm"
              />
              <input
                type="number"
                required
                min={1}
                max={60}
                value={svcDays}
                onChange={(e) => setSvcDays(e.target.value)}
                placeholder={t("serviceDaysLabel")}
                className="min-h-11 rounded-lg border border-border bg-bg px-3 text-sm"
              />
            </div>
            <label className="flex min-h-11 items-center gap-2 text-xs">
              <input type="checkbox" checked={svcMinors} onChange={(e) => setSvcMinors(e.target.checked)} />
              <span>{t("minorAllowed")}</span>
            </label>
            <button
              type="submit"
              disabled={!me}
              className="min-h-11 rounded-lg border border-accent px-4 text-sm font-medium text-accent disabled:opacity-50"
            >
              {t("createServiceBtn")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
