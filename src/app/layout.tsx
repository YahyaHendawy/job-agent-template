import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getAppearance, appearanceCss, DEFAULT_APPEARANCE } from "@/lib/appearance";

export const metadata: Metadata = {
  title: "Job Agent",
  description: "Your always-on recruitment agent",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Job Agent", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#050506" },
    { media: "(prefers-color-scheme: dark)", color: "#050506" },
  ],
};

// A brand-new copy deployed before its free database was connected (env vars arrive on the next deploy).
const NEEDS_DB = !!process.env.VERCEL && !process.env.POSTGRES_URL && !process.env.DATABASE_URL;

function ConnectDatabase() {
  return (
    <main className="min-h-dvh p-5 max-w-lg mx-auto space-y-4 safe-top">
      <h1 className="text-2xl font-bold mt-4">Almost there: connect your free database</h1>
      <p>Your app is online. It needs a free Supabase database to store your answers. About 2 minutes, on your phone:</p>
      <ol className="list-decimal pl-5 space-y-3">
        <li>Open <a className="text-accent underline font-semibold" href="https://vercel.com/dashboard" target="_blank" rel="noreferrer">vercel.com/dashboard</a> and tap your Job Agent project.</li>
        <li>Tap <b>Storage</b> → <b>Create Database</b> (or Browse Marketplace) → <b>Supabase</b> → <b>Continue</b>. Pick the <b>Free</b> plan and the region nearest you → <b>Create</b>. Accept Supabase&apos;s terms if asked.</li>
        <li>When asked which projects to connect, keep your Job Agent project ticked → <b>Connect</b>.</li>
        <li>Tap <b>Deployments</b> → the ⋯ menu on the top one → <b>Redeploy</b> → <b>Redeploy</b>. Wait about 2 minutes.</li>
        <li>Come back here and refresh. You&apos;ll be asked for the setup passphrase you chose when you deployed.</li>
      </ol>
      <p className="text-sm text-muted">Free plans only, no card needed. Your data stays in your own accounts.</p>
    </main>
  );
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const look = NEEDS_DB ? DEFAULT_APPEARANCE : await getAppearance();
  const css = appearanceCss(look);
  return (
    <html lang="en-GB" data-scroll-behavior="smooth">
      <body className="min-h-dvh font-sans">
        {/* Saved look from Settings → Appearance (always present so the live preview can update it) */}
        <style id="appearance" dangerouslySetInnerHTML={{ __html: css }} />
        <div className="aura-bg" aria-hidden><span /><span /><span /></div>
        <div className="status-cover" aria-hidden />
        {NEEDS_DB ? <ConnectDatabase /> : children}
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){addEventListener('load',()=>navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(()=>{}))}`,
          }}
        />
      </body>
    </html>
  );
}
