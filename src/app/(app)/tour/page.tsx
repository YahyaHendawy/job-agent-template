import { PageHeader } from "@/components/ui";
import { TourSteps, type TourStep } from "@/components/Tour";

const STEPS: TourStep[] = [
  { icon: "🤖", title: "It works for you around the clock", href: "/", cta: "See the status panel",
    body: ["Every few minutes the agent searches job sites and employers' own careers pages for roles that suit you.", "It checks each job against your visa, studies and location, and filters out what doesn't fit.", "The status panel on Home shows what it's doing. Pause or Emergency stop it any time."] },
  { icon: "💼", title: "Jobs: everything it found", href: "/jobs", cta: "Open Jobs",
    body: ["Every open opportunity with a match score, eligibility and deadline.", "Search, sort and filter anything; a RESULTS bar shows how many match.", "Found something yourself? “+ Add” a job by pasting its link."] },
  { icon: "🗺️", title: "Map: where the jobs are", href: "/map", cta: "Open the Map",
    body: ["Every job as a pin. Pinch to zoom, tap a pin to see the jobs there.", "Use the same filters as the lists, and jump to any country or place.", "Tap a job to open it."] },
  { icon: "📄", title: "Applications: decide yes or no", href: "/applications", cta: "Open Applications",
    body: ["The app prepares a tailored CV and gives reasons to apply and not to apply.", "Each one shows your chance of getting it and why.", "Tap ✅ Yes and it does the rest it can; 👎 No keeps it stored under Not doing."] },
  { icon: "✋", title: "Solo: the bits only you can do", href: "/todo", cta: "Open Solo",
    body: ["The app can't press Submit, sign in to sites or write your personal answers.", "Solo lists every one of those in order: send, reply, prepare, follow up, set up accounts.", "Applied somewhere else? Log it there in 20 seconds so it's tracked too."] },
  { icon: "📧", title: "Emails: replies are caught for you", href: "/emails", cta: "Open Emails",
    body: ["Connect your job inbox and the app reads employer replies.", "Interviews, tests, offers and rejections update the right application by themselves.", "You get a notification only when something needs you."] },
  { icon: "💼", title: "My job: when you get an offer", href: "/work", cta: "Open My job",
    body: ["Offers appear here by themselves, checked against your visa hours, dates and pay.", "Reply with ready-made accept or decline emails, then a getting-ready checklist: contract, right to work, day one.", "In the role: log hours (with term-time warnings) and a work journal that becomes your CV and reference request."] },
  { icon: "🎯", title: "Manager: your career coach", href: "/manager", cta: "Open Manager",
    body: ["This week's orders, in order of impact.", "Hiring season, your scorecard, skills employers want with free courses.", "Monthly career moves, and a Sunday review of your week."] },
  { icon: "☰", title: "Get anywhere in one tap", href: "/", cta: "Try ☰ Jump",
    body: ["The bar at the top of every screen has chips for that page's sections.", "☰ Jump opens a searchable list of every page and section (⌘K on a Mac).", "Compare up to 4 jobs side by side with the ⇄ buttons."] },
  { icon: "🎨", title: "Make it yours", href: "/settings/appearance", cta: "Open Appearance",
    body: ["Settings → Appearance changes colours, theme (including light), font, text size, effects and motion.", "Choose which tabs sit in the bottom bar and what Home shows.", "Settings also has notifications, your details, job sources and filters."] },
];

export default function Tour() {
  return (
    <div className="space-y-4">
      <PageHeader title="Tour" subtitle="Everything the app does, one step at a time" />
      <TourSteps steps={STEPS} />
    </div>
  );
}
