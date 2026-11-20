// ============================================
// Renisan — Wishlist / Saved Items Store
// Manages student preferences locally in localStorage
// ============================================

import type { FederalCutoff, KRGCutoff, Scholarship } from './types';
import { pickLocalized, type Language } from './i18n.ts';
import { localizePlace } from './places.ts';
import { chanceBand } from './chance.ts';

export type ApplicationStage = 'saved' | 'preparing' | 'applied' | 'got_it' | 'rejected';

export interface WishlistItem {
  id: string;
  type: 'federal' | 'krg' | 'scholarship';
  title: string;
  subtitle: string;
  location?: string;
  score?: number;
  studyType?: string;
  channel?: string;
  url?: string;
  stage?: ApplicationStage;
  note?: string;
  raw: FederalCutoff | KRGCutoff | Scholarship;
  addedAt: number;
}

export interface WishlistInversion {
  higherPriorityIndex: number;
  lowerPriorityIndex: number;
  higherPriorityItem: WishlistItem;
  lowerPriorityItem: WishlistItem;
}

export interface WishlistAnalysis {
  total: number;
  universities: number;
  colleges: number;
  institutes: number;
  scholarships: number;
  avgScore: string | null;
  safeCount: number;
  targetCount: number;
  reachCount: number;
  inversions: WishlistInversion[];
  needsSafetyNet: boolean;
}

/**
 * Dynamically localizes a saved wishlist item's title, subtitle, and location
 * from its `raw` record so switching languages updates the Wishlist immediately.
 */
export function localizeWishlistItem(
  item: WishlistItem,
  lang: Language
): { title: string; subtitle: string; location: string; isInstitute: boolean } {
  const raw = item.raw as any;
  if (!raw || typeof raw !== 'object') {
    return {
      title: item.title,
      subtitle: item.subtitle,
      location: item.location ? localizePlace(item.location, lang) : '',
      isInstitute: false
    };
  }

  if (item.type === 'scholarship') {
    const sch = raw as Scholarship;
    const title =
      pickLocalized(lang, { ar: sch.name_ar, ckb: sch.name_ckb, kmr: sch.name_kmr, en: sch.name }) || item.title;
    const loc = localizePlace(sch.country || item.location || '', lang);
    return {
      title,
      subtitle: `${sch.provider} • ${loc}`,
      location: loc,
      isInstitute: false
    };
  }

  const pickName = (ar: string | null | undefined, en: string | null | undefined, ku: string | null | undefined): string | null =>
    pickLocalized(lang, { ar, ckb: ku, kmr: en, en }) ?? null;

  const uni = pickName(raw.university, raw.university_en, raw.university_ku) || '';
  const college = pickName(raw.college, raw.college_en, raw.college_ku) || item.title;
  const dept = pickName(raw.department, raw.department_en, raw.department_ku);
  const campus = raw.campus ? pickName(raw.campus, raw.campus_en, null) : null;
  const rawPlace = item.type === 'federal' ? raw.governorate : raw.city;
  const location = localizePlace(rawPlace || item.location || '', lang);
  const isInstitute = raw.level === 'institute';

  return {
    title: college,
    subtitle: `${uni}${dept ? ` • ${dept}` : ''}${campus ? ` • ${campus}` : ''}`,
    location,
    isInstitute
  };
}

/**
 * Analyzes an ordered wishlist against Central Admission / Zankoline form best practices:
 * 1. Detects priority inversions (a lower-cutoff choice placed above a higher-cutoff choice in the same system)
 * 2. Counts colleges vs. technical institutes vs. scholarships
 * 3. Evaluates Safe / Target / Reach distribution if a student score is provided
 */
