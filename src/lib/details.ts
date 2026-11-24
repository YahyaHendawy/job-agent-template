import { pool } from "@/db";
import { getProfile } from "@/profile";
import { defaultDetails, type ApplicationDetails } from "./answers";
import { persona, isUkStudent } from "./persona";

/** Application details live in the settings table (not the seeded profile, so redeploys never overwrite them). */
export async function getDetails(): Promise<ApplicationDetails> {
  const r = await pool.query(`select value from settings where key = 'applicationDetails'`);
  return { ...defaultDetails(await getProfile()), ...(r.rows[0]?.value ?? {}) };
}

export async function saveDetails(d: ApplicationDetails) {
  await pool.query(
    `insert into settings (key, value, updated_at) values ('applicationDetails', $1, now())
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [JSON.stringify(d)]);
}

export type DetailField = { key: keyof ApplicationDetails; label: string; type?: string; hint?: string; options?: string[]; group: string };
/** Labels follow the owner's set-up (home city, visa, university). Call after getDetails()/loadPersona(). */
export const detailFields = (): DetailField[] => {
  const P = persona();
  const addr = P.home.city ? `Address (${P.home.city})` : "Address";
  const uni = P.universityShort || "your university";
  return [
  { group: "Name & contact", key: "firstName", label: "First name (legal)" },
  { group: "Name & contact", key: "lastName", label: "Last name (legal)" },
  { group: "Name & contact", key: "preferredName", label: "Preferred name" },
  { group: "Name & contact", key: "email", label: "Email for applications", type: "email" },
  { group: "Name & contact", key: "phone", label: "Phone", type: "tel" },
  { group: addr, key: "addressLine1", label: "Address line 1", hint: "Many forms require it" },
  { group: addr, key: "addressLine2", label: "Address line 2" },
  { group: addr, key: "city", label: "City" },
  { group: addr, key: "postcode", label: "Postcode" },
  { group: addr, key: "country", label: "Country" },
  { group: "Links", key: "linkedin", label: "LinkedIn URL", type: "url" },
  { group: "Links", key: "github", label: "GitHub URL (optional)", type: "url" },
  { group: "Links", key: "portfolio", label: "Website / portfolio (optional)", type: "url" },
  ...(isUkStudent() ? [{ group: "Visa & availability", key: "visaExpiry" as const, label: "Student visa expiry", hint: "e.g. October 2028, or the exact date from your eVisa" }] : [{ group: "Visa & availability", key: "visaExpiry" as const, label: "Visa / permit expiry (if any)", hint: "Leave empty if you don't need a visa" }]),
  { group: "Visa & availability", key: "earliestStartSummer", label: `Summer ${P.summerYear}: earliest start date`, type: "date", hint: `First day of ${uni} summer vacation` },
  { group: "Visa & availability", key: "latestEndSummer", label: `Summer ${P.summerYear}: latest end date`, type: "date", hint: "Last day before term restarts" },
  { group: "Visa & availability", key: "willingToRelocate", label: "Willing to relocate?" },
  { group: "Education", key: "currentAverage", label: "Current average / predicted grade (optional)", hint: "e.g. 68% or predicted 2:1" },
  { group: "Declarations", key: "futureSponsorship", label: "If a form asks if you'll need visa sponsorship “now or in the future”, answer:", options: ["", "yes", "ask"], hint: "“Yes” is the truthful answer for most students (you'd need sponsorship for a permanent job after your Student visa ends). “Ask” leaves it to you each time." },
  { group: "Declarations", key: "drivingLicence", label: "Do you hold a full driving licence?", options: ["", "yes", "no"] },
  { group: "Declarations", key: "unspentConvictions", label: "Any unspent criminal convictions?", options: ["", "no", "yes"], hint: "If yes, the agent leaves this question for you" },
  { group: "Declarations", key: "howHeard", label: "Default answer to “How did you hear about us?”" },
];
};
