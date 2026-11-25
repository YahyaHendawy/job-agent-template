/**
 * Honest list of what the app can't do, with what to do instead. Shown in full on /limits and as short
 * reminders on the screens where each limit matters (topic). Wording follows the owner's set-up.
 */
import { persona, isUkStudent } from "@/lib/persona";

export type LimitTopic = "home" | "apply" | "jobs" | "emails" | "compare" | "notifications" | "visa" | "map" | "work";
export type Limit = { id: string; icon: string; title: string; detail: string; instead: string; href?: string; topics: LimitTopic[]; top?: boolean };

export function limits(ctx: { inbox?: string | null } = {}): Limit[] {
  const P = persona();
  const uni = P.universityShort || "your university";
  const inbox = ctx.inbox || "your job inbox";
  return [
    { id: "submit", icon: "🖐️", top: true, topics: ["home", "apply"],
      title: "I can't press Submit for you",
      detail: "I prepare everything and Safari autofill fills the form, but the final Submit is yours. I also can't sign in, create accounts or solve CAPTCHAs on employer sites.",
      instead: "Open the application on your Mac, tap Apply now, check the form, press Submit." },
    { id: "personal", icon: "✍️", top: true, topics: ["home", "apply"],
      title: "I don't write your personal answers",
      detail: "Questions like “Why do you want to work here?” must be in your own words. Employers check for AI text. I only reuse answers you've already written.",
      instead: "Write them in Your answers on each application (about 5 minutes each).", href: "/applications?tab=going" },
    { id: "sites", icon: "🔍", top: true, topics: ["home", "jobs"],
      title: "I can't search every job site",
      detail: "LinkedIn, Indeed, student job boards and many big employers' own careers sites block automatic searching, so I never see their jobs.",
      instead: "Do the 30-minute weekly check in Solo and add anything good with “+ Add by link”.", href: "/todo#sites" },
    { id: "tests", icon: "🎤", topics: ["home", "apply"],
      title: "I can't do online tests or interviews",
      detail: "Assessments, video interviews and real interviews are all you.",
      instead: "When one arrives I notify you and the application page gives a step-by-step prep guide.", href: "/applications?tab=progress" },
    { id: "inbox", icon: "📧", topics: ["emails", "notifications"],
      title: `I only read ${inbox}`,
      detail: "Replies sent to any other email address, by text or by phone call won't reach me. I never send an email unless you press Send.",
      instead: `Use ${inbox} on every application (autofill already does) and tell me about anything that arrives elsewhere.`, href: "/emails" },
    { id: "visa", icon: "🛂", topics: ["apply", "visa", "compare", "work"],
      title: "My visa and eligibility checks are a guide, not advice",
      detail: `I read the advert's wording against ${isUkStudent() ? "Student visa rules" : "your work rules"}, but adverts are vague and rules change.${isUkStudent() ? ` Summer dates are estimates until ${uni} publishes them.` : ""}`,
      instead: `Check anything marked “verify” with ${uni} and gov.uk before accepting an offer.` },
    { id: "match", icon: "🎯", topics: ["jobs", "compare", "apply"],
      title: "Matching and filters work on keywords",
      detail: "Scores, the halal filter and the block list read titles, employers and advert text. They can miss something or flag something wrongly, and anything the advert doesn't say (pay, dates) shows as “Not stated”.",
      instead: "Read the full advert before saying yes, especially ☪️ and ⚠️ items." },
    { id: "estimates", icon: "📐", topics: ["apply", "compare"],
      title: "Chances, applicant numbers and places are estimates",
      detail: "Employers don't publish acceptance rates, how many people applied, or (unless the advert says) how many places there are. I estimate them from the type of role, the employer, timing and your CV.",
      instead: "Use them to compare and prioritise, and follow the “How to improve your chances” steps on each application." },
    { id: "contacts", icon: "✉️", topics: ["apply", "emails"],
      title: "I can only email recruiters whose address is published",
      detail: "I use addresses written in the advert or from people at the employer who've emailed you. I never guess an address, and nothing is sent until you tap Send.",
      instead: "No address? Use the LinkedIn link on the application to message their recruiters." },
    { id: "work", icon: "✍️", topics: ["work"],
      title: "I can't accept, negotiate or sign anything for you",
      detail: "Replying to offers, contracts and right-to-work checks are yours. I prepare the emails and checklists, check the offer against your visa, and remind you.",
      instead: "Reply with the templates here, then tap the matching button so I stay up to date." },
    { id: "map", icon: "🗺️", topics: ["map"],
      title: "Map pins can be approximate",
      detail: "Adverts often give only a city or area, so the pin sits at its centre (≈ when only the country or region is known). Remote jobs aren't on the map, and the map needs internet.",
      instead: "Check the exact address in the advert before planning travel." },
    { id: "iphone", icon: "📱", topics: ["apply"],
      title: "Autofill only works in Safari on your Mac",
      detail: "On iPhone I can't fill forms. Some sites (for example Workday) block it even on the Mac.",
      instead: "On iPhone, copy answers from the Apply Kit; or send it later from your Mac." },
    { id: "notify", icon: "🔔", topics: ["notifications", "home"],
      title: "Notifications need the Home Screen app",
      detail: "Push only reaches the iPhone app added to your Home Screen with notifications allowed. Offline, you see a saved copy that may be out of date.",
      instead: "If notifications stop, open Settings → Notifications and send a test." , href: "/settings" },
    { id: "free", icon: "🆓", topics: ["home"],
      title: "I only use free services",
      detail: "Paid job sites (and anything with a card) are never used, and if a free limit gets close I search less often.",
      instead: "Nothing to do. Settings → Free plan shows how close it is.", href: "/settings#free-plan" },
    { id: "monthly", icon: "🗓️", topics: [],
      title: "Monthly upgrades (if you set them up) need the Claude app open on your Mac",
      detail: "The self-upgrade runs on the 1st of the month from the Claude app; if it's closed, it runs the next time you open it.",
      instead: "Open the Claude app on your Mac now and then." },
  ];
}
