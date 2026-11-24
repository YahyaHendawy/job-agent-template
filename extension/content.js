// Job Agent Autofill: runs on supported application-form sites.
// Fills standard fields from the owner's verified Job Agent details, attaches the tailored CV, leaves personal
// questions / CAPTCHAs / uncertain answers to him, and submits only when nothing needs him.
// The owner is involved in EVERY application at least once: submission happens only on their tap ("Submit for me"),
// or, if he switched Auto-submit on, only for applications he launched himself with "Apply now", after a
// 10-second countdown he can cancel.
(() => {
  if (window.__jobAgentLoaded) return;
  window.__jobAgentLoaded = true;
  const api = globalThis.browser ?? globalThis.chrome;
  const send = (msg) => new Promise((res) => { try { const p = api.runtime.sendMessage(msg, res); if (p && p.then) p.then(res, (e) => res({ error: String(e) })); } catch (e) { res({ error: String(e) }); } });
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const txt = (el) => (el ? (el.innerText || el.textContent || "") : "").replace(/\s+/g, " ").trim();
  const visible = (el) => !!(el && (el.offsetParent !== null || el.getClientRects().length));

  // ---------- labels ----------
  function labelOf(el) {
    const parts = [];
    if (el.getAttribute("aria-label")) parts.push(el.getAttribute("aria-label"));
    const lb = el.getAttribute("aria-labelledby");
    if (lb) lb.split(/\s+/).forEach((id) => parts.push(txt(document.getElementById(id))));
    if (el.id) { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l) parts.push(txt(l)); }
    const wrap = el.closest("label"); if (wrap) parts.push(txt(wrap));
    let p = el.parentElement;
    for (let i = 0; i < 5 && p && parts.join("").length < 3; i++, p = p.parentElement) {
      const l = p.querySelector("label, legend, .application-label, [class*='label'], [class*='Label'], [class*='question']");
      if (l && !l.contains(el)) parts.push(txt(l));
    }
    if (el.placeholder) parts.push(el.placeholder);
    if (el.name) parts.push(el.name.replace(/[_\-\[\]]+/g, " "));
    return parts.join(" | ").toLowerCase().slice(0, 300);
  }
  const short = (label) => label.split(" | ")[0].slice(0, 90);

  // ---------- value setting (React-safe) ----------
  function setValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    for (const t of ["input", "change", "blur"]) el.dispatchEvent(new Event(t, { bubbles: true }));
  }
  const PREFER_NOT = /prefer not|decline|not (wish|want) to|rather not|don.?t wish|choose not|not to (say|disclose|answer|self)/i;
  function chooseOption(select, want) {
    const opts = [...select.options].filter((o) => o.value !== "" && !/^(select|choose|please|--)/i.test(o.text.trim()));
    let o;
    if (want === "PREFER_NOT") o = opts.find((x) => PREFER_NOT.test(x.text));
    else if (want === "MALE" || want === "FEMALE") o = opts.find((x) => (want === "MALE" ? /^\s*(male|man)\b/i : /^\s*(female|woman)\b/i).test(x.text));
    else if (want.startsWith("AGE:")) o = opts.find((x) => inBand(x.text, Number(want.slice(4))));
    else if (/^yes\b/i.test(want)) o = opts.find((x) => /^yes\b/i.test(x.text.trim()));
    else if (/^no\b/i.test(want)) o = opts.find((x) => /^no\b/i.test(x.text.trim()));
    else {
      const w = want.toLowerCase();
      o = opts.find((x) => x.text.trim().toLowerCase() === w) || opts.find((x) => x.text.toLowerCase().includes(w)) || opts.find((x) => w.includes(x.text.trim().toLowerCase()) && x.text.trim().length > 2);
    }
    if (!o) return false;
    setValue(select, o.value);
    return true;
  }
  // "18-24", "18 to 24", "16–24", "25+" → does the age fall in it?
  function inBand(text, age) {
    const t = String(text).replace(/[–—]/g, "-");
    const m = t.match(/(\d{2})\s*(?:-|to)\s*(\d{2})/);
    if (m) return age >= +m[1] && age <= +m[2];
    const plus = t.match(/(\d{2})\s*(\+|or over|and over)/);
    if (plus) return age >= +plus[1];
    const under = t.match(/under\s*(\d{2})/i);
    if (under) return age < +under[1];
    return false;
  }
  const radioGroup = (r) => (r.name ? [...document.querySelectorAll(`input[type=radio][name="${CSS.escape(r.name)}"]`)] : [r]);
  function chooseRadio(radio, want) {
    const group = radioGroup(radio);
    const lab = (r) => (txt(r.closest("label")) || txt(document.querySelector(`label[for="${CSS.escape(r.id || "x")}"]`)) || r.value || "").trim();
    const pick = want === "PREFER_NOT" ? group.find((r) => PREFER_NOT.test(lab(r)))
      : want === "MALE" ? group.find((r) => /^\s*(male|man)\b/i.test(lab(r))) : want === "FEMALE" ? group.find((r) => /^\s*(female|woman)\b/i.test(lab(r)))
      : want.startsWith("AGE:") ? group.find((r) => inBand(lab(r), Number(want.slice(4))))
      : /^yes\b/i.test(want) ? group.find((r) => /^yes\b/i.test(lab(r))) : /^no\b/i.test(want) ? group.find((r) => /^no\b/i.test(lab(r))) : null;
    if (!pick) return false;
    if (!pick.checked) pick.click();
    return true;
  }

  // ---------- rules: label → value ----------
  function rules(kit) {
    const d = kit.details || {};
    const ans = (re) => (kit.answers.find((a) => re.test(a.question)) || {}).answer || "";
    const full = [d.firstName, d.lastName].filter(Boolean).join(" ");
    const yesNo = (t) => (/^\s*(yes|not for this role)/i.test(t) ? (/^\s*not/i.test(t) ? "No" : "Yes") : /^\s*no\b/i.test(t) ? "No" : "");
    return [
      [/preferred (first )?name|known as|nickname/, d.preferredName],
      [/first name|given name|forename|^first\b/, d.firstName],
      [/last name|surname|family name/, d.lastName],
      [/^(full )?name\b|full name|your name|legal name/, full],
      [/e-?mail/, d.email],
      [/phone|mobile|telephone|contact number/, d.phone],
      [/address line 2|address 2|apartment|flat/, d.addressLine2],
      [/address|street/, d.addressLine1],
      [/\bcity\b|town/, d.city],
      [/post ?code|zip/, d.postcode],
      [/linkedin/, d.linkedin],
      [/github/, d.github],
      [/website|portfolio|personal (site|url)/, d.portfolio],
      [/sponsor/, yesNo(ans(/sponsorship/i)) || "No"],
      [/right to work|authori[sz]ed to work|eligible to work|legally (able|entitled|permitted) to work|permission to work/, yesNo(ans(/right to work/i))],
      [/visa (type|status)|immigration status|work permit/, ans(/visa type/i)],
      [/nationality|citizenship/, d.nationality],
      [/(are you|aged?|at least|over) (18|eighteen)|18 (years|or over|\+)|over the age of 18|minimum age/, kit.age ? (kit.age >= 18 ? "Yes" : "No") : ""],
      [/\bgender\b|\bsex\b(?!ual)/, d.gender === "male" ? "MALE" : d.gender === "female" ? "FEMALE" : "PREFER_NOT"],
      [/age (group|range|band|bracket)/, kit.age ? `AGE:${kit.age}` : "PREFER_NOT"],
      [/^(your )?age\b|how old/, kit.age ? String(kit.age) : ""],
      [/pronoun|ethnic|race|religio|belief|disab|sexual|orientation|veteran|transgender|trans |marital|caring|socio|free school|first generation|parents? (attend|went)/, "PREFER_NOT"],
      [/driv(ing|er'?s) licen/, d.drivingLicence === "yes" ? "Yes" : d.drivingLicence === "no" ? "No" : ""],
      [/convict|criminal|offen[cs]e/, d.unspentConvictions === "no" ? "No" : ""],
      [/start date|available from|earliest (start|available)|availability date/, d.earliestStartSummer],
      [/end date|available until/, d.latestEndSummer],
      [/relocat/, yesNo(d.willingToRelocate || "")],
      [/how did you (hear|find)|where did you (hear|find)|referral source|source of application/, d.howHeard],
      [/university|school|institution|college/, d.university],
      [/discipline|major|field of study|subject|course of study/, d.discipline || d.degree],
      [/degree( type)?|qualification/, d.degree],
      [/graduat|completion (date|year)/, d.graduationYear],
      [/\bcountry\b/, d.country],
    ].filter(([, v]) => v);
  }
  const PERSONAL = /why|motivat|cover letter|tell us|describe|about yourself|additional information|anything else|personal statement|interest(ed)? in|what (makes|excites)|example of|explain/;
  const PRIVACY_OK = /privacy (notice|policy|statement)|data (processing|protection)|process(ing)? (of )?my (personal )?data|recruitment purposes|gdpr|candidate privacy/;
  const DECLARATION = /certify|declare|accurate|true and (complete|correct)|terms (of|and) (use|service|conditions)|background check|right to work|sponsor|marketing|newsletter|talent (pool|community)|future (roles|opportunities)/;
  const isPersonal = (el, label) => el.tagName === "TEXTAREA" || (PERSONAL.test(label) && el.type === "text" && el.maxLength > 200);
  const isFutureSponsor = (label) => /sponsor/.test(label) && /future|ever|at any (point|time)/.test(label);

  // ---------- CV upload ----------
  function attachCv(kit) {
    const fileInputs = [...document.querySelectorAll("input[type=file]")];
    const cvInput = fileInputs.find((i) => /resume|cv\b|curriculum/.test(labelOf(i)) && !/cover/.test(labelOf(i))) || (fileInputs.length === 1 && !/cover/.test(labelOf(fileInputs[0])) ? fileInputs[0] : null);
    if (!cvInput || !kit.cv) return null;
    if (cvInput.files && cvInput.files.length) return true;
    try {
      const bytes = Uint8Array.from(atob(kit.cv.base64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], kit.cv.filename, { type: "application/pdf" }));
      cvInput.files = dt.files;
      cvInput.dispatchEvent(new Event("input", { bubbles: true }));
      cvInput.dispatchEvent(new Event("change", { bubbles: true }));
      return cvInput.files.length === 1;
    } catch { return false; }
  }

  const mark = (el, color) => { el.style.outline = `2px solid ${color}`; el.style.outlineOffset = "2px"; };
  const fields = () => [...document.querySelectorAll("input, select, textarea")].filter((el) => el.type !== "hidden" && !el.disabled && (visible(el) || el.type === "file") && !["submit", "button", "reset", "image"].includes(el.type));

  // ---------- the owner's own written answers (from the app) ----------
  const STOP = new Set("the a an to of and or for in on at with you your our we us is are be this that why what how do did have has it as from by about any please tell describe".split(" "));
  const wordset = (s) => new Set((String(s).toLowerCase().match(/[a-z]{3,}/g) || []).filter((w) => !STOP.has(w)));
  function sim(a, b) { const A = wordset(a), B = wordset(b); if (!A.size || !B.size) return 0; let n = 0; A.forEach((w) => { if (B.has(w)) n++; }); return n / Math.min(A.size, B.size); }
  function bestWritten(kit, label) {
    const list = kit.written || [];
    let best = null, score = 0;
    for (const w of list) {
      let s = sim(label, w.question);
      if (/\bwhy\b/.test(label) && /^why\b/i.test(w.question)) s = Math.max(s, 0.6);
      if (s > score) { score = s; best = w.answer; }
    }
    return score >= 0.5 ? best : null;
  }
  let personalAsked = [];

  // ---------- fill ----------
  function fill(kit) {
    const R = rules(kit);
    personalAsked = [];
    let filled = 0;
    for (const el of fields()) {
      if (el.type === "file") continue;
      const label = labelOf(el);
      if (!label) continue;
      if (el.type === "checkbox") {
        if (kit.automation && kit.automation.autoConsent && PRIVACY_OK.test(label) && !DECLARATION.test(label) && !el.checked) { el.click(); filled++; mark(el, "#3fcf96"); }
        continue;
      }
      if (isPersonal(el, label)) {
        if (el.value) continue;
        const best = bestWritten(kit, label);
        if (best) { setValue(el, best); filled++; mark(el, "#3fcf96"); } // the owner's own words, written in the app
        else { mark(el, "#5b82ff"); personalAsked.push(short(label)); }
        continue;
      }
      if (isFutureSponsor(label)) {
        const fs = (kit.details || {}).futureSponsorship;
        if (fs === "yes" && (el.tagName === "SELECT" ? chooseOption(el, "Yes") : el.type === "radio" ? chooseRadio(el, "Yes") : false)) { filled++; mark(el, "#3fcf96"); }
        else mark(el, "#f0a63a");
        continue;
      }
      const rule = R.find(([re]) => re.test(label));
      if (!rule) continue;
      const value = rule[1];
      let ok = false;
      if (el.tagName === "SELECT") ok = (el.value && el.selectedIndex > 0) || chooseOption(el, value);
      else if (el.type === "radio") ok = radioGroup(el).some((r) => r.checked) || chooseRadio(el, value);
      else if (value !== "PREFER_NOT" && !el.value) {
        let v = value === "MALE" ? "Male" : value === "FEMALE" ? "Female" : value.startsWith("AGE:") ? "" : value; // codes → words for free-text boxes
        if (el.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(v)) v = /^\d{4}$/.test(v) ? `${v}-06-30` : "";
        if (v) { setValue(el, v); ok = true; }
      } else ok = !!el.value;
      if (ok) { filled++; mark(el, "#3fcf96"); } else mark(el, "#f0a63a");
    }
    return { filled, cv: attachCv(kit) };
  }

  // ---------- what still needs the owner (recomputed live) ----------
  function captchaPending() {
    const frames = [...document.querySelectorAll("iframe")].filter((f) => /recaptcha|hcaptcha|challenges\.cloudflare|turnstile|captcha/i.test(f.src || f.title || ""));
    const challenge = frames.some((f) => visible(f) && f.getBoundingClientRect().height > 60 && !/size=invisible/.test(f.src));
    const widget = [...document.querySelectorAll(".g-recaptcha, .h-captcha, .cf-turnstile")].some((w) => visible(w) && !(w.querySelector("textarea, input[name*='response']") || {}).value);
    return challenge || widget;
  }
  function outstanding() {
    const items = [];
    const seenRadio = new Set();
    for (const el of fields()) {
      const label = labelOf(el);
      if (el.type === "radio") {
        if (seenRadio.has(el.name)) continue; seenRadio.add(el.name);
        if (el.required && !radioGroup(el).some((r) => r.checked)) items.push(`Choose: ${short(label)}`);
        continue;
      }
      if (el.type === "checkbox") { if (el.required && !el.checked) items.push(`Tick: ${short(label)}`); continue; }
      if (el.type === "file") { if (el.required && !(el.files && el.files.length)) items.push(`Upload: ${short(label)}`); continue; }
      const empty = el.tagName === "SELECT" ? !el.value || el.selectedIndex <= 0 : !String(el.value || "").trim();
      if (isPersonal(el, label) && empty) items.push(`✍️ Write: ${short(label)}`);
      else if (isFutureSponsor(label) && empty) items.push(`🛂 Decide: ${short(label)}`);
      else if (el.required && empty) items.push(`Fill: ${short(label)}`);
    }
    const invalid = [...document.querySelectorAll("[aria-invalid='true']")].filter(visible).length;
    if (invalid) items.push(`${invalid} field(s) marked invalid by the site`);
    if (captchaPending()) items.push("🧩 Complete the CAPTCHA");
    return [...new Set(items)];
  }

  // ---------- submit / next buttons ----------
  const SUBMIT_RE = /^(submit( (my )?application)?|apply( now)?|send( (my )?application)?|complete( (my )?application)?|finish)$/i;
  const NEXT_RE = /^(next|continue|save (and|&) continue|next step)$/i;
  function findButton(re) {
    return [...document.querySelectorAll("button, input[type=submit], [role=button]")].filter(visible).filter((b) => !b.disabled)
      .find((b) => re.test((txt(b) || b.value || b.getAttribute("aria-label") || "").trim()));
  }
  async function noteSubmit() {
    try { sessionStorage.setItem("jobAgentSubmitAt", String(Date.now())); } catch {}
    const cur = (await api.storage.local.get("pending")).pending;
    if (cur) await api.storage.local.set({ pending: { ...cur, submitAt: Date.now() } });
  }

  // ---------- panel UI ----------
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647";
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `<style>
    .p{font:13px -apple-system,system-ui,sans-serif;background:#15181e;color:#eef1f6;border:1px solid #272c36;border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.35);width:310px;max-height:72vh;overflow:auto}
    .h{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #272c36;font-weight:700}
    .b{padding:10px 12px}
    button{font:600 13px -apple-system,system-ui;border:0;border-radius:10px;padding:8px 12px;cursor:pointer}
    .pri{background:#5b82ff;color:#fff;width:100%}.gh{background:#1d2129;color:#eef1f6;width:100%;margin-top:6px}.ok{color:#3fcf96}.w{color:#f0a63a}.m{color:#98a1b0;font-size:12px}
    .go{background:#12a36a;color:#fff;width:100%;margin-top:8px}.go:disabled{opacity:.45;cursor:default}
    ul{margin:6px 0 0;padding-left:16px}li{margin:2px 0}
    select{width:100%;margin-top:6px;padding:6px;border-radius:8px;background:#1d2129;color:#eef1f6;border:1px solid #272c36}
    .x{margin-left:auto;background:none;color:#98a1b0;padding:2px 6px}
  </style>
  <div class="p"><div class="h">Job Agent<button class="x" id="min">–</button></div><div class="b" id="body"><button class="pri" id="go">Fill with Job Agent</button><p class="m">Fills standard fields and attaches your CV. Personal answers and CAPTCHAs stay with you.</p></div></div>`;
  document.documentElement.appendChild(host);
  const $ = (id) => root.getElementById(id);
  $("min").onclick = () => { $("body").hidden = !$("body").hidden; };

  let kitCache = null, ticker = null, countdown = null, launchedByYou = false;

  function render(res) {
    const kit = kitCache;
    const todo = outstanding();
    const submitBtn = findButton(SUBMIT_RE), nextBtn = !submitBtn && findButton(NEXT_RE);
    const facts = (kit.writing && kit.writing.facts || []).slice(0, 4).map((f) => `<li>${esc(f)}</li>`).join("");
    const auto = kit.automation && kit.automation.autoSubmit && launchedByYou;
    if (countdown && countdown !== "cancelled" && countdown !== "done") { if (todo.length) { clearInterval(countdown); countdown = null; } else return; }
    $("body").innerHTML = `
      <p><b>${esc(kit.match.title)}</b><br><span class="m">${esc(kit.match.employer)}</span></p>
      <p class="ok">✓ ${res.filled} fields filled${res.cv ? " · CV attached" : ""}</p>
      ${res.cv === false ? `<p class="w">⚠ Couldn't attach your CV here. Attach it yourself (Apply Kit → Download CV).</p>` : ""}
      ${todo.length ? `<p class="w" style="margin-top:6px">Needs you (${todo.length}):</p><ul>${todo.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : `<p class="ok" style="margin-top:6px">Nothing else needs you on this page.</p>`}
      ${todo.some((t) => t.startsWith("✍️")) ? `<p style="margin-top:8px"><b>Write in your own words</b> (blue boxes) — or answer them in the Job Agent app on your phone; they'll be filled in next time. Facts to use:</p><ul>${facts}</ul>` : ""}
      ${submitBtn ? `<button class="go" id="submit" ${todo.length ? "disabled" : ""}>${todo.length ? "Submit for me (finish the items above first)" : "Submit for me"}</button>` : ""}
      ${nextBtn ? `<button class="go" id="next" ${todo.length ? "disabled" : ""}>Next page for me</button>` : ""}
      <div id="cd"></div>
      <p class="m" style="margin-top:8px">${auto ? "Auto-submit is on for this application (you launched it): when nothing needs you, it submits after a 10-second countdown you can cancel." : "Green = filled by Job Agent. Review, then tap Submit for me."}</p>`;
    if ($("submit")) $("submit").onclick = async () => { if (outstanding().length) return render(res); await noteSubmit(); submitBtn.click(); };
    if ($("next")) $("next").onclick = () => { if (!outstanding().length) nextBtn.click(); };
    if (auto && !todo.length && (submitBtn || nextBtn) && !countdown) startCountdown(submitBtn || nextBtn, !!submitBtn, res);
  }

  function startCountdown(btn, isSubmit, res) {
    let n = isSubmit ? 10 : 4;
    const draw = () => {
      const cd = $("cd"); if (!cd) return;
      cd.innerHTML = `<p class="w" style="margin-top:8px">${isSubmit ? "Submitting" : "Going to the next page"} in ${n}s…</p><button class="gh" id="cancel">Cancel</button>`;
      $("cancel").onclick = () => { clearInterval(countdown); countdown = "cancelled"; render(res); };
    };
    draw();
    countdown = setInterval(async () => {
      n--;
      if (outstanding().length) { clearInterval(countdown); countdown = null; return render(res); }
      if (n <= 0) { clearInterval(countdown); countdown = "done"; if (isSubmit) await noteSubmit(); btn.click(); return; }
      draw();
    }, 1000);
  }

  async function run(applicationId) {
    $("body").innerHTML = `<p class="m">Getting your details…</p>`;
    const kit = await send({ type: "getKit", url: location.href, applicationId });
    if (!kit || kit.error) { $("body").innerHTML = `<p class="w">${esc(kit ? kit.error : "Extension error")}</p>`; return; }
    if (!kit.match) {
      if (!kit.ready || !kit.ready.length) { $("body").innerHTML = `<p class="m">No prepared application in Job Agent yet. Open the job in Job Agent and tap “Prepare application”.</p>`; return; }
      $("body").innerHTML = `<p>Which application is this?</p><select id="pick">${kit.ready.map((r) => `<option value="${esc(r.id)}">${esc(r.title)} — ${esc(r.employer)}</option>`).join("")}</select><button class="pri" id="use" style="margin-top:8px">Fill</button>`;
      $("use").onclick = () => run($("pick").value);
      return;
    }
    kitCache = kit;
    await api.storage.local.set({ pending: { id: kit.match.id, host: location.host, at: Date.now() } });
    const res = fill(kit);
    setTimeout(() => {
      const r2 = fill(kit); res.filled = Math.max(res.filled, r2.filled); res.cv = res.cv || r2.cv; // late-rendering forms get a second pass
      if (personalAsked.length) send({ type: "formQuestions", payload: { applicationId: kit.match.id, questions: [...new Set(personalAsked)] } });
    }, 1200);
    render(res);
    clearInterval(ticker);
    ticker = setInterval(() => { if (countdown !== "done") render(res); }, 2000);
  }
  $("go").onclick = () => run();

  // ---------- start: auto-run when the owner opened it with "Apply now", and on later pages of the same form ----------
  (async () => {
    const m = location.hash.match(/jobagent=([0-9a-f-]{36})/);
    if (m) { launchedByYou = true; await api.storage.local.set({ active: { id: m[1], host: location.host, at: Date.now(), launchedByYou: true } }); return run(m[1]); }
    const { active } = await api.storage.local.get("active");
    if (active && active.host === location.host && Date.now() - active.at < 2 * 3600_000 && fields().length > 2) { launchedByYou = !!active.launchedByYou; run(active.id); }
  })();

  // ---------- confirmation detection after a submit ----------
  (async () => {
    document.addEventListener("submit", () => { noteSubmit(); }, true);
    document.addEventListener("click", (e) => { const b = e.target.closest && e.target.closest("button, input[type=submit]"); if (b && SUBMIT_RE.test((txt(b) || b.value || "").trim())) noteSubmit(); }, true);
    const fresh = (await api.storage.local.get("pending")).pending;
    let submitAt = fresh && fresh.submitAt;
    try { submitAt = Math.max(submitAt || 0, Number(sessionStorage.getItem("jobAgentSubmitAt") || 0)); } catch {}
    if (!fresh || !submitAt || Date.now() - submitAt > 30 * 60_000 || Date.now() - fresh.at > 3 * 3600_000) return;
    const check = async () => {
      const t = txt(document.body).slice(0, 4000);
      const m = t.match(/(thank you for (applying|your application|submitting)[^.]{0,120}|application (has been |was )?(received|submitted)[^.]{0,120}|we('ve| have) received your application[^.]{0,120})/i);
      if (!m) return false;
      const r = await send({ type: "submitted", payload: { applicationId: fresh.id, url: location.origin + location.pathname, title: document.title.slice(0, 300), confirmationText: m[0].slice(0, 500) } });
      if (r && r.ok) { await api.storage.local.remove(["pending", "active"]); $("body").innerHTML = `<p class="ok">✓ Submitted and recorded in Job Agent.</p>`; }
      return true;
    };
    if (!(await check())) { const obs = new MutationObserver(() => check().then((d) => d && obs.disconnect())); obs.observe(document.body, { childList: true, subtree: true }); setTimeout(() => obs.disconnect(), 120_000); }
  })();
})();
