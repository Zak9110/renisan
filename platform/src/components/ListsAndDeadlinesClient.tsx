"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { pickText, type Locale } from "@/i18n/config";

interface CustomListDto {
  id: string;
  name: string;
  items: {
    opportunity: {
      id: string;
      title: Record<string, string | undefined>;
      providerName: string;
    };
  }[];
}

interface DeadlineDto {
  opportunityId: string;
  title: Record<string, string | undefined>;
  providerName: string;
  applyUrl: string | null;
  sourceUrl: string;
  state: "saved" | "applied" | "got_it" | "rejected" | "dismissed";
  deadline: string | null;
  rolling: boolean;
  daysLeft: number | null;
  urgency: string;
  privateNote: string | null;
}

export function ListsAndDeadlinesClient({ locale }: { locale: Locale }) {
  const t = useTranslations("Lists");
  const [unauth, setUnauth] = useState(false);
  const [lists, setLists] = useState<CustomListDto[]>([]);
  const [deadlines, setDeadlines] = useState<DeadlineDto[]>([]);
  const [newListName, setNewListName] = useState("");
  const [calendarPath, setCalendarPath] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [lRes, dRes] = await Promise.all([fetch("/api/lists"), fetch("/api/deadlines")]);
    if (lRes.status === 401 || dRes.status === 401) {
      setUnauth(true);
      return;
    }
    setUnauth(false);
    if (lRes.ok) {
      const data = (await lRes.json()) as { lists: CustomListDto[] };
      setLists(data.lists);
    }
    if (dRes.ok) {
      const data = (await dRes.json()) as { deadlines: DeadlineDto[] };
      setDeadlines(data.deadlines);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim()) return;
    const res = await fetch("/api/lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newListName.trim() }),
    });
    if (res.ok) {
      setNewListName("");
      await load();
    }
  };

  const handleDeleteList = async (id: string) => {
    const res = await fetch(`/api/lists/${id}`, { method: "DELETE" });
    if (res.ok) await load();
  };

  const handleUpdateTracker = async (
    opportunityId: string,
    state: DeadlineDto["state"],
    privateNote?: string,
  ) => {
    await fetch("/api/tracker", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opportunityId, state, privateNote }),
    });
    await load();
  };

  const handleGenerateCalendar = async () => {
    const res = await fetch("/api/deadlines", { method: "POST" });
    if (res.ok) {
      const data = (await res.json()) as { calendarPath: string };
      setCalendarPath(data.calendarPath);
    }
  };

  if (unauth) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-start text-sm text-muted">
        {t("signInPrompt")}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-border bg-surface p-5">
        <form onSubmit={handleCreateList} className="mb-4 flex flex-wrap gap-2">
          <input
            type="text"
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            placeholder={t("newListPlaceholder")}
            className="min-h-11 flex-1 rounded-lg border border-border bg-bg px-3 text-sm"
          />
          <button
            type="submit"
            className="min-h-11 rounded-lg bg-accent px-4 text-sm font-medium text-white"
          >
            {t("createList")}
          </button>
        </form>

        {lists.length === 0 ? (
          <p className="text-start text-sm text-muted">{t("emptyLists")}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {lists.map((list) => (
              <div
                key={list.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-bg px-4 py-3"
              >
                <div className="text-start">
                  <strong>{list.name}</strong>
                  <span className="ms-2 text-xs text-muted">({list.items.length})</span>
                </div>
                <button
                  type="button"
                  onClick={() => void handleDeleteList(list.id)}
                  className="min-h-11 rounded-md border border-border px-3 text-xs"
                >
                  {t("deleteList")}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-start text-lg font-bold">{t("deadlinesTitle")}</h2>
          <button
            type="button"
            onClick={() => void handleGenerateCalendar()}
            className="min-h-11 rounded-lg border border-accent px-4 text-sm font-medium text-accent"
          >
            📅 {t("calendarSync")}
          </button>
        </div>

        {calendarPath && (
          <div className="mb-4 rounded-lg border border-accent bg-bg p-3 text-start text-xs">
            <p className="mb-1 font-medium">{t("calendarReady")}</p>
            <a href={calendarPath} className="underline">
              {calendarPath}
            </a>
          </div>
        )}

        {deadlines.length === 0 ? (
          <p className="text-start text-sm text-muted">{t("emptyDeadlines")}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {deadlines.map((d) => (
              <div
                key={d.opportunityId}
                className="flex flex-col gap-2 rounded-lg border border-border bg-bg p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-start">
                    <strong>
                      <bdi>{pickText(d.title, locale)}</bdi>
                    </strong>
                    <p className="text-xs text-muted">{d.providerName}</p>
                  </div>
                  <span className="rounded-full border border-border px-3 py-1 text-xs font-medium">
                    {d.deadline
                      ? new Intl.DateTimeFormat(locale, {
                          dateStyle: "medium",
                          timeZone: "Asia/Baghdad",
                        }).format(new Date(d.deadline))
                      : "Rolling"}
                    {d.daysLeft != null && d.daysLeft >= 0 ? ` (${d.daysLeft}d)` : ""}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={d.state}
                    onChange={(e) =>
                      void handleUpdateTracker(
                        d.opportunityId,
                        e.target.value as DeadlineDto["state"],
                        d.privateNote ?? undefined,
                      )
                    }
                    className="min-h-11 rounded-md border border-border bg-surface px-3 text-xs"
                  >
                    <option value="saved">{t("stageSaved")}</option>
                    <option value="applied">{t("stageApplied")}</option>
                    <option value="got_it">{t("stageGotIt")}</option>
                    <option value="rejected">{t("stageRejected")}</option>
                  </select>
                  <input
                    type="text"
                    defaultValue={d.privateNote ?? ""}
                    placeholder={t("notePlaceholder")}
                    onBlur={(e) =>
                      void handleUpdateTracker(d.opportunityId, d.state, e.target.value)
                    }
                    className="min-h-11 flex-1 rounded-md border border-border bg-surface px-3 text-xs"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
