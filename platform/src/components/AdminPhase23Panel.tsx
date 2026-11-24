"use client";

import { useCallback, useEffect, useState } from "react";

interface AdminHelperData {
  pendingHelpers: {
    userId: string;
    verificationMethod: string;
    proofRef: string | null;
    outcomes: { program: string; year: number; country?: string }[];
  }[];
  pendingServices: {
    id: string;
    category: string;
    priceIqd: number;
    title: Record<string, string | undefined>;
    scope: Record<string, string | undefined>;
    deliverables: Record<string, string | undefined>;
    allowedForMinors: boolean;
    sessionLink: string | null;
  }[];
  activeOrders: { id: string; status: string; priceIqd: number; disputeReason: string | null }[];
}

interface AdminSponsorData {
  sponsors: { id: string; name: string; websiteUrl: string }[];
  placements: { id: string; slot: string; impressionCount: number; clickCount: number }[];
}

interface AdminCommunityData {
  pendingAmbassadors: {
    id: string;
    university: string;
    country: string;
    field: string;
    verificationMethod: string;
    proofRef: string | null;
  }[];
  pendingQuestions: { id: string; askerPseudonym: string; questionText: string }[];
  readiness: { helpersWithCompletedOrders: number; gateTargetHelpers: number; gateMet: boolean };
}

