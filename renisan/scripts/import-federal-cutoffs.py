#!/usr/bin/env python3
"""
Renisan — import the official MOHESR "الحدود الدنيا للقبول المركزي" PDF into
public/data/cutoffs-federal-<year>.json.

Usage:
  python3 scripts/import-federal-cutoffs.py <limits.pdf> <year> <source_url> [source_date]

Requires: pip install pypdf

The ministry publishes one PDF per year (dirasat.mohesr.gov.iq → download center).
Each row reads: "<n><university>/<college>[/<campus|track>][/قسم <department>]<stream><gender><total><average><tiebreak>".
Names are translated through scripts/federal-names.json; add any name the script
reports as unknown to that file and re-run. Averages are the ministry's competitive
average (total ÷ 7) and can exceed 100 because 8% of the foreign-language mark is
added to the total.
"""
import json, re, sys, os, collections
try:
    import pypdf
except ImportError:
    sys.exit("pypdf is required: pip install pypdf")

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

ROW = re.compile(
    r'^(\d+)(.+?)(علمي|احيائي|تطبيقي|ادبي|مهني|صناعي|تجاري|زراعي|فنون|تمريض)'
    r'(مختلط|ذكور|اناث|انثى|ذكر|بنات|بنين)(\d{3}\.\d{2})([\d.]+)$'
)
STREAM = {'علمي': 'scientific', 'احيائي': 'scientific', 'تطبيقي': 'scientific', 'ادبي': 'literary',
          'مهني': 'vocational', 'صناعي': 'vocational', 'تجاري': 'vocational', 'زراعي': 'vocational',
          'فنون': 'literary', 'تمريض': 'vocational'}
SUB = {'احيائي': 'bio', 'تطبيقي': 'applied'}
GENDER = {'مختلط': 'both', 'ذكور': 'male', 'ذكر': 'male', 'بنين': 'male', 'اناث': 'female', 'انثى': 'female', 'بنات': 'female'}


def fold(s: str) -> str:
    """Normalise hamza/alef variants and whitespace so map keys are stable."""
    s = re.sub(r'[أإآٱ]', 'ا', s)
    s = s.replace('ى', 'ي').replace('ـ', '')
    return re.sub(r'\s+', ' ', s).strip()


def split_number_tail(tail: str, total: float):
    """'99291' -> ('99', '291'): pick the average that equals total/7."""
    target = total / 7
    best = None
    for cut in range(2, min(6, len(tail)) + 1):
        avg_s, rest = tail[:cut], tail[cut:]
        try:
            avg = float(avg_s)
        except ValueError:
            continue
        if rest and not re.fullmatch(r'\d+(?:\.\d+)?', rest):
            continue
        if abs(avg - target) < 0.011:
            if best is None or abs(avg - target) < abs(best[0] - target):
                best = (avg, rest)
    if best is None:
        raise ValueError(f'cannot split {tail!r} for total {total}')
    return best


