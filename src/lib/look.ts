/** Everything about how the app looks and what it shows, chosen in Settings → Appearance. Saved per account. */

export type Appearance = {
  theme: "command" | "midnight" | "emerald" | "gold" | "violet" | "mono" | "light";
  accent: string;              // "" = the theme's own colour
  font: "system" | "rounded" | "mono" | "serif";
  textSize: "s" | "m" | "l" | "xl";
  corners: "sharp" | "normal" | "round";
  cards: "glass" | "solid" | "outline";
  motion: "full" | "calm" | "off";
  glow: boolean; grid: boolean; scanner: boolean; hudHeadings: boolean;
  greeting: string; showDate: boolean;
  home: Record<"search" | "status" | "manager" | "needs" | "goal" | "tiles" | "progress" | "matches" | "activity", boolean>;
  tabs: string[];              // bottom-bar tabs (phone)
  tabLabels: boolean; badges: boolean; jumpBar: boolean; reminders: boolean;
};

export const ALL_TABS: { href: string; label: string }[] = [
  { href: "/", label: "Home" }, { href: "/jobs", label: "Jobs" }, { href: "/map", label: "Map" }, { href: "/applications", label: "Applications" },
  { href: "/todo", label: "Solo" }, { href: "/emails", label: "Emails" }, { href: "/work", label: "My job" }, { href: "/manager", label: "Manager" }, { href: "/analytics", label: "Analytics" }, { href: "/activity", label: "Activity" },
  { href: "/compare", label: "Compare" }, { href: "/settings", label: "Settings" },
];

export const THEMES: Record<Appearance["theme"], { label: string; accent: string; accent2: string; dark: boolean }> = {
  command: { label: "Command centre (crimson)", accent: "#e11d2e", accent2: "#ff5a1f", dark: true },
  midnight: { label: "Midnight (electric blue)", accent: "#2f6bff", accent2: "#22d3ee", dark: true },
  emerald: { label: "Emerald", accent: "#10b981", accent2: "#a3e635", dark: true },
  gold: { label: "Gold", accent: "#e0a526", accent2: "#f97316", dark: true },
  violet: { label: "Violet", accent: "#8b5cf6", accent2: "#ec4899", dark: true },
  mono: { label: "Monochrome", accent: "#d4d4d8", accent2: "#a1a1aa", dark: true },
  light: { label: "Light", accent: "#d61f2f", accent2: "#ea580c", dark: false },
};

export const DEFAULT_APPEARANCE: Appearance = {
  theme: "command", accent: "", font: "system", textSize: "m", corners: "normal", cards: "glass", motion: "full",
  glow: true, grid: true, scanner: true, hudHeadings: true, greeting: "Greetings", showDate: true,
  home: { search: true, status: true, manager: true, needs: true, goal: true, tiles: true, progress: true, matches: true, activity: true },
  tabs: ["/", "/jobs", "/map", "/applications", "/todo", "/emails", "/settings"], tabLabels: true, badges: true, jumpBar: true, reminders: true,
};

