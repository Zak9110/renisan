// ============================================
// Renisan — Offline .ics Calendar Event Generator
// Lets students save scholarship deadlines to Apple/Google/Android Calendar
// with a 7-day advance reminder alarm, zero external network dependencies.
// ============================================

import type { Scholarship } from './types';

function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Generates an RFC 5545 iCalendar (.ics) string for a scholarship deadline.
 * Returns null if the scholarship has no valid YYYY-MM-DD deadline.
 */
export function buildScholarshipIcs(
  scholarship: Scholarship,
  localizedTitle: string,
  localizedNotes?: string,
  estimatedLabel?: string
): string | null {
  if (!scholarship.deadline || !/^\d{4}-\d{2}-\d{2}$/.test(scholarship.deadline)) {
    return null;
  }

  const [y, m, d] = scholarship.deadline.split('-').map(Number);
  const dateCompact = scholarship.deadline.replace(/-/g, '');
  // Next day for all-day DTEND (exclusive in iCalendar spec)
  const nextDate = new Date(Date.UTC(y, m - 1, d + 1));
  const nextCompact = nextDate.toISOString().slice(0, 10).replace(/-/g, '');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  // An estimated date is a guess at the next cycle, never an announced deadline:
  // say so in the event title and description so the calendar entry cannot mislead.
  const estimated = scholarship.deadline_estimated === true;
  const label = estimatedLabel || 'expected date';
  const summary = estimated ? `🎓 (${label}) ${localizedTitle}` : `🎓 ${localizedTitle}`;

  const descriptionParts = [
    `${localizedTitle} (${scholarship.provider})`,
    estimated ? `${label}: check the official page for the announced deadline.` : '',
    scholarship.application_url ? `Apply: ${scholarship.application_url}` : '',
    localizedNotes || ''
  ].filter(Boolean);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Renisan//Scholarship Deadlines//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:renisan-${scholarship.id}-${dateCompact}@renisan.app`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${dateCompact}`,
    `DTEND;VALUE=DATE:${nextCompact}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `DESCRIPTION:${escapeIcsText(descriptionParts.join('\n\n'))}`,
    `URL:${scholarship.application_url}`,
    'BEGIN:VALARM',
    'TRIGGER:-P7D',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcsText(`7 days left: ${localizedTitle}`)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ];

  return lines.join('\r\n');
}

/**
 * Generates a single .ics calendar containing multiple scholarship deadlines
 * (with 7-day and 2-day reminders per event). Returns null if none have valid ISO dates.
 */
export function buildMultiScholarshipIcs(
  entries: { scholarship: Scholarship; localizedTitle: string; localizedNotes?: string }[],
  estimatedLabel?: string
): string | null {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const label = estimatedLabel || 'expected date';
  const events: string[] = [];

  for (const { scholarship, localizedTitle, localizedNotes } of entries) {
    if (!scholarship.deadline || !/^\d{4}-\d{2}-\d{2}$/.test(scholarship.deadline)) continue;
    const [y, m, d] = scholarship.deadline.split('-').map(Number);
    const dateCompact = scholarship.deadline.replace(/-/g, '');
    const nextDate = new Date(Date.UTC(y, m - 1, d + 1));
    const nextCompact = nextDate.toISOString().slice(0, 10).replace(/-/g, '');
    const estimated = scholarship.deadline_estimated === true;
    const summary = estimated ? `🎓 (${label}) ${localizedTitle}` : `🎓 ${localizedTitle}`;
    const descriptionParts = [
      `${localizedTitle} (${scholarship.provider})`,
      estimated ? `${label}: check the official page for the announced deadline.` : '',
      scholarship.application_url ? `Apply: ${scholarship.application_url}` : '',
      localizedNotes || ''
    ].filter(Boolean);

    events.push(
      [
        'BEGIN:VEVENT',
        `UID:renisan-${scholarship.id}-${dateCompact}@renisan.app`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${dateCompact}`,
        `DTEND;VALUE=DATE:${nextCompact}`,
        `SUMMARY:${escapeIcsText(summary)}`,
        `DESCRIPTION:${escapeIcsText(descriptionParts.join('\n\n'))}`,
        `URL:${scholarship.application_url}`,
        'BEGIN:VALARM',
        'TRIGGER:-P7D',
        'ACTION:DISPLAY',
        `DESCRIPTION:${escapeIcsText(`7 days left: ${localizedTitle}`)}`,
        'END:VALARM',
        'BEGIN:VALARM',
        'TRIGGER:-P2D',
        'ACTION:DISPLAY',
        `DESCRIPTION:${escapeIcsText(`2 days left: ${localizedTitle}`)}`,
        'END:VALARM',
        'END:VEVENT'
      ].join('\r\n')
    );
  }

  if (events.length === 0) return null;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Renisan//Scholarship Deadlines//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...events,
    'END:VCALENDAR'
  ].join('\r\n');
}

/** Triggers a browser download of a combined .ics file for all dated saved scholarships. */
export function downloadAllScholarshipsIcs(
  entries: { scholarship: Scholarship; localizedTitle: string; localizedNotes?: string }[],
  estimatedLabel?: string
): boolean {
  const ics = buildMultiScholarshipIcs(entries, estimatedLabel);
  if (!ics || typeof document === 'undefined') return false;
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'renisan-deadlines.ics';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}

/**
 * Triggers a browser download / calendar open of the .ics file for a scholarship.
 */
export function downloadScholarshipIcs(
  scholarship: Scholarship,
  localizedTitle: string,
  localizedNotes?: string,
  estimatedLabel?: string
): boolean {
  const ics = buildScholarshipIcs(scholarship, localizedTitle, localizedNotes, estimatedLabel);
  if (!ics || typeof document === 'undefined') return false;

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${scholarship.id}-deadline.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}
