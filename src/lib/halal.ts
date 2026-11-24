/**
 * Optional halal filter (switched on in onboarding or Settings → Halal filter): "nothing can be haram".
 * - BLOCK: jobs clearly in a haram industry or role (never saved, shown or prepared).
 * - FLAG: grey areas (e.g. a supermarket checkout that may sell alcohol). Shown with a ⚠️ reason so the owner decides.
 * When the filter is on, each category can be switched off in Settings → Halal filter (all on by default).
 */
export type HalalCategory = "alcohol" | "gambling" | "pork" | "riba" | "insurance" | "tobacco" | "adult";
export const HALAL_CATEGORIES: { key: HalalCategory; label: string; what: string }[] = [
  { key: "alcohol", label: "Alcohol", what: "Pubs, bars, breweries, wine & spirits companies, bar staff roles" },
  { key: "gambling", label: "Gambling", what: "Betting shops, bookmakers, casinos, lotteries, online gaming/sportsbook" },
  { key: "pork", label: "Pork", what: "Pork, bacon and pig-farming roles and companies" },
  { key: "riba", label: "Interest (riba)", what: "Conventional banks, lenders, mortgage & loan roles (Islamic banks are allowed)" },
  { key: "insurance", label: "Conventional insurance", what: "Insurers and underwriting roles (takaful is allowed)" },
  { key: "tobacco", label: "Tobacco & vaping", what: "Tobacco and vape companies and shops" },
  { key: "adult", label: "Adult & immoral entertainment", what: "Adult entertainment, strip clubs, escort services" },
];
export type HalalSettings = Record<HalalCategory, boolean> & { flagGreyAreas: boolean };
export const HALAL_DEFAULTS: HalalSettings = { alcohol: true, gambling: true, pork: true, riba: true, insurance: true, tobacco: true, adult: true, flagGreyAreas: true };
/** Used when the owner hasn't switched the halal filter on. */
export const HALAL_OFF: HalalSettings = { alcohol: false, gambling: false, pork: false, riba: false, insurance: false, tobacco: false, adult: false, flagGreyAreas: false };

const w = (s: string) => new RegExp(`(^|[^a-z])(${s})($|[^a-z])`, "i");

// Employer names (whole words) by category
const EMPLOYER: Record<HalalCategory, RegExp> = {
  alcohol: w("brewery|breweries|brewing|brewdog|distillery|distillers|winery|wines?|spirits|diageo|heineken|ab ?inbev|carlsberg|pernod|bacardi|majestic wine|wetherspoons?|greene king|fuller'?s|mitchells (and|&) butlers|stonegate|young'?s pubs|marston'?s|punch pubs|admiral taverns|nightclub|off.licen[cs]e|liquor|bargain booze|laithwaites|naked wines"),
  gambling: w("betting|bookmakers?|casinos?|gambling|lottery|lotto|bingo|william hill|ladbrokes|paddy ?power|betfred|coral|flutter|entain|bet365|sky ?bet|betway|camelot|allwyn|poker|sportsbook|igaming|grosvenor casinos|rank group|merkur|playtech|evolution gaming|kindred|888"),
  pork: w("pork|bacon|pig farm(s|ing)?|pig breeding|cranswick|tulip ltd|danish crown"),
  riba: w("(?<!(food|blood|data|river|seed|power|test|west|south|north|east) )bank(?! (street|st|station|holiday|road|lane|house|square|end|side))|banking|building society|credit union|lender|lending|loans?|mortgages?|monzo|starling|revolut|barclays|hsbc|lloyds|natwest|santander|nationwide|halifax|metro bank|tsb|virgin money|capital one|american express|amex|jpmorgan|j\\.?p\\. morgan|goldman sachs|morgan stanley|citi(group|bank)?|wells fargo|klarna|clearpay|zopa|funding circle|oakbrook|qnb|qatar national bank|doha bank|commercial bank of qatar|cib|commercial international bank|banque misr|national bank of egypt|nbe|mnt.halan|halan|valu|khazna|contact credit|aman holding"),
  insurance: w("insurance|insurer|assurance|underwriters?|aviva|axa|allianz|admiral|direct line|legal (and|&) general|zurich|prudential|lv=|hiscox|chubb|lloyd'?s of london|qatar insurance|qic|misr insurance"),
  tobacco: w("tobacco|vape|vaping|vapes|e-?cigarettes?|cigarettes?|philip morris|british american tobacco|bat group|imperial brands|jti|japan tobacco|vuse|elf ?bar|totally wicked"),
  adult: w("adult entertainment|strip club|gentlemen'?s club|escort|onlyfans|playboy|ann summers"),
};
// Islamic finance is fine: overrides the riba / insurance employer match
const ISLAMIC = w("islamic|takaful|sharia|shariah|al rayan|qib|qatar islamic bank|dukhan bank|masraf al rayan|qiib|faisal islamic|abu dhabi islamic|adib|kuwait finance house|bank of london and the middle east|gatehouse|tamara|wahed|qardus|ethis");

