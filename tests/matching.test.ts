import "./setup-persona";
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectCountry, classify, evaluate, assessEligibility } from "../src/matching";

test("country detection", () => {
  assert.equal(detectCountry("London, United Kingdom"), "UK");
  assert.equal(detectCountry("Bristol, UK"), "UK");
  assert.equal(detectCountry("New York, NY"), "OTHER");
  assert.equal(detectCountry("Plymouth, MI, us"), "OTHER");
  assert.equal(detectCountry("York, England"), "UK");
  assert.equal(detectCountry("Doha"), "QA");
  assert.equal(detectCountry("Ras Laffan, Qatar"), "QA");
  assert.equal(detectCountry("Smart Village, Giza"), "EG");
  assert.equal(detectCountry("Lincoln, KC, United Kingdom"), "UK");
});

test("classification", () => {
  assert.equal(classify({ title: "Firmware Summer Intern 2027", employer: "X" }), "summer_internship");
  assert.equal(classify({ title: "Electrical Engineering Industrial Placement 2027/28", employer: "X" }), "placement");
  assert.equal(classify({ title: "Part-Time Sales Assistant", employer: "X" }), "part_time");
  assert.equal(classify({ title: "Graduate Engineer 2028", employer: "X" }), "graduate");
  assert.equal(classify({ title: "Industrial Hygiene Technician", employer: "X" }), "other");
});

test("relevance filter drops senior and foreign roles", () => {
  assert.equal(evaluate({ title: "Senior Hardware Engineer", employer: "X", location: "London, UK" }, null).relevant, false);
  assert.equal(evaluate({ title: "Hardware Intern", employer: "X", location: "Austin, TX" }, null).relevant, false);
  assert.equal(evaluate({ title: "Hardware Engineering Intern", employer: "X", location: "Cambridge, UK" }, null).relevant, true);
  assert.equal(evaluate({ title: "Degree Apprenticeship Electrical", employer: "X", location: "London, UK" }, null).relevant, false);
});

test("security clearance and nationality are ineligible", () => {
  const r = assessEligibility({ title: "Electronics Intern", employer: "X", description: "Candidates must be eligible for SC clearance." }, "summer_internship", "UK", null);
  assert.equal(r.status, "ineligible");
  const q = assessEligibility({ title: "Engineering Intern", employer: "X", description: "This programme is open to Qatari nationals only." }, "summer_internship", "QA", null);
  assert.equal(q.status, "ineligible");
});

test("student visa rules: self-employment and permanent full-time", () => {
  assert.equal(assessEligibility({ title: "Freelance tutor", employer: "X", description: "self-employed role" }, "part_time", "UK", null).status, "ineligible");
  assert.equal(assessEligibility({ title: "Store assistant", employer: "X", description: "Permanent, full-time, 37.5 hours" }, "other", "UK", null).status, "ineligible");
});

test("part-time hours", () => {
  const ok = assessEligibility({ title: "Part-time retail assistant", employer: "X", description: "16 hours per week" }, "part_time", "UK", null);
  assert.equal(ok.status, "eligible");
  const over = assessEligibility({ title: "Part-time assistant", employer: "X", description: "24 hours per week, part-time" }, "part_time", "UK", null);
  assert.equal(over.status, "potentially_eligible");
});

test("summer internship in UK is eligible with vacation note", () => {
  const r = assessEligibility({ title: "Electronics Summer Intern", employer: "X", description: "Penultimate year students. No sponsorship available." }, "summer_internship", "UK", null);
  assert.equal(r.status, "eligible");
  assert.ok(r.reasons.some((x) => /vacation/.test(x)));
});

test("mentioning future graduation does not mean graduates-only", () => {
  const r = assessEligibility({ title: "Hardware Summer Intern 2027", employer: "X", description: "There may be an opportunity to join one of our graduate programmes once you've graduated. Currently studying towards a degree in Electronic Engineering." }, "summer_internship", "UK", null);
  assert.equal(r.status, "eligible");
  const f = assessEligibility({ title: "Summer Intern", employer: "X", description: "Open to final year students only." }, "summer_internship", "UK", null);
  assert.equal(f.status, "potentially_eligible");
});

test("market focus: London first in UK, Qatar and Egypt anywhere", () => {
  const job = (location: string, title = "Electrical Engineering Intern") => evaluate({ title, employer: "X", location, description: "electronics" }, null);
  assert.ok(job("London, UK").score > job("Bristol, UK").score);
  assert.ok(job("Doha, Qatar").score >= job("Bristol, UK").score);
  assert.ok(job("Cairo, Egypt").score >= job("Bristol, UK").score);
  assert.ok(job("London, UK", "Part-time Sales Assistant").score > job("Leeds, UK", "Part-time Sales Assistant").score + 20);
  assert.equal(job("Alexandria, Egypt", "Fresh Graduate Electrical Engineer").relevant, true);
});

test("placements require manual verification", () => {
  assert.equal(assessEligibility({ title: "Industrial Placement", employer: "X" }, "placement", "UK", null).status, "manual_verification");
});

test("experience requirement", () => {
  assert.equal(assessEligibility({ title: "Intern", employer: "X", description: "3+ years of experience required" }, "summer_internship", "UK", null).status, "ineligible");
});

test("embedded internship scores higher than generic", () => {
  const a = evaluate({ title: "Embedded Firmware Summer Intern", employer: "X", location: "Bristol, UK", description: "C++, Python, oscilloscope, electronics" }, null);
  const b = evaluate({ title: "Marketing Intern", employer: "X", location: "Bristol, UK", description: "social media" }, null);
  assert.ok(a.score > b.score + 20, `${a.score} vs ${b.score}`);
});

test("audit fixes: London postcodes/boroughs, gig work, qualified roles, Qatari-only", () => {
  const ev = (title: string, location: string, employer = "X", description = "part time") => evaluate({ title, employer, location, description }, null, { aggregatorQuery: true });
  const bodyShop = ev("16-HR Customer Consultant - fixed term", "SE19SP, United Kingdom", "The Body Shop", "16 hours per week");
  const leeds = ev("16-HR Customer Consultant - fixed term", "Leeds, United Kingdom", "The Body Shop", "16 hours per week");
  assert.ok(bodyShop.score > leeds.score + 20, `${bodyShop.score} vs ${leeds.score}`);
  assert.ok(ev("Retail Assistant (part-time)", "Kensington, United Kingdom").scoreReasons.some((r) => /London/.test(r)));
  assert.equal(ev("Cleaner in Fulham - Part-Time", "Fulham, United Kingdom", "Housekeep").relevant, false);
  assert.equal(ev("Maths Teacher", "SW1P2DY, United Kingdom", "Reeson Education").relevant, false);
  assert.equal(ev("Teaching Assistant (part-time)", "London, United Kingdom").relevant, true);
  const qa = evaluate({ title: "Summer Internship Programme (Qatari National)", employer: "Qatar Airways", location: "Doha, Qatar" }, null);
  assert.equal(qa.eligibility.status, "ineligible");
});

test("vague locations keep the known country; drivers need a licence", () => {
  const cf = evaluate({ title: "Software Engineer Intern (2027) - London, UK", employer: "Cloudflare", location: "In-Office", countryHint: "UK" }, null);
  assert.equal(cf.relevant, true);
  assert.equal(evaluate({ title: "Weekend Collection Driver - Dartford", employer: "X", location: "DA15XT, United Kingdom", description: "part time" }, null, { aggregatorQuery: true }).relevant, false);
});
