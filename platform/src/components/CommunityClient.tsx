"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { pickText, type Locale } from "@/i18n/config";

interface QuestionDto {
  id: string;
  askerPseudonym: string;
  questionText: string;
  answerText: string | null;
  status: string;
}

interface AmbassadorDto {
  id: string;
  university: string;
  country: string;
  field: string;
  howFunded: Record<string, string | undefined> | null;
  bio: Record<string, string | undefined> | null;
  questions: QuestionDto[];
}

interface EventDto {
  id: string;
  title: Record<string, string | undefined>;
  description: Record<string, string | undefined> | null;
  hostName: string;
  startsAt: string;
  externalUrl: string;
  replayUrl: string | null;
  registrationCount: number;
}

interface ClubDto {
  id: string;
  name: Record<string, string | undefined>;
  description: Record<string, string | undefined> | null;
  topic: string;
  externalUrl: string;
  codeOfConductUrl: string | null;
}

interface MyCommunityDto {
  myIntros: { id: string; status: string; contactChannel: string | null; university: string }[];
  inbox: {
    intros: { id: string; note: string }[];
    questions: { id: string; askerPseudonym: string; questionText: string }[];
  } | null;
}

async function fetchMine(): Promise<MyCommunityDto | null> {
  const res = await fetch("/api/community/intros");
  return res.ok ? ((await res.json()) as MyCommunityDto) : null;
}

