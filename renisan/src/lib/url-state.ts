// ============================================
// Renisan — Checker state <-> URL query string
// Lets students share a link that reopens with the same score and filters.
// ============================================

import type { AdmissionSystem, Gender, ProgramLevel } from './types';

export type Stream = 'scientific' | 'literary' | 'vocational';
export type SubStream = 'bio' | 'applied';

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
}

export const DEFAULT_CHECKER_STATE: CheckerUrlState = {
  system: 'federal',
  score: '',
  stream: 'scientific',
  subStream: undefined,
  location: 'all',
  studyType: 'all',
  channel: 'all',
  gender: 'both',
  level: 'all'
};

const SYSTEMS: readonly AdmissionSystem[] = ['federal', 'krg'];
const STREAMS: readonly Stream[] = ['scientific', 'literary', 'vocational'];
const SUB_STREAMS: readonly SubStream[] = ['bio', 'applied'];
const GENDERS: readonly Gender[] = ['both', 'male', 'female'];
const LEVELS: readonly (ProgramLevel | 'all')[] = ['all', 'college', 'institute'];

function pick<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

/** Parses a query string, ignoring unknown or malformed values. */
export function parseCheckerState(search: string): CheckerUrlState {
  const p = new URLSearchParams(search);
  const d = DEFAULT_CHECKER_STATE;
  const stream = pick(p.get('stream'), STREAMS) ?? d.stream;
  return {
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
  const qs = p.toString();
  return qs ? `?${qs}` : '';
}