// Job titles (whole words) by category
const TITLE: Record<HalalCategory, RegExp> = {
  alcohol: w("bartender|bar ?(staff|team|tender|person|supervisor|manager|back|host|associate|assistant)|mixologist|sommelier|cocktail|pub|brewer|brewery|cellar ?(person|team|hand)|wine|whisky|spirits|beer"),
  gambling: w("croupier|casino|betting|bookmaker|gaming host|cashier.{0,15}(betting|casino)|bingo|lottery|sportsbook|odds compiler|trader.{0,10}(betting|sports)"),
  pork: w("pork|bacon|pig|butcher.{0,20}pork"),
  riba: w("mortgage|loan|lending|credit analyst|credit risk|underwrit\\w*|debt collector|collections agent|payday|bank teller|personal banker|retail banking"),
  insurance: w("insurance|underwrit\\w*|claims handler|actuar\\w*|loss adjuster"),
  tobacco: w("tobacco|vape|vaping|cigarette"),
  adult: w("dancer.{0,15}(club|adult)|escort|adult content"),
};
// Clear wording in the advert itself
const DESC_BLOCK: Partial<Record<HalalCategory, RegExp>> = {
  alcohol: /\b(pouring|serving|selling) (alcohol|beer|wine|spirits|cocktails)\b|\bpersonal licen[cs]e holder\b|\bcocktail menu\b|\bbar work\b/i,
  gambling: /\b(gambling|betting) (company|operator|industry|shop)\b|\bonline casino\b|\bsports betting\b/i,
  pork: /\b(pork|bacon) (products|processing|production)\b/i,
};
// Grey areas → ⚠️ warning, not a block
const SHOP_FLOOR = w("customer assistant|team member|cashier|checkout|till|sales assistant|store assistant|shop assistant|customer team|retail assistant|night (shift|team)|delivery driver|rider|picker|warehouse operative|shift (leader|manager)|store colleague|general assistant");
const GREY: { cat: HalalCategory; re: RegExp; note: string; shopFloor?: boolean; inDescription?: boolean }[] = [
  { cat: "alcohol", re: /\b(challenge 25|over 18 to serve|serve alcohol|sell(ing)? alcohol|licensed (premises|restaurant|venue)|alcoholic (drinks|beverages))\b/i, note: "may involve selling or serving alcohol", inDescription: true },
  { cat: "alcohol", re: w("tesco|sainsbury'?s|asda|morrisons|aldi|lidl|co-?op|waitrose|m&s|marks (and|&) spencer|iceland|spar|londis|costcutter|one stop|nisa|budgens|ocado|deliveroo|uber eats|just eat|getir|gopuff"), note: "a shop or delivery service that sells alcohol: this role may handle it", shopFloor: true },
  { cat: "pork", re: w("restaurant|kitchen|chef|cook|food service|catering|hospitality|mcdonald'?s|burger king|kfc|subway|greggs|pret|wagamama|nando'?s|pizza|cafe|caf[eé]"), note: "food may not be halal (you may handle pork)" },
  { cat: "riba", re: w("fintech|financial services|investment bank(ing)?|hedge fund|asset management|private equity|consumer finance|buy now,? pay later"), note: "finance company: check it isn't interest-based" },
];

export type HalalResult = { blocked: boolean; category?: HalalCategory; reason?: string; warnings: string[] };

export function halalCheck(job: { title: string; employer: string; description?: string | null }, s: HalalSettings = HALAL_DEFAULTS): HalalResult {
  const title = job.title ?? "", emp = job.employer ?? "", desc = (job.description ?? "").slice(0, 20000);
  const islamic = ISLAMIC.test(emp) || ISLAMIC.test(title);
  for (const { key, label } of HALAL_CATEGORIES) {
    if (!s[key]) continue;
    if ((key === "riba" || key === "insurance") && islamic) continue;
    if (EMPLOYER[key].test(emp)) return { blocked: true, category: key, reason: `${label}: the employer works in this industry`, warnings: [] };
    if (TITLE[key].test(title)) return { blocked: true, category: key, reason: `${label}: the role itself involves it`, warnings: [] };
    const d = DESC_BLOCK[key];
    if (d && d.test(desc)) return { blocked: true, category: key, reason: `${label}: the advert says the job involves it`, warnings: [] };
  }
  const warnings: string[] = [];
  if (s.flagGreyAreas) {
    for (const g of GREY) {
      if (!s[g.cat]) continue;
      if (g.cat === "riba" && islamic) continue;
      const hit = g.shopFloor
        ? g.re.test(emp) && SHOP_FLOOR.test(title)          // shops: only roles on the till/shop floor/deliveries
        : g.re.test(emp) || g.re.test(title) || (g.inDescription === true && g.re.test(desc));
      if (hit) warnings.push(`Halal check: ${g.note}`);
    }
  }
  return { blocked: false, warnings: [...new Set(warnings)].slice(0, 2) };
}

// --- Stored settings and applying the filter to jobs already in the app (server only) ---
export async function getHalal(): Promise<HalalSettings> {
  const { pool } = await import("@/db");
  const { loadPersona } = await import("@/lib/persona");
  if (!(await loadPersona()).filters.halal) return HALAL_OFF;
  const r = await pool.query(`select value from settings where key = 'halal'`);
  return { ...HALAL_DEFAULTS, ...(r.rows[0]?.value ?? {}) };
}

/** Hides haram jobs already found and removes their not-yet-sent applications. */
export async function applyHalal(s?: HalalSettings) {
  const { pool } = await import("@/db");
  const settings = s ?? (await getHalal());
  const rows = (await pool.query(`select id, title, employer, description from jobs where listing_status <> 'hidden'`)).rows;
  const bad = rows.map((j) => ({ id: j.id, r: halalCheck(j, settings) })).filter((x) => x.r.blocked);
  if (!bad.length) return { jobsHidden: 0, applicationsRemoved: 0 };
  const ids = bad.map((b) => b.id);
  const apps = await pool.query(`delete from applications where job_id = any($1) and status in ('draft','preparing','awaiting_approval','approved','failed') returning id`, [ids]);
  await pool.query(`update jobs set listing_status = 'hidden', dismissed = true, updated_at = now(), notes = coalesce(notes, '') || ' [halal filter]' where id = any($1)`, [ids]);
  return { jobsHidden: ids.length, applicationsRemoved: apps.rowCount ?? 0 };
}
