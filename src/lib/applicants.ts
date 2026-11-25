/**
 * Estimated number of people who have applied so far. Employers don't publish this, so it's modelled from:
 * the type of role, how well-known the employer is, the place, and how long the advert has been up
 * (most applications arrive in the first couple of weeks). It's a rough guide, clearly labelled as such.
 */
export type ApplicantsInput = { category: string | null; title: string; employer: string; location?: string | null; source_kind?: string | null; discovered_at?: string | Date | null; deadline?: string | Date | null; salary?: string | null; description?: string | null };
export type ApplicantsModel = { rate: number; tau: number; start: number; end: number | null; low: number; high: number; places: number; placesStated: boolean };

const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fifteen: 15, twenty: 20 };
/** Places on offer: read from the advert when it says ("we have 3 placements"), otherwise a typical number for this kind of role. */
export function placesFor(j: ApplicantsInput): { places: number; stated: boolean } {
  const d = (j.description ?? "").toLowerCase();
  const m = d.match(/\b(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty)\s+(?:\w+\s){0,3}?(places|positions|roles|vacancies|openings|interns|internships|placements|placement students|graduates|opportunities)\b/);
  if (m) { const n = WORDS[m[1]] ?? Number(m[1]); if (n >= 1 && n <= 300) return { places: n, stated: true }; }
  if (/\b(several|multiple|a number of)\s+(places|positions|roles|vacancies|openings|interns|placements)/.test(d)) return { places: 4, stated: false };
  const big = !!j.source_kind && !AGG.includes(j.source_kind);
  const typical: Record<string, [number, number]> = { summer_internship: [5, 1], placement: [4, 1], graduate: [10, 2], part_time: [2, 1], temporary: [3, 2] };
  const [b, s] = typical[j.category ?? ""] ?? [2, 1];
  return { places: /insight|spring week/.test(j.title.toLowerCase()) ? 30 : big ? b : s, stated: false };
}

const AGG = ["reed", "jooble", "adzuna", "careerjet"];
const DAY = 86_400_000;

export function applicantsModel(j: ApplicantsInput): ApplicantsModel {
  const t = j.title.toLowerCase();
  let rate = ({ summer_internship: 12, placement: 9, graduate: 25, part_time: 5, temporary: 4 } as Record<string, number>)[j.category ?? ""] ?? 4;
  if (/insight|spring week/.test(t)) rate = 15;
  if (j.source_kind && !AGG.includes(j.source_kind)) rate *= 2.5;          // big employer's own careers site
  if (/london/i.test(j.location ?? "")) rate *= 1.4;
  if (/remote/i.test(j.location ?? "")) rate *= 2;
  if (/doha|qatar|cairo|egypt/i.test(j.location ?? "")) rate *= 0.8;
  if (j.salary) rate *= 1.1;
  // Adverts are usually up a few days before the app finds them
  const start = (j.discovered_at ? new Date(j.discovered_at).getTime() : Date.now()) - 3 * DAY;
  const end = j.deadline ? new Date(j.deadline).getTime() : null;
  const p = placesFor(j);
  return { rate, tau: 12, start, end, low: 0.5, high: 1.8, places: p.places, placesStated: p.stated };
}

/** Applicants by a moment in time: fast at first, then slowing (n = rate·τ·(1−e^(−t/τ))). */
export function applicantsAt(m: ApplicantsModel, at = Date.now()) {
  const t = Math.max(0, (Math.min(at, m.end ?? at) - m.start) / DAY);
  const n = m.rate * m.tau * (1 - Math.exp(-t / m.tau));
  const perDay = at > (m.end ?? Infinity) ? 0 : m.rate * Math.exp(-t / m.tau);
  return { n, perDay, low: Math.round(n * m.low), high: Math.round(n * m.high) };
}
