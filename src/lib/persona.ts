/**
 * The owner's personal set-up: where they study, which visa rules apply, which countries and cities they
 * target, which fields interest them and the optional filters. It's stored in the settings table (key
 * 'persona') and written by the onboarding wizard (/welcome). Nothing personal is hard-coded in the app.
 *
 * Matching, verdicts, answers and the guide read it synchronously through persona(). Server code
 * calls loadPersona() first. It's cached for 60 s, and every worker cycle and page render reloads it.
 */
export type Eligibility = "eligible" | "potentially_eligible" | "ineligible" | "manual_verification";

export type Market = {
  code: string;                       // catalogue code, e.g. "UK", "IE", "QA"
  /** How the owner may work there. "visa" applies the visa preset's rules (UK Student visa only). */
  rightToWork: "visa" | "citizen" | "resident" | "full" | "unsure";
  priority?: number;                  // score bonus for non-home markets (default 8)
  eligibilityReason?: string;         // shown on every job there (e.g. "you're a resident on a family permit…")
  eligibilityLevel?: Eligibility;     // lowest eligibility for every job there (e.g. potentially_eligible)
  verdictPro?: string; verdictCon?: string;  // plain-English version of eligibilityReason in "Should you apply"
  placePro?: string; placeCon?: string;      // shown under "Place" for jobs there
  answer?: string; answerNeedsYou?: string;  // "Right to work in <country>" standard answer
  inPersonPartTimeAbroad?: boolean;   // penalise in-person part-time jobs there (default true for non-home)
};

export type Term = { pattern: string; weight: number; label: string };
export type WeeklyLink = { label: string; href: string };
export type WeeklyItem = { id: string; title: string; why: string; links: WeeklyLink[] };

export type Persona = {
  version: 1;
  completed: boolean;                 // onboarding finished
  university: string;                 // "University of Leeds"
  universityShort: string;            // "Leeds" (used in sentences: "ask Leeds placements")
  degreeSubject: string;              // "Electrical & Electronic"
  fieldName: string;                  // "engineering" (used in "Not an engineering role")
  yearOfStudy: string;                // "2nd year (2026/27)"
  gradYear: number;                   // expected graduation
  gradYearPlacement: number | null;   // graduation if they take a placement year
  summerYear: number;                 // next summer they're looking for work
  summerWindow: string;               // "about mid-June to mid-September"
  visa: { preset: "uk_student" | "none"; expiry: string; termHours: number };
  home: { country: string; city: string; cityMatch: "london" | "name" };
  markets: Market[];                  // in priority order; include the home country
  remoteOk: boolean;
  interests: Term[];                  // regex sources (lower-case text) with weights
  skills: { pattern: string; label: string }[];
  technicalTitle: string;             // regex source (case-insensitive): titles that count as "in your field"
  fieldText: string;                  // regex source: description mentions your field
  degreeEvidence: string;             // regex source: a requirement your degree meets
  offField?: { title: string; unless: string; text: string };  // e.g. software roles for a hardware degree
  relocate: string;                   // default "Willing to relocate?" answer
  timeZone: string;
  filters: { halal: boolean; blocklist: boolean };
  weekly?: WeeklyItem[];              // custom weekly routine links (otherwise built from markets/keywords)
  keywords: string[];                 // job-search keywords chosen in onboarding
  jobTypes: string[];                 // categories they want
};

