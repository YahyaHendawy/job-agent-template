import "./setup-persona";
import { test } from "node:test";
import assert from "node:assert/strict";
import { classify } from "../src/worker/inbox";

const c = (subject: string, text = "", from = "no-reply@greenhouse.io") => classify(subject, text, from);

test("interview invitations", () => {
  assert.equal(c("Interview invitation – Hardware Summer Intern", "We'd like to invite you to an interview. Please book a slot."), "interview");
  assert.equal(c("Next steps", "We would like to invite you for a call with the hiring manager"), "interview");
});
test("assessments", () => {
  assert.equal(c("Your online assessment", "Please complete the assessment within 5 days via HackerRank"), "assessment");
  assert.equal(c("Video interview", "Complete your HireVue video interview"), "assessment");
});
test("rejections win over interview wording", () => {
  assert.equal(c("Your application", "Unfortunately we will not be inviting you to interview at this stage"), "rejection");
  assert.equal(c("Update", "We regret to inform you that you have been unsuccessful"), "rejection");
});
test("offers", () => {
  assert.equal(c("Offer of employment", "We are pleased to offer you the position of Summer Intern"), "offer");
});
test("application received", () => {
  assert.equal(c("Thank you for applying to Graphcore", "We have received your application and will review it"), "received");
});
test("verification", () => {
  assert.equal(c("Activate your account", "Please verify your email address", "no-reply@reed.co.uk"), "verification");
});
test("recruiter vs other", () => {
  assert.equal(c("Quick question about your application", "Could you let us know your availability?", "talent@company.com"), "recruiter");
  assert.equal(c("Weekly newsletter", "Top articles this week", "news@medium.com"), "other");
});

test("marketing emails are not verification or recruiter items", () => {
  assert.equal(classify("Why wait for Black Friday? 40% off is live", "Confirm your email preferences here. Unsubscribe.", "hello@send.simmereats.com", true), "other");
  assert.equal(classify("Application key has been created", "It will start working as soon as you activate your account", "no-reply@3scale.redhat.com", false), "other");
  assert.equal(classify("Your verification code", "Your code is 123456", "no-reply@service.com", true), "verification");
});
