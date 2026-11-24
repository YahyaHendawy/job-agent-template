# Job Agent: your own job-hunting assistant (free)

Job Agent searches for internships, placements, part-time and graduate jobs every 10 minutes. It checks you're allowed to apply, writes a tailored CV for each job, and tells you why to apply or not. It also watches your job inbox and pings your phone only when you need to do something. You decide yes or no on every application.

**Your copy is yours.** It runs on your own free Vercel and Supabase accounts. Nobody else, including whoever shared this link, can see your CV, answers or passwords.

**Everything here can be done on your phone.** Allow about 20 minutes. It's all free and no card is needed.

---

## Before you start

- A phone with Safari (iPhone) or Chrome (Android).
- A free **GitHub** account. You can create one in step 1.
- *(Optional)* A Gmail address just for job applications. A fresh free one is best.

Tip: keep the **Notes** app open to jot down the passphrase you'll make up in step 1.

---

## Step 1: Create your copy (5 min)

1. Tap this button:

   [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FYahyaHendawy%2Fjob-agent-template&project-name=job-agent&repository-name=job-agent&env=OWNER_SETUP_TOKEN&envDescription=Make%20up%20a%20setup%20passphrase%20(any%20long%20phrase).%20You%27ll%20type%20it%20once%20to%20claim%20your%20app.%20Save%20it%20in%20Notes.&envLink=https%3A%2F%2Fgithub.com%2FYahyaHendawy%2Fjob-agent-template%23step-1-create-your-copy-5-min)

2. Tap **Continue with GitHub**. If you don't have an account, create a free one, then come back to this page and tap the button again.
3. If Vercel asks which plan to use, choose **Hobby (free)**.
4. Under **Create Git Repository**, keep the name `job-agent` and tick **Private repository** → **Create**.
5. Under **Environment Variables**, fill in **OWNER_SETUP_TOKEN** with any long phrase you make up, for example `purple-kettle-runs-at-noon`. Save it in Notes.
6. Tap **Deploy** and wait about 2 minutes until you see confetti 🎉.

## Step 2: Connect your free database (2 min)

1. Tap **Continue to Dashboard** → **Storage** → **Create Database** → **Supabase** → **Continue**.
2. Choose the **Free** plan and the region nearest you → **Create**. Accept Supabase's terms if asked.
3. Keep your `job-agent` project ticked → **Connect**.
4. Tap **Deployments** → the **⋯** on the top one → **Redeploy** → **Redeploy**. Wait about 2 minutes.

If you open your app before this step, it shows these same instructions.

## Step 3: Claim your app (1 min)

1. In Vercel, tap **Visit** (or the address under **Domains**, e.g. `job-agent-abc.vercel.app`).
2. Enter your setup passphrase from step 1, then your name, email and a new password. Let Safari save it in Passwords.

## Step 4: Answer the setup questions (10 min)

The app walks you through it one screen at a time:

- **Your CV.** Upload it (Word works best) or paste the text. The app shows what it found and you **untick anything that isn't true**. Nothing is invented.
- **Your studies:** university, degree and graduation year.
- **Right to work and places:** your visa or right to work, your city, and the countries you'd work in.
- **Jobs you want:** internships, placements, part-time work and search words.
- **Questions every form asks:** sponsorship, driving licence, convictions, address and dates.
- **Optional filters:** a halal filter and an employer block list. Both are off unless you switch them on.
- **Notifications and weekly goal.**

## Step 5: Link everything (5 min, some optional)

The **Link everything** checklist (also in **Settings → Setup checklist**) checks each item live and shows the steps:

| | What | Needed? |
|---|---|---|
| ✅ | **Scheduler**: runs every 10 minutes, even with your phone off. Set up for you automatically; one button repairs it. | Yes |
| 📱 | **Phone app and notifications**: Safari → Share → **Add to Home Screen**, open the icon, then Settings → **Enable notifications**. | Yes |
| 🔑 | **Free job-site keys**: Reed (UK) and Jooble (per country) add thousands of jobs. Request them on their sites, then paste them in Settings → Job sites. | Recommended |
| 📬 | **Job inbox**: a Gmail *app password* lets the app spot interview invites and replies. You type it into **your own** app; it's stored encrypted. | Recommended |
| 💾 | **Weekly encrypted backup**: Vercel → Storage → Blob (free) → Connect → Redeploy. | Optional |
| 💻 | **Mac app and Safari autofill**: see below. | Optional |

When the essentials are done it says **"You're fully set up ✅"**.

---

## The Mac app and Safari autofill (optional, needs a Mac)

To be honest: **this part can't be done on a phone**. Apple only lets you install your own Safari extension if you build it yourself in Xcode, which is free and runs on a Mac.

1. On a Mac, install **Xcode** (free, App Store) and **GitHub Desktop**. Clone your private `job-agent` repo.
2. Open `mac-app/Job Agent/Job Agent.xcodeproj`.
3. In `ViewController.swift`, change `https://YOUR-APP.vercel.app/` to your app's address.
4. For both targets: **Signing & Capabilities** → **Team** → your Apple ID (**Personal Team**). Change the **Bundle Identifier** from `com.example.jobagent` to something unique, e.g. `com.yourname.jobagent` (the extension keeps the `.Extension` ending).
5. Press **Run** (▶). In Safari → **Settings** → **Extensions**, turn on **Job Agent Autofill**. Then, in your app, open **Settings → Safari autofill** to connect it.

With a free Personal Team, **Apple makes the app stop working after 7 days**. Press Run in Xcode again to renew it. A paid Apple Developer account ($99/year) removes the limit, but you don't need it. Without the Mac app, everything else still works: every application has an **Apply Kit** you can copy from on your phone.

---

## Good to know

- **Free forever, by design.** The app measures its own use and searches less often if it gets near 60% of any free limit (Settings → Free plan). No card is on file anywhere, so nothing can charge you.
- **Your passwords stay with you.** The only things you type into the app are your own login, an optional Gmail app password and optional job-site keys. All of them are stored in **your** database, and the secrets are encrypted.
- **Nothing is sent without you.** The app prepares applications; you decide yes or no on each one, and you press Submit yourself.
- **Your words, not AI's.** Personal answers ("Why do you want this job?") are always written by you. The app only shows the facts from your CV to help.
- **Visa rules.** UK Student visa rules are built in (20 hours a week in term, full-time in vacations). For other countries the app uses what you told it and flags anything to check. It isn't legal advice: always check your own visa conditions.
- **Updates.** Your copy is yours and doesn't change by itself. To get improvements, compare your repo with this template on GitHub, or ask whoever shared it.

## Something not working?

- **"Almost there: connect your free database"** → do step 2, including the **Redeploy**.
- **"Invalid setup token"** → use the exact passphrase from step 1. To change it: Vercel → Settings → Environment Variables → `OWNER_SETUP_TOKEN` → edit → Redeploy.
- **No notifications on iPhone** → open the app from the **Home Screen icon**, not Safari, then enable notifications again.
- **Scheduler not running** → Settings → Setup checklist → **Set up / repair the scheduler**.
