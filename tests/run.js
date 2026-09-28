import assert from "node:assert";
import { joinOf, castOf } from "../joint.js";
import { step, close } from "../jointrun.js";
import { render } from "../app.js";

const base = {
  budget: 1,
  state: { members: [], records: [], ledger: [], applied: [] },
  events: [{ id: 1, kind: "declare", name: "a", side: "old" }],
  bad_name_code: "E_BAD_NAME", bad_side_code: "E_BAD_SIDE",
  dup_member_code: "E_DUP_MEMBER", no_member_code: "E_NO_MEMBER",
  empty_code: "E_EMPTY", event_error_code: "E_BAD_EVENT"
};

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("ok " + name); } catch (e) { failed += 1; console.log("FAIL " + name + " :: " + e.message); }
}

check("joinOf returns a list", () => {
  assert.ok(Array.isArray(joinOf([], "a", "old")));
});

check("castOf returns a list", () => {
  assert.ok(Array.isArray(castOf([], "a", true)));
});

check("step returns a state", () => {
  assert.strictEqual(typeof step(base).state, "object");
});

check("close returns a state", () => {
  assert.strictEqual(typeof close(base).state, "object");
});

check("render counts events", () => {
  assert.strictEqual(typeof render(base).count_events, "number");
});

console.log("5 cases, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);