export function analyzeWishlistForm(items: WishlistItem[], studentScore?: number | null): WishlistAnalysis {
  const uniItems = items.filter((x) => x.type !== 'scholarship');
  const schItems = items.filter((x) => x.type === 'scholarship');
  let colleges = 0;
  let institutes = 0;
  let safeCount = 0;
  let targetCount = 0;
  let reachCount = 0;

  for (const u of uniItems) {
    const isInst = (u.raw as any)?.level === 'institute';
    if (isInst) institutes++;
    else colleges++;

    if (studentScore != null && typeof u.score === 'number') {
      const band = chanceBand(studentScore - u.score);
      if (band === 'safe') safeCount++;
      else if (band === 'target') targetCount++;
      else reachCount++;
    }
  }

  const scores = uniItems.filter((x) => typeof x.score === 'number').map((x) => x.score as number);
  const avgScore = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : null;

  // Detect adjacent or top-level inversions within the same admission system
  const inversions: WishlistInversion[] = [];
  for (let i = 0; i < items.length; i++) {
    const a = items[i];
    if (a.type === 'scholarship' || typeof a.score !== 'number') continue;
    for (let j = i + 1; j < items.length; j++) {
      const b = items[j];
      if (b.type !== a.type || typeof b.score !== 'number') continue;
      // If a choice ranked higher (earlier index) has a cutoff > 0.5 points lower than a later choice
      if (b.score - a.score >= 0.5) {
        inversions.push({
          higherPriorityIndex: i,
          lowerPriorityIndex: j,
          higherPriorityItem: a,
          lowerPriorityItem: b
        });
        break;
      }
    }
  }

  const needsSafetyNet = studentScore != null && uniItems.length >= 2 && safeCount === 0;

  return {
    total: items.length,
    universities: uniItems.length,
    colleges,
    institutes,
    scholarships: schItems.length,
    avgScore,
    safeCount,
    targetCount,
    reachCount,
    inversions,
    needsSafetyNet
  };
}

// ============================================
// Form checks — what the official form will reject or what the student
// probably did not mean. Pure function so it is fully testable.
// ============================================

export interface FormProfile {
  stream?: 'scientific' | 'literary' | 'vocational';
  subStream?: 'bio' | 'applied';
  gender?: 'male' | 'female' | 'both';
  channel?: string;
}

export interface FormRulesInput {
  min_choices: Partial<Record<'scientific' | 'literary' | 'vocational', number>>;
  min_technical: number;
}

export interface FormProgress {
  choices: number;
  requiredChoices: number;
  technical: number;
  requiredTechnical: number;
}

export interface FormCheck {
  /** Federal-form progress against the published minimums, when the stream has a known rule */
  progress: FormProgress | null;
  /** Saved Federal and KRG choices together: they go on two separate forms */
  mixedSystems: boolean;
  /** 1-based positions (in the whole list) of choices the student's stream cannot apply to */
  wrongStream: number[];
  /** 1-based positions of single-sex programmes that do not match the student */
  wrongGender: number[];
  /** 1-based positions of distinguished-schools seats saved by a student not on that channel */
  wrongChannel: number[];
}

/** Institutes and the colleges of the technical (polytechnic) universities count toward the form's technical minimum. */
export function isTechnicalChoice(item: WishlistItem): boolean {
  if (item.type === 'scholarship') return false;
  const raw = item.raw as any;
  if (raw?.level === 'institute') return true;
  const names = `${raw?.university ?? ''} ${raw?.university_en ?? ''}`;
  return /التقنية|Technical University|Polytechnic/i.test(names);
}

export function checkForm(items: WishlistItem[], profile: FormProfile, rules?: FormRulesInput | null): FormCheck {
  const federal = items.filter((x) => x.type === 'federal');
  const krg = items.filter((x) => x.type === 'krg');

  let progress: FormProgress | null = null;
  const required = profile.stream ? rules?.min_choices[profile.stream] : undefined;
  if (rules && required != null && federal.length > 0) {
    progress = {
      choices: federal.length,
      requiredChoices: required,
      technical: federal.filter(isTechnicalChoice).length,
      requiredTechnical: rules.min_technical
    };
  }

  const wrongStream: number[] = [];
  const wrongGender: number[] = [];
  const wrongChannel: number[] = [];
  items.forEach((item, i) => {
    if (item.type === 'scholarship') return;
    const raw = item.raw as any;
    if (!raw) return;
    if (profile.stream && raw.stream && raw.stream !== profile.stream) {
      wrongStream.push(i + 1);
    } else if (profile.subStream && raw.sub_stream && raw.sub_stream !== profile.subStream) {
      wrongStream.push(i + 1);
    }
    if (profile.gender && profile.gender !== 'both' && raw.gender && raw.gender !== 'both' && raw.gender !== profile.gender) {
      wrongGender.push(i + 1);
    }
    if (item.type === 'federal' && raw.channel === 'distinguished' && profile.channel && profile.channel !== 'distinguished' && profile.channel !== 'all') {
      wrongChannel.push(i + 1);
    }
  });

  return {
    progress,
    mixedSystems: federal.length > 0 && krg.length > 0,
    wrongStream,
    wrongGender,
    wrongChannel
  };
}

