"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { pickText, type Locale } from "@/i18n/config";
import { Link } from "@/i18n/navigation";

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

interface ChecklistEntry {
  label: string;
  done: boolean;
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
  checklist: ChecklistEntry[];
}

export function ListsAndDeadlinesClient({ locale }: { locale: Locale }) {
  const t = useTranslations("Lists");
  const [unauth, setUnauth] = useState(false);
  const [lists, setLists] = useState<CustomListDto[]>([]);
  const [deadlines, setDeadlines] = useState<DeadlineDto[]>([]);
  const [newListName, setNewListName] = useState("");
  const [calendarPath, setCalendarPath] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"timeline" | "calendar">("timeline");
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date();
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
  });
  const [draftChecklist, setDraftChecklist] = useState<Record<string, string>>({});

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
    let active = true;
    Promise.all([fetch("/api/lists"), fetch("/api/deadlines")])
      .then(async ([lRes, dRes]) => {
        if (!active) return;
        if (lRes.status === 401 || dRes.status === 401) {
          setUnauth(true);
          return;
        }
        setUnauth(false);
        if (lRes.ok) {
          const data = (await lRes.json()) as { lists: CustomListDto[] };
          if (active) setLists(data.lists);
        }
        if (dRes.ok) {
          const data = (await dRes.json()) as { deadlines: DeadlineDto[] };
          if (active) setDeadlines(data.deadlines);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

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

  const handleRemoveFromList = async (listId: string, opportunityId: string) => {
    const res = await fetch(`/api/lists/${listId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opportunityId }),
    });
    if (res.ok) await load();
  };

  const handleUpdateTracker = async (
    opportunityId: string,
    state: DeadlineDto["state"],
    privateNote?: string | null,
    checklist?: ChecklistEntry[],
  ) => {
    await fetch("/api/tracker", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        opportunityId,
        state,
        ...(privateNote !== undefined ? { privateNote } : {}),
        ...(checklist !== undefined ? { checklist } : {}),
      }),
    });
    await load();
  };

  const handleToggleChecklist = async (d: DeadlineDto, index: number) => {
    const next = d.checklist.map((c, i) => (i === index ? { ...c, done: !c.done } : c));
    await handleUpdateTracker(d.opportunityId, d.state, d.privateNote, next);
  };

  const handleAddChecklistItem = async (d: DeadlineDto) => {
    const text = (draftChecklist[d.opportunityId] ?? "").trim();
    if (!text) return;
    const next = [...d.checklist, { label: text, done: false }];
    setDraftChecklist((prev) => ({ ...prev, [d.opportunityId]: "" }));
    await handleUpdateTracker(d.opportunityId, d.state, d.privateNote, next);
  };

  const handleGenerateCalendar = async () => {
    const res = await fetch("/api/deadlines", { method: "POST" });
    if (res.ok) {
      const data = (await res.json()) as { calendarPath: string };
      setCalendarPath(data.calendarPath);
    }
  };

  const shiftMonth = (delta: number) => {
    setCalMonth((prev) => {
      const dt = new Date(Date.UTC(prev.year, prev.month + delta, 1));
      return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() };
    });
  };

  const calendarCells = useMemo(() => {
    const firstDay = new Date(Date.UTC(calMonth.year, calMonth.month, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(calMonth.year, calMonth.month + 1, 0)).getUTCDate();
    const cells: { day: number | null; items: DeadlineDto[] }[] = [];
    for (let i = 0; i < firstDay; i++) cells.push({ day: null, items: [] });
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = `${calMonth.year}-${String(calMonth.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const matched = deadlines.filter((d) => d.deadline && d.deadline.slice(0, 10) === iso);
      cells.push({ day, items: matched });
    }
    return cells;
  }, [calMonth, deadlines]);

  if (unauth) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-start text-sm text-muted">
        {t("signInPrompt")}
      </div>
    );
  }

  const monthHeading = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(calMonth.year, calMonth.month, 1)));

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
          <button type="submit" className="min-h-11 rounded-lg bg-accent px-4 text-sm font-medium text-white">
            {t("createList")}
          </button>
        </form>

        {lists.length === 0 ? (
          <p className="text-start text-sm text-muted">{t("emptyLists")}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {lists.map((list) => (
              <div key={list.id} className="rounded-lg border border-border bg-bg p-4">
                <div className="flex items-center justify-between gap-2">
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
                {list.items.length > 0 && (
                  <ul className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
                    {list.items.map(({ opportunity }) => (
                      <li key={opportunity.id} className="flex items-center justify-between gap-2 text-sm">
                        <Link
                          href={`/opportunities/${opportunity.id}`}
                          className="text-start hover:text-accent hover:underline"
                        >
                          <bdi>{pickText(opportunity.title, locale)}</bdi>
                        </Link>
                        <button
                          type="button"
                          onClick={() => void handleRemoveFromList(list.id, opportunity.id)}
                          className="rounded-md border border-border px-2 py-1 text-xs text-muted"
                        >
                          {t("removeItem")}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-start text-lg font-bold">{t("deadlinesTitle")}</h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setViewMode("timeline")}
              className={`min-h-11 rounded-lg border px-3 text-xs font-medium ${
                viewMode === "timeline" ? "border-accent bg-accent text-white" : "border-border bg-bg"
              }`}
            >
              {t("viewTimeline")}
            </button>
            <button
              type="button"
              onClick={() => setViewMode("calendar")}
              className={`min-h-11 rounded-lg border px-3 text-xs font-medium ${
                viewMode === "calendar" ? "border-accent bg-accent text-white" : "border-border bg-bg"
              }`}
            >
              📅 {t("viewCalendar")}
            </button>
            <button
              type="button"
              onClick={() => void handleGenerateCalendar()}
              className="min-h-11 rounded-lg border border-accent px-4 text-xs font-medium text-accent"
            >
              {t("calendarSync")}
            </button>
          </div>
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
        ) : viewMode === "calendar" ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                className="min-h-11 rounded-lg border border-border bg-bg px-3 text-xs"
              >
                {t("prevMonth")}
              </button>
              <strong className="text-sm">{monthHeading}</strong>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                className="min-h-11 rounded-lg border border-border bg-bg px-3 text-xs"
              >
                {t("nextMonth")}
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-xs">
              {calendarCells.map((cell, idx) => (
                <div
                  key={idx}
                  className={`min-h-20 rounded-md border p-1.5 ${
                    cell.items.length > 0 ? "border-accent bg-bg" : "border-border bg-surface"
                  }`}
                >
                  {cell.day != null && <div className="font-semibold text-muted">{cell.day}</div>}
                  <div className="mt-1 flex flex-col gap-1">
                    {cell.items.map((item) => (
                      <Link
                        key={item.opportunityId}
                        href={`/opportunities/${item.opportunityId}`}
                        className="block truncate rounded bg-accent px-1 py-0.5 text-[11px] text-white"
                      >
                        <bdi>{pickText(item.title, locale)}</bdi>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {deadlines.map((d) => (
              <div
                key={d.opportunityId}
                className="flex flex-col gap-3 rounded-lg border border-border bg-bg p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-start">
                    <Link
                      href={`/opportunities/${d.opportunityId}`}
                      className="font-bold hover:text-accent hover:underline"
                    >
                      <bdi>{pickText(d.title, locale)}</bdi>
                    </Link>
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
                        d.privateNote,
                        d.checklist,
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
                      void handleUpdateTracker(d.opportunityId, d.state, e.target.value, d.checklist)
                    }
                    className="min-h-11 flex-1 rounded-md border border-border bg-surface px-3 text-xs"
                  />
                </div>

                {/* Per-item interactive document checklist */}
                <div className="border-t border-border pt-2">
                  <p className="mb-1 text-start text-xs font-medium text-muted">{t("checklistTitle")}</p>
                  {d.checklist.length > 0 && (
                    <ul className="mb-2 flex flex-col gap-1">
                      {d.checklist.map((c, idx) => (
                        <li key={idx} className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={c.done}
                            onChange={() => void handleToggleChecklist(d, idx)}
                          />
                          <span className={c.done ? "line-through text-muted" : ""}>{c.label}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={draftChecklist[d.opportunityId] ?? ""}
                      onChange={(e) =>
                        setDraftChecklist((prev) => ({ ...prev, [d.opportunityId]: e.target.value }))
                      }
                      placeholder={t("checklistAddPlaceholder")}
                      className="min-h-9 flex-1 rounded-md border border-border bg-surface px-2 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => void handleAddChecklistItem(d)}
                      className="min-h-9 rounded-md border border-border bg-surface px-3 text-xs"
                    >
                      {t("checklistAdd")}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