/** Generic catalogue: names and main cities per country (public facts, not personal). */
export const COUNTRIES: Record<string, { name: string; flag: string; names: string; cities?: string; iso: string[]; jooble?: string; indeed?: string }> = {
  UK: { name: "United Kingdom", flag: "🇬🇧", iso: ["gb", "uk"], jooble: "uk", indeed: "uk.indeed.com",
    names: String.raw`\b(united kingdom|uk|u\.k\.|england|scotland|wales|northern ireland|great britain|gb)\b`,
    cities: String.raw`\b(united kingdom|uk|u\.k\.|england|scotland|wales|northern ireland|great britain|gb|london|manchester|birmingham|bristol|cambridge|oxford|leeds|glasgow|edinburgh|cardiff|belfast|sheffield|nottingham|leicester|coventry|reading|southampton|newcastle|liverpool|derby|guildford|milton keynes|stevenage|swindon|warrington|aberdeen|crawley|basingstoke|harwell|culham|bracknell|slough|surrey|kent|essex|hertfordshire|bath|brighton|exeter|plymouth|portsmouth|sunderland|york|preston|lancaster|warwick|loughborough|ipswich|norwich|chelmsford|luton|watford|woking|farnborough|filton|barrow|didcot|abingdon)\b` },
  QA: { name: "Qatar", flag: "🇶🇦", iso: ["qa"], jooble: "qa", indeed: "qa.indeed.com", names: String.raw`\b(qatar|doha|ras laffan|al khor|mesaieed|lusail|al wakrah|dukhan)\b` },
  EG: { name: "Egypt", flag: "🇪🇬", iso: ["eg"], jooble: "eg", indeed: "eg.indeed.com", names: String.raw`\b(egypt|cairo|alexandria|giza|new cairo|6th of october|smart village|sheikh zayed|suez|port said|ain sokhna)\b` },
  IE: { name: "Ireland", flag: "🇮🇪", iso: ["ie"], jooble: "ie", indeed: "ie.indeed.com", names: String.raw`\b(ireland|dublin|cork|galway|limerick|waterford)\b` },
  AE: { name: "United Arab Emirates", flag: "🇦🇪", iso: ["ae"], jooble: "ae", indeed: "ae.indeed.com", names: String.raw`\b(united arab emirates|uae|dubai|abu dhabi|sharjah|ajman)\b` },
  SA: { name: "Saudi Arabia", flag: "🇸🇦", iso: ["sa"], jooble: "sa", indeed: "sa.indeed.com", names: String.raw`\b(saudi arabia|saudi|ksa|riyadh|jeddah|dammam|khobar|neom)\b` },
  KW: { name: "Kuwait", flag: "🇰🇼", iso: ["kw"], jooble: "kw", indeed: "kw.indeed.com", names: String.raw`\b(kuwait)\b` },
  BH: { name: "Bahrain", flag: "🇧🇭", iso: ["bh"], jooble: "bh", indeed: "bh.indeed.com", names: String.raw`\b(bahrain|manama)\b` },
  OM: { name: "Oman", flag: "🇴🇲", iso: ["om"], jooble: "om", indeed: "om.indeed.com", names: String.raw`\b(oman|muscat)\b` },
  JO: { name: "Jordan", flag: "🇯🇴", iso: ["jo"], jooble: "jo", names: String.raw`\b(jordan|amman)\b` },
  MA: { name: "Morocco", flag: "🇲🇦", iso: ["ma"], jooble: "ma", indeed: "ma.indeed.com", names: String.raw`\b(morocco|casablanca|rabat)\b` },
  TR: { name: "Türkiye", flag: "🇹🇷", iso: ["tr"], jooble: "tr", indeed: "tr.indeed.com", names: String.raw`\b(turkey|türkiye|turkiye|istanbul|ankara|izmir)\b` },
  PK: { name: "Pakistan", flag: "🇵🇰", iso: ["pk"], jooble: "pk", indeed: "pk.indeed.com", names: String.raw`\b(pakistan|karachi|lahore|islamabad)\b` },
  IN: { name: "India", flag: "🇮🇳", iso: ["in"], jooble: "in", indeed: "in.indeed.com", names: String.raw`\b(india|bangalore|bengaluru|mumbai|delhi|hyderabad|pune|chennai)\b` },
  MY: { name: "Malaysia", flag: "🇲🇾", iso: ["my"], jooble: "my", indeed: "malaysia.indeed.com", names: String.raw`\b(malaysia|kuala lumpur)\b` },
  SG: { name: "Singapore", flag: "🇸🇬", iso: ["sg"], jooble: "sg", indeed: "sg.indeed.com", names: String.raw`\b(singapore)\b` },
  US: { name: "United States", flag: "🇺🇸", iso: ["us"], jooble: "us", indeed: "www.indeed.com", names: String.raw`\b(united states|usa|u\.s\.|new york|san francisco|seattle|boston|chicago|austin)\b` },
  CA: { name: "Canada", flag: "🇨🇦", iso: ["ca"], jooble: "ca", indeed: "ca.indeed.com", names: String.raw`\b(canada|toronto|vancouver|montreal|ottawa|calgary)\b` },
  DE: { name: "Germany", flag: "🇩🇪", iso: ["de"], jooble: "de", indeed: "de.indeed.com", names: String.raw`\b(germany|berlin|munich|münchen|hamburg|frankfurt|stuttgart|cologne)\b` },
  FR: { name: "France", flag: "🇫🇷", iso: ["fr"], jooble: "fr", indeed: "fr.indeed.com", names: String.raw`\b(france|paris|lyon|toulouse|marseille)\b` },
  NL: { name: "Netherlands", flag: "🇳🇱", iso: ["nl"], jooble: "nl", indeed: "nl.indeed.com", names: String.raw`\b(netherlands|amsterdam|rotterdam|eindhoven|the hague|delft)\b` },
  AU: { name: "Australia", flag: "🇦🇺", iso: ["au"], jooble: "au", indeed: "au.indeed.com", names: String.raw`\b(australia|sydney|melbourne|brisbane|perth)\b` },
};
export const countryName = (code: string | null | undefined) => (code && COUNTRIES[code]?.name) || code || "";
export const countryFlag = (code: string | null | undefined) => (code && COUNTRIES[code]?.flag) || "";

