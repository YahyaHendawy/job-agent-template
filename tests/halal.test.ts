import "./setup-persona";
import { test } from "node:test";
import assert from "node:assert/strict";
import { halalCheck, HALAL_DEFAULTS } from "../src/lib/halal";

const j = (title: string, employer: string, description = "") => halalCheck({ title, employer, description });

test("clearly haram jobs are blocked", () => {
  for (const [t, e] of [["Bar Staff", "Greene King"], ["Team Member", "Wetherspoons"], ["Customer Service", "William Hill"], ["Software Intern", "Monzo"],
    ["Graduate Analyst", "Barclays"], ["Summer Intern", "Aviva"], ["Store Assistant", "Totally Wicked"], ["Croupier", "Grosvenor Casinos"],
    ["Mortgage Adviser", "Acme Ltd"], ["Engineering Intern", "Qatar National Bank"], ["Production Operative", "Cranswick"]] as const) {
    assert.equal(j(t, e).blocked, true, `${t} @ ${e}`);
  }
  assert.equal(j("Waiting staff", "The Ivy", "You will be serving cocktails and wine to guests").blocked, true);
});

test("halal and normal jobs pass", () => {
  for (const [t, e, d] of [["Hardware Summer Intern 2027", "Graphcore", "Drug and alcohol testing applies on site."], ["Engineering Intern", "Qatar Islamic Bank", ""],
    ["Retail Assistant", "Primark", ""], ["Embedded Intern", "Bosch", ""], ["Data Intern", "Tamara", ""], ["Publishing Assistant", "Penguin", ""],
    ["Customer Consultant", "The Body Shop", ""], ["Team Spirit Coordinator", "Acme", ""], ["Tutor", "Bank Street Tutors Hub", ""]] as const) {
    assert.equal(j(t, e, d).blocked, false, `${t} @ ${e}`);
  }
  assert.equal(j("Hardware Summer Intern 2027", "Graphcore", "Drug and alcohol testing applies on site.").warnings.length, 0);
});

test("grey areas warn instead of block", () => {
  const tesco = j("Customer Assistant (part-time)", "Tesco");
  assert.equal(tesco.blocked, false);
  assert.ok(tesco.warnings.some((w) => /alcohol/.test(w)));
  assert.ok(j("Kitchen Team Member", "Nando's").warnings.some((w) => /pork|halal/.test(w)));
});

test("categories can be switched off", () => {
  assert.equal(halalCheck({ title: "Software Intern", employer: "Monzo" }, { ...HALAL_DEFAULTS, riba: false }).blocked, false);
});

test("'bank' in place names and food banks is fine", () => {
  for (const e of ["Bank Street Tutors Hub", "Trussell Food Bank", "Riverbank Engineering", "Bankside Studios", "Power Bank Labs"]) assert.equal(j("Assistant", e).blocked, false, e);
  assert.equal(j("Assistant", "Metro Bank").blocked, true);
});

test("shop warning only for shop-floor roles; client names in adverts don't count", () => {
  assert.equal(j("Pharmacy Colleague", "ASDA").warnings.length, 0);
  assert.equal(j("Software Engineering Intern", "Databricks", "Customers include Tesco, Lidl and Ocado.").warnings.length, 0);
  assert.ok(j("Customer Assistant", "Lidl").warnings.length > 0);
});