def main():
    if len(sys.argv) < 4:
        sys.exit(__doc__)
    pdf, year, source_url = sys.argv[1], int(sys.argv[2]), sys.argv[3]
    source_date = sys.argv[4] if len(sys.argv) > 4 else f'{year}-10-01'
    names = json.load(open(os.path.join(HERE, 'federal-names.json'), encoding='utf8'))
    U = {fold(k): v for k, v in names['universities'].items()}
    C = {fold(k): v for k, v in names['colleges'].items() if not k.startswith('_')}
    D = {fold(k): v for k, v in names['departments'].items() if not k.startswith('_')}
    T = {fold(k): v for k, v in names['tracks'].items() if not k.startswith('_')}
    CG = sorted(((fold(k), v) for k, v in names['campus_governorates'].items() if not k.startswith('_')),
                key=lambda kv: -len(kv[0]))

    reader = pypdf.PdfReader(pdf)
    lines = []
    for page in reader.pages:
        lines.extend((page.extract_text() or '').split('\n'))

    rows, unknown = [], collections.Counter()
    for line in lines:
        line = line.strip()
        m = ROW.match(line)
        if not m:
            if re.match(r'^\d+[^\d]', line) and '/' in line:
                print('UNPARSED:', line, file=sys.stderr)
            continue
        n, name, stream, gender, total_s, tail = m.groups()
        total = float(total_s)
        avg, _tiebreak = split_number_tail(tail, total)

        segs = [fold(s) for s in name.split('/')]
        uni_ar, col_ar = segs[0], (segs[1] if len(segs) > 1 else '')
        dept_ar, campus_parts, length = None, [], None
        for seg in segs[2:]:
            if seg.startswith('قسم'):
                dept_ar = seg
            else:
                lm = re.search(r'\((\d(?:-\d)?)\s*سنة\)', seg)
                if lm:
                    length = lm.group(1)
                    seg = fold(seg[:lm.start()] + seg[lm.end():])
                if seg:
                    campus_parts.append(seg)
        campus_ar = ' - '.join(campus_parts) or None

        uni = U.get(uni_ar)
        if not uni:
            unknown[f'university: {uni_ar}'] += 1
        col = C.get(col_ar)
        if not col:
            unknown[f'college: {col_ar}'] += 1
        if dept_ar and dept_ar not in D:
            unknown[f'department: {dept_ar}'] += 1
        campus_en = ' – '.join(T.get(p, p) for p in campus_parts) if campus_parts else None
        for p in campus_parts:
            if p not in T:
                unknown[f'track: {p}'] += 1

        governorate = uni['governorate'] if uni else None
        for key, gov in CG:
            # whole-word match so "الحي" never matches "الحياتي"
            kre = re.compile(r'(?<!\w)' + re.escape(key) + r'(?!\w)')
            if kre.search(col_ar) or any(kre.search(p) for p in campus_parts):
                governorate = gov
                break

        is_institute = 'المعهد' in col_ar or length == '2'
        rows.append({
            'id': f'fed{str(year)[2:]}-{int(n):04d}',
            'year': year,
            'university': uni_ar,
            'university_en': uni['en'] if uni else uni_ar,
            'university_ku': uni['ku'] if uni else None,
            'college': col_ar,
            'college_en': col['en'] if col else col_ar,
            'college_ku': col['ku'] if col else None,
            'department': dept_ar,
            'department_en': D.get(dept_ar) if dept_ar else None,
            'campus': campus_ar,
            'campus_en': campus_en,
            'level': 'institute' if is_institute else 'college',
            'program_length': length,
            'stream': STREAM[stream],
            **({'sub_stream': SUB[stream]} if stream in SUB else {}),
            'gender': GENDER[gender],
            'study_type': 'morning',
            'channel': 'general',
            'governorate': governorate,
            'min_average': round(avg, 2),
            'min_score': total,
            'source_url': source_url,
            'source_date': source_date,
            'confidence': 'official'
        })

    if unknown:
        print('\nUnknown names (add to scripts/federal-names.json):', file=sys.stderr)
        for k, v in unknown.most_common():
            print(f'  {v:4d}  {k}', file=sys.stderr)
    ids = [r['id'] for r in rows]
    assert len(ids) == len(set(ids)), 'duplicate ids'
    out = os.path.join(ROOT, 'public', 'data', f'cutoffs-federal-{year}.json')
    # One row per line: diff-friendly in git, ~40% smaller than indented JSON
    with open(out, 'w', encoding='utf8') as f:
        f.write('[\n' + ',\n'.join(json.dumps(r, ensure_ascii=False, separators=(',', ':')) for r in rows) + '\n]\n')
    print(f'wrote {len(rows)} rows to {os.path.relpath(out, ROOT)}')
    print('streams:', dict(collections.Counter(r['stream'] for r in rows)))
    print('levels :', dict(collections.Counter(r['level'] for r in rows)))
    print('gender :', dict(collections.Counter(r['gender'] for r in rows)))
    print('governorates:', dict(collections.Counter(r['governorate'] for r in rows)))
    missing_dept_en = sum(1 for r in rows if r['department'] and not r['department_en'])
    print(f'departments without English: {missing_dept_en}')
    if any(k.startswith(('university', 'college')) for k in unknown):
        sys.exit(1)


if __name__ == '__main__':
    main()