/** Fields of study with ready-made interest and skill terms (the owner can edit keywords in onboarding). */
export const FIELDS: Record<string, { label: string; degreeSubject: string; fieldName: string; interests: Term[]; skills: { pattern: string; label: string }[]; technicalTitle: string; fieldText: string; degreeEvidence: string; offField?: Persona["offField"]; keywords: string[] }> = {
  electrical: {
    label: "Electrical & electronic engineering", degreeSubject: "Electrical & Electronic", fieldName: "engineering",
    interests: [
      { pattern: String.raw`\bembedded|firmware|microcontroller|stm32|arduino|rtos\b`, weight: 14, label: "embedded systems" },
      { pattern: String.raw`\belectronic|electronics|pcb|circuit|analogue|analog|hardware\b`, weight: 12, label: "electronics / hardware" },
      { pattern: String.raw`\belectrical|electrified|electrification\b`, weight: 12, label: "electrical engineering" },
      { pattern: String.raw`\bpower electronics|power systems|grid|substation|transmission|distribution network|high voltage|hv\b`, weight: 10, label: "power / electrical infrastructure" },
      { pattern: String.raw`\benergy|renewable|solar|wind|battery|ev charging|net zero|smart energy|lng\b`, weight: 10, label: "energy" },
      { pattern: String.raw`\bcontrol systems?|plc|scada|automation|mechatronic\b`, weight: 10, label: "control / automation" },
      { pattern: String.raw`\brobot|robotics|autonomous\b`, weight: 10, label: "robotics" },
      { pattern: String.raw`\btest engineer|testing|validation|verification|reliability|quality\b`, weight: 6, label: "test / reliability" },
      { pattern: String.raw`\bmedical device|biomedical|medtech|healthcare technology\b`, weight: 9, label: "medical technology" },
      { pattern: String.raw`\bdata cent(re|er)\b`, weight: 8, label: "data centres" },
      { pattern: String.raw`\bsemiconductor|fpga|asic|vlsi|chip\b`, weight: 9, label: "semiconductors" },
      { pattern: String.raw`\biot|internet of things|sensor\b`, weight: 8, label: "IoT / sensors" },
      { pattern: String.raw`\bconsultan(cy|t)\b`, weight: 5, label: "engineering consultancy" },
      { pattern: String.raw`\bsignal processing|dsp|rf|telecom|5g|wireless\b`, weight: 7, label: "signals / RF" },
    ],
    skills: [
      { pattern: String.raw`\bpython\b`, label: "Python" }, { pattern: String.raw`\bc\+\+|\bc\/c\+\+`, label: "C++" }, { pattern: String.raw`\bmatlab\b`, label: "MATLAB" },
      { pattern: String.raw`\bsql\b`, label: "SQL" }, { pattern: String.raw`\bjavascript\b`, label: "JavaScript" }, { pattern: String.raw`\bltspice|spice\b`, label: "LTspice" },
      { pattern: String.raw`\boscilloscope|multimeter|soldering\b`, label: "lab equipment" },
    ],
    technicalTitle: String.raw`\b(engineer|engineering|electr|hardware|firmware|embedded|software|developer|technician|technical|scientist|research|silicon|systems|data|test|lab|r&d|design engineer|it support)\b`,
    fieldText: String.raw`\b(engineering|engineer)\b`,
    degreeEvidence: String.raw`\b(electrical|electronic|engineering)\b.*\b(degree|student|studying)\b|\b(degree|student|studying)\b.*\b(electrical|electronic|engineering)\b`,
    offField: { title: String.raw`software|cloud|data|frontend|backend|full.?stack|ios|android|web`, unless: String.raw`hardware|embedded|firmware|electr|power|robot|semiconductor`, text: "Mostly software, less linked to your Electrical & Electronic degree" },
    keywords: ["electrical engineering intern", "electronics internship", "embedded hardware intern", "industrial placement engineering"],
  },
  mechanical: {
    label: "Mechanical / aerospace engineering", degreeSubject: "Mechanical Engineering", fieldName: "engineering",
    interests: [
      { pattern: String.raw`\bmechanical|mechanics|cad|solidworks|catia|fea|cfd\b`, weight: 14, label: "mechanical design" },
      { pattern: String.raw`\baerospace|aeronautic|aircraft|propulsion|space\b`, weight: 12, label: "aerospace" },
      { pattern: String.raw`\bautomotive|vehicle|motorsport|powertrain\b`, weight: 10, label: "automotive" },
      { pattern: String.raw`\bmanufactur|production engineer|lean|six sigma\b`, weight: 10, label: "manufacturing" },
      { pattern: String.raw`\bthermal|fluids|hvac|energy|renewable\b`, weight: 8, label: "thermal / energy" },
      { pattern: String.raw`\brobot|robotics|mechatronic|automation\b`, weight: 9, label: "robotics / automation" },
    ],
    skills: [{ pattern: String.raw`\bsolidworks\b`, label: "SolidWorks" }, { pattern: String.raw`\bmatlab\b`, label: "MATLAB" }, { pattern: String.raw`\bpython\b`, label: "Python" }, { pattern: String.raw`\bansys\b`, label: "ANSYS" }],
    technicalTitle: String.raw`\b(engineer|engineering|mechanical|aerospace|design|manufactur|technician|technical|research|r&d|test|lab)\b`,
    fieldText: String.raw`\b(engineering|engineer)\b`,
    degreeEvidence: String.raw`\b(mechanical|aerospace|engineering)\b.*\b(degree|student|studying)\b|\b(degree|student|studying)\b.*\b(mechanical|aerospace|engineering)\b`,
    keywords: ["mechanical engineering intern", "aerospace internship", "manufacturing placement"],
  },
  software: {
    label: "Computer science / software", degreeSubject: "Computer Science", fieldName: "tech",
    interests: [
      { pattern: String.raw`\bsoftware|developer|programmer|full.?stack|backend|frontend\b`, weight: 14, label: "software development" },
      { pattern: String.raw`\bdata scien|machine learning|\bml\b|\bai\b|analytics\b`, weight: 12, label: "data / AI" },
      { pattern: String.raw`\bcloud|devops|infrastructure|sre\b`, weight: 10, label: "cloud / DevOps" },
      { pattern: String.raw`\bsecurity|cyber\b`, weight: 10, label: "cyber security" },
      { pattern: String.raw`\bmobile|ios|android|web\b`, weight: 8, label: "web / mobile" },
    ],
    skills: [{ pattern: String.raw`\bpython\b`, label: "Python" }, { pattern: String.raw`\bjava\b`, label: "Java" }, { pattern: String.raw`\bjavascript|typescript\b`, label: "JavaScript/TypeScript" }, { pattern: String.raw`\bsql\b`, label: "SQL" }, { pattern: String.raw`\bc\+\+`, label: "C++" }],
    technicalTitle: String.raw`\b(software|developer|engineer|engineering|data|cloud|devops|security|cyber|it|technical|technology|analyst|scientist|research|web|mobile|qa|test)\b`,
    fieldText: String.raw`\b(software|computer science|computing|developer)\b`,
    degreeEvidence: String.raw`\b(computer science|computing|software|it)\b.*\b(degree|student|studying)\b|\b(degree|student|studying)\b.*\b(computer science|computing|software|it)\b`,
    keywords: ["software engineering intern", "data science internship", "software placement year"],
  },
  business: {
    label: "Business, finance & management", degreeSubject: "Business", fieldName: "business",
    interests: [
      { pattern: String.raw`\bmarketing|brand|digital marketing|social media\b`, weight: 12, label: "marketing" },
      { pattern: String.raw`\bfinance|accounting|audit|tax\b`, weight: 12, label: "finance / accounting" },
      { pattern: String.raw`\bconsult|strategy|operations\b`, weight: 10, label: "consulting / operations" },
      { pattern: String.raw`\bhr|human resources|recruitment|people\b`, weight: 8, label: "HR" },
      { pattern: String.raw`\bsales|business development|account manag\b`, weight: 8, label: "sales" },
      { pattern: String.raw`\bsupply chain|procurement|logistics\b`, weight: 8, label: "supply chain" },
    ],
    skills: [{ pattern: String.raw`\bexcel\b`, label: "Excel" }, { pattern: String.raw`\bpowerpoint\b`, label: "PowerPoint" }, { pattern: String.raw`\bsql\b`, label: "SQL" }, { pattern: String.raw`\bpower bi|tableau\b`, label: "Power BI/Tableau" }],
    technicalTitle: String.raw`\b(business|marketing|finance|analyst|consult|operations|strategy|hr|people|sales|account|audit|tax|supply chain|procurement|commercial|management)\b`,
    fieldText: String.raw`\b(business|management|finance|marketing)\b`,
    degreeEvidence: String.raw`\b(business|management|finance|economics|accounting)\b.*\b(degree|student|studying)\b|\b(degree|student|studying)\b.*\b(business|management|finance|economics|accounting)\b`,
    keywords: ["business internship", "marketing intern", "finance summer internship"],
  },
  general: {
    label: "Other / any field", degreeSubject: "", fieldName: "graduate-level",
    interests: [], skills: [{ pattern: String.raw`\bexcel\b`, label: "Excel" }, { pattern: String.raw`\bpython\b`, label: "Python" }],
    technicalTitle: String.raw`\b(intern|internship|placement|graduate|analyst|assistant|research|engineer|officer|coordinator|associate)\b`,
    fieldText: String.raw`\b(internship|graduate)\b`,
    degreeEvidence: String.raw`\b(degree|student|studying|undergraduate)\b`,
    keywords: ["summer internship", "student placement", "graduate scheme"],
  },
};

