import assert from "node:assert/strict";
import {
  CONNECTED_OUTCOMES,
  NOT_CONNECTED_OUTCOMES,
  calculateCeAvf,
  ceAvfCategory,
  deriveCeCallUpdate,
  formatCeDate,
  outcomeNeedsDate,
  parseCeDateInput,
  validateCeCallDetails,
  type CeCallOutcome,
  type CeStatus,
} from "./src/lib/ce/rules.ts";

assert.equal(calculateCeAvf(25_000, 10_000), 1.5);
assert.equal(ceAvfCategory(0.999), "red");
assert.equal(ceAvfCategory(1), "yellow");
assert.equal(ceAvfCategory(1.7), "yellow");
assert.equal(ceAvfCategory(1.701), "green");
assert.equal(ceAvfCategory(null), "unavailable");

const date = "2026-10-20";
assert.equal(parseCeDateInput("20/10/2026"), date);
assert.equal(formatCeDate(date), "20/10/2026");
assert.equal(parseCeDateInput("31/02/2026"), null);
assert.equal(parseCeDateInput("2026-10-20"), null);
assert.match(validateCeCallDetails({ callStatus: "connected", outcome: "Appointment booked", followUpDate: "2026-10-17", today: "2026-10-17" }) ?? "", /future/);
assert.match(validateCeCallDetails({ callStatus: "connected", outcome: "Appointment booked", followUpDate: "2026-10-16", today: "2026-10-17" }) ?? "", /future/);
assert.equal(validateCeCallDetails({ callStatus: "connected", outcome: "Appointment booked", followUpDate: date, today: "2026-10-17" }), null);
const expectedConnected = new Map<CeCallOutcome, CeStatus>([
  ["Appointment booked", "Appointment booked"],
  ["Call back later", "Follow-up"],
  ["Service due later", "Follow-up"],
  ["Needs estimate/details", "Follow-up"],
  ["Already serviced with us", "Converted"],
  ["Serviced elsewhere", "Not interested"],
  ["Vehicle sold", "Not interested"],
  ["Customer complaint", "Follow-up"],
  ["Not interested", "Not interested"],
]);

for (const outcome of CONNECTED_OUTCOMES) {
  const needsDate = outcomeNeedsDate(outcome);
  assert.equal(validateCeCallDetails({ callStatus: "connected", outcome, followUpDate: needsDate ? null : date }) !== null, needsDate);
  const result = deriveCeCallUpdate({ currentAttemptCount: 0, callStatus: "connected", outcome, followUpDate: needsDate ? date : null });
  assert.equal(result.status, expectedConnected.get(outcome), outcome);
  assert.equal(result.nextFollowUpDate, ["Converted", "Not interested", "Unreachable"].includes(result.status) ? null : date, outcome);
}

for (const outcome of NOT_CONNECTED_OUTCOMES) {
  const retryable = outcome !== "Invalid/wrong number";
  assert.equal(outcomeNeedsDate(outcome), retryable);
  assert.equal(validateCeCallDetails({ callStatus: "not_connected", outcome, followUpDate: null }) !== null, retryable);
  const result = deriveCeCallUpdate({ currentAttemptCount: 0, callStatus: "not_connected", outcome, followUpDate: retryable ? date : null });
  assert.equal(result.status, retryable ? "Attempted" : "Unreachable", outcome);
}

assert.match(validateCeCallDetails({ callStatus: "connected", outcome: "Line busy", followUpDate: date }) ?? "", /valid outcome/);
assert.match(validateCeCallDetails({ callStatus: "not_connected", outcome: "Appointment booked", followUpDate: date }) ?? "", /valid outcome/);
assert.match(validateCeCallDetails({ callStatus: "unknown", outcome: "Appointment booked", followUpDate: date }) ?? "", /whether the call connected/);
assert.match(validateCeCallDetails({ callStatus: "connected", outcome: "Appointment booked", followUpDate: "2026-02-30" }) ?? "", /valid appointment/);

let attempt = 0;
for (let expected = 1; expected <= 5; expected += 1) {
  const result = deriveCeCallUpdate({ currentAttemptCount: attempt, callStatus: "not_connected", outcome: "Line busy", followUpDate: date });
  assert.equal(result.attemptCount, expected);
  assert.equal(result.status, expected === 5 ? "Unreachable" : "Attempted");
  attempt = result.attemptCount;
}

const f5Connected = deriveCeCallUpdate({ currentAttemptCount: 5, callStatus: "connected", outcome: "Customer complaint", followUpDate: date });
assert.equal(f5Connected.attemptCount, 5);
assert.equal(f5Connected.status, "Follow-up");
assert.equal(f5Connected.nextFollowUpDate, date);

const terminal = deriveCeCallUpdate({ currentAttemptCount: 2, callStatus: "connected", outcome: "Already serviced with us", followUpDate: date });
assert.equal(terminal.status, "Converted");
assert.equal(terminal.nextFollowUpDate, null);
const reopened = deriveCeCallUpdate({ currentAttemptCount: terminal.attemptCount, callStatus: "connected", outcome: "Call back later", followUpDate: date });
assert.equal(reopened.status, "Follow-up");
assert.equal(reopened.nextFollowUpDate, date);

console.log("PASS  CE call outcomes, dates, AVF bands, attempts, closure, and reopening");
