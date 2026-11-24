/** A different (fictional) owner: Irish citizen studying software in Dublin, also open to the UK. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { setPersona, FIELDS, BLANK_PERSONA } from "../src/lib/persona";
import { evaluate, detectCountry } from "../src/matching";
import { verdict } from "../src/lib/verdict";
import { buildPersona } from "../src/lib/onboarding";
import { searchesFor } from "../src/lib/searches";

const persona = buildPersona({
  study: { university: "Trinity College Dublin", universityShort: "Trinity", degree: "BA Computer Science", field: "software", gradYear: 2028, summerYear: 2027 },
  place: { home: "IE", city: "Dublin", visa: "none", markets: [{ code: "IE", rightToWork: "citizen" }, { code: "UK", rightToWork: "full" }], remoteOk: true },
  jobs: { types: ["summer_internship", "part_time"], keywords: ["software intern"] },
});
setPersona(persona);

test("onboarding answers become a generic persona", () => {
  assert.equal(persona.home.country, "IE");
  assert.equal(persona.visa.preset, "none");
  assert.deepEqual(persona.interests, FIELDS.software.interests);
  assert.equal(persona.filters.halal, false);
  assert.equal(BLANK_PERSONA.completed, false);
});

test("countries follow the owner's markets", () => {
  assert.equal(detectCountry("Dublin, Ireland"), "IE");
  assert.equal(detectCountry("Cork"), "IE");
  assert.equal(detectCountry("Manchester, UK"), "UK");
  assert.equal(detectCountry("Doha, Qatar"), "OTHER");
});

test("no UK Student visa rules for a citizen; home city preferred", () => {
  const dublin = evaluate({ title: "Software Engineering Intern", employer: "X", location: "Dublin, Ireland", description: "Python" }, null);
  const perm = evaluate({ title: "Part-time Developer", employer: "X", location: "Dublin, Ireland", description: "permanent full-time role, 39 hours per week" }, null);
  assert.equal(dublin.relevant, true);
  assert.equal(dublin.eligibility.status, "eligible");
  assert.ok(!perm.eligibility.reasons.some((r) => /Student visa/.test(r)));
  const shop = (loc: string) => evaluate({ title: "Part-time Sales Assistant", employer: "X", location: loc }, null).score;
  assert.ok(shop("Dublin, Ireland") > shop("Galway, Ireland"));
  const v = verdict({ title: "Software Engineering Intern", employer: "X", location: "Dublin, Ireland", country: "IE", category: "summer_internship",
    match_score: dublin.score, match_reasons: dublin.scoreReasons, eligibility: "eligible", eligibility_reasons: [] });
  assert.ok(v.pros.some((p) => /In Dublin/.test(p)));
  assert.ok(!v.pros.some((p) => /Student visa/.test(p)));
});

test("saved searches are built per country and keyword", () => {
  const s = searchesFor(persona);
  assert.ok(s.some((x) => x.kind === "jooble" && x.config.country === "IE"));
  assert.ok(s.some((x) => x.kind === "reed" && /software intern/.test(x.name)));
  assert.ok(s.some((x) => /Dublin: part-time/.test(x.name)));
});