/** Empty, generic starting point. The onboarding wizard fills it in. */
export const BLANK_PERSONA: Persona = {
  version: 1, completed: false,
  university: "", universityShort: "your university", degreeSubject: "", fieldName: "engineering",
  yearOfStudy: "", gradYear: new Date().getFullYear() + 2, gradYearPlacement: null,
  summerYear: new Date().getMonth() >= 8 ? new Date().getFullYear() + 1 : new Date().getFullYear(), summerWindow: "your summer break",
  visa: { preset: "none", expiry: "", termHours: 20 },
  home: { country: "UK", city: "", cityMatch: "name" },
  markets: [], remoteOk: true,
  interests: FIELDS.general.interests, skills: FIELDS.general.skills, technicalTitle: FIELDS.general.technicalTitle,
  fieldText: FIELDS.general.fieldText, degreeEvidence: FIELDS.general.degreeEvidence,
  relocate: "", timeZone: "Europe/London", filters: { halal: false, blocklist: false },
  keywords: [], jobTypes: ["summer_internship", "placement", "part_time", "temporary", "research", "graduate", "insight_programme"],
};

let current: Persona = BLANK_PERSONA;
let loadedAt = 0;
const compiled = new Map<string, RegExp>();
/** Cached RegExp for a persona pattern. */
export const rx = (source: string, flags = "") => {
  const k = `${flags}/${source}`;
  let r = compiled.get(k);
  if (!r) { r = new RegExp(source, flags); compiled.set(k, r); }
  return r;
};

