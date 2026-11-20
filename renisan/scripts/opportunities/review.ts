// ============================================
// Renisan — Review queue for discovered opportunities
// The only way a discovered opportunity reaches the site: an editor reads it,
// checks the official page, and accepts it.
//
//   npm run opps:review                      list pending candidates
//   npm run opps:review -- show <cid>        print one candidate in full
//   npm run opps:review -- accept <cid>      validate and add to public/data/scholarships.json
//   npm run opps:review -- reject <cid> "reason"
//
// Before accepting: open the official link, confirm the dates and Iraqi
// eligibility, and fix the record in review/candidates.json if needed.
// ============================================

import fs from 'node:fs';
import path from 'node:path';
import { validateScholarship } from './validate.ts';
import { CANDIDATES, REJECTED, readJson, type CandidateFile, type RejectedEntry } from './discover.ts';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const DATA = path.join(ROOT, 'public/data/scholarships.json');

/** Next free id in the sch-NNN sequence. */
export function nextScholarshipId(list: { id: string }[]): string {
  const max = list.reduce((m, s) => {
    const n = /^sch-(\d+)$/.exec(s.id)?.[1];
    return n ? Math.max(m, parseInt(n, 10)) : m;
  }, 0);
  return `sch-${String(max + 1).padStart(3, '0')}`;
}

/** Builds the final listing: id first, verification stamp, same key order style as the existing data. */
export function toListing(record: Record<string, any>, id: string, today: string, editor: string): Record<string, any> {
  return { id, ...record, last_verified: today, verified_by: editor };
}

function main() {
  const [cmd = 'list', cid, ...rest] = process.argv.slice(2);
  const today = new Date().toISOString().slice(0, 10);
  const queue = readJson<CandidateFile>(CANDIDATES, { updated: today, items: [] });
  const pending = queue.items.filter((c) => c.status === 'pending');

  if (cmd === 'list') {
    if (pending.length === 0) {
      console.log('No pending candidates. Run `npm run opps:discover` to look for new ones.');
      return;
    }
    for (const c of pending) {
      const v = c.validation.errors.length ? `✗ ${c.validation.errors.join('; ')}` : '✓ valid';
      console.log(`${c.cid}  [${c.confidence}] ${c.record.name} (${c.record.status}${c.record.deadline ? `, ${c.record.deadline}` : ''})`);
      console.log(`         ${c.record.application_url}`);
      console.log(`         ${v}${c.validation.warnings.length ? ` · ${c.validation.warnings.length} warning(s)` : ''}`);
    }
    return;
  }

  const item = queue.items.find((c) => c.cid === cid);
  if (!item) {
    console.error(`No candidate "${cid}". Run without arguments to list them.`);
    process.exit(1);
  }

  if (cmd === 'show') {
    console.log(JSON.stringify(item, null, 2));
    return;
  }

  if (item.status !== 'pending') {
    console.error(`${cid} is already ${item.status}.`);
    process.exit(1);
  }

  if (cmd === 'reject') {
    const reason = rest.join(' ').trim() || 'not suitable';
    item.status = 'rejected';
    const rejected = readJson<RejectedEntry[]>(REJECTED, []);
    rejected.push({ name: item.record.name, application_url: item.record.application_url, reason, date: today });
    fs.writeFileSync(REJECTED, JSON.stringify(rejected, null, 2) + '\n');
    fs.writeFileSync(CANDIDATES, JSON.stringify(queue, null, 2) + '\n');
    console.log(`Rejected ${item.record.name}. Discovery will not suggest it again.`);
    return;
  }

  if (cmd === 'accept') {
    const list: any[] = JSON.parse(fs.readFileSync(DATA, 'utf8'));
    const id = nextScholarshipId(list);
    const listing = toListing(item.record, id, today, process.env.RENISAN_EDITOR || 'Renisan editor');
    // Re-check against today's list: the record may have been edited by hand since discovery
    const result = validateScholarship(listing, {
      existing: list.map((s) => ({ id: s.id, name: s.name, application_url: s.application_url })),
      today
    });
    if (result.errors.length) {
      console.error(`Cannot accept ${cid}; fix these in review/candidates.json first:\n- ${result.errors.join('\n- ')}`);
      process.exit(1);
    }
    list.push(listing);
    fs.writeFileSync(DATA, JSON.stringify(list, null, 2) + '\n');
    item.status = 'accepted';
    fs.writeFileSync(CANDIDATES, JSON.stringify(queue, null, 2) + '\n');
    console.log(`Added ${id} ${listing.name} to public/data/scholarships.json.`);
    if (result.warnings.length) console.log(`Check before deploying:\n- ${result.warnings.join('\n- ')}`);
    console.log('Then run `npm test` and have a native speaker check the Sorani and Kurmanji text.');
    return;
  }

  console.error(`Unknown command "${cmd}". Use list, show, accept or reject.`);
  process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main();
}