/**
 * The names a student types or picks on the official form: Arabic for the Federal
 * Qaddim form, Sorani Kurdish (falling back to Arabic) for Zankoline.
 */
export function officialChoiceName(item: WishlistItem): string {
  const raw = item.raw as any;
  if (!raw || item.type === 'scholarship') return item.title;
  const ku = item.type === 'krg';
  const pick = (ar?: string | null, ckb?: string | null) => (ku ? ckb || ar : ar) || '';
  const parts = [
    pick(raw.university, raw.university_ku),
    pick(raw.college, raw.college_ku),
    pick(raw.department, raw.department_ku),
    raw.campus || ''
  ].filter(Boolean);
  return parts.join(' / ');
}

// ============================================
// Storage — several named plans, one active.
// "Plan A", "Backup", "Second round" etc. The old single wishlist
// (renisan_wishlist) becomes the first plan on first load.
// ============================================

export interface WishlistPlan {
  id: string;
  name: string;
  items: WishlistItem[];
  createdAt: number;
}

interface PlanStore {
  active: string;
  plans: WishlistPlan[];
}

const LEGACY_KEY = 'renisan_wishlist';
const PLANS_KEY = 'renisan_plans';
export const MAX_PLANS = 8;
const listeners = new Set<() => void>();

function newPlanId(): string {
  return `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Validates a stored value; returns null if it is not a usable plan store. */
export function parsePlanStore(value: unknown): PlanStore | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.plans)) return null;
  const plans: WishlistPlan[] = v.plans
    .filter((p: any) => p && typeof p.id === 'string' && typeof p.name === 'string' && Array.isArray(p.items))
    .map((p: any) => ({
      id: p.id,
      name: p.name.slice(0, 40),
      items: p.items.filter((x: any) => x && typeof x.id === 'string' && typeof x.type === 'string'),
      createdAt: typeof p.createdAt === 'number' ? p.createdAt : 0
    }));
  if (plans.length === 0) return null;
  const active = typeof v.active === 'string' && plans.some((p) => p.id === v.active) ? v.active : plans[0].id;
  return { active, plans };
}

function readStore(): PlanStore {
  const fallback = (items: WishlistItem[] = []): PlanStore => {
    const id = 'plan-main';
    return { active: id, plans: [{ id, name: '', items, createdAt: Date.now() }] };
  };
  if (typeof window === 'undefined') return fallback();
  try {
    const raw = localStorage.getItem(PLANS_KEY);
    if (raw) {
      const parsed = parsePlanStore(JSON.parse(raw));
      if (parsed) return parsed;
    }
    // First run after the upgrade: carry the old single list over
    const legacy = localStorage.getItem(LEGACY_KEY);
    const legacyItems = legacy ? JSON.parse(legacy) : [];
    return fallback(Array.isArray(legacyItems) ? legacyItems : []);
  } catch {
    return fallback();
  }
}

function writeStore(store: PlanStore): void {
  try {
    localStorage.setItem(PLANS_KEY, JSON.stringify(store));
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    // quota exceeded or private mode
  }
  listeners.forEach((cb) => cb());
}

function updateActiveItems(fn: (items: WishlistItem[]) => WishlistItem[]): void {
  const store = readStore();
  const plan = store.plans.find((p) => p.id === store.active)!;
  plan.items = fn([...plan.items]);
  writeStore(store);
}

export function getPlans(): { active: string; plans: { id: string; name: string; count: number }[] } {
  const store = readStore();
  return { active: store.active, plans: store.plans.map((p) => ({ id: p.id, name: p.name, count: p.items.length })) };
}

/** Items of the active plan, in form order. */
export function getWishlist(): WishlistItem[] {
  const store = readStore();
  return store.plans.find((p) => p.id === store.active)?.items ?? [];
}

export function isWishlisted(id: string): boolean {
  return getWishlist().some((item) => item.id === id);
}

/** Adds to the END of the active plan (the form is filled top-down), or removes if already saved. */
export function toggleWishlist(item: WishlistItem): boolean {
  let added = false;
  updateActiveItems((items) => {
    if (items.some((x) => x.id === item.id)) return items.filter((x) => x.id !== item.id);
    added = true;
    return [...items, item];
  });
  return added;
}

export function removeWishlistItem(id: string): void {
  updateActiveItems((items) => items.filter((x) => x.id !== id));
}

const VALID_STAGES: readonly string[] = ['saved', 'preparing', 'applied', 'got_it', 'rejected'];

/** Updates an item's application stage or personal note in the active list. */
export function updateWishlistItemMeta(
  id: string,
  patch: { stage?: ApplicationStage; note?: string }
): void {
  updateActiveItems((items) =>
    items.map((item) => {
      if (item.id !== id) return item;
      const next = { ...item };
      if (patch.stage && VALID_STAGES.includes(patch.stage)) next.stage = patch.stage;
      if (typeof patch.note === 'string') next.note = patch.note.slice(0, 200);
      return next;
    })
  );
}

/** Moves an item one step up or down so the list can mirror the order of the official form. */
export function moveWishlistItem(id: string, direction: -1 | 1): void {
  updateActiveItems((list) => {
    const from = list.findIndex((x) => x.id === id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= list.length) return list;
    [list[from], list[to]] = [list[to], list[from]];
    return list;
  });
}

/** Moves an item to a 1-based position (for long 50-choice lists). */
export function moveWishlistItemTo(id: string, position: number): void {
  updateActiveItems((list) => {
    const from = list.findIndex((x) => x.id === id);
    if (from < 0) return list;
    const to = Math.max(0, Math.min(list.length - 1, Math.round(position) - 1));
    const [it] = list.splice(from, 1);
    list.splice(to, 0, it);
    return list;
  });
}

/** Sorts university choices by descending cutoff (a starting point the student then adjusts), scholarships last. */
export function sortWishlistByCutoff(): void {
  updateActiveItems((list) =>
    [...list].sort((a, b) => {
      const aIsSch = a.type === 'scholarship' ? 1 : 0;
      const bIsSch = b.type === 'scholarship' ? 1 : 0;
      if (aIsSch !== bIsSch) return aIsSch - bIsSch;
      return (b.score ?? 0) - (a.score ?? 0);
    })
  );
}

export function clearWishlist(): void {
  updateActiveItems(() => []);
}

export function setActivePlan(id: string): void {
  const store = readStore();
  if (!store.plans.some((p) => p.id === id) || store.active === id) return;
  store.active = id;
  writeStore(store);
}

/** Creates a plan (optionally a copy of the active one) and makes it active. Returns false at the plan limit. */
export function createPlan(name: string, copyActive: boolean): boolean {
  const store = readStore();
  if (store.plans.length >= MAX_PLANS) return false;
  const source = store.plans.find((p) => p.id === store.active);
  const plan: WishlistPlan = {
    id: newPlanId(),
    name: name.trim().slice(0, 40),
    items: copyActive && source ? [...source.items] : [],
    createdAt: Date.now()
  };
  store.plans.push(plan);
  store.active = plan.id;
  writeStore(store);
  return true;
}

export function renamePlan(id: string, name: string): void {
  const store = readStore();
  const plan = store.plans.find((p) => p.id === id);
  if (!plan) return;
  plan.name = name.trim().slice(0, 40);
  writeStore(store);
}

/** Deletes a plan; the last remaining plan is emptied instead. */
export function deletePlan(id: string): void {
  const store = readStore();
  if (store.plans.length <= 1) {
    store.plans[0].items = [];
    writeStore(store);
    return;
  }
  store.plans = store.plans.filter((p) => p.id !== id);
  if (!store.plans.some((p) => p.id === store.active)) store.active = store.plans[0].id;
  writeStore(store);
}

export function onWishlistChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