export function AdminPhase23Panel() {
  const [helpers, setHelpers] = useState<AdminHelperData | null>(null);
  const [sponsors, setSponsors] = useState<AdminSponsorData | null>(null);
  const [community, setCommunity] = useState<AdminCommunityData | null>(null);
  const [sponsorName, setSponsorName] = useState("");
  const [sponsorUrl, setSponsorUrl] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [h, s, c] = await Promise.all([
      fetch("/api/admin/helpers"),
      fetch("/api/admin/sponsors"),
      fetch("/api/admin/community"),
    ]);
    if (h.ok) setHelpers((await h.json()) as AdminHelperData);
    if (s.ok) setSponsors((await s.json()) as AdminSponsorData);
    if (c.ok) setCommunity((await c.json()) as AdminCommunityData);
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([fetch("/api/admin/helpers"), fetch("/api/admin/sponsors"), fetch("/api/admin/community")])
      .then(async ([h, s, c]) => {
        if (!active) return;
        if (h.ok) setHelpers((await h.json()) as AdminHelperData);
        if (s.ok) setSponsors((await s.json()) as AdminSponsorData);
        if (c.ok) setCommunity((await c.json()) as AdminCommunityData);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const act = async (endpoint: string, body: Record<string, unknown>) => {
    setStatus(null);
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setStatus("✓ Updated");
      await load();
    } else {
      setStatus("Action failed");
    }
  };

  return (
    <div className="flex flex-col gap-5 text-start text-xs">
      {status && <p className="font-semibold text-accent">{status}</p>}

      {community && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <strong>Phase 3 Readiness Gate:</strong> {community.readiness.helpersWithCompletedOrders} /{" "}
          {community.readiness.gateTargetHelpers} verified helpers with completed orders{" "}
          {community.readiness.gateMet ? "✅" : "(pre-gate)"}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {/* M7 Helpers & Services Queue */}
        <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
          <h3 className="text-sm font-bold">M7 — Pending Helpers & Services</h3>
          {(helpers?.pendingHelpers ?? []).map((h) => (
            <div key={h.userId} className="flex items-center justify-between gap-2 rounded-lg bg-bg p-2">
              <span>
                {h.outcomes
                  .map((o) => `${o.program} (${o.year}${o.country ? `, ${o.country}` : ""})`)
                  .join(", ")}
                <br />
                {h.verificationMethod}: <bdi className="break-all">{h.proofRef ?? "—"}</bdi>
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() =>
                    void act("/api/admin/helpers", {
                      kind: "verify_helper",
                      helperUserId: h.userId,
                      decision: "approve",
                    })
                  }
                  className="min-h-10 rounded bg-accent px-2 text-white"
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void act("/api/admin/helpers", {
                      kind: "verify_helper",
                      helperUserId: h.userId,
                      decision: "reject",
                    })
                  }
                  className="min-h-10 rounded border border-border px-2"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
          {(helpers?.pendingServices ?? []).map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg bg-bg p-2">
              <span>
                <strong>{Object.values(s.title).filter(Boolean).join(" / ")}</strong> · {s.category} ·{" "}
                {s.priceIqd} IQD · {s.allowedForMinors ? "minors allowed" : "18+"}
                <br />
                {Object.values(s.scope).filter(Boolean).join(" / ")} —{" "}
                {Object.values(s.deliverables).filter(Boolean).join(" / ")}
                {s.sessionLink && <bdi className="break-all"> · {s.sessionLink}</bdi>}
              </span>
              <button
                type="button"
                onClick={() =>
                  void act("/api/admin/helpers", {
                    kind: "review_service",
                    serviceId: s.id,
                    decision: "active",
                  })
                }
                className="min-h-10 rounded bg-accent px-2 text-white"
              >
                Activate
              </button>
              <button
                type="button"
                onClick={() =>
                  void act("/api/admin/helpers", {
                    kind: "review_service",
                    serviceId: s.id,
                    decision: "rejected",
                  })
                }
                className="min-h-10 rounded border border-border px-2"
              >
                Reject
              </button>
            </div>
          ))}
          {(helpers?.activeOrders ?? []).map((o) => (
            <div key={o.id} className="flex items-center justify-between gap-2 rounded-lg bg-bg p-2">
              <span>
                Order {o.id.slice(0, 8)} · <strong>{o.status}</strong> ({o.priceIqd} IQD)
                {o.disputeReason ? ` · ${o.disputeReason}` : ""}
              </span>
              <div className="flex gap-1">
                {o.status === "created" && (
                  <button
                    type="button"
                    onClick={() =>
                      void act("/api/admin/helpers", {
                        kind: "transition_order",
                        orderId: o.id,
                        status: "paid_held",
                      })
                    }
                    className="min-h-10 rounded border border-accent px-2 text-accent"
                  >
                    Confirm Paid
                  </button>
                )}
                {(o.status === "confirmed" || o.status === "disputed") && (
                  <button
                    type="button"
                    onClick={() =>
                      void act("/api/admin/helpers", {
                        kind: "transition_order",
                        orderId: o.id,
                        status: "released",
                      })
                    }
                    className="min-h-10 rounded bg-accent px-2 text-white"
                  >
                    Release
                  </button>
                )}
                {["created", "paid_held", "in_progress", "disputed"].includes(o.status) && (
                  <button
                    type="button"
                    onClick={() =>
                      void act("/api/admin/helpers", {
                        kind: "transition_order",
                        orderId: o.id,
                        status: "refunded",
                      })
                    }
                    className="min-h-10 rounded border border-border px-2"
                  >
                    {o.status === "created" ? "Cancel" : "Refund"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </section>

        {/* M8 Sponsors & M9 Moderation */}
        <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
          <h3 className="text-sm font-bold">M8 Sponsors & M9 Moderation</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={sponsorName}
              onChange={(e) => setSponsorName(e.target.value)}
              placeholder="Sponsor name"
              className="min-h-10 flex-1 rounded border border-border bg-bg px-2"
            />
            <input
              type="url"
              value={sponsorUrl}
              onChange={(e) => setSponsorUrl(e.target.value)}
              placeholder="https://..."
              className="min-h-10 flex-1 rounded border border-border bg-bg px-2"
            />
            <button
              type="button"
              onClick={() => {
                if (sponsorName && sponsorUrl) {
                  void act("/api/admin/sponsors", {
                    kind: "sponsor",
                    name: sponsorName,
                    websiteUrl: sponsorUrl,
                  });
                  setSponsorName("");
                  setSponsorUrl("");
                }
              }}
              className="min-h-10 rounded bg-accent px-3 text-white"
            >
              + Sponsor
            </button>
          </div>
          {(sponsors?.placements ?? []).map((p) => (
            <div key={p.id} className="rounded bg-bg p-2">
              {p.slot} · impressions: {p.impressionCount} · clicks: {p.clickCount}
            </div>
          ))}
          {(community?.pendingAmbassadors ?? []).map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-2 rounded bg-bg p-2">
              <span>
                Ambassador: {a.university} ({a.country}) · {a.field}
                <br />
                {a.verificationMethod}: <bdi className="break-all">{a.proofRef ?? "—"}</bdi>
              </span>
              <button
                type="button"
                onClick={() =>
                  void act("/api/admin/community", {
                    kind: "verify_ambassador",
                    ambassadorId: a.id,
                    approve: true,
                  })
                }
                className="min-h-10 rounded bg-accent px-2 text-white"
              >
                Verify
              </button>
              <button
                type="button"
                onClick={() =>
                  void act("/api/admin/community", {
                    kind: "verify_ambassador",
                    ambassadorId: a.id,
                    approve: false,
                  })
                }
                className="min-h-10 rounded border border-border px-2"
              >
                Reject
              </button>
            </div>
          ))}
          {(community?.pendingQuestions ?? []).map((q) => (
            <div key={q.id} className="flex items-center justify-between gap-2 rounded bg-bg p-2">
              <span>
                Q ({q.askerPseudonym}): {q.questionText}
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() =>
                    void act("/api/admin/community", {
                      kind: "moderate_question",
                      questionId: q.id,
                      decision: "approved",
                    })
                  }
                  className="min-h-10 rounded bg-accent px-2 text-white"
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void act("/api/admin/community", {
                      kind: "moderate_question",
                      questionId: q.id,
                      decision: "hidden",
                    })
                  }
                  className="min-h-10 rounded border border-border px-2"
                >
                  Hide
                </button>
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