export const persona = () => current;
export function setPersona(p: Partial<Persona>) {
  const next = { ...BLANK_PERSONA, ...p } as Persona;
  // used inside SQL "at time zone" and Intl, so only plain IANA names are allowed
  if (!/^[A-Za-z]+(\/[A-Za-z_+-]+){0,2}$/.test(next.timeZone ?? "")) next.timeZone = "Europe/London";
  current = next; loadedAt = Date.now();
}
export const market = (code: string | null | undefined) => current.markets.find((m) => m.code === code);
export const isUkStudent = () => current.visa.preset === "uk_student";
export const article = (w: string) => (/^[aeiou]/i.test(w) ? `an ${w}` : `a ${w}`);

export async function loadPersona(force = false): Promise<Persona> {
  if (!force && loadedAt && Date.now() - loadedAt < 60_000) return current;
  const { pool } = await import("@/db");
  const r = await pool.query(`select value from settings where key = 'persona'`).catch(() => ({ rows: [] as any[] }));
  setPersona(r.rows[0]?.value ?? {});
  return current;
}

export async function savePersona(p: Partial<Persona>) {
  const { pool } = await import("@/db");
  const next = { ...(await loadPersona(true)), ...p };
  await pool.query(`insert into settings (key, value, updated_at) values ('persona', $1, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()`, [JSON.stringify(next)]);
  setPersona(next);
  return next;
}

/** SQL condition (on alias j) for "in my home city", used by the list filters. Literal is escaped. */
export function homeCitySql() {
  const h = current.home;
  const c = `j.country = '${h.country.replace(/[^A-Z]/g, "")}'`;
  if (h.cityMatch === "london") return `${c} and (j.location ~* 'london' or j.location ~* '(^|[^a-z])(se|sw|nw|ne|ec|wc|e|n|w)[0-9]')`;
  const city = h.city.replace(/[^\p{L}\p{N} -]/gu, "");
  return city ? `${c} and j.location ~* '${city}'` : c;
}
/** [code, label] pairs for the Country filter. */
export const marketOptions = (): [string, string][] => current.markets.map((m) => [m.code, m.code === "UK" ? "UK" : countryName(m.code)]);