export function CommunityClient({ locale }: { locale: Locale }) {
  const t = useTranslations("Community");
  const [tab, setTab] = useState<"ambassadors" | "events" | "clubs" | "apply">("ambassadors");
  const [ambassadorsList, setAmbassadorsList] = useState<AmbassadorDto[]>([]);
  const [eventsList, setEventsList] = useState<EventDto[]>([]);
  const [clubsList, setClubsList] = useState<ClubDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [questionDraft, setQuestionDraft] = useState<Record<string, string>>({});
  const [pseudonymDraft, setPseudonymDraft] = useState<Record<string, string>>({});

  const [mine, setMine] = useState<MyCommunityDto | null>(null);
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({});

  const errorText = (code?: string) =>
    code && t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.generic");

  useEffect(() => {
    let active = true;
    fetchMine()
      .then((m) => {
        if (active) setMine(m);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const handleReply = async (url: string, body: Record<string, unknown>) => {
    setFeedback(null);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setFeedback(t("replySaved"));
      setMine(await fetchMine());
    } else {
      setFeedback(errorText(((await res.json()) as { error?: string }).error));
    }
  };

  // Ambassador apply form
  const [university, setUniversity] = useState("");
  const [country, setCountry] = useState("");
  const [field, setField] = useState("");
  const [howFunded, setHowFunded] = useState("");
  const [proofRef, setProofRef] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/community")
      .then((res) =>
        res.ok
          ? (res.json() as Promise<{
              ambassadors: AmbassadorDto[];
              events: EventDto[];
              clubs: ClubDto[];
            }>)
          : null,
      )
      .then((json) => {
        if (!active || !json) return;
        setAmbassadorsList(json.ambassadors);
        setEventsList(json.events);
        setClubsList(json.clubs);
        setLoading(false);
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleAskQuestion = async (ambassadorId: string) => {
    const text = questionDraft[ambassadorId]?.trim();
    if (!text) return;
    setFeedback(null);
    const res = await fetch("/api/community/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "ask",
        ambassadorId,
        questionText: text,
        pseudonym: pseudonymDraft[ambassadorId]?.trim() || undefined,
      }),
    });
    if (res.ok) {
      setQuestionDraft({ ...questionDraft, [ambassadorId]: "" });
      setFeedback(t("questionSent"));
    } else {
      const json = (await res.json()) as { error?: string };
      setFeedback(errorText(json.error));
    }
  };

  const handleRequestIntro = async (ambassadorId: string) => {
    setFeedback(null);
    const res = await fetch("/api/community/intros", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "request",
        ambassadorId,
        note: t("introNote"),
      }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    if (res.ok && json.ok) {
      setFeedback(t("introSent"));
      setMine(await fetchMine());
    } else if (json.error === "minors_cannot_request_intros") {
      setFeedback(t("introMinorBlocked"));
    } else {
      setFeedback(errorText(json.error));
    }
  };

  const handleRegisterEvent = async (eventId: string) => {
    setFeedback(null);
    const res = await fetch(`/api/community/events/${eventId}/register`, { method: "POST" });
    if (res.ok) {
      setFeedback(t("registeredEvent"));
      setEventsList((prev) =>
        prev.map((e) => (e.id === eventId ? { ...e, registrationCount: e.registrationCount + 1 } : e)),
      );
    } else {
      setFeedback(errorText(res.status === 401 ? "unauthorized" : undefined));
    }
  };

  const handleApplyAmbassador = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const res = await fetch("/api/community", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        university,
        country,
        field,
        howFunded: howFunded.trim() ? { [locale]: howFunded.trim() } : null,
        verificationMethod: "academic_email",
        proofRef,
      }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    if (res.ok && json.ok) {
      setFeedback(t("appliedMsg"));
      setUniversity("");
      setCountry("");
      setField("");
      setHowFunded("");
      setProofRef("");
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
        🛡️ {t("safetyNote")}
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["ambassadors", t("tabAmbassadors")],
            ["events", t("tabEvents")],
            ["clubs", t("tabClubs")],
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

      {mine && mine.myIntros.length > 0 && (
        <section className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 text-start text-sm">
          <h2 className="font-bold">{t("myIntros")}</h2>
          {mine.myIntros.map((i) => (
            <p key={i.id} className="text-xs">
              <bdi>{i.university}</bdi> · {t(`introStatus.${i.status}`)}
              {i.contactChannel ? (
                <>
                  {" · "}
                  <bdi>{i.contactChannel}</bdi>
                </>
              ) : null}
            </p>
          ))}
        </section>
      )}

      {mine?.inbox && (
        <section className="flex flex-col gap-3 rounded-xl border border-accent bg-surface p-4 text-start text-sm">
          <h2 className="font-bold">{t("inboxTitle")}</h2>
          {mine.inbox.questions.length + mine.inbox.intros.length === 0 && (
            <p className="text-xs text-muted">{t("inboxEmpty")}</p>
          )}
          {mine.inbox.questions.map((q) => (
            <div key={q.id} className="flex flex-col gap-2 rounded-lg border border-border bg-bg p-3 text-xs">
              <p>
                <strong>{q.askerPseudonym}:</strong> <bdi>{q.questionText}</bdi>
              </p>
              <textarea
                rows={2}
                aria-label={t("answerPlaceholder")}
                value={replyDraft[q.id] ?? ""}
                onChange={(e) => setReplyDraft({ ...replyDraft, [q.id]: e.target.value })}
                placeholder={t("answerPlaceholder")}
                className="rounded-lg border border-border bg-surface p-2"
              />
              <button
                type="button"
                disabled={(replyDraft[q.id] ?? "").trim().length < 2}
                onClick={() =>
                  void handleReply("/api/community/questions", {
                    kind: "answer",
                    questionId: q.id,
                    answerText: replyDraft[q.id],
                  })
                }
                className="min-h-11 self-start rounded-lg bg-accent px-4 font-medium text-white disabled:opacity-50"
              >
                {t("answerSubmit")}
              </button>
            </div>
          ))}
          {mine.inbox.intros.map((i) => (
            <div key={i.id} className="flex flex-col gap-2 rounded-lg border border-border bg-bg p-3 text-xs">
              <p>
                {t("introRequest")}: <bdi>{i.note}</bdi>
              </p>
              <input
                type="text"
                maxLength={120}
                aria-label={t("contactPlaceholder")}
                value={replyDraft[i.id] ?? ""}
                onChange={(e) => setReplyDraft({ ...replyDraft, [i.id]: e.target.value })}
                placeholder={t("contactPlaceholder")}
                className="min-h-11 rounded-lg border border-border bg-surface px-3"
              />
              <div className="flex flex-wrap gap-2">
                {(["accepted", "declined"] as const).map((decision) => (
                  <button
                    key={decision}
                    type="button"
                    disabled={decision === "accepted" && !(replyDraft[i.id] ?? "").trim()}
                    onClick={() =>
                      void handleReply("/api/community/intros", {
                        kind: "respond",
                        introId: i.id,
                        decision,
                        contactChannel: decision === "accepted" ? replyDraft[i.id] : undefined,
                      })
                    }
                    className="min-h-11 rounded-lg border border-accent px-4 text-accent disabled:opacity-50"
                  >
                    {decision === "accepted" ? t("accept") : t("decline")}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {tab === "ambassadors" && (
        <div className="flex flex-col gap-4">
          {loading ? (
            <p className="text-start text-sm text-muted">...</p>
          ) : ambassadorsList.length === 0 ? (
            <p className="rounded-xl border border-border bg-surface p-6 text-start text-sm text-muted">
              {t("emptyAmbassadors")}
            </p>
          ) : (
            ambassadorsList.map((a) => (
              <article
                key={a.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 text-start"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-bold">
                      {a.university} — {a.country}
                    </h2>
                    <p className="text-xs text-muted">{a.field}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleRequestIntro(a.id)}
                    className="min-h-11 rounded-lg border border-accent px-3 text-xs font-medium text-accent"
                  >
                    {t("requestIntro")}
                  </button>
                </div>

                {a.howFunded && (
                  <p className="text-sm">
                    <bdi>{pickText(a.howFunded, locale)}</bdi>
                  </p>
                )}

                {a.questions.length > 0 && (
                  <div className="flex flex-col gap-2 rounded-lg border border-border bg-bg p-3 text-xs">
                    {a.questions.map((q) => (
                      <div key={q.id} className="border-b border-border pb-2 last:border-b-0 last:pb-0">
                        <p className="font-semibold">
                          {q.askerPseudonym}: {q.questionText}
                        </p>
                        {q.answerText && <p className="mt-1 text-muted">↳ {q.answerText}</p>}
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    value={pseudonymDraft[a.id] ?? ""}
                    onChange={(e) => setPseudonymDraft({ ...pseudonymDraft, [a.id]: e.target.value })}
                    placeholder={t("pseudonymPlaceholder")}
                    className="min-h-11 rounded-lg border border-border bg-bg px-3 text-xs sm:w-48"
                  />
                  <input
                    type="text"
                    value={questionDraft[a.id] ?? ""}
                    onChange={(e) => setQuestionDraft({ ...questionDraft, [a.id]: e.target.value })}
                    placeholder={t("askPlaceholder")}
                    className="min-h-11 flex-1 rounded-lg border border-border bg-bg px-3 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => void handleAskQuestion(a.id)}
                    className="min-h-11 rounded-lg bg-accent px-4 text-xs font-medium text-white"
                  >
                    {t("askSubmit")}
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      )}

      {tab === "events" && (
        <div className="flex flex-col gap-3">
          {eventsList.length === 0 ? (
            <p className="rounded-xl border border-border bg-surface p-6 text-start text-sm text-muted">
              {t("emptyEvents")}
            </p>
          ) : (
            eventsList.map((ev) => (
              <div
                key={ev.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 text-start"
              >
                <div>
                  <strong className="text-base">
                    <bdi>{pickText(ev.title, locale)}</bdi>
                  </strong>
                  <p className="text-xs text-muted">
                    {ev.hostName} ·{" "}
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "Asia/Baghdad",
                    }).format(new Date(ev.startsAt))}{" "}
                    · {ev.registrationCount}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handleRegisterEvent(ev.id)}
                    className="min-h-11 rounded-lg bg-accent px-4 text-xs font-medium text-white"
                  >
                    {t("registerEvent")}
                  </button>
                  <a
                    href={ev.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 text-xs underline"
                  >
                    {t("joinEvent")} ↗
                  </a>
                  {ev.replayUrl && (
                    <a
                      href={ev.replayUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center rounded-lg border border-accent px-3 text-xs text-accent"
                    >
                      {t("watchReplay")} ↗
                    </a>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "clubs" && (
        <div className="flex flex-col gap-3">
          {clubsList.length === 0 ? (
            <p className="rounded-xl border border-border bg-surface p-6 text-start text-sm text-muted">
              {t("emptyClubs")}
            </p>
          ) : (
            clubsList.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 text-start"
              >
                <div>
                  <strong className="text-base">
                    <bdi>{pickText(c.name, locale)}</bdi>
                  </strong>
                  <p className="text-xs text-muted">{c.topic}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={c.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 text-xs font-medium text-white"
                  >
                    {t("joinClub")} ↗
                  </a>
                  {c.codeOfConductUrl && (
                    <a
                      href={c.codeOfConductUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 text-xs"
                    >
                      {t("codeOfConduct")} ↗
                    </a>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "apply" && (
        <form
          onSubmit={handleApplyAmbassador}
          className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 text-start"
        >
          <h2 className="text-base font-bold">{t("applyTitle")}</h2>
          <input
            type="text"
            required
            value={university}
            onChange={(e) => setUniversity(e.target.value)}
            placeholder={t("universityLabel")}
            className="min-h-11 rounded-lg border border-border bg-bg px-3 text-sm"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              type="text"
              required
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder={t("countryLabel")}
              className="min-h-11 rounded-lg border border-border bg-bg px-3 text-sm"
            />
            <input
              type="text"
              required
              value={field}
              onChange={(e) => setField(e.target.value)}
              placeholder={t("fieldLabel")}
              className="min-h-11 rounded-lg border border-border bg-bg px-3 text-sm"
            />
          </div>
          <textarea
            rows={2}
            value={howFunded}
            onChange={(e) => setHowFunded(e.target.value)}
            placeholder={t("howFundedLabel")}
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
          <button type="submit" className="min-h-11 rounded-lg bg-accent px-5 text-sm font-medium text-white">
            {t("applySubmit")}
          </button>
        </form>
      )}
    </div>
  );
}
