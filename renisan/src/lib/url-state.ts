// ============================================
// Renisan — Checker state <-> URL query string
// Lets students share a link that reopens with the same score and filters.
// ============================================

import type { AdmissionSystem, Gender, ProgramLevel } from './types';

export type Stream = 'scientific' | 'literary' | 'vocational';
export type SubStream = 'bio' | 'applied';
export type SortBy = 'cutoff_desc' | 'cutoff_asc' | 'closest' | 'alpha';

export interface CheckerUrlState {
  system: AdmissionSystem;
  score: string;
  stream: Stream;
  subStream?: SubStream;
  location: string;
  studyType: string;
  channel: string;
  gender: Gender;
  level: ProgramLevel | 'all';
  search?: string;
  sortBy?: SortBy;
  showReach?: boolean;
}

export const DEFAULT_CHECKER_STATE: CheckerUrlState = {
  system: 'federal',
  score: '',
  stream: 'scientific',
  subStream: undefined,
  location: 'all',
  studyType: 'all',
  channel: 'general',
  gender: 'both',
  level: 'all'
};

const SYSTEMS: readonly AdmissionSystem[] = ['federal', 'krg'];
const STREAMS: readonly Stream[] = ['scientific', 'literary', 'vocational'];
const SUB_STREAMS: readonly SubStream[] = ['bio', 'applied'];
const GENDERS: readonly Gender[] = ['both', 'male', 'female'];
const LEVELS: readonly (ProgramLevel | 'all')[] = ['all', 'college', 'institute'];
const SORTS: readonly SortBy[] = ['cutoff_desc', 'cutoff_asc', 'closest', 'alpha'];

function pick<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

/** Parses a query string, ignoring unknown or malformed values. */
export function parseCheckerState(search: string): CheckerUrlState {
  const p = new URLSearchParams(search);
  const d = DEFAULT_CHECKER_STATE;
  const stream = pick(p.get('stream'), STREAMS) ?? d.stream;
  const q = p.get('q')?.trim().slice(0, 60);
  const sort = pick(p.get('sort'), SORTS);
  const reach = p.get('reach') === '1';
  const result: CheckerUrlState = {
    system: pick(p.get('sys'), SYSTEMS) ?? d.system,
    score: (p.get('score') ?? d.score).slice(0, 12),
    stream,
    subStream: stream === 'scientific' ? pick(p.get('sub'), SUB_STREAMS) : undefined,
    location: p.get('loc') || d.location,
    studyType: p.get('type') || d.studyType,
    channel: p.get('ch') || d.channel,
    gender: pick(p.get('g'), GENDERS) ?? d.gender,
    level: pick(p.get('lvl'), LEVELS) ?? d.level
  };
  if (q) result.search = q;
  if (sort && sort !== 'cutoff_desc') result.sortBy = sort;
  if (reach) result.showReach = true;
  return result;
}

/** Serializes state, omitting defaults to keep shared links short. */
export function serializeCheckerState(state: CheckerUrlState): string {
  const d = DEFAULT_CHECKER_STATE;
  const p = new URLSearchParams();
  if (state.system !== d.system) p.set('sys', state.system);
  if (state.score !== d.score) p.set('score', state.score);
  if (state.stream !== d.stream) p.set('stream', state.stream);
  if (state.subStream) p.set('sub', state.subStream);
  if (state.location !== d.location) p.set('loc', state.location);
  if (state.studyType !== d.studyType) p.set('type', state.studyType);
  if (state.channel !== d.channel) p.set('ch', state.channel);
  if (state.gender !== d.gender) p.set('g', state.gender);
  if (state.level !== d.level) p.set('lvl', state.level);
  if (state.search && state.search.trim() !== '') p.set('q', state.search.trim().slice(0, 60));
  if (state.sortBy && state.sortBy !== 'cutoff_desc') p.set('sort', state.sortBy);
  if (state.showReach) p.set('reach', '1');
  const qs = p.toString();
  return qs ? `?${qs}` : '';
}
