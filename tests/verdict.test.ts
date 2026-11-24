import "./setup-persona";
import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "../src/lib/verdict";

const base = { title: "Hardware Summer Intern 2027", employer: "Graphcore", location: "Bristol, UK", country: "UK", category: "summer_internship",
  match_score: 85, match_reasons: ["Mentions: embedded systems", "Role focus: electronics / hardware", "Uses your skills: Python, C++"],
  eligibility: "eligible", eligibility_reasons: [] as string[] };

test("strong eligible internship: apply, with fit reasons", () => {
  const v = verdict(base);
  assert.equal(v.call, "✅ Apply");
  assert.ok(v.pros.some((p) => /Strong match \(85%\)/.test(p)));
  assert.ok(v.pros.some((p) => /Student visa/.test(p)));
  assert.ok(v.cons.some((c) => /Bristol/.test(c)));
});

test("placement: worth applying, but EXU check", () => {
  const v = verdict({ ...base, title: "Undergraduate Placement Year 2027", category: "placement", match_score: 52, eligibility: "manual_verification" });
  assert.equal(v.call, "👍 Worth applying");
  assert.ok(v.cons.some((c) => /EXU/.test(c)));
});

test("graduate role and passed deadline: probably skip", () => {
  assert.equal(verdict({ ...base, category: "graduate" }).call, "⚠️ Probably skip");
  assert.equal(verdict({ ...base, deadline: new Date(Date.now() - 86400000) }).call, "⚠️ Probably skip");
});

test("London part-time and agency advert", () => {
  const v = verdict({ ...base, title: "Retail Assistant", employer: "Unknown employer", location: "London SW1", category: "part_time", match_score: 30 });
  assert.ok(v.pros.some((p) => /London/.test(p)));
  assert.ok(v.pros.some((p) => /20 h\/week/.test(p)));
  assert.ok(v.cons.some((c) => /agency/.test(c)));
  assert.equal(v.call, "🤔 Your call");
});

test("software-only role is flagged", () => {
  assert.ok(verdict({ ...base, title: "Software Engineering Intern" }).cons.some((c) => /software/i.test(c)));
});

test("visa notes become plain reasons", () => {
  const v = verdict({ ...base, eligibility: "potentially_eligible", eligibility_reasons: [
    "Graduation-year requirement (2027) may not match your expected 2028.",
    "Requires right to work for the full duration: the whole internship must fall inside EXU's official vacation (or within 20 h/week in term time).",
    "Summer internship falls in the university vacation, when full-time work is permitted on a Student visa (confirm vacation dates with EXU).",
  ] });
  assert.ok(v.cons.some((c) => /2027; you expect 2028/.test(c)));
  assert.ok(!v.cons.some((c) => /falls in the university vacation/.test(c)));
  assert.equal(v.call, "⚠️ Probably skip");
});

import { isBlockedEmployer, DEFAULT_BLOCKED } from "../src/lib/blocked";
test("blocked employers: whole words, no false positives", () => {
  for (const e of ["Palantir Technologies", "Lockheed Martin UK", "Elbit Systems UK", "Wix.com", "Check Point Software", "RTX Corporation"]) assert.ok(isBlockedEmployer(e, DEFAULT_BLOCKED), e);
  for (const e of ["Gong Cha", "Levi Strauss", "MG Motor (SAIC Motor)", "Wizz Air", "Graphcore", "Nice Pak Products", "Hadrian's Wall Trust", "BAE Systems"]) assert.ok(!isBlockedEmployer(e, DEFAULT_BLOCKED), e);
});

test("a related-degree requirement is not a gap", () => {
  const v = verdict({ ...base, missing_info: ["Requirement without evidence: Currently studying for a bachelor’s or master’s degree in Computer Science, Maths, Machine Learning, Data Science or a related field"] });
  assert.ok(!v.cons.some((c) => /not on your CV/.test(c)));
});