const hex = (s: string) => (/^#[0-9a-f]{6}$/i.test(s) ? s : null);

/** CSS for the chosen look. Only emits rules that differ from the built-in command-centre look. */
export function appearanceCss(a: Appearance): string {
  const t = Object.hasOwn(THEMES, a.theme) ? THEMES[a.theme] : THEMES.command;
  const accent = hex(a.accent) ?? t.accent;
  const css: string[] = [];
  const recolour = a.theme !== "command" || !!hex(a.accent);
  const rgb = parseInt(accent.slice(1), 16);
  const btnInk = (299 * (rgb >> 16) + 587 * ((rgb >> 8) & 255) + 114 * (rgb & 255)) / 1000 > 150 ? "#111" : "#fff";
  if (recolour) {
    css.push(`:root,:root[data-theme]{--accent:${accent};--accent-2:${t.accent2};--glow:0 0 0 1px color-mix(in srgb,${accent} 35%,transparent),0 10px 36px -10px color-mix(in srgb,${accent} 55%,transparent);--edge:color-mix(in srgb,${accent} 14%,transparent)}
.btn-primary{background:linear-gradient(180deg,color-mix(in srgb,var(--accent) 88%,#fff),color-mix(in srgb,var(--accent) 72%,#000));border-color:color-mix(in srgb,var(--accent) 55%,#fff);color:${btnInk}}
.tab-active{color:var(--accent);text-shadow:0 0 12px color-mix(in srgb,var(--accent) 70%,transparent)}
.tab-active::before{background:var(--accent);box-shadow:0 0 10px 1px color-mix(in srgb,var(--accent) 90%,transparent)}
.side-active{background:linear-gradient(90deg,color-mix(in srgb,var(--accent) 22%,transparent),transparent);box-shadow:inset 2px 0 0 var(--accent)}
.jump-on{background:color-mix(in srgb,var(--accent) 28%,transparent)!important;border-color:color-mix(in srgb,var(--accent) 60%,transparent)!important;box-shadow:0 0 12px -2px var(--accent)}
.gradient-hero{background:linear-gradient(160deg,color-mix(in srgb,var(--accent) 16%,var(--surface)) 0%,var(--surface) 55%);border-color:color-mix(in srgb,var(--accent) 35%,transparent)}
.aura-text{background:linear-gradient(100deg,var(--ink) 0%,color-mix(in srgb,var(--ink) 70%,transparent) 40%,var(--accent) 75%,color-mix(in srgb,var(--accent) 60%,#000) 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
.aura-bg span:nth-child(1){background:radial-gradient(closest-side,color-mix(in srgb,var(--accent) 13%,transparent),transparent 70%)}
.aura-bg::before{background-image:linear-gradient(color-mix(in srgb,var(--accent) 5%,transparent) 1px,transparent 1px),linear-gradient(90deg,color-mix(in srgb,var(--accent) 5%,transparent) 1px,transparent 1px)}
.input:focus{border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 25%,transparent)}
.jumpbar{border-bottom-color:color-mix(in srgb,var(--accent) 15%,transparent)} .status-cover{box-shadow:0 1px 0 color-mix(in srgb,var(--accent) 18%,transparent)}
::selection{background:color-mix(in srgb,var(--accent) 45%,transparent)} *{scrollbar-color:color-mix(in srgb,var(--accent) 45%,transparent) transparent}`);
  }
  if (!t.dark) {
    css.push(`:root,:root[data-theme]{--bg:#f3f4f6;--surface:#ffffff;--surface-2:#eef0f3;--line:#dde0e6;--ink:#111318;--muted:#5b616e;--glass:rgba(255,255,255,.88);--glass-strong:rgba(255,255,255,.94);--shine:rgba(255,255,255,.8);--good:#0f8a62;--warn:#b86e00;--bad:#d23a4a;color-scheme:light}
html{background:var(--bg)} .status-cover{background:#111318} .jumpbar{background:rgba(243,244,246,.94)} .aura-bg::after{background:none}
.card{box-shadow:0 1px 2px rgba(0,0,0,.05),0 10px 30px -20px rgba(0,0,0,.25)} .btn-ghost,.chip{background:#fff;border-color:var(--line)} .input{background:#fff}
.jm-tiles{filter:none} .leaflet-bar a{background:#fff!important;color:#111!important;border-color:#ddd!important}`);
  }
  const font = { system: "", rounded: `ui-rounded,"SF Pro Rounded",-apple-system,system-ui,sans-serif`, mono: `ui-monospace,"SF Mono",Menlo,monospace`, serif: `ui-serif,"New York",Georgia,serif` }[a.font];
  if (font) css.push(`:root{--font-sans:${font}} body{font-family:${font}}`);
  const size = { s: "15px", m: "", l: "17.5px", xl: "19px" }[a.textSize];
  if (size) css.push(`html{font-size:${size}}${a.textSize === "s" ? " .input{font-size:16px}" : ""}`);
  if (a.corners !== "normal") { const r = a.corners === "sharp" ? ".2rem" : "1.4rem"; css.push(`.card{border-radius:${r}} .btn,.input{border-radius:${a.corners === "sharp" ? ".2rem" : "1rem"}} .chip{border-radius:${a.corners === "sharp" ? ".2rem" : "999px"}}`); }
  if (a.cards === "solid") css.push(`.card{background:var(--surface)}`);
  if (a.cards === "outline") css.push(`.card:not(.fixed){background:transparent;box-shadow:none}`);
  if (!a.glow) css.push(`.aura-bg span{display:none}`);
  if (!a.grid) css.push(`.aura-bg::before{display:none}`);
  if (!a.scanner) css.push(`.gradient-hero::before,.gradient-hero::after{display:none}`);
  if (!a.hudHeadings) css.push(`.card h2{text-transform:none;letter-spacing:normal;font-family:inherit;font-size:1rem;color:var(--ink)} .hud-label{text-transform:none;letter-spacing:.02em;font-family:inherit}`);
  if (a.motion === "calm") css.push(`.aura-bg span,.gradient-hero::after,.blink{animation:none!important} main>div>*{animation:none!important}`);
  if (a.motion === "off") css.push(`*,*::before,*::after{animation:none!important;transition:none!important} html{scroll-behavior:auto}`);
  return css.join("\n");
}
